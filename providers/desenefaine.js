var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "FilmeDublate";
var MAIN_URL = "https://filmedublate.net";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url, options) {
  options = options || {};
  return fetch(url, { method: options.method || "GET", headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); });
}

function fetchJson(url, options) {
  options = options || {};
  return fetch(url, { method: options.method || "GET", headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
    .then(function(res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); });
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, " ").trim();
}

function getStreams(id, type, season, episode) {
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = ""; var enTitle = ""; 
    if (isImdb) {
      var results = type === "tv" ? data.tv_results : data.movie_results;
      if (results && results.length > 0) { 
          roTitle = type === "tv" ? results[0].name : results[0].title; 
          enTitle = type === "tv" ? results[0].original_name : results[0].original_title; 
      }
    } else { 
        roTitle = type === "tv" ? data.name : data.title; 
        enTitle = type === "tv" ? data.original_name : data.original_title; 
    }

    if (!roTitle && !enTitle) return [];

    function searchSite(query) {
      return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(query)).then(function(html) {
        var $ = cheerio.load(html); 
        var bestMatch = null; 
        var queryWords = normalizeTitle(query).split(" ").filter(function(w) { return w.length > 2; });
        
        $("a").each(function(_, el) {
          var href = $(el).attr("href");
          if (!href || !href.includes("filmedublate.net")) return;
          if (href.includes("/category/") || href.includes("/tag/") || href.includes("/page/")) return;

          var text = normalizeTitle($(el).text().trim());
          if (text.length < 3) return;

          var matchCount = 0; 
          queryWords.forEach(function(word) { if (text.includes(word)) matchCount++; });
          
          if (matchCount >= Math.ceil(queryWords.length / 2)) { 
              if (!bestMatch || text.length < bestMatch.text.length) {
                  bestMatch = { href: href, text: text, score: matchCount }; 
              }
          }
        });
        if (bestMatch) return fetchText(bestMatch.href).then(function(resHtml) { return { url: bestMatch.href, html: resHtml }; });
        return null;
      }).catch(function() { return null; });
    }

    return searchSite(roTitle).then(function(result) {
        if (!result && enTitle && enTitle !== roTitle) return searchSite(enTitle);
        return result;
    }).then(function(result) {
      if (!result || !result.html) return [{ name: PROVIDER_NAME, title: "Movie not found", url: "http://err", provider: "filmedublate" }];

      var $$ = cheerio.load(result.html);
      
      // 1. Find the internal wrapper iframe (/embed/filmsrv.php)
      var wrapperUrl = null;
      $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src");
          if (src && src.includes("filmsrv.php")) wrapperUrl = src;
      });

      if (!wrapperUrl) return [{ name: PROVIDER_NAME, title: "No wrapper iframe found", url: "http://err", provider: "filmedublate" }];
      if (wrapperUrl.startsWith("/")) wrapperUrl = MAIN_URL + wrapperUrl;

      // 2. Fetch the wrapper to get the raw mirror links (ABYServer, Filemoon)
      return fetchText(wrapperUrl, { headers: { "Referer": result.url } }).then(function(wrapperHtml) {
          var streams = [];
          var seen = {};

          // Look for raw URLs in the javascript of the wrapper
          var urls = wrapperHtml.match(/(https?:\/\/[^\s"'<>]+)/gi) || [];
          
          urls.forEach(function(u) {
              if (seen[u]) return;
              
              var serverName = "Unknown Server";
              var resQuality = "1080p";
              var shouldAdd = false;

              if (u.includes("absplayer")) {
                  serverName = "ABYServer (Abyss)";
                  resQuality = "480p"; // According to trace, abyss caps at 480p
                  shouldAdd = true;
              } else if (u.includes("byse") || u.includes("filemoon")) {
                  serverName = "Filemoon";
                  shouldAdd = true;
              } else if (u.includes("streamtape")) {
                  serverName = "Streamtape (Ad Heavy)";
                  shouldAdd = true;
              }

              if (shouldAdd) {
                  seen[u] = true;
                  streams.push({
                      name: PROVIDER_NAME + " | " + serverName,
                      title: "Web Player\n⚠️ TAP 2-3 TIMES TO PLAY (Bypass Ads)",
                      url: u,
                      quality: resQuality,
                      isM3U8: false,
                      headers: { "Referer": wrapperUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
                      behaviorHints: { 
                          notWebReady: true, // Force Nuvio WebView
                          bingeGroup: "filmedublate-webview" 
                      },
                      provider: "filmedublate"
                  });
              }
          });

          if (streams.length === 0) return [{ name: PROVIDER_NAME, title: "No usable mirrors in wrapper", url: wrapperUrl, provider: "filmedublate" }];
          return streams;
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
