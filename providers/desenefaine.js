var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
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

// --- CORE PLAYER4ME DECRYPTION LOGIC ---
function extractDecryptedM3U8(iframeUrl) {
  return new Promise(function(resolve) {
    var filecodeMatch = iframeUrl.match(/\/(?:e|embed|video|v|play|watch)\/([^/?#]+)/i);
    if (!filecodeMatch) return resolve(null);
    
    var filecode = filecodeMatch[1];
    var hostMatch = iframeUrl.match(/^https?:\/\/([^/?#]+)/i);
    if (!hostMatch) return resolve(null);
    var host = hostMatch[1];
    
    var apiUrl = "https://" + host + "/api/v1/video?id=" + encodeURIComponent(filecode) + "&w=2048&h=1152&r=";

    fetchText(apiUrl, { "Referer": iframeUrl, "Origin": "https://" + host }).then(function(body) {
      // 1. Check if it's unencrypted JSON
      var m3u8Regex = /(https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*)/i;
      var unencryptedMatch = body.match(m3u8Regex);
      if (unencryptedMatch && unencryptedMatch[1]) {
          return resolve(unencryptedMatch[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&"));
      }

      // 2. Run AES Decryption
      try {
        var CryptoJS = require("crypto-js");
        var key = CryptoJS.enc.Hex.parse("6b69656d7469656e6d75613931316361");
        var iv = CryptoJS.enc.Hex.parse("313233343536373839306f6975797472");
        var encrypted = CryptoJS.enc.Hex.parse(String(body).trim());
        var decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
        var text = decrypted.toString(CryptoJS.enc.Utf8);
        
        var decryptedMatch = text.match(m3u8Regex);
        if (decryptedMatch && decryptedMatch[1]) {
            return resolve(decryptedMatch[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&"));
        }
      } catch (e) {
        // Crypto failed
      }
      resolve(null);
    }).catch(function() { resolve(null); });
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

    return tryDirectUrl(roTitle).then(function(result) {
      if (result) return result;
      if (enTitle && enTitle !== roTitle) return tryDirectUrl(enTitle);
      return null;
    }).then(function(result) {
      if (!result || !result.html) return [];

      var $$ = cheerio.load(result.html);
      var streams = [];
      var iframePromises = [];

      $$("iframe").each(function(_, el) {
        var src = $$(el).attr("src") || $$(el).attr("data-src");
        if (!src) return;
        if (src.startsWith("//")) src = "https:" + src;
        if (src.includes("facebook.com") || src.includes("youtube.com")) return;

        var iframeDomain = src.match(/^https?:\/\/([^/?#]+)/i)[0];

        var p = extractDecryptedM3U8(src).then(function(directUrl) {
            if (directUrl) {
                streams.push({
                    name: PROVIDER_NAME + " | Server 1 (HLS Decrypted)",
                    title: "1080p | RO Dub",
                    url: directUrl, // Successfully extracted sprintcdn m3u8
                    quality: "1080p",
                    isM3U8: true, // Tells ExoPlayer to handle HLS chunks
                    behaviorHints: { bingeGroup: "desenefaine-1080p" },
                    headers: { 
                        "User-Agent": FETCH_HEADERS["User-Agent"], 
                        "Referer": iframeDomain + "/", // Bypasses CDN Block
                        "Origin": iframeDomain
                    },
                    provider: "desenefaine"
                });
            } else {
                streams.push({
                    name: PROVIDER_NAME + " | Iframe Fallback (Loop Warning)",
                    title: "Extraction Failed",
                    url: src,
                    quality: "1080p",
                    headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
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
