var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "FilmeDublate";
var MAIN_URL = "https://filmedublate.net";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url, options) {
  options = options || {};
  var request = {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  };
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  var request = {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  };
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

var QUOTED_URL_RE = /["']((?:https?:)?\/\/[^"'<>\\]+)["']/gi;
var M3U8_RE = /(?:https?:)?\/\/[^\s"'<>\\]+?\.m3u8(?:\?[^\s"'<>\\]*)?/gi;

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/[),;]+$/, "");
}

function absoluteUrl(value, baseUrl) {
  var cleaned = cleanUrl(value).trim();
  if (!cleaned) return null;
  try {
    return new URL(cleaned, baseUrl).href;
  } catch (_) {
    return null;
  }
}

function isLikelyPlayerUrl(url) {
  if (/\/embed\/(?:onclickmov|noindex)(?:$|[?#])/i.test(url)) return false;
  return /(?:\/embed\/|\/player\/|\/watch\/|\/e\/|\/d\/|video|stream|player|abyss|filemoon|vidhide|morencius|bysebuho)/i.test(url);
}

function providerName(url) {
  var hostMatch = String(url).match(/^https?:\/\/([^/?#]+)/i);
  if (!hostMatch) return "Unknown Host";

  var host = hostMatch[1].replace(/^www\./i, "").toLowerCase();
  if (host.includes("abyssplayer") || host.includes("abyss.to")) return "ABYServer (Abyss)";
  if (host.includes("bysebuho") || host.includes("filemoon")) return "Filemoon";
  if (host.includes("vidhide") || host.includes("morencius")) return "VidHide";
  return hostMatch[1].replace(/^www\./i, "");
}

function siteFilmUrl(category, slug) {
  var prefix = "/film-dublat/";
  if (category === "Serial") prefix = "/serial-dublat/";
  if (category === "Desene") prefix = "/desen-animat/";
  return MAIN_URL + prefix + slug + "-dublat-in-romana";
}

function titleScore(text, queryWords) {
  var normalized = normalizeTitle(text);
  var score = 0;
  queryWords.forEach(function(word) {
    if (normalized.includes(word)) score += 1;
  });
  return score;
}

function searchSite(query) {
  var queryWords = normalizeTitle(query).split(" ").filter(function(word) {
    return word.length > 2;
  });
  if (!queryWords.length) return Promise.resolve(null);

  var searchUrl = MAIN_URL + "/search.php?q=" + encodeURIComponent(query);
  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var bestMatch = null;
    var minimumScore = Math.ceil(queryWords.length / 2);

    // Current site structure: <article onclick="goFilm('Film', 'slug')">.
    $("article[onclick*='goFilm']").each(function(_, el) {
      var onclick = $(el).attr("onclick") || "";
      var match = onclick.match(/goFilm\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/i);
      if (!match) return;

      var text = normalizeTitle($(el).text());
      var score = titleScore(text, queryWords);
      if (score < minimumScore) return;

      var candidate = {
        href: siteFilmUrl(match[1], match[2]),
        text: text,
        score: score
      };
      if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && text.length < bestMatch.text.length)) {
        bestMatch = candidate;
      }
    });

    // Compatibility fallback for older pages that used ordinary links.
    if (!bestMatch) {
      $("a[href]").each(function(_, el) {
        var href = absoluteUrl($(el).attr("href"), searchUrl);
        if (!href || !/filmedublate\.net/i.test(href)) return;
        if (/\/category(?:\.php|\/)|\/tag\/|\/page\//i.test(href)) return;

        var text = normalizeTitle($(el).text());
        var score = titleScore(text, queryWords);
        if (score < minimumScore) return;

        var candidate = { href: href, text: text, score: score };
        if (!bestMatch || score > bestMatch.score || (score === bestMatch.score && text.length < bestMatch.text.length)) {
          bestMatch = candidate;
        }
      });
    }

    if (!bestMatch) return null;
    return fetchText(bestMatch.href).then(function(pageHtml) {
      return { url: bestMatch.href, html: pageHtml };
    });
  }).catch(function() {
    return null;
  });
}

function tmdbUrl(id, type) {
  var isTv = type === "tv" || type === "series";
  var isImdb = String(id).startsWith("tt");
  var endpoint = isImdb
    ? "find/" + encodeURIComponent(id)
    : (isTv ? "tv/" : "movie/") + encodeURIComponent(id);
  var params = new URLSearchParams();
  params.set("api_key", TMDB_API_KEY);
  params.set("language", "ro-RO");
  if (isImdb) params.set("external_source", "imdb_id");
  return "https://api.themoviedb.org/3/" + endpoint + "?" + params.toString();
}

function getStreams(id, type, season, episode) {
  var isTv = type === "tv" || type === "series";

  return fetchJson(tmdbUrl(id, type)).then(function(data) {
    var isImdb = String(id).startsWith("tt");
    var roTitle = "";
    var enTitle = "";

    if (isImdb) {
      var results = isTv ? data.tv_results : data.movie_results;
      if (results && results.length > 0) {
        roTitle = isTv ? results[0].name : results[0].title;
        enTitle = isTv ? results[0].original_name : results[0].original_title;
      }
    } else {
      roTitle = isTv ? data.name : data.title;
      enTitle = isTv ? data.original_name : data.original_title;
    }

    if (!roTitle && !enTitle) return [];

    return searchSite(roTitle).then(function(result) {
      if (!result && enTitle && enTitle !== roTitle) return searchSite(enTitle);
      return result;
    }).then(function(result) {
      if (!result || !result.html) return [];

      var $ = cheerio.load(result.html);
      var wrapperUrl = null;

      $("iframe").each(function(_, el) {
        var src = $(el).attr("src") || $(el).attr("data-src");
        if (src && /filmsrv\.php/i.test(src)) wrapperUrl = absoluteUrl(src, result.url);
      });

      if (!wrapperUrl) return [];

      return fetchText(wrapperUrl, {
        headers: { Referer: result.url }
      }).then(function(wrapperHtml) {
        var streams = [];
        var seen = {};
        var match;

        // Preserve any direct HLS URL if the wrapper ever exposes one.
        while ((match = M3U8_RE.exec(wrapperHtml)) !== null) {
          var m3u8 = cleanUrl(match[0]);
          var m3u8Key = m3u8.toLowerCase();
          if (seen[m3u8Key]) continue;
          seen[m3u8Key] = true;
          streams.push({
            name: PROVIDER_NAME + " | HLS",
            title: "HLS stream",
            url: m3u8,
            quality: "1080p",
            isM3U8: true,
            headers: { Referer: wrapperUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: { bingeGroup: "filmedublate-hls" },
            provider: "filmedublate"
          });
        }

        QUOTED_URL_RE.lastIndex = 0;
        while ((match = QUOTED_URL_RE.exec(wrapperHtml)) !== null) {
          var extractedUrl = absoluteUrl(match[1], wrapperUrl);
          if (!extractedUrl || !isLikelyPlayerUrl(extractedUrl)) continue;

          var key = extractedUrl.toLowerCase();
          if (seen[key]) continue;
          seen[key] = true;

          streams.push({
            name: PROVIDER_NAME + " | " + providerName(extractedUrl),
            title: "Web Player (Bypass Ads)",
            url: extractedUrl,
            quality: "1080p",
            isM3U8: false,
            headers: {
              Referer: wrapperUrl,
              "User-Agent": FETCH_HEADERS["User-Agent"]
            },
            behaviorHints: {
              notWebReady: true,
              bingeGroup: "filmedublate-webview"
            },
            provider: "filmedublate"
          });
        }

        return streams;
      });
    });
  }).catch(function() {
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
