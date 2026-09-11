var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
// Using the working TMDB key from the reference Nuvio-TV plugin
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

// Removes diacritics and special chars for reliable matching (e.g., "Mașini" -> "masini")
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

    log("TMDB Titles -> RO: '" + roTitle + "' | EN: '" + enTitle + "'");

    // Helper function to search the site and return the best matching URL
    function searchSite(query) {
      var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
      log("Searching site for: '" + query + "'");
      
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
          
          // Check if most of the query words are in the post title
          var matchCount = 0;
          queryWords.forEach(function(word) {
            if (normText.includes(word)) matchCount++;
          });

          if (matchCount >= Math.ceil(queryWords.length / 2)) {
            // Prefer shorter, more exact titles
            if (!bestMatch || text.length < bestMatch.text.length) {
              bestMatch = { href: href, text: text, score: matchCount };
            }
          }
        });

        return bestMatch;
      }).catch(function(e) {
        log("Search failed for '" + query + "': " + e.message);
        return null;
      });
    }

    // Try Romanian title first, then English title as fallback
    return searchSite(roTitle).then(function(match) {
      if (match) {
        log("Found match with RO title: " + match.text + " -> " + match.href);
        return match.href;
      }
      
      if (enTitle && enTitle !== roTitle) {
        log("RO title failed, trying EN title: '" + enTitle + "'");
        return searchSite(enTitle).then(function(enMatch) {
          if (enMatch) {
            log("Found match with EN title: " + enMatch.text + " -> " + enMatch.href);
            return enMatch.href;
          }
          log("No matches found for either RO or EN title.");
          return null;
        });
      }
      
      log("No matches found.");
      return null;
    }).then(function(postUrl) {
      if (!postUrl) return [];

      log("Extracting streams from: " + postUrl);
      return fetchText(postUrl).then(function(postHtml) {
        var $$ = cheerio.load(postHtml);
        var streams = [];
        var serverCount = 1;

        $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src") || $$(el).attr("data-lazy-src");
          if (!src) return;
          
          if (src.startsWith("//")) src = "https:" + src;
          else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;

          if (src.includes("facebook.com") || src.includes("youtube.com") || src.includes("doubleclick") || src.includes("google.com")) {
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

        log("Successfully extracted " + streams.length + " streams.");
        return streams;
      });
    });
  }).catch(function(e) {
    log("Fatal Error: " + e.message);
    return [];
  });
}

// Support both CommonJS (Nuvio) and Global environments
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
