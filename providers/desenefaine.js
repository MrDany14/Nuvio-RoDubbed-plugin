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
    redirect: options.redirect || "follow",
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
    redirect: options.redirect || "follow",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function normalizeSlug(value) {
  return String(value || "").toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
  return String(value || "").toLowerCase()
    .replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i")
    .replace(/ș/g, "s").replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// ADVANCED RESOLVER: Bypasses the iframe to find the hidden .m3u8/.mp4 link
function resolveIframe(iframeUrl, postUrl) {
  return fetchText(iframeUrl, {
    headers: { "Referer": postUrl, "Origin": MAIN_URL }
  }).then(function(iframeHtml) {
    var videoUrl = null;
    
    // 1. Search for hidden .m3u8 or .mp4 links in the JavaScript/HTML
    var m3u8Match = iframeHtml.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
    if (m3u8Match) videoUrl = m3u8Match[0];
    
    if (!videoUrl) {
      var mp4Match = iframeHtml.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/i);
      if (mp4Match) videoUrl = mp4Match[0];
    }

    // 2. Search for <source> tags inside the iframe
    if (!videoUrl) {
      var $ = cheerio.load(iframeHtml);
      var src = $("source").attr("src") || $("video").attr("src");
      if (src) {
        if (src.startsWith("//")) src = "https:" + src;
        videoUrl = src;
      }
    }

    // 3. Search for common JS player variables (e.g., file: "url")
    if (!videoUrl) {
      var jsMatch = iframeHtml.match(/(?:file|src|source|url):\s*["']([^"']+\.m?[^"']*)["']/i);
      if (jsMatch) videoUrl = jsMatch[1];
    }

    if (videoUrl) {
      log("RESOLVED DIRECT STREAM: " + videoUrl);
      return videoUrl;
    }
    return null;
  }).catch(function() { return null; });
}

function getStreams(id, type, season, episode) {
  log("Requested: " + id);
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = "", enTitle = "";
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
      if (type === "tv" && season && episode) slug += "-sezonul-" + season + "-episodul-" + episode;
      var prefixes = type === "tv" ? ["epi", "serial", "desene"] : ["film", "desene"];
      
      var promises = prefixes.map(function(prefix) {
        var url = MAIN_URL + "/" + prefix + "/" + slug + "/";
        return fetchText(url).then(function(html) {
          if (html.length > 2000 && !html.includes("does not exist") && !html.includes("Nu am găsit")) return { url: url, html: html };
          return null;
        }).catch(function() { return null; });
      });
      return Promise.all(promises).then(function(results) {
        for (var i = 0; i < results.length; i++) if (results[i]) return results[i];
        return null;
      });
    }

    function searchSite(query) {
      return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(query)).then(function(html) {
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
          if (matchCount >= Math.ceil(queryWords.length / 2) && (!bestMatch || text.length < bestMatch.text.length)) {
            bestMatch = { href: href, text: text };
          }
        });
        if (bestMatch) return fetchText(bestMatch.href).then(function(html) { return { url: bestMatch.href, html: html }; });
        return null;
      }).catch(function() { return null; });
    }

    return tryDirectUrl(roTitle).then(function(result) {
      if (result) return result;
      if (enTitle && enTitle !== roTitle) {
        return tryDirectUrl(enTitle).then(function(r) {
          if (r) return r;
          return searchSite(roTitle).then(function(r) { return r || searchSite(enTitle); });
        });
      }
      return searchSite(roTitle);
    }).then(function(result) {
      if (!result || !result.html) return [];
      
      var $$ = cheerio.load(result.html);
      var streams = [];
      var serverCount = 1;

      // 1. Direct links on main page
      $$("source, video").each(function(_, el) {
        var src = $$(el).attr("src");
        if (src && (src.indexOf(".mp4") !== -1 || src.indexOf(".m3u8") !== -1)) {
          if (src.startsWith("//")) src = "https:" + src;
          streams.push({
            name: PROVIDER_NAME + " | Direct",
            title: "1080p | RO Dub",
            url: src,
            quality: "1080p",
            headers: { "User-Agent": FETCH_HEADERS["User-Agent"], "Referer": result.url, "Origin": MAIN_URL },
            provider: "desenefaine"
          });
        }
      });

      // 2. Resolve Iframes to Direct Links (The "moviesdrive.js" method)
      if (streams.length === 0) {
        var iframePromises = [];
        $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src");
          if (!src) return;
          if (src.startsWith("//")) src = "https:" + src;
          else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;
          if (src.includes("facebook.com") || src.includes("youtube.com")) return;

          var p = resolveIframe(src, result.url).then(function(directUrl) {
            if (directUrl) {
              return {
                name: PROVIDER_NAME + " | Server " + serverCount++,
                title: "1080p | RO Dub (Resolved)",
                url: directUrl, // Passes the direct .m3u8 link to Nuvio
                quality: "1080p",
                headers: { 
                  "User-Agent": FETCH_HEADERS["User-Agent"], 
                  "Referer": src, 
                  "Origin": new URL(src).origin 
                },
                provider: "desenefaine"
              };
            }
            return null;
          });
          iframePromises.push(p);
        });

        return Promise.all(iframePromises).then(function(resolved) {
          resolved.forEach(function(s) { if (s) streams.push(s); });
          
          // FALLBACK: If Cloudflare blocked the resolution, open in external browser
          if (streams.length === 0) {
            $$("iframe").each(function(_, el) {
              var src = $$(el).attr("src") || $$(el).attr("data-src");
              if (!src) return;
              if (src.startsWith("//")) src = "https:" + src;
              else if (!src.startsWith("http")) src = MAIN_URL + (src.startsWith("/") ? "" : "/") + src;
              if (src.includes("facebook.com") || src.includes("youtube.com")) return;

              streams.push({
                name: PROVIDER_NAME + " | Server (External)",
                title: "1080p | RO Dub (Open in Browser)",
                externalUrl: src,
                quality: "1080p",
                provider: "desenefaine"
              });
            });
          }
          return streams;
        });
      }
      return streams;
    });
  }).catch(function(e) { log("Fatal: " + e.message); return []; });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
