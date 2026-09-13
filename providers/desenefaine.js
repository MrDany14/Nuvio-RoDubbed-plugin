var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 Chrome/100.0.4896.127 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function fetchText(url, headers) {
  return fetch(url, {
    redirect: "follow",
    headers: Object.assign({}, DEFAULT_HEADERS, headers || {})
  }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
    return res.text();
  });
}

function decodeBase64(value) {
  try {
    if (typeof atob === "function") return atob(value);
  } catch (e) {}

  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var output = "";
  var i = 0;
  value = value.replace(/[^A-Za-z0-9+/=]/g, "");
  while (i < value.length) {
    var a = chars.indexOf(value.charAt(i++));
    var b = chars.indexOf(value.charAt(i++));
    var c = chars.indexOf(value.charAt(i++));
    var d = chars.indexOf(value.charAt(i++));
    output += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== 64) output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== 64) output += String.fromCharCode(((c & 3) << 6) | d);
  }
  return output;
}

function reverse(value) {
  return value.split("").reverse().join("");
}

function decodeHex(value) {
  var output = "";
  for (var i = 0; i + 1 < value.length; i += 2) {
    output += String.fromCharCode(parseInt(value.substr(i, 2), 16));
  }
  return output;
}

function absoluteUrl(value) {
  if (value.indexOf("//") === 0) return "https:" + value;
  if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) return value;
  return MAIN_URL + (value.indexOf("/") === 0 ? "" : "/") + value;
}

function findIframeUrl(html) {
  var match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  return match ? absoluteUrl(match[1]) : null;
}

function resolveServer(embedUrl) {
  return fetchText(embedUrl, { Referer: MAIN_URL + "/" }).then(function(wrapperHtml) {
    var iframeUrl = findIframeUrl(wrapperHtml);
    if (!iframeUrl) return null;

    var tidMatch = iframeUrl.match(/[?&]tid=([^&]+)/i);
    if (!tidMatch) return iframeUrl;

    // DeseneFaine reverses this value before exposing it as trhex.
    var trhex = reverse(tidMatch[1]);
    var decodedUrl = decodeHex(trhex);
    if (decodedUrl.indexOf("http://") === 0 || decodedUrl.indexOf("https://") === 0) {
      return decodedUrl;
    }
    return iframeUrl.replace(/[?&]tid=[^&]+/i, "&trhex=" + trhex);
  });
}

function searchPage(title) {
  return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(title)).then(function(html) {
    var $ = cheerio.load(html);
    var wanted = String(title || "").toLowerCase();
    var result = null;
    $("article a, .post a, a[href*='/film/']").each(function(_, element) {
      if (result) return;
      var href = $(element).attr("href");
      var text = $(element).text().toLowerCase();
      if (href && !/\/(director|cast|actiune|animatie|comedie|film\/?$)/i.test(href) &&
          (text.indexOf(wanted) >= 0 || href.toLowerCase().indexOf(wanted.replace(/\s+/g, "-")) >= 0)) {
        result = absoluteUrl(href);
      }
    });
    return result;
  });
}

function getTmdbTitle(tmdbId, type) {
  var endpoint = type === "tv" ? "tv/" : "movie/";
  return fetchText("https://api.themoviedb.org/3/" + endpoint + tmdbId +
    "?api_key=ccd8c6e162505e91ef8dc65b323ff4be&language=ro-RO").then(function(text) {
    var data = JSON.parse(text);
    return data.title || data.name || data.original_title || data.original_name;
  });
}

function extractStreams(pageUrl) {
  return fetchText(pageUrl).then(function(html) {
    var $ = cheerio.load(html);
    var servers = [];

    $("a[data-option][data-src]").each(function(_, element) {
      var encodedUrl = $(element).attr("data-src");
      var label = $(element).find(".option").text().trim() || ("Server " + (servers.length + 1));
      if (!encodedUrl) return;
      servers.push({ label: label, url: absoluteUrl(decodeBase64(encodedUrl)) });
    });

    return Promise.all(servers.map(function(server) {
      return resolveServer(server.url).then(function(url) {
        if (!url) return null;
        return {
          name: PROVIDER_NAME,
          title: server.label,
          url: url,
          quality: "1080p",
          behaviorHints: {
            notWebReady: true,
            proxyHeaders: {
              request: {
                Referer: pageUrl,
                "User-Agent": DEFAULT_HEADERS["User-Agent"]
              }
            }
          }
        };
      }).catch(function(error) {
        console.log("[DeseneFaine] Server error:", server.label, error.message);
        return null;
      });
    })).then(function(streams) {
      return streams.filter(function(stream) { return stream !== null; });
    });
  });
}

function getStreams(tmdbId, mediaType) {
  return getTmdbTitle(tmdbId, mediaType).then(function(title) {
    return searchPage(title).then(function(pageUrl) {
      if (!pageUrl) return [];
      return extractStreams(pageUrl);
    });
  }).catch(function(error) {
    console.log("[DeseneFaine] Error:", error.message);
    return [];
  });
}

module.exports = { getStreams: getStreams };
