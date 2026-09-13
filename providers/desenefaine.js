var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "Desene Router Fix";
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

function resolveVideoUrl(url, pageUrl, prefix) {
    var hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
    var domain = hostMatch ? hostMatch[1] : "Unknown_Host";
    
    // Default to the actual domain name instead of "Server"
    var serverName = domain.replace("www.", ""); 
    var lUrl = url.toLowerCase();
    
    if (lUrl.includes("player4me")) serverName = "Player4Me";
    else if (lUrl.includes("streamp2p")) serverName = "StreamP2P";
    else if (lUrl.includes("seekstreaming")) serverName = "SeekStreaming";
    else if (lUrl.includes("byse")) serverName = "ByseHD";
    else if (lUrl.includes("dsvplay")) serverName = "Dsvplay";
    else if (lUrl.includes("ok.ru")) serverName = "Ok.ru";
    else if (lUrl.includes("youtube")) serverName = "YouTube";
    
    var finalName = prefix ? (prefix + " | " + serverName) : serverName;

    if (url.includes(".m3u8") || url.includes(".mp4")) {
        return Promise.resolve({
            name: PROVIDER_NAME + " | " + finalName,
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
                name: PROVIDER_NAME + " | " + finalName,
                title: "1080p | RO Dub",
                url: directUrl, 
                quality: "1080p",
                isM3U8: directUrl.includes(".m3u8"),
                headers: { "Referer": "https://" + domain + "/", "Origin": "https://" + domain, "User-Agent": FETCH_HEADERS["User-Agent"] },
                behaviorHints: { bingeGroup: "desenefaine-1080p" },
                provider: "desenefaine"
            };
        }

        return {
            name: PROVIDER_NAME + " | " + finalName,
            title: "Fallback (May Loop)",
            url: url,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        };
    }).catch(function() {
        return {
            name: PROVIDER_NAME + " | " + finalName,
            title: "Network Error",
            url: url,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "desenefaine-1080p" },
            provider: "desenefaine"
        };
    });
}

function processExtractedUrl(url, pageUrl) {
    if (!url) return Promise.resolve(null);
    if (url.startsWith("//")) url = "https:" + url;

    if (url.includes("desenefaine.com/?")) {
        var prefix = url.includes("trembed") ? "Trailer" : "Movie";
        
        return fetchText(url, { headers: { "Referer": pageUrl } }).then(function(html) {
            var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
            if (iframeMatch && iframeMatch[1]) {
                var innerUrl = iframeMatch[1].replace(/\\\//g, "/");
                return resolveVideoUrl(innerUrl, url, prefix);
            }
            
            var directMatch = html.match(/(https?:\/\/[^"'<>\\\s]+\.(?:m3u8|mp4)[^"'<>\\\s]*)/i);
            if (directMatch && directMatch[1]) {
                return resolveVideoUrl(directMatch[1].replace(/\\\//g, "/"), url, prefix);
            }
            return null;
        }).catch(function() { return null; });
    }

    return resolveVideoUrl(url, pageUrl, "Stream");
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

      var streams = [];
      var urlsToInvestigate = [];
      var $$ = cheerio.load(result.html);

      $$("iframe").each(function(_, el) {
          var src = $$(el).attr("src") || $$(el).attr("data-src");
          if (src && !src.includes("facebook")) urlsToInvestigate.push(src);
      });

      var b64Matches = result.html.match(/(aHR0cHM6Ly[a-zA-Z0-9+/=]+)/g) || [];
      b64Matches.forEach(function(b64) {
          try {
              var dec = typeof atob !== 'undefined' ? atob(b64) : null;
              if (dec && dec.includes("http") && urlsToInvestigate.indexOf(dec) === -1) {
                  urlsToInvestigate.push(dec);
              }
          } catch(e) {}
      });

      var processPromises = urlsToInvestigate.map(function(u) {
          return processExtractedUrl(u, result.url);
      });

      return Promise.all(processPromises).then(function(resolvedStreams) {
          for (var k = 0; k < resolvedStreams.length; k++) {
              if (resolvedStreams[k]) streams.push(resolvedStreams[k]);
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
