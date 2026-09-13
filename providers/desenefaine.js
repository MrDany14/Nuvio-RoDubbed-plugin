var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

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

    return tryDirectUrl(roTitle).then(function(result) {
      if (!result || !result.html) return [];

      var streams = [];
      
      // 1. EXTRACT POST ID
      var m1 = result.html.match(/shortlink["'][^>]+p=(\d+)/i);
      var m2 = result.html.match(/postid-(\d+)/i);
      var m3 = result.html.match(/data-post=["']?(\d+)["']?/i);
      var postId = (m1&&m1[1]) || (m2&&m2[1]) || (m3&&m3[1]) || null;

      if (!postId) {
          streams.push({
              name: "Error: No Post ID",
              title: "Scraper failed to find movie ID",
              url: "http://example.com",
              quality: "1080p",
              provider: "desenefaine"
          });
          return streams;
      }

      // 2. ISOLATED AJAX FETCH
      var ajaxUrl = MAIN_URL + "/wp-admin/admin-ajax.php";
      var bodyData = "action=doo_player_ajax&post=" + postId + "&nume=1&type=" + (type === "tv" ? "tv" : "movie");

      // We use the raw JS fetch here to catch the exact status code
      return fetch(ajaxUrl, {
          method: "POST",
          headers: { 
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", 
              "Referer": result.url,
              "Origin": MAIN_URL,
              "X-Requested-With": "XMLHttpRequest",
              "User-Agent": FETCH_HEADERS["User-Agent"]
          },
          body: bodyData
      }).then(function(res) {
          var statusCode = res.status;
          
          return res.text().then(function(text) {
              var cleanText = text.replace(/</g, "").replace(/>/g, "").substring(0, 50);
              
              streams.push({
                  name: "Status: " + statusCode,
                  title: cleanText ? cleanText : "EMPTY_RESPONSE",
                  url: "http://example.com/loop",
                  quality: "1080p",
                  provider: "desenefaine"
              });
              
              return streams;
          });
      }).catch(function(e) {
          streams.push({
              name: "Fetch Error",
              title: e.message || "Network Failed",
              url: "http://example.com/loop",
              quality: "1080p",
              provider: "desenefaine"
          });
          return streams;
      });

    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
