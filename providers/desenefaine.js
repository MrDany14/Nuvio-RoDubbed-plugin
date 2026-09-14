var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DozaAnimata";
var MAIN_URL = "https://www.dozaanimata.net";
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
        
        // Search through article and anchor tags
        $("a").each(function(_, el) {
          var href = $(el).attr("href");
          if (!href || !href.includes("dozaanimata.net")) return;
          if (href.includes("/category/") || href.includes("/tag/") || href.includes("/page/")) return;

          var text = normalizeTitle($(el).text().trim() || $$(el).attr("title") || "");
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
      if (!result || !result.html) return [{ name: PROVIDER_NAME, title: "Movie not found on DozaAnimata", url: "http://err", provider: "dozaanimata" }];

      var $$ = cheerio.load(result.html);
      var streams = [];
      var seenUrls = {};

      function addStream(url) {
          if (!url || seenUrls[url]) return;
          if (url.includes("youtube.com") || url.includes("facebook.com") || url.includes("imdb.com")) return;
          
          seenUrls[url] = true;
          if (url.startsWith("//")) url = "https:" + url;

          var hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
          var domain = hostMatch ? hostMatch[1].replace("www.", "") : "Unknown Server";
          
          streams.push({
              name: PROVIDER_NAME + " | " + domain,
              title: "1080p | RO Dub",
              url: url,
              quality: "1080p",
              isM3U8: false,
              headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
              behaviorHints: { 
                  // Set to false initially so Nuvio can attempt native extraction via resolvers
                  notWebReady: false, 
                  bingeGroup: "dozaanimata-dub" 
              },
              provider: "dozaanimata"
          });
      }

      // 1. Grab visible iframes (Standard for DozaAnimata)
      $$("iframe").each(function(_, el) {
          addStream($$(el).attr("src") || $$(el).attr("data-src"));
      });

      // 2. Grab hidden data-src attributes (Dooplay style server switchers)
      $$("[data-src]").each(function(_, el) {
          var src = $$(el).attr("data-src");
          if (src && src.startsWith("http")) addStream(src);
      });
      
      // 3. Fallback to WebView streams if Nuvio native extract fails
      var webViewStreams = streams.map(function(stream) {
          var newStream = Object.assign({}, stream);
          newStream.title = "Web Player | " + newStream.title;
          newStream.behaviorHints = { notWebReady: true, bingeGroup: "dozaanimata-web" };
          return newStream;
      });

      if (streams.length === 0) {
          return [{ name: PROVIDER_NAME, title: "No usable servers found", url: "http://err", provider: "dozaanimata" }];
      }

      // Return native attempts first, followed by WebView fallbacks
      return streams.concat(webViewStreams);
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
