var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

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

// -----------------------------------------------------------------------------
// EMBED RESOLVER 
// -----------------------------------------------------------------------------
function resolveVideoUrl(url, pageUrl, customName) {
    var hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
    var domain = hostMatch ? hostMatch[1] : "desenefaine.com";
    
    var serverName = customName || "Server";
    var lUrl = url.toLowerCase();
    if (lUrl.includes("player4me")) serverName = "Player4Me";
    else if (lUrl.includes("streamp2p")) serverName = "StreamP2P";
    else if (lUrl.includes("seekstreaming")) serverName = "SeekStreaming";
    else if (lUrl.includes("byse")) serverName = "ByseHD";
    else if (lUrl.includes("dsvplay")) serverName = "Dsvplay";
    else if (lUrl.includes("sprintcdn")) serverName = "Direct CDN";

    if (url.includes(".m3u8") || url.includes(".mp4")) {
        return Promise.resolve({
            name: PROVIDER_NAME + " | " + serverName,
            title: "1080p | RO Dub",
            url: url,
            quality: "1080p",
            isM3U8: url.includes(".m3u8"),
            headers: { "Referer": "https://" + domain + "/", "Origin": "https://" + domain, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        });
    }

    return fetchText(url, { headers: { "Referer": pageUrl } }).then(function(html) {
        var m3u8Match = html.match(/(https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*)/i);
        var mp4Match = html.match(/(https?:\/\/[^"'<>\\\s]+\.mp4[^"'<>\\\s]*)/i);
        var directUrl = null;

        if (m3u8Match && m3u8Match[1]) directUrl = m3u8Match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
        else if (mp4Match && mp4Match[1]) directUrl = mp4Match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");

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
        }

        // Return the raw iframe url if unencrypted file not found
        return {
            name: PROVIDER_NAME + " | " + serverName,
            title: "Fallback (May Loop)",
            url: url,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        };
    }).catch(function() {
        return {
            name: PROVIDER_NAME + " | " + serverName,
            title: "Network Error",
            url: url,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        };
    });
}

// -----------------------------------------------------------------------------
// MAIN SCRAPER
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

      var streams = [];
      var errorLog = [];
      var urlsToResolve = [];
      var seenUrls = {};

      function addUrlObj(u, name) {
          if (!u) return;
          if (u.startsWith("//")) u = "https:" + u;
          if (u.includes("facebook.com") || u.includes("youtube.com")) return;
          if (!seenUrls[u]) {
              seenUrls[u] = true;
              urlsToResolve.push({ url: u, name: name });
          }
      }

      var $$ = cheerio.load(result.html);

      // Extract Post ID
      var m1 = result.html.match(/shortlink["'][^>]+p=(\d+)/i);
      var m2 = result.html.match(/postid-(\d+)/i);
      var m3 = result.html.match(/data-post=["']?(\d+)["']?/i);
      var postId = (m1&&m1[1]) || (m2&&m2[1]) || (m3&&m3[1]) || null;

      // Extract Nonce
      var nonceMatch = result.html.match(/["']nonce["']\s*:\s*["']([^"']+)["']/i) || result.html.match(/data-nonce=["']([^"']+)["']/i);
      var nonce = nonceMatch ? nonceMatch[1] : "";

      var ajaxPromises = [];
      
      if (postId) {
          var ajaxUrl = MAIN_URL + "/wp-admin/admin-ajax.php";
          
          // Force unpack servers 1 through 6
          for (var i = 1; i <= 6; i++) {
              (function(nume) {
                  var bodyData = "action=doo_player_ajax&post=" + postId + "&nume=" + nume + "&type=" + (type === "tv" ? "tv" : "movie");
                  if (nonce) bodyData += "&nonce=" + nonce + "&security=" + nonce; 

                  var p = fetchText(ajaxUrl, {
                      method: "POST",
                      headers: { 
                          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", 
                          "Referer": result.url, 
                          "Origin": MAIN_URL, 
                          "X-Requested-With": "XMLHttpRequest",
                          "User-Agent": FETCH_HEADERS["User-Agent"]
                      },
                      body: bodyData
                  }).then(function(resText) {
                      var embedMatch = resText.match(/src=["']?([^"'\s<>]+)["']?/i) || resText.match(/(https?:\/\/[^"'\s<>]+)/i);
                      if (embedMatch && embedMatch[1] && !embedMatch[1].includes("admin-ajax")) {
                          addUrlObj(embedMatch[1].replace(/\\\//g, "/"), "Server " + nume);
                      }
                  }).catch(function(e) {
                      errorLog.push("Err " + nume + ": " + e.message);
                  });
                  ajaxPromises.push(p);
              })(i);
          }
      }

      // Add pre-loaded iframes (failsafe)
      $$("iframe").each(function(_, el) {
          addUrlObj($$(el).attr("src") || $$(el).attr("data-src"), "HTML Iframe");
      });

      return Promise.all(ajaxPromises).then(function() {
          var resolvePromises = urlsToResolve.map(function(obj) {
              return resolveVideoUrl(obj.url, result.url, obj.name);
          });

          return Promise.all(resolvePromises).then(function(resolvedStreams) {
              for (var k = 0; k < resolvedStreams.length; k++) {
                  if (resolvedStreams[k]) streams.push(resolvedStreams[k]);
              }
              
              // If it STILL failed to find any servers, print the fetch error so we can read it
              if (streams.length === 0 && errorLog.length > 0) {
                  streams.push({
                      name: "AJAX Blocked: " + errorLog[0],
                      title: "Server Firewall Block",
                      url: "http://example.com/loop",
                      quality: "1080p",
                      provider: "desenefaine"
                  });
              }
              return streams;
          });
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
