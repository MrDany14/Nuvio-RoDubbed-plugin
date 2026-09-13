var cheerio = require("cheerio-without-node-native");
var CryptoJS;
var cryptoError = null;

try {
    CryptoJS = require("crypto-js");
} catch (e) {
    cryptoError = e.message;
}

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function normalizeSlug(value) {
  return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeBase64(str) {
    try {
        if (typeof atob !== 'undefined') return atob(str);
    } catch (e) {}
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0;
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

function extractPlayer4Me(iframeUrl) {
    var idMatch = iframeUrl.match(/\/[ve]\/([a-zA-Z0-9]+)/);
    if (!idMatch) {
        return Promise.resolve([{ name: "P4M Error", title: "Could not extract File ID", url: "http://example.com", quality: "1080p", provider: "desenefaine" }]);
    }

    if (cryptoError || !CryptoJS || !CryptoJS.AES) {
        return Promise.resolve([{ name: "Crypto Missing", title: cryptoError || "crypto-js module unavailable", url: "http://example.com", quality: "1080p", provider: "desenefaine" }]);
    }

    var apiUrl = "https://player4me.com/api/v1/video?id=" + idMatch[1] + "&w=2048&h=1152&r=";

    return fetchJson(apiUrl, { headers: { "Referer": "https://player4me.com/" } }).then(function(apiRes) {
        if (!apiRes || !apiRes.data) return [{ name: "API Error", title: "Empty API response", url: "http://example.com", quality: "1080p", provider: "desenefaine" }];

        try {
            var key = CryptoJS.enc.Hex.parse("6b69656d7469656e6d75613931316361");
            var iv = CryptoJS.enc.Hex.parse("313233343536373839306f6975797472");
            var decrypted = CryptoJS.AES.decrypt(apiRes.data, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
            
            var videoData = JSON.parse(decrypted);
            var m3u8Url = videoData.file || (videoData.sources && videoData.sources[0] && videoData.sources[0].file);

            if (m3u8Url) {
                return [{
                    name: "DeseneFaine | SprintCDN",
                    title: "1080p | RO Dub",
                    url: m3u8Url,
                    quality: "1080p",
                    isM3U8: true,
                    headers: { "Referer": "https://player4me.com/", "Origin": "https://player4me.com", "User-Agent": FETCH_HEADERS["User-Agent"] },
                    behaviorHints: { bingeGroup: "desenefaine-1080p" },
                    provider: "desenefaine"
                }];
            } else {
                 return [{ name: "Decryption Fail", title: "No file in JSON", url: "http://example.com", quality: "1080p", provider: "desenefaine" }];
            }
        } catch (err) {
             return [{ name: "Decryption Crash", title: err.message.substring(0, 50), url: "http://example.com", quality: "1080p", provider: "desenefaine" }];
        }
    }).catch(function(err) {
        return [{ name: "Network Error", title: err.message, url: "http://example.com", quality: "1080p", provider: "desenefaine" }];
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
    } else {
      roTitle = type === "tv" ? data.name : data.title; enTitle = type === "tv" ? data.original_name : data.original_title;
    }

    if (!roTitle && !enTitle) return [];

    function tryDirectUrl(title) {
      var slug = normalizeSlug(title);
      if (type === "tv" && season && episode) slug = normalizeSlug(title) + "-sezonul-" + season + "-episodul-" + episode;
      var prefixes = type === "tv" ? ["epi", "serial", "desene"] : ["film", "desene"];
      
      var promises = prefixes.map(function(prefix) {
        var url = MAIN_URL + "/" + prefix + "/" + slug + "/";
        return fetchText(url).then(function(html) {
          if (html && html.length > 2000 && !html.includes("Nu am găsit")) return { url: url, html: html };
          return null;
        }).catch(function() { return null; });
      });
      return Promise.all(promises).then(function(results) {
        for (var i = 0; i < results.length; i++) if (results[i]) return results[i];
        return null;
      });
    }

    function searchSite(query) {
      var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
      return fetchText(searchUrl).then(function(html) {
        var $ = cheerio.load(html);
        var bestMatch = null;
        var normQuery = normalizeTitle(query);
        var queryWords = normQuery.split(" ").filter(function(w) { return w.length > 2; });

        $("a").each(function(_, el) {
          var href = $(el).attr("href");
          if (!href || !href.includes("desenefaine.com") || /\/(category|tag|author|page|feed|wp-)/i.test(href)) return;
          var text = $(el).text().trim();
          if (text.length < 5) return;
          var normText = normalizeTitle(text);
          var matchCount = 0;
          queryWords.forEach(function(word) { if (normText.includes(word)) matchCount++; });
          if (matchCount >= Math.ceil(queryWords.length / 2)) {
            if (!bestMatch || text.length < bestMatch.text.length) bestMatch = { href: href, text: text, score: matchCount };
          }
        });

        if (bestMatch) return fetchText(bestMatch.href).then(function(html) { return { url: bestMatch.href, html: html }; });
        return null;
      }).catch(function() { return null; });
    }

    return tryDirectUrl(roTitle).then(function(result) {
      if (result) return result;
      if (enTitle && enTitle !== roTitle) {
        return tryDirectUrl(enTitle).then(function(enResult) {
          if (enResult) return enResult;
          return searchSite(roTitle).then(function(searchResult) {
            if (searchResult) return searchResult;
            return searchSite(enTitle);
          });
        });
      }
      return searchSite(roTitle);
    }).then(function(result) {
      if (!result || !result.html) return [];

      var $$ = cheerio.load(result.html);
      var player4MeUrl = null;

      // Unpack Base64 Buttons to find Player4Me
      $$("[data-src]").each(function(_, el) {
          var src = $$(el).attr("data-src");
          if (src && src.startsWith("aHR0")) {
              var decoded = decodeBase64(src);
              if (decoded.includes("player4me")) player4MeUrl = decoded;
          } else if (src && src.includes("player4me")) {
              player4MeUrl = src;
          }
      });

      if (!player4MeUrl) {
          $$("iframe").each(function(_, el) {
              var src = $$(el).attr("src") || $$(el).attr("data-src");
              if (src && src.includes("player4me")) player4MeUrl = src;
          });
      }

      if (!player4MeUrl) return [{ name: "Scrape Error", title: "Base64 decode found no Player4Me link", url: "http://example.com", quality: "1080p", provider: "desenefaine" }];

      return extractPlayer4Me(player4MeUrl);
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
