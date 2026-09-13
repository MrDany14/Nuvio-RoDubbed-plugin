var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
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

function getStreams(id, type, season, episode) {
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = "";
    if (isImdb) {
      var results = type === "tv" ? data.tv_results : data.movie_results;
      if (results && results.length > 0) {
        roTitle = type === "tv" ? results[0].name : results[0].title;
      }
    } else {
      roTitle = type === "tv" ? data.name : data.title;
    }

    if (!roTitle) return [];

    var slug = normalizeSlug(roTitle);
    if (type === "tv" && season && episode) slug = slug + "-sezonul-" + season + "-episodul-" + episode;
    var url = MAIN_URL + (type === "tv" ? "/desene/" : "/film/") + slug + "/";

    return fetchText(url).then(function(html) {
      var streams = [];
      var $$ = cheerio.load(html);

      // 1. IFRAME SRC
      var iframeSrc = $$("iframe").first().attr("src") || $$("iframe").first().attr("data-src") || "NONE";
      streams.push({
          name: "1. SRC: " + iframeSrc.substring(0, 40),
          title: "Diagnostic",
          url: "http://example.com/loop1",
          quality: "1080p",
          provider: "desenefaine"
      });

      // 2. BUTTON ATTRIBUTES
      var firstBtn = $$("li[data-post]").first();
      var attrs = "NONE";
      if (firstBtn.length > 0) {
          attrs = "P:" + (firstBtn.attr("data-post")||"") + " N:" + (firstBtn.attr("data-nume")||"") + " T:" + (firstBtn.attr("data-type")||"");
      }
      streams.push({
          name: "2. BTN: " + attrs,
          title: "Diagnostic",
          url: "http://example.com/loop2",
          quality: "1080p",
          provider: "desenefaine"
      });

      // 3. BASE64 URLS
      var b64Matches = html.match(/(aHR0cHM6Ly[a-zA-Z0-9+/=]+)/g) || [];
      var decodedUrl = "NONE";
      for (var i = 0; i < b64Matches.length; i++) {
          try {
              // Simple b64 decode fallback since Node Buffer might not be in Nuvio
              var dec = typeof atob !== 'undefined' ? atob(b64Matches[i]) : "B64_FOUND_NO_ATOB"; 
              if (dec.includes("http")) { decodedUrl = dec; break; }
          } catch(e) {}
      }
      if (decodedUrl === "NONE" && b64Matches.length > 0) decodedUrl = "B64_FOUND_FAILED_DECODE";
      
      streams.push({
          name: "3. B64: " + decodedUrl.substring(0, 40),
          title: "Diagnostic",
          url: "http://example.com/loop3",
          quality: "1080p",
          provider: "desenefaine"
      });
      
      // 4. JS DATA CHECK
      var jsCheck = html.match(/doo_player_ajax/i) ? "USES_DOO_AJAX" : "NO_DOO_AJAX";
      streams.push({
          name: "4. JS: " + jsCheck,
          title: "Diagnostic",
          url: "http://example.com/loop4",
          quality: "1080p",
          provider: "desenefaine"
      });

      return streams;
    }).catch(function() {
      return [];
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
