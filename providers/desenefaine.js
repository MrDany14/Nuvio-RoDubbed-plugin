var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "FilmeDublate";
var MAIN_URL = "https://filmedublate.net";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

function decodeBase64(str) {
    try { if (typeof atob !== 'undefined') return atob(str); } catch (e) {}
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = ''; var chr1, chr2, chr3, enc1, enc2, enc3, enc4; var i = 0;
    str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < str.length) {
        enc1 = chars.indexOf(str.charAt(i++)); enc2 = chars.indexOf(str.charAt(i++));
        enc3 = chars.indexOf(str.charAt(i++)); enc4 = chars.indexOf(str.charAt(i++));
        chr1 = (enc1 << 2) | (enc2 >> 4); chr2 = ((enc2 & 15) << 4) | (enc3 >> 2); chr3 = ((enc3 & 3) << 6) | enc4;
        output += String.fromCharCode(chr1);
        if (enc3 != 64) output += String.fromCharCode(chr2);
        if (enc4 != 64) output += String.fromCharCode(chr3);
    }
    return output;
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
      if (!result || !result.html) return [{ name: PROVIDER_NAME, title: "Movie not found on site", url: "http://err", provider: "filmedublate" }];

      var $$ = cheerio.load(result.html);
      var streams = [];
      var seenUrls = {};

      function addStream(url, label) {
          if (!url || seenUrls[url]) return;
          if (url.includes("youtube.com") || url.includes("facebook.com") || url.includes("imdb.com")) return;
          
          seenUrls[url] = true;
          if (url.startsWith("//")) url = "https:" + url;

          var hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
          var domain = hostMatch ? hostMatch[1].replace("www.", "") : "Unknown Server";
          
          streams.push({
              name: PROVIDER_NAME + " | " + domain,
              title: label + " | 1080p RO Dub",
              url: url,
              quality: "1080p",
              isM3U8: false,
              headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
              behaviorHints: { 
                  notWebReady: true,
                  bingeGroup: "filmedublate-webview" 
              },
              provider: "filmedublate"
          });
      }

      $$("iframe").each(function(_, el) {
          addStream($$(el).attr("src") || $$(el).attr("data-src"), "Iframe");
      });

      $$("[data-src]").each(function(_, el) {
          var src = $$(el).attr("data-src");
          if (src && src.startsWith("http")) {
              addStream(src, "Data-Src");
          } else if (src && src.startsWith("aHR0")) {
              try {
                  var decoded = decodeBase64(src);
                  if (decoded.startsWith("http")) addStream(decoded, "Base64");
              } catch(e) {}
          }
      });

      $$(".player_options a, .server_line a").each(function(_, el) {
          var href = $$(el).attr("href");
          if (href && href.startsWith("http") && !href.includes("filmedublate.net")) {
              addStream(href, "Button Link");
          }
      });

      if (streams.length === 0) {
          return [{ name: PROVIDER_NAME, title: "No iframes found on page", url: "http://err", provider: "filmedublate" }];
      }

      return streams;
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
