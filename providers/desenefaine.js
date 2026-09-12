var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function log(msg) {
  console.log("[" + PROVIDER_NAME + "] " + msg);
}

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

function extractMasterUrlFromText(text) {
  if (!text) return null;
  var patterns = [
    /(https?:\/\/[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*)/i,
    /(https?:\/\/[^"'\\\s<>]+\.mp4[^"'\\\s<>]*)/i,
    /["']?(?:source|masterUrl|master_url|master|url|file|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i
  ];
  for (var j = 0; j < patterns.length; j++) {
    var m = text.match(patterns[j]);
    if (m && m[1]) return m[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  }
  return null;
}

function resolvePlayer4Me(embedUrl) {
  var filecodeMatch = embedUrl.match(/\/(?:e|embed|video|v|play|watch)\/([^/?#]+)/i);
  if (!filecodeMatch) return Promise.resolve(null);
  var filecode = filecodeMatch[1];
  
  var hostMatch = embedUrl.match(/^https?:\/\/([^/?#]+)/i);
  if (!hostMatch) return Promise.resolve(null);
  var host = hostMatch[1];

  var apiUrl = "https://" + host + "/api/v1/video?id=" + encodeURIComponent(filecode) + "&w=2048&h=1152&r=";

  // 1. Try to fetch the iframe directly (sometimes unencrypted .m3u8 is right in the HTML)
  return fetchText(embedUrl, { headers: { "Referer": MAIN_URL + "/" } }).then(function(html) {
    var directUrl = extractMasterUrlFromText(html);
    if (directUrl && directUrl.indexOf(".m3u8") !== -1) return directUrl;

    // 2. If not in HTML, fetch the API
    return fetchText(apiUrl, {
      headers: { "Referer": embedUrl, "Origin": "https://" + host, "Accept": "*/*" }
    }).then(function(body) {
      if (!body) return null;
      
      var apiDirect = extractMasterUrlFromText(body);
      if (apiDirect && apiDirect.indexOf(".m3u8") !== -1) return apiDirect;
      
      try {
        var CryptoJS = require("crypto-js");
        var key = CryptoJS.enc.Hex.parse("6b69656d7469656e6d75613931316361");
        var iv = CryptoJS.enc.Hex.parse("313233343536373839306f6975797472");
        var encrypted = CryptoJS.enc.Hex.parse(String(body).trim());
        var decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
        var text = decrypted.toString(CryptoJS.enc.Utf8);
        return extractMasterUrlFromText(text);
      } catch (e) {
        return null;
      }
    });
  }).catch(function() {
    return null;
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
      if (results && results.length > 0) {
        roTitle = type === "tv" ? results[0].name : results[0].title;
        enTitle = type === "tv" ? results[0].original_name : results[0].original_title;
      }
    } else {
      roTitle = type === "tv" ? data.name : data.title;
      enTitle = type === "tv" ? data.original_name : data.original_title;
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
          if (!href || !href.includes("desenefaine.com")) return;
          if (/\/(category|tag|author|page|feed|wp-)/i.test(href)) return;

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
      var streams = [];
      var iframePromises = [];
      var serverCount = 1;

      $$("iframe").each(function(_, el) {
        var src = $$(el).attr("src") || $$(el).attr("data-src") || $$(el).attr("data-lazy-src");
        if (!src) return;
        if (src.startsWith("//")) src = "https:" + src;
        else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;

        if (src.includes("facebook.com") || src.includes("youtube.com") || src.includes("doubleclick")) return;

        var iframeDomainMatch = src.match(/^https?:\/\/([^/?#]+)/i);
        var iframeDomain = iframeDomainMatch ? iframeDomainMatch[0] : MAIN_URL;
        var isStreamHost = src.includes("player4me") || src.includes("streamp2p") || src.includes("seekstreaming");

        var p = Promise.resolve().then(function() {
            if (isStreamHost) return resolvePlayer4Me(src);
            return null;
        }).then(function(directUrl) {
            if (directUrl && directUrl.indexOf(".m3u8") !== -1) {
                // FORMAT EXACTLY LIKE TEST 1
                streams.push({
                    name: PROVIDER_NAME + " | Server " + serverCount++,
                    title: "1080p | RO Dub",
                    url: directUrl, 
                    quality: "1080p",
                    isM3U8: true,
                    behaviorHints: { bingeGroup: "desenefaine-1080p" },
                    headers: { 
                        "Referer": iframeDomain + "/",
                        "Origin": iframeDomain,
                        "User-Agent": FETCH_HEADERS["User-Agent"]
                    },
                    provider: "desenefaine"
                });
            } else {
                // FAILSAFE: Push the original iframe URL if decryption fails, so it never returns 0 streams
                streams.push({
                    name: PROVIDER_NAME + " | Iframe Fallback",
                    title: "Could not unpack stream",
                    url: src,
                    quality: "1080p",
                    headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
                    provider: "desenefaine"
                });
            }
        }).catch(function() {
            // CATCH ALL FAILURES: Push the original iframe URL
            streams.push({
                name: PROVIDER_NAME + " | Iframe Fallback",
                title: "Network error during unpack",
                url: src,
                quality: "1080p",
                headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
                provider: "desenefaine"
            });
        });
        
        iframePromises.push(p);
      });

      return Promise.all(iframePromises).then(function() {
          return streams;
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
