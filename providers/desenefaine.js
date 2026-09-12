var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function log(msg) { console.log("[" + PROVIDER_NAME + "] " + msg); }

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

        // 1. ALWAYS push the raw iframe first (Guarantees Nuvio shows *something*)
        streams.push({
            name: PROVIDER_NAME + " | Iframe Fallback",
            title: "Will likely loop",
            url: src,
            quality: "1080p",
            headers: { "Referer": result.url, "User-Agent": FETCH_HEADERS["User-Agent"] },
            provider: "desenefaine"
        });

        // 2. Try to fetch and extract the direct stream
        var p = fetchText(src, { headers: { "Referer": result.url } }).then(function(iframeHtml) {
            var match = iframeHtml.match(/(https?:\/\/[^"'<>\\\s]+\.(?:m3u8|mp4)[^"'<>\\\s]*)/i);
            if (match && match[1]) {
                var directUrl = match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
                streams.push({
                    name: PROVIDER_NAME + " | Direct Test",
                    title: "Should play without loop",
                    url: directUrl,
                    quality: "1080p",
                    isM3U8: directUrl.includes(".m3u8"),
                    headers: { "Referer": src, "Origin": src.match(/^https?:\/\/([^/?#]+)/i)[0], "User-Agent": FETCH_HEADERS["User-Agent"] },
                    behaviorHints: { bingeGroup: "desenefaine-1080p" },
                    provider: "desenefaine"
                });
            }
        }).catch(function(e) {
            log("Extraction failed: " + e.message);
        });
        
        iframePromises.push(p);
      });

      return Promise.all(iframePromises).then(function() {
          return streams;
      });
    });
  }).catch(function(e) {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
