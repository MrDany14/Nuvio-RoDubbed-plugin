var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var DEFAULT_HEADERS = {
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

function getStreams(id, type, season, episode) {
  log("Nuvio requested: ID=" + id + ", Type=" + type + ", S=" + season + ", E=" + episode);
  
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = "";
    var enTitle = "";

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

    if (!roTitle && !enTitle) {
      log("TMDB returned no title for ID: " + id);
      return [];
    }

    function tryDirectUrl(title) {
      var slug = normalizeSlug(title);
      if (type === "tv" && season && episode) {
        slug = normalizeSlug(title) + "-sezonul-" + season + "-episodul-" + episode;
      }
      
      var prefixes = type === "tv" ? ["epi", "serial", "desene"] : ["film", "desene"];
      
      var promises = prefixes.map(function(prefix) {
        var url = MAIN_URL + "/" + prefix + "/" + slug + "/";
        return fetchText(url).then(function(html) {
          if (html && html.length > 2000 && !html.includes("does not exist") && !html.includes("Nu am găsit")) {
            return { url: url, html: html };
          }
          return null;
        }).catch(function() { return null; });
      });
      
      return Promise.all(promises).then(function(results) {
        for (var i = 0; i < results.length; i++) {
          if (results[i]) {
            log("Direct URL match: " + results[i].url);
            return results[i];
          }
        }
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
          queryWords.forEach(function(word) {
            if (normText.includes(word)) matchCount++;
          });

          if (matchCount >= Math.ceil(queryWords.length / 2)) {
            if (!bestMatch || text.length < bestMatch.text.length) {
              bestMatch = { href: href, text: text, score: matchCount };
            }
          }
        });

        if (bestMatch) {
          return fetchText(bestMatch.href).then(function(html) {
            return { url: bestMatch.href, html: html };
          });
        }
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
      if (!result || !result.html) {
        log("No valid page found.");
        return [];
      }

      log("Extracting from: " + result.url);
      var $$ = cheerio.load(result.html);
      var streams = [];
      var serverCount = 1;

      // 1. PRIORITY: Direct .mp4 or .m3u8 links
      $$("source, video").each(function(_, el) {
        var src = $$(el).attr("src");
        if (src && (src.indexOf(".mp4") !== -1 || src.indexOf(".m3u8") !== -1)) {
          if (src.startsWith("//")) src = "https:" + src;
          else if (!src.startsWith("http")) src = result.url + (src.startsWith("/") ? "" : "/") + src;
          
          streams.push({
            name: PROVIDER_NAME,
            title: "Direct Video | RO Dub",
            url: src,
            quality: "1080p",
            behaviorHints: {
              notWebReady: true,
              filename: "video.mp4",
              proxyHeaders: {
                request: {
                  "Referer": result.url,
                  "User-Agent": DEFAULT_HEADERS["User-Agent"]
                }
              }
            }
          });
        }
      });

      // 2. FALLBACK: Iframes (like player4me)
      if (streams.length === 0) {
        $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src") || $$(el).attr("data-lazy-src");
          if (!src) return;
          
          if (src.startsWith("//")) src = "https:" + src;
          else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;

          if (src.includes("facebook.com") || src.includes("youtube.com") || src.includes("doubleclick")) {
            return;
          }

          log("FOUND IFRAME: " + src);

          streams.push({
            name: PROVIDER_NAME,
            title: "Server " + serverCount++ + " | RO Dub (Use External Player if loops)",
            url: src,
            quality: "1080p",
            behaviorHints: {
              notWebReady: true,
              filename: "video.mp4", // CRITICAL: Tricks Nuvio into treating it as a video stream
              proxyHeaders: {
                request: {
                  "Referer": result.url, // MUST be the post URL
                  "Origin": MAIN_URL,
                  "User-Agent": DEFAULT_HEADERS["User-Agent"],
                  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
                }
              }
            }
          });
        });
      }

      log("Extracted " + streams.length + " streams.");
      return streams;
    });
  }).catch(function(e) {
    log("Fatal Error: " + e.message);
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
