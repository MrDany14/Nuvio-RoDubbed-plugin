var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
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

function getStreams(id, type, season, episode) {
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
  var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

  return fetchJson(tmdbUrl).then(function(data) {
    var roTitle = ""; 
    if (isImdb) {
      var results = type === "tv" ? data.tv_results : data.movie_results;
      if (results && results.length > 0) roTitle = type === "tv" ? results[0].name : results[0].title;
    } else {
      roTitle = type === "tv" ? data.name : data.title;
    }

    if (!roTitle) return [];

    var slug = normalizeSlug(roTitle);
    if (type === "tv" && season && episode) slug = slug + "-sezonul-" + season + "-episodul-" + episode;
    var url = MAIN_URL + (type === "tv" ? "/desene/" : "/film/") + slug + "/";

    return fetchText(url).then(function(html) {
      var streams = [];

      // Extract all 'action' commands hidden in their Javascript
      var actionMatches = html.match(/["']action["']\s*:\s*["']([^"']+)["']/gi) || [];
      var uniqueActions = [];
      
      actionMatches.forEach(function(m) {
          var act = m.split(/['"]/)[3]; 
          if (act && uniqueActions.indexOf(act) === -1 && !act.includes("http")) {
              uniqueActions.push(act);
          }
      });

      // Push the extracted actions as stream names so we can read them
      streams.push({
          name: "1. Act: " + (uniqueActions[0] || "NONE"),
          title: "Diagnostic",
          url: "http://example.com/loop1",
          quality: "1080p",
          provider: "desenefaine"
      });

      streams.push({
          name: "2. Act: " + (uniqueActions[1] || "NONE"),
          title: "Diagnostic",
          url: "http://example.com/loop2",
          quality: "1080p",
          provider: "desenefaine"
      });

      streams.push({
          name: "3. Act: " + (uniqueActions[2] || "NONE"),
          title: "Diagnostic",
          url: "http://example.com/loop3",
          quality: "1080p",
          provider: "desenefaine"
      });

      // Extract Nonce again just to be 100% sure
      var nonceMatch = html.match(/["']nonce["']\s*:\s*["']([^"']+)["']/i) || html.match(/data-nonce=["']([^"']+)["']/i);
      streams.push({
          name: "4. Nonce: " + (nonceMatch ? nonceMatch[1] : "NONE"),
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
