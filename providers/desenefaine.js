var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "Desene Inspector";
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
      var $$ = cheerio.load(html);
      var btnHtmls = [];

      // Look for the standard Dooplay server buttons
      $$("ul#playeroptionsul li, .player_options li, #player-option-links li, li[data-nume]").each(function(_, el) {
          btnHtmls.push($$.html(el));
      });

      // If they changed the class names, search manually by text
      if (btnHtmls.length === 0) {
          $$("li").each(function(_, el) {
              var text = $$(el).text().toLowerCase();
              if (text.includes("bysehd") || text.includes("server 0") || text.includes("player4me")) {
                  btnHtmls.push($$.html(el));
              }
          });
      }

      if (btnHtmls.length === 0) {
          streams.push({
              name: "Error: No Server Buttons Found",
              title: "The HTML doesn't contain any recognizable servers.",
              url: "http://example.com/loop",
              quality: "1080p",
              provider: "desenefaine"
          });
          return streams;
      }

      // Print the raw HTML of the first 5 buttons found
      var max = Math.min(btnHtmls.length, 5);
      for (var i = 0; i < max; i++) {
          var cleanHtml = btnHtmls[i].replace(/\s+/g, ' ').trim();
          streams.push({
              name: "BTN " + (i + 1) + ": " + cleanHtml.substring(0, 45),
              title: cleanHtml.substring(45, 120),
              url: "http://example.com/loop" + i,
              quality: "1080p",
              provider: "desenefaine"
          });
      }
      
      // Also grab the Post ID just in case
      var postIdMatch = html.match(/postid-(\d+)/i) || html.match(/data-post=["']?(\d+)["']?/i);
      streams.push({
          name: "DEBUG | Post ID: " + (postIdMatch ? postIdMatch[1] : "NONE"),
          title: "ID Check",
          url: "http://example.com/loop_id",
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
