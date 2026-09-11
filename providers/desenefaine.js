var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "5201b54eb0a60ac2778dc965256f3f01";
var DEBUG = true; // Set to false once confirmed working

var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function dbg() {
  if (DEBUG) {
    var args = ["[" + PROVIDER_NAME + "]"].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }
}

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

function fixUrl(url, baseUrl) {
  if (!url) return "";
  if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  try {
    return new URL(url, baseUrl).toString();
  } catch(e) {
    return url;
  }
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
    }).catch(function(e) { 
      dbg("TMDB IMDB lookup failed:", e.message);
      return null; 
    });
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
    }).catch(function(e) { 
      dbg("TMDB ID lookup failed:", e.message);
      return null; 
    });
  }
}

function searchContent(query, mediaType, season, episode) {
  var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
  dbg("Searching:", searchUrl);
  
  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var results = [];
    
    // TARGETED SELECTOR: Only grab links inside article/post titles, ignoring menus/footers
    $("article a, .post-title a, .entry-title a, h2 a, h3 a").each(function(_, el) {
      var href = fixUrl($(el).attr("href"), MAIN_URL);
      if (!href || href === MAIN_URL + "/" || href === MAIN_URL) return;
      if (/\/(category|tag|author|page|feed|wp-admin|wp-login|about|contact|dmca|privacy)\//i.test(href)) return;
      
      var title = $(el).find("h2, h3, h4, .entry-title, .title").first().text().trim() || 
                  $(el).attr("title") || 
                  $(el).text().trim();
      
      if (!title || title.length < 3) return;
      
      var normalizedTitle = normalizeTitle(title);
      var normalizedQuery = normalizeTitle(query);
      
      var isEpisode = /sezonul|episodul|s\d+e\d+/i.test(href) || /sezonul|episodul/i.test(title);
      
      if (mediaType === "tv" && season && episode) {
        var epPattern = new RegExp("sezonul[s-]*" + season + "[s-]*episodul[s-]*" + episode, "i");
        if (!epPattern.test(href) && !epPattern.test(title)) {
          if (normalizedTitle.indexOf(normalizedQuery) === -1) return;
        }
      } else if (mediaType === "movie") {
        if (isEpisode) return; // Skip episodes when looking for a movie
      }
      
      // Flexible scoring system
      var score = 0;
      if (normalizedTitle === normalizedQuery) score = 100;
      else if (normalizedTitle.indexOf(normalizedQuery) !== -1) score = 50;
      else if (normalizedQuery.indexOf(normalizedTitle) !== -1) score = 25;
      
      if (score > 0) {
        results.push({ href: href, title: title, score: score });
      }
    });
    
    if (results.length === 0) {
      dbg("No results found for:", query);
      return null;
    }
    
    results.sort(function(a, b) { return b.score - a.score; });
    dbg("Best match:", results[0].title, "->", results[0].href);
    return results[0].href;
  }).catch(function(e) {
    dbg("Search error:", e.message);
    return null;
  });
}

function extractStreams(contentUrl, mediaType, season, episode) {
  dbg("Extracting from:", contentUrl);
  return fetchText(contentUrl).then(function(html) {
    var $ = cheerio.load(html);
    var streams = [];
    var serverCount = 1;
    
    // Look for standard and lazy-loaded iframes
    $("iframe").each(function(_, el) {
      var src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      if (!src) return;
      
      src = fixUrl(src, contentUrl);
      
      // Filter out known non-video iframes
      if (src.indexOf("facebook.com") !== -1 || 
          src.indexOf("youtube.com") !== -1 || 
          src.indexOf("doubleclick") !== -1 ||
          src.indexOf("google.com") !== -1) {
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
    
    // Fallback: look for direct video tags if iframes fail
    if (streams.length === 0) {
      $("source, video").each(function(_, el) {
        var src = $(el).attr("src");
        if (src && (src.indexOf(".mp4") !== -1 || src.indexOf(".m3u8") !== -1)) {
          src = fixUrl(src, contentUrl);
          streams.push({
            name: PROVIDER_NAME,
            title: "Direct Video | RO Dub",
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
        }
      });
    }
    
    dbg("Found", streams.length, "streams");
    return streams;
  }).catch(function(e) {
    dbg("Extract error:", e.message);
    return [];
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  dbg("getStreams called with:", tmdbId, mediaType, "S:", season, "E:", episode);
  
  return getTmdbDetails(tmdbId, mediaType).then(function(mediaInfo) {
    if (!mediaInfo || !mediaInfo.title) {
      dbg("TMDB match failed.");
      return [];
    }
    
    var trySearch = function(query) {
      return searchContent(query, mediaType, season, episode).then(function(contentUrl) {
        return contentUrl || null;
      });
    };
    
    // Try Romanian title first, then fallback to original English title
    return trySearch(mediaInfo.title).then(function(contentUrl) {
      if (contentUrl) return contentUrl;
      if (mediaInfo.original && mediaInfo.original !== mediaInfo.title) {
        dbg("Romanian title failed, trying original:", mediaInfo.original);
        return trySearch(mediaInfo.original);
      }
      return null;
    }).then(function(contentUrl) {
      if (!contentUrl) {
        dbg("No confident match found on search page.");
        return [];
      }
      return extractStreams(contentUrl, mediaType, season, episode);
    });
  }).catch(function(e) {
    console.error("[" + PROVIDER_NAME + "] Global Error:", e.message);
    return [];
  });
}

// CRITICAL: Support both CommonJS (Node/Nuvio) and Global (Browser/Web) environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
