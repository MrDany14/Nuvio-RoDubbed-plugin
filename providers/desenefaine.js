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

      // TEST 1: Check for Dooplay Post ID
      var postIdMatch = result.html.match(/data-post=["'](\d+)["']/i) || result.html.match(/"post_id":"?(\d+)"?/i) || result.html.match(/\?p=(\d+)/i) || result.html.match(/postid=(\d+)/i);
      var postId = postIdMatch ? postIdMatch[1] : "NOT_FOUND";
      streams.push({
          name: "ID: " + postId, // Forces data into main title
          title: "Post ID",
          url: "http://example.com/loop",
          quality: "1080p",
          provider: "desenefaine"
      });

      // TEST 2: Check for Server List in HTML
      var serverList = [];
      $$("li[data-post][data-nume]").each(function(_, el) {
          serverList.push($$(el).attr("data-nume"));
      });
      streams.push({
          name: "Servers: " + (serverList.length > 0 ? serverList.length : "0 found"),
          title: "Found Server Count",
          url: "http://example.com/loop",
          quality: "1080p",
          provider: "desenefaine"
      });

      // TEST 3: Check for Nonce (Security Token)
      var nonceMatch = result.html.match(/"?nonce"?\s*:\s*["']([^"']+)["']/i) || result.html.match(/data-nonce=["']([^"']+)["']/i);
      var nonce = nonceMatch ? nonceMatch[1] : "NOT_FOUND";
      streams.push({
          name: "Nonce: " + nonce,
          title: "Security Token",
          url: "http://example.com/loop",
          quality: "1080p",
          provider: "desenefaine"
      });

      // TEST 4: Blind-fire AJAX call to see if it blocks us
      if (postId !== "NOT_FOUND") {
          var ajaxUrl = MAIN_URL + "/wp-admin/admin-ajax.php";
          var bodyData = "action=doo_player_ajax&post=" + postId + "&nume=1&type=movie";
          
          return fetchText(ajaxUrl, {
              method: "POST",
              headers: { 
                  "Content-Type": "application/x-www-form-urlencoded", 
                  "Referer": result.url, 
                  "X-Requested-With": "XMLHttpRequest" 
              },
              body: bodyData
          }).then(function(resText) {
              var cleanText = resText.replace(/</g, "").replace(/>/g, "").substring(0, 35);
              streams.push({
                  name: "AJAX: " + (cleanText || "EMPTY"),
                  title: "Backend Response",
                  url: "http://example.com/loop",
                  quality: "1080p",
                  provider: "desenefaine"
              });
              return streams;
          }).catch(function(e) {
              streams.push({
                  name: "AJAX ERR: " + e.message,
                  title: "Backend Error",
                  url: "http://example.com/loop",
                  quality: "1080p",
                  provider: "desenefaine"
              });
              return streams;
          });
      }

      return streams;
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
