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
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    return res.text().then(function(text) {
        return { status: res.status, text: text };
    });
  }).catch(function(e) {
    return { status: "ERR", text: e.message };
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
        return fetchText(url).then(function(res) {
          if (res.text && res.text.length > 2000 && !res.text.includes("Nu am găsit")) return { url: url, html: res.text };
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
      var $$ = cheerio.load(result.html);

      // 1. EXTRACT EXACT DATA DIRECTLY FROM THE SERVER BUTTON
      var firstServerBtn = $$("li[data-post][data-nume]").first();
      var s_post = firstServerBtn.attr("data-post") || "29025"; // Fallback to Toy Story 5 ID
      var s_nume = firstServerBtn.attr("data-nume") || "1";
      var s_type = firstServerBtn.attr("data-type") || "movie";

      // 2. EXTRACT NONCE
      var nonceMatch = result.html.match(/["']nonce["']\s*:\s*["']([^"']+)["']/i) || result.html.match(/data-nonce=["']([^"']+)["']/i);
      var nonce = nonceMatch ? nonceMatch[1] : "";

      var ajaxUrl = MAIN_URL + "/wp-admin/admin-ajax.php";

      // 3. DEFINE 10 DIFFERENT ATTACK VECTORS
      var tests = [
          { id: "T1", desc: "Standard doo_player", body: "action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type },
          { id: "T2", desc: "doo_player + nonce", body: "action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce },
          { id: "T3", desc: "doo_player + security", body: "action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&security="+nonce },
          { id: "T4", desc: "dt_player_ajax", body: "action=dt_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce },
          { id: "T5", desc: "Both security tokens", body: "action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce+"&security="+nonce },
          { id: "T6", desc: "No Origin Headers", body: "action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce, dropHeaders: true },
          { id: "T7", desc: "GET Method", method: "GET", urlMod: "?action=doo_player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce },
          { id: "T8", desc: "action=player_ajax", body: "action=player_ajax&post="+s_post+"&nume="+s_nume+"&type="+s_type+"&nonce="+nonce },
          { id: "T9", desc: "Hardcoded Toy Story ID", body: "action=doo_player_ajax&post=29025&nume=1&type=movie&nonce="+nonce },
          { id: "T10", desc: "DATA CHECK", isInfo: true, infoText: "Btn ID: " + s_post + " | Nonce: " + nonce }
      ];

      var testPromises = tests.map(function(t) {
          if (t.isInfo) {
              return Promise.resolve({
                  name: t.id + " | " + t.desc,
                  title: t.infoText,
                  url: "http://example.com/info",
                  quality: "1080p",
                  provider: "desenefaine"
              });
          }

          var reqOptions = {
              method: t.method || "POST",
              headers: {
                  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest"
              }
          };

          if (!t.dropHeaders) {
              reqOptions.headers["Referer"] = result.url;
              reqOptions.headers["Origin"] = MAIN_URL;
          }

          if (t.body) reqOptions.body = t.body;

          var fetchUrl = t.urlMod ? ajaxUrl + t.urlMod : ajaxUrl;

          return fetchText(fetchUrl, reqOptions).then(function(res) {
              var cleanText = res.text.replace(/</g, "").replace(/>/g, "").substring(0, 45);
              var isSuccess = res.text.includes("http") ? " (FOUND URL!)" : "";
              
              return {
                  name: t.id + " | Stat: " + res.status + isSuccess,
                  title: cleanText || "EMPTY_RESPONSE",
                  url: "http://example.com/loop",
                  quality: "1080p",
                  provider: "desenefaine"
              };
          });
      });

      return Promise.all(testPromises).then(function(results) {
          return results;
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
