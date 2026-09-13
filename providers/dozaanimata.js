// providers/dozaanimata.js
var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DozaAnimata";
var MAIN_URL = "https://www.dozaanimata.net";
var TMDB_API_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function fetchText(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: Object.assign({}, DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: Object.assign({}, DEFAULT_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
    return res.json();
  });
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getTmdbDetails(tmdbId, mediaType) {
  var isImdb = String(tmdbId).startsWith("tt");
  var url = "";
  
  if (isImdb) {
    url = "https://api.themoviedb.org/3/find/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=ro-RO";
    return fetchJson(url).then(function(data) {
      var results = mediaType === "tv" ? data.tv_results : data.movie_results;
      if (results && results.length > 0) {
        var item = results[0];
        return { 
          id: item.id, 
          title: mediaType === "tv" ? item.name : item.title,
          original: mediaType === "tv" ? item.original_name : item.original_title,
          year: (item.first_air_date || item.release_date || "").substring(0, 4) 
        };
      }
      return null;
    }).catch(function() { return null; });
  } else {
    var endpoint = mediaType === "tv" ? "tv" : "movie";
    url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";
    return fetchJson(url).then(function(data) {
      return { 
        id: data.id, 
        title: mediaType === "tv" ? data.name : data.title,
        original: mediaType === "tv" ? data.original_name : data.original_title,
        year: (data.first_air_date || data.release_date || "").substring(0, 4) 
      };
    }).catch(function() { return null; });
  }
}

function searchContent(query, mediaType, season, episode) {
  var searchUrl = MAIN_URL + "/search/" + encodeURIComponent(query) + "/";
  
  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var exactPostUrl = null;
    var titleSlug = normalizeTitle(query);

    $("a").each(function(_, el) {
      var href = $(el).attr("href");
      if (!href) return;
      if (/\/(category|genre|page|tag)\//i.test(href)) return;

      var postText = $(el).text().toLowerCase();
      var hrefLower = href.toLowerCase();

      if (mediaType === "tv" && season && episode) {
        var epPattern = new RegExp(
          "sezonul[^a-z0-9]*" + season + "[^a-z0-9]*episodul[^a-z0-9]*" + episode,
          "i"
        );
        if (hrefLower.includes("/episode/") && (epPattern.test(hrefLower) || epPattern.test(postText))) {
          exactPostUrl = href;
          return false; // break loop
        }
      } else if (mediaType === "movie") {
        if (hrefLower.includes(titleSlug) && !hrefLower.includes("/episode/") &&
            (hrefLower.includes("/movies/") || hrefLower.includes("/film-") || hrefLower.includes("/movie/"))) {
          exactPostUrl = href;
          return false; // break loop
        }
      }
    });

    if (exactPostUrl && !exactPostUrl.startsWith("http")) {
      exactPostUrl = MAIN_URL + (exactPostUrl.startsWith("/") ? "" : "/") + exactPostUrl;
    }
    
    return exactPostUrl;
  }).catch(function(e) {
    console.log("[DozaAnimata] Search error:", e.message);
    return null;
  });
}

function extractStreams(contentUrl) {
  return fetchText(contentUrl).then(function(postHtml) {
    var $ = cheerio.load(postHtml);
    var streams = [];
    var serverCount = 1;

    $("iframe").each(function(_, el) {
      var src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      if (!src) return;

      if (src.startsWith("//")) src = "https:" + src;
      else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;

      if (src.includes("facebook.com") || src.includes("youtube.com") || src.includes("doubleclick") || src.includes("googletagmanager")) {
        return;
      }

      streams.push({
        name: PROVIDER_NAME,
        title: "Server " + serverCount++ + " | RO Dub",
        url: src,
        quality: "1080p",
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              "Referer": MAIN_URL + "/",
              "User-Agent": DEFAULT_HEADERS["User-Agent"]
            }
          }
        }
      });
    });

    // Doza currently puts the fallback player in an @XX-encoded script.
    // Decode it so the player URL remains usable when the primary player is unavailable.
    var encodedIframe = postHtml.match(/str\s*=\s*'([^']+)'/i);
    if (encodedIframe) {
      var decoded = encodedIframe[1].replace(/@([0-9a-f]{2})/gi, function(_, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
      var decodedSrc = decoded.match(/<iframe[^>]+src=["']([^"']+)["']/i);
      if (decodedSrc && decodedSrc[1]) {
        streams.push({
          name: PROVIDER_NAME,
          title: "Server " + serverCount++ + " | RO Dub",
          url: decodedSrc[1],
          quality: "1080p",
          behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
              request: {
                "Referer": MAIN_URL + "/",
                "User-Agent": DEFAULT_HEADERS["User-Agent"]
              }
            }
          }
        });
      }
    }

    console.log("[DozaAnimata] Found", streams.length, "streams for", contentUrl);
    return streams;
  }).catch(function(e) {
    console.log("[DozaAnimata] Extract error:", e.message);
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  console.log("[DozaAnimata] Fetching for TMDB/IMDB ID:", tmdbId, "Type:", mediaType, "S:", season, "E:", episode);
  
  return getTmdbDetails(tmdbId, mediaType).then(function(mediaInfo) {
    if (!mediaInfo || !mediaInfo.title) {
      console.log("[DozaAnimata] TMDB match failed.");
      return [];
    }
    
    var trySearch = function(query) {
      return searchContent(query, mediaType, season, episode).then(function(contentUrl) {
        return contentUrl || null;
      });
    };
    
    return trySearch(mediaInfo.title).then(function(contentUrl) {
      if (contentUrl) return contentUrl;
      if (mediaInfo.original && mediaInfo.original !== mediaInfo.title) {
        console.log("[DozaAnimata] Romanian title failed, trying original:", mediaInfo.original);
        return trySearch(mediaInfo.original);
      }
      return null;
    }).then(function(contentUrl) {
      if (!contentUrl) {
        console.log("[DozaAnimata] No confident match found on search page.");
        return [];
      }
      
      console.log("[DozaAnimata] Extracting from:", contentUrl);
      return extractStreams(contentUrl);
    });
  }).catch(function(e) {
    console.error("[DozaAnimata] Global Error:", e.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };
