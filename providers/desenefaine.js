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
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// EXACT WORKING PLAYER4ME DECRYPTOR (From your original script)
// -----------------------------------------------------------------------------
function extractMasterUrlFromPayload(payload) {
  if (!payload) return null;
  var text = String(payload).trim();
  try {
    var obj = JSON.parse(text);
    if (obj) {
      var candidates = [ obj.source, obj.master, obj.masterUrl, obj.master_url, obj.url, obj.file, obj.playlist ];
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i] && typeof candidates[i] === "string" && /^https?:\/\//i.test(candidates[i])) return candidates[i];
      }
      if (obj.data) {
        var nested = extractMasterUrlFromPayload(JSON.stringify(obj.data));
        if (nested) return nested;
      }
    }
  } catch (_) {}
  
  var patterns = [
    /["']?(?:source|masterUrl|master_url|master|url|file|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /(https?:\/\/[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*)/i,
    /(https?:\/\/[^"'\\\s<>]+\.mp4[^"'\\\s<>]*)/i,
  ];
  for (var j = 0; j < patterns.length; j++) {
    var m = text.match(patterns[j]);
    if (m && m[1]) return m[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  }
  if (/^https?:\/\//i.test(text)) return text;
  return null;
}

function resolvePlayer4MeAPI(embedUrl) {
  var filecodeMatch = embedUrl.match(/\/(?:e|embed|video|v|play|watch)\/([^/?#]+)/i);
  if (!filecodeMatch) return Promise.resolve(null);
  var filecode = filecodeMatch[1];
  
  var hostMatch = embedUrl.match(/^https?:\/\/([^/?#]+)/i);
  if (!hostMatch) return Promise.resolve(null);
  var host = hostMatch[1];
  
  var apiUrl = "https://" + host + "/api/v1/video?id=" + encodeURIComponent(filecode) + "&w=2048&h=1152&r=";

  return fetchText(apiUrl, {
    headers: { "Referer": embedUrl, "Origin": "https://" + host, "Accept": "*/*" }
  }).then(function(body) {
    if (!body) return null;
    
    // 1. Check if the response is unencrypted JSON
    var direct = extractMasterUrlFromPayload(body);
    if (direct) return direct;
    
    // 2. Run the AES Decryptor on the payload
    try {
      var CryptoJS = require("crypto-js");
      var key = CryptoJS.enc.Hex.parse("6b69656d7469656e6d75613931316361");
      var iv = CryptoJS.enc.Hex.parse("313233343536373839306f6975797472");
      var encrypted = CryptoJS.enc.Hex.parse(String(body).trim());
      var decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
      var text = decrypted.toString(CryptoJS.enc.Utf8);
      
      return extractMasterUrlFromPayload(text);
    } catch (e) {
      log("Crypto Error: " + e.message);
      return null;
    }
  }).catch(function(e) {
    log("API Fetch Error: " + e.message);
    return null;
  });
}

// -----------------------------------------------------------------------------
// MAIN SCRAPING LOGIC
// -----------------------------------------------------------------------------
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
            if (isStreamHost) return resolvePlayer4MeAPI(src);
            return null;
        }).then(function(directUrl) {
            // FORMAT EXACTLY LIKE TEST 1
            if (directUrl) {
                streams.push({
                    name: PROVIDER_NAME + " | Server " + serverCount++,
                    title: "1080p | RO Dub",
                    url: directUrl, 
                    quality: "1080p",
                    isM3U8: directUrl.includes(".m3u8"),
                    behaviorHints: { bingeGroup: "desenefaine-1080p" },
                    headers: { 
                        "Referer": iframeDomain + "/",
                        "Origin": iframeDomain,
                        "User-Agent": FETCH_HEADERS["User-Agent"]
                    },
                    provider: "desenefaine"
                });
            }
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
