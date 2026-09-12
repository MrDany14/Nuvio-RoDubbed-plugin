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
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  return fetch(url, {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
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

// -----------------------------------------------------------------------------
// EMBED RESOLVER (Converts iframes to direct .m3u8/.mp4 to fix Nuvio loops)
// -----------------------------------------------------------------------------
function resolveEmbed(embedUrl, serverName, pageUrl) {
    var hostMatch = embedUrl.match(/^https?:\/\/([^/?#]+)/i);
    var domain = hostMatch ? hostMatch[1] : "desenefaine.com";

    return fetchText(embedUrl, { headers: { "Referer": pageUrl } }).then(function(html) {
        // Regex to find raw video files in the iframe's source code
        var match = html.match(/(https?:\/\/[^"'<>\\\s]+\.(?:m3u8|mp4)[^"'<>\\\s]*)/i) || 
                    html.match(/(?:file|src|url)["']?\s*[:=]\s*["'](https?:\/\/[^"']+(?:\.mp4|\.m3u8)[^"']*)["']/i);
        
        var directUrl = null;
        if (match && match[1]) {
            directUrl = match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
        }

        if (directUrl) {
            return {
                name: PROVIDER_NAME + " | " + serverName,
                title: "1080p | RO Dub",
                url: directUrl, 
                quality: "1080p",
                isM3U8: directUrl.includes(".m3u8"),
                headers: { "Referer": "https://" + domain + "/", "Origin": "https://" + domain, "User-Agent": FETCH_HEADERS["User-Agent"] },
                behaviorHints: { bingeGroup: "desenefaine-1080p" },
                provider: "desenefaine"
            };
        } else {
            // Failsafe: if extraction fails, push the iframe URL anyway so it appears in the list
            return {
                name: PROVIDER_NAME + " | " + serverName,
                title: "Extraction Failed (May Loop)",
                url: embedUrl,
                quality: "1080p",
                headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
                behaviorHints: { bingeGroup: "desenefaine-1080p" },
                provider: "desenefaine"
            };
        }
    }).catch(function() {
        return {
            name: PROVIDER_NAME + " | " + serverName,
            title: "Network Error (May Loop)",
            url: embedUrl,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        };
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
      var dooplayServers = [];

      // 1. EXTRACT DOOPLAY AJAX SERVERS (This matches your screenshot!)
      $$("li[data-post][data-nume][data-type]").each(function(_, el) {
          var post = $$(el).attr("data-post");
          var nume = $$(el).attr("data-nume");
          var type = $$(el).attr("data-type");
          var serverText = $$(el).find(".server").text().trim() || $$(el).find(".title").text().trim();
          
          if (post && nume && type) {
              // Clean up the name (e.g., "ByseHd - ROMANA" -> "ByseHD")
              var cleanName = serverText ? serverText.split("-")[0].trim() : "Server " + nume;
              dooplayServers.push({ post: post, nume: nume, type: type, name: cleanName });
          }
      });

      var ajaxPromises = [];
      var ajaxUrl = MAIN_URL + "/wp-admin/admin-ajax.php";

      // 2. FETCH THE HIDDEN IFRAMES FROM WORDPRESS BACKEND
      if (dooplayServers.length > 0) {
          dooplayServers.forEach(function(server) {
              var bodyData = "action=doo_player_ajax&post=" + server.post + "&nume=" + server.nume + "&type=" + server.type;
              
              var p = fetchText(ajaxUrl, {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/x-www-form-urlencoded",
                      "Referer": result.url,
                      "X-Requested-With": "XMLHttpRequest"
                  },
                  body: bodyData
              }).then(function(resText) {
                  var embedStr = "";
                  try {
                      var json = JSON.parse(resText);
                      embedStr = json.embed_url || "";
                  } catch(e) {
                      embedStr = resText; // Sometimes it just returns the iframe HTML directly
                  }

                  var srcMatch = embedStr.match(/src=["']([^"']+)["']/i);
                  var finalEmbedUrl = srcMatch ? srcMatch[1] : embedStr;

                  if (finalEmbedUrl && finalEmbedUrl.startsWith("http")) {
                      return resolveEmbed(finalEmbedUrl, server.name, result.url);
                  }
                  return null;
              }).catch(function() { return null; });

              ajaxPromises.push(p);
          });

          return Promise.all(ajaxPromises).then(function(results) {
              for (var i = 0; i < results.length; i++) {
                  if (results[i]) streams.push(results[i]);
              }
              return streams;
          });
      }

      // 3. FALLBACK: IF NO AJAX SERVERS FOUND, SCAN DOM FOR PRELOADED IFRAMES
      var serverCount = 1;
      $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src") || $$(el).attr("data-lazy-src");
          if (!src) return;
          if (src.startsWith("//")) src = "https:" + src;
          else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;

          if (src.includes("facebook.com") || src.includes("youtube.com") || src.includes("doubleclick")) return;

          var hostMatch = src.match(/^https?:\/\/([^/?#]+)/i);
          var serverName = hostMatch ? hostMatch[1].split(".")[0] : "Server " + serverCount++;

          ajaxPromises.push(resolveEmbed(src, serverName, result.url));
      });

      return Promise.all(ajaxPromises).then(function(results) {
          for (var i = 0; i < results.length; i++) {
              if (results[i]) streams.push(results[i]);
          }
          return streams;
      });

    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
