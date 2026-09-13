var cheerio = require("cheerio-without-node-native");
var CryptoJS;
var cryptoError = null;

try {
    CryptoJS = require("crypto-js");
} catch (e) {
    cryptoError = e.message;
}

var PROVIDER_NAME = "Desene Shotgun";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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
    try { if (typeof atob !== 'undefined') return atob(str); } catch (e) {}
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

function buildStream(testName, srvName, url, isM3) {
    return {
        name: testName + " | " + srvName,
        title: "1080p | RO Dub",
        url: url,
        quality: "1080p",
        isM3U8: isM3,
        headers: { "User-Agent": FETCH_HEADERS["User-Agent"] },
        behaviorHints: { bingeGroup: "desenefaine-1080p" },
        provider: "desenefaine"
    };
}

function run10ExtractionTests(iframeUrl) {
    var hostMatch = iframeUrl.match(/^https?:\/\/([^/?#]+)/i);
    var domain = hostMatch ? hostMatch[1] : "Unknown";
    var srvName = domain.replace("www.", "").split(".")[0].toUpperCase();
    var streams = [];

    // T1: Player4Me Crypto API
    var p4mPromise = Promise.resolve();
    if (iframeUrl.includes("player4me")) {
        var idMatch = iframeUrl.match(/\/[ve]\/([a-zA-Z0-9]+)/);
        if (idMatch && !cryptoError && CryptoJS && CryptoJS.AES) {
            var apiUrl = "https://player4me.com/api/v1/video?id=" + idMatch[1] + "&w=2048&h=1152&r=";
            p4mPromise = fetchJson(apiUrl, { headers: { "Referer": "https://player4me.com/" } }).then(function(apiRes) {
                if (apiRes && apiRes.data) {
                    var key = CryptoJS.enc.Hex.parse("6b69656d7469656e6d75613931316361");
                    var iv = CryptoJS.enc.Hex.parse("313233343536373839306f6975797472");
                    var dec = CryptoJS.AES.decrypt(apiRes.data, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
                    var vData = JSON.parse(dec);
                    var mUrl = vData.file || (vData.sources && vData.sources[0] && vData.sources[0].file);
                    if (mUrl) streams.push(buildStream("T1 Crypto", "P4M", mUrl, true));
                }
            }).catch(function() {});
        } else if (cryptoError) {
             streams.push({ name: "T1 Crypto Err", title: cryptoError.substring(0,30), url: "http://err", quality: "1080p", provider: "desenefaine" });
        }
    }

    // Run tests T2 through T9 on the raw HTML of the iframe
    var htmlPromise = fetchText(iframeUrl, { headers: { "Referer": MAIN_URL } }).then(function(html) {
        
        // T2: Raw M3U8
        var m2 = html.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+?\.m3u8[^"'\s<>]*)/i);
        if (m2) streams.push(buildStream("T2 Regex M3U8", srvName, m2[1], true));

        // T3: Raw MP4
        var m3 = html.match(/(https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+?\.mp4[^"'\s<>]*)/i);
        if (m3) streams.push(buildStream("T3 Regex MP4", srvName, m3[1], false));

        // T4: JSON 'file' or 'src'
        var m4 = html.match(/['"]?(?:file|src)['"]?\s*:\s*['"](https?:\/\/[^'"]+)['"]/i);
        if (m4 && (m4[1].includes(".m3u8") || m4[1].includes(".mp4"))) {
            streams.push(buildStream("T4 JSON", srvName, m4[1], m4[1].includes(".m3u8")));
        }

        // T5: Escaped URL
        var m5 = html.match(/(https?:\\[/][/][^"'\s<>]+?\.m3u8[^"'\s<>]*)/i);
        if (m5) streams.push(buildStream("T5 Escaped", srvName, m5[1].replace(/\\\//g, "/"), true));

        // T6: Base64 Scan
        var b64Matches = html.match(/(aHR0cHM6Ly[a-zA-Z0-9+/=]+)/g) || [];
        for (var i = 0; i < b64Matches.length; i++) {
            var dec = decodeBase64(b64Matches[i]);
            if (dec.includes(".m3u8") || dec.includes(".mp4")) {
                streams.push(buildStream("T6 B64", srvName, dec, dec.includes(".m3u8")));
                break; // Only push one
            }
        }

        // T7: DOM Source Parse
        var $$ = cheerio.load(html);
        var domSrc = $$('video source').attr('src') || $$('video').attr('src');
        if (domSrc && domSrc.startsWith("http")) streams.push(buildStream("T7 DOM", srvName, domSrc, domSrc.includes(".m3u8")));

        // T8: ATOB Regex
        var m8 = html.match(/atob\(['"]([^'"]+)['"]\)/i);
        if (m8) {
            var dec8 = decodeBase64(m8[1]);
            if (dec8.includes(".m3u8") || dec8.includes(".mp4")) {
                streams.push(buildStream("T8 ATOB", srvName, dec8, dec8.includes(".m3u8")));
            }
        }

        // T9: Unicode/Hex Obfuscation
        var m9 = html.match(/(https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*)/i); 
        // If m2 didn't catch it because of \u0026, let's catch it here
        if (html.includes("\\u0026") && m9) {
            var clean = m9[1].replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
            streams.push(buildStream("T9 Unicode", srvName, clean, true));
        }

        // T10: Raw Iframe Pass-through (Failsafe)
        streams.push(buildStream("T10 Raw Iframe", srvName, iframeUrl, false));

    }).catch(function() {
        streams.push({ name: "T10 Failsafe | " + srvName, url: iframeUrl, quality: "1080p", provider: "desenefaine" });
    });

    return Promise.all([p4mPromise, htmlPromise]).then(function() {
        return streams;
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
      var routerUrls = [];

      $$("[data-src]").each(function(_, el) {
          var src = $$(el).attr("data-src");
          if (src && src.startsWith("aHR0")) {
              var decoded = decodeBase64(src);
              if (decoded.startsWith("http")) routerUrls.push(decoded);
          }
      });

      if (routerUrls.length === 0) return [{ name: "Err", title: "No Base64 Buttons", url: "http://err", quality: "1080p", provider: "desenefaine" }];

      var processPromises = routerUrls.map(function(rUrl) {
          return fetchText(rUrl, { headers: { "Referer": result.url } }).then(function(rHtml) {
              var iframeMatch = rHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
              if (!iframeMatch || !iframeMatch[1]) return [];

              var innerUrl = iframeMatch[1].replace(/\\\//g, "/");
              if (innerUrl.startsWith("//")) innerUrl = "https:" + innerUrl;

              return run10ExtractionTests(innerUrl);
          }).catch(function() { return []; });
      });

      return Promise.all(processPromises).then(function(arraysOfStreams) {
          var finalStreams = [];
          for (var i = 0; i < arraysOfStreams.length; i++) {
              if (arraysOfStreams[i] && arraysOfStreams[i].length) {
                  finalStreams = finalStreams.concat(arraysOfStreams[i]);
              }
          }
          return finalStreams.length > 0 ? finalStreams : [{ name: "Extraction Failed", url: "http://err", quality: "1080p", provider: "desenefaine" }];
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
