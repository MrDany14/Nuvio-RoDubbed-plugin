var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
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

function normalizeSlug(value) {
  return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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

// -----------------------------------------------------------------------------
// FILEMOON UNPACKER
// -----------------------------------------------------------------------------
function extractFilemoon(iframeUrl) {
    return fetchText(iframeUrl, { headers: { "Referer": MAIN_URL } }).then(function(html) {
        var unpacked = html;
        
        // Unpack Javascript Eval (eval(function(p,a,c,k,e,d)...)
        var packMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?return p\}\('(.*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
        if (packMatch) {
            var p = packMatch[1];
            var a = parseInt(packMatch[2]);
            var c = parseInt(packMatch[3]);
            var k = packMatch[4].split('|');
            var e = function(c) {
                return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
            };
            while (c--) {
                if (k[c]) {
                    var reg = new RegExp('\\b' + e(c) + '\\b', 'g');
                    p = p.replace(reg, k[c]);
                }
            }
            unpacked = p;
        }

        // Strict Extraction: Must capture ?t=... and &s=... tokens and clean escapes
        var m3u8Match = unpacked.match(/['"](https?:\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]+)?)['"]/i);
        
        if (m3u8Match && m3u8Match[1]) {
            var finalUrl = m3u8Match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
            return [{
                name: "DeseneFaine | Filemoon",
                title: "1080p | RO Dub",
                url: finalUrl,
                quality: "1080p",
                isM3U8: true,
                headers: { "Referer": "https://filemoon.sx/", "Origin": "https://filemoon.sx", "User-Agent": FETCH_HEADERS["User-Agent"] },
                behaviorHints: { bingeGroup: "desenefaine-1080p" },
                provider: "desenefaine"
            }];
        } else {
            return [{ name: "Extractor Error", title: "Could not locate M3U8 string in Filemoon", url: "http://err", quality: "1080p", provider: "desenefaine" }];
        }
    }).catch(function(err) {
        return [{ name: "Network Error", title: "Failed to load Filemoon iframe", url: "http://err", quality: "1080p", provider: "desenefaine" }];
    });
}

function getStreams(id, type, season, episode) {
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = ""; var enTitle = "";
    if (isImdb) {
      var results = type === "tv" ? data.tv_results : data.movie_results;
      if (results && results.length > 0) { roTitle = type === "tv" ? results[0].name : results[0].title; enTitle = type === "tv" ? results[0].original_name : results[0].original_title; }
    } else { roTitle = type === "tv" ? data.name : data.title; enTitle = type === "tv" ? data.original_name : data.original_title; }

    if (!roTitle) return [];

    function searchSite(query) {
      return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(query)).then(function(html) {
        var $ = cheerio.load(html); var bestMatch = null; var queryWords = normalizeTitle(query).split(" ").filter(function(w) { return w.length > 2; });
        $("a").each(function(_, el) {
          var href = $(el).attr("href");
          if (!href || !href.includes("desenefaine.com") || /\/(category|tag|author|page|feed|wp-)/i.test(href)) return;
          var text = normalizeTitle($(el).text().trim());
          var matchCount = 0; queryWords.forEach(function(word) { if (text.includes(word)) matchCount++; });
          if (matchCount >= Math.ceil(queryWords.length / 2)) { if (!bestMatch || text.length < bestMatch.text.length) bestMatch = { href: href, text: text, score: matchCount }; }
        });
        if (bestMatch) return fetchText(bestMatch.href).then(function(resHtml) { return { url: bestMatch.href, html: resHtml }; });
        return null;
      }).catch(function() { return null; });
    }

    var slug = normalizeSlug(roTitle);
    if (type === "tv" && season && episode) slug = normalizeSlug(roTitle) + "-sezonul-" + season + "-episodul-" + episode;
    var directUrl = MAIN_URL + "/film/" + slug + "/";

    return fetchText(directUrl).then(function(html) {
        if (html && html.length > 2000 && !html.includes("Nu am găsit")) return { url: directUrl, html: html };
        return searchSite(roTitle);
    }).catch(function() { return searchSite(roTitle); })
    .then(function(result) {
      if (!result || !result.html) return [];

      var $$ = cheerio.load(result.html);
      var routerUrls = [];

      $$("[data-src]").each(function(_, el) {
          var src = $$(el).attr("data-src");
          if (src && src.startsWith("aHR0")) {
              var decoded = decodeBase64(src);
              if (decoded.includes("trembed")) routerUrls.push(decoded);
          }
      });

      if (routerUrls.length === 0) return [{ name: "Err", title: "No Base64 Router Found", url: "http://err" }];

      var processPromises = routerUrls.map(function(rUrl) {
          return fetchText(rUrl, { headers: { "Referer": result.url } }).then(function(rHtml) {
              var iframeMatch = rHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
              if (!iframeMatch || !iframeMatch[1]) return null;

              var innerUrl = iframeMatch[1].replace(/\\\//g, "/");
              if (innerUrl.startsWith("//")) innerUrl = "https:" + innerUrl;

              // Extract Filemoon directly
              if (innerUrl.includes("filemoon")) {
                  return extractFilemoon(innerUrl);
              }
              return null;
          }).catch(function(e) { return null; });
      });

      return Promise.all(processPromises).then(function(arraysOfStreams) {
          var finalStreams = [];
          for (var i = 0; i < arraysOfStreams.length; i++) {
              if (arraysOfStreams[i] && arraysOfStreams[i].length) {
                  finalStreams = finalStreams.concat(arraysOfStreams[i]);
              }
          }
          return finalStreams.length > 0 ? finalStreams : [{ name: "No Filemoon Streams", title: "No valid Filemoon links found on this page.", url: "http://err", quality: "1080p", provider: "desenefaine" }];
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
