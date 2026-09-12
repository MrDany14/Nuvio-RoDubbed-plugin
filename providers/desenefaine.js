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
      var foundUrls = {}; // Used to prevent duplicate servers
      var html = result.html.replace(/\\\//g, "/"); // Unescape JSON slashes

      function addStream(url) {
          if (!url) return;
          if (url.startsWith("//")) url = "https:" + url;
          if (url.includes("facebook.com") || url.includes("youtube.com")) return;
          
          // Prevent duplicates
          if (foundUrls[url]) return;
          foundUrls[url] = true;

          var hostMatch = url.match(/^https?:\/\/([^/?#]+)/i);
          var host = hostMatch ? hostMatch[1] : "desenefaine.com";
          
          // Name the servers nicely based on the host
          var serverName = "Server";
          if (url.includes("player4me")) serverName = "Player4Me";
          else if (url.includes("streamp2p")) serverName = "StreamP2P";
          else if (url.includes("seekstreaming")) serverName = "SeekStreaming";
          else if (url.includes("byse")) serverName = "ByseHD";
          else if (url.includes("dsvplay")) serverName = "Dsvplay";
          else if (url.includes("ok.ru")) serverName = "Ok.ru";

          streams.push({
              name: PROVIDER_NAME + " | " + serverName,
              title: "1080p | RO Dub",
              url: url,
              quality: "1080p",
              headers: { 
                  "Referer": "https://" + host + "/",
                  "Origin": "https://" + host,
                  "User-Agent": FETCH_HEADERS["User-Agent"]
              },
              behaviorHints: { bingeGroup: "desenefaine-1080p" },
              provider: "desenefaine"
          });
      }

      // 1. CHEERIO: Extract standard iframes
      var $$ = cheerio.load(result.html);
      $$("iframe").each(function(_, el) {
          addStream($$(el).attr("src") || $$(el).attr("data-src") || $$(el).attr("data-lazy-src"));
      });

      // 2. RAW REGEX: Extract hidden embeds from Dooplay inline scripts/data attributes
      // This will grab Byse, Dsvplay, etc., even if they aren't loaded in an iframe yet.
      var embedRegex = /(https?:)?\/\/(player4me\.com|streamp2p\.com|seekstreaming\.com|byse[a-zA-Z0-9.-]*\.[a-z]+|dsvplay[a-zA-Z0-9.-]*\.[a-z]+|ok\.ru)\/[a-zA-Z0-9_/?&=-]+/gi;
      var match;
      while ((match = embedRegex.exec(html)) !== null) {
          addStream(match[0]);
      }

      // 3. RAW REGEX: Extract any direct .mp4 or .m3u8 found in the source code
      var directRegex = /(https?:\/\/[^"'<>\\\s]+\.(?:m3u8|mp4)[^"'<>\\\s]*)/gi;
      var directMatch;
      while ((directMatch = directRegex.exec(html)) !== null) {
          addStream(directMatch[1]);
      }

      return streams;
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
