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

function resolveRedirectUrl(url, options) {
  options = options || {};

  function requestRedirect(mode) {
    var requestHeaders = Object.assign({}, FETCH_HEADERS, options.headers || {});
    requestHeaders.Accept = "video/mp4,video/*;q=0.9,*/*;q=0.8";
    requestHeaders.Range = "bytes=0-1";
    var request = {
      method: options.method || "GET",
      headers: requestHeaders
    };
    if (mode) request.redirect = mode;

    return fetch(url, request).then(function(res) {
      if (mode === "manual") {
        var location = res.headers && res.headers.get
          ? res.headers.get("location")
          : null;
        if (location) return absoluteUrl(location, url);
      }

      var resolvedUrl = res.url || null;
      if (resolvedUrl && resolvedUrl !== url) return resolvedUrl;

      return null;
    });
  }

  return requestRedirect("follow").then(function(resolvedUrl) {
    return resolvedUrl || requestRedirect("manual");
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
var M3U8_RE = /(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\/master\.txt)(?:\?[^\s"'<>\\]*)?/gi;

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
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.indexOf("//") === 0) return "https:" + cleaned;

  var originMatch = String(baseUrl).match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return null;
  if (cleaned.charAt(0) === "/") return originMatch[1] + cleaned;

  var basePath = String(baseUrl).split("?")[0].replace(/\/[^/]*$/, "/");
  return basePath + cleaned;
}

function findUnescaped(text, marker, start) {
  var index = text.indexOf(marker, start);
  while (index >= 0) {
    var slashes = 0;
    var cursor = index - 1;
    while (cursor >= 0 && text.charAt(cursor) === "\\") {
      slashes += 1;
      cursor -= 1;
    }
    if (slashes % 2 === 0) return index;
    index = text.indexOf(marker, index + 1);
  }
  return -1;
}

function decodeJsString(value) {
  return String(value || "")
    .replace(/\\x([0-9a-fA-F]{2})/g, function(_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, function(_, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\([\\'"])/g, "$1");
}

// Morencius/VidHide packs its player setup with a small numeric-token
// replacement function. Decode that setup without executing provider code.
function unpackProviderScript(script) {
  var payloadStart = script.indexOf("}('") + 3;
  if (payloadStart < 3) return null;

  var payloadEnd = findUnescaped(script, "',", payloadStart);
  if (payloadEnd < 0) return null;

  var payload = decodeJsString(script.slice(payloadStart, payloadEnd));
  var argumentsText = script.slice(payloadEnd + 2);
  var firstComma = argumentsText.indexOf(",");
  var secondComma = argumentsText.indexOf(",", firstComma + 1);
  if (firstComma < 0 || secondComma < 0) return null;

  var radix = parseInt(argumentsText.slice(0, firstComma), 10);
  var count = parseInt(argumentsText.slice(firstComma + 1, secondComma), 10);
  if (!radix || !count) return null;

  var wordsStart = findUnescaped(argumentsText, ",'", secondComma) + 2;
  var wordsEnd = argumentsText.lastIndexOf("'.split");
  if (wordsStart < 2 || wordsEnd < wordsStart) return null;

  var words = decodeJsString(argumentsText.slice(wordsStart, wordsEnd)).split("|");
  for (var index = count - 1; index >= 0; index -= 1) {
    if (!words[index]) continue;
    payload = payload.replace(new RegExp("\\b" + index.toString(radix) + "\\b", "g"), words[index]);
  }
  return payload;
}

function findProviderHls(html) {
  var decoded = [];
  var scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  var scriptMatch;

  while ((scriptMatch = scriptRe.exec(html)) !== null) {
    var script = scriptMatch[1] || "";
    if (script.indexOf("eval(function(p,a,c,k,e,d)") >= 0) {
      var unpacked = unpackProviderScript(script);
      if (unpacked) decoded.push(unpacked);
    }
  }

  var candidates = [];
  var seen = {};
  var source = html + "\n" + decoded.join("\n");
  M3U8_RE.lastIndex = 0;
  var match;
  while ((match = M3U8_RE.exec(source)) !== null) {
    var candidate = cleanUrl(match[0]);
    var key = candidate.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    candidates.push(candidate);
  }
  return candidates;
}

function findProviderMp4(html) {
  var match = String(html).match(
    /getElementById\(\s*['"]botlink['"]\s*\)[\s\S]*?['"]([^'"]*)['"]\s*\+\s*(?:['"][^'"]*['"]\s*\+\s*)?\(\s*['"]([^'"]+)['"]\s*\)\.substring\(\s*(\d+)\s*\)/i
  );
  if (match) {
    var offset = parseInt(match[3], 10);
    var streamUrl = absoluteUrl(match[1] + match[2].slice(offset), "https://streamtape.com/");
    if (!/[?&]stream=/.test(streamUrl)) streamUrl += "&stream=1";
    return [streamUrl];
  }

  var directMatch = String(html).match(
    /<span\b[^>]*\bid\s*=\s*["']botlink["'][^>]*>([^<]*\/get_video\?[^<]*)<\/span>/i
  );
  if (!directMatch) return [];

  var directValue = cleanUrl(directMatch[1]).trim();
  var directUrl;
  if (/^\/?streamtape\.com\//i.test(directValue)) {
    directUrl = "https://" + directValue.replace(/^\/+/, "");
  } else {
    directUrl = absoluteUrl(directValue, "https://streamtape.com/");
  }
  if (!directUrl) return [];
  if (!/[?&]stream=/.test(directUrl)) directUrl += "&stream=1";
  return [directUrl];
}

function fallbackProviderStream(url) {
  return {
    name: PROVIDER_NAME + " | " + providerName(url),
    title: "Open in web player",
    url: url,
    quality: "1080p",
    isM3U8: false,
    behaviorHints: { notWebReady: true, bingeGroup: "filmedublate-webview" },
    provider: "filmedublate"
  };
}

function directMp4Stream(videoUrl, providerUrl) {
  return {
    name: PROVIDER_NAME + " | " + providerName(providerUrl) + " MP4",
    title: "Direct MP4 stream",
    url: videoUrl,
    quality: "1080p",
    type: "mp4",
    isM3U8: false,
    behaviorHints: { bingeGroup: "filmedublate-mp4" },
    provider: "filmedublate"
  };
}

function resolveProvider(url, wrapperUrl) {
  return Promise.resolve().then(function() {
    return fetchText(url, { headers: { Referer: wrapperUrl } });
  }).then(function(html) {
    var mp4 = findProviderMp4(html);
    if (mp4.length) {
      return resolveRedirectUrl(mp4[0], { headers: { Referer: url } })
        .then(function(resolvedUrl) {
          if (!resolvedUrl) throw new Error("Streamtape redirect URL unavailable");
          return [directMp4Stream(resolvedUrl, url)];
        })
        .catch(function() {
          return [fallbackProviderStream(url)];
        });
    }

    var hls = findProviderHls(html);
    if (!hls.length) return [fallbackProviderStream(url)];

    return hls.map(function(m3u8) {
      var originMatch = String(url).match(/^(https?:\/\/[^/]+)/i);
      var requestHeaders = {
        Referer: url,
        Origin: originMatch ? originMatch[1] : String(url),
        "User-Agent": FETCH_HEADERS["User-Agent"]
      };

      return {
        name: PROVIDER_NAME + " | " + providerName(url) + " HLS",
        title: "Direct HLS stream",
        url: m3u8,
        quality: "1080p",
        type: "hls",
        isM3U8: true,
        headers: requestHeaders,
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "filmedublate-hls",
          proxyHeaders: { request: requestHeaders }
        },
        provider: "filmedublate"
      };
    });
  }).catch(function() {
    return [fallbackProviderStream(url)];
  });
}

function isLikelyPlayerUrl(url) {
  if (/\/embed\/(?:onclickmov|noindex)(?:$|[?#])/i.test(url)) return false;
  return /(?:\/embed\/|\/player\/|\/watch\/|\/e\/|\/d\/|video|stream|player|abyss|filemoon|vidhide|morencius|bysebuho)/i.test(url);
}

function providerName(url) {
  var hostMatch = String(url).match(/^https?:\/\/([^/?#]+)/i);
  if (!hostMatch) return "Unknown Host";

  var host = hostMatch[1].replace(/^www\./i, "").toLowerCase();
  if (host.indexOf("abyssplayer") >= 0 || host.indexOf("abyss.to") >= 0) return "ABYServer (Abyss)";
  if (host.indexOf("bysebuho") >= 0 || host.indexOf("filemoon") >= 0) return "Filemoon";
  if (host.indexOf("vidhide") >= 0 || host.indexOf("morencius") >= 0) return "VidHide";
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
    if (normalized.indexOf(word) >= 0) score += 1;
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
    $("article").each(function(_, el) {
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
  var query = "?api_key=" + encodeURIComponent(TMDB_API_KEY) + "&language=ro-RO";
  if (isImdb) query += "&external_source=imdb_id";
  return "https://api.themoviedb.org/3/" + endpoint + query;
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
        var providers = [];
        var match;

        function addStream(stream) {
          var value = stream.url || stream.externalUrl;
          if (!value) return;
          var key = value.toLowerCase();
          if (seen[key]) return;
          seen[key] = true;
          streams.push(stream);
        }

        // Preserve any direct HLS URL if the wrapper ever exposes one.
        M3U8_RE.lastIndex = 0;
        while ((match = M3U8_RE.exec(wrapperHtml)) !== null) {
          var m3u8 = cleanUrl(match[0]);
          addStream({
            name: PROVIDER_NAME + " | HLS",
            title: "HLS stream",
            url: m3u8,
            quality: "1080p",
            type: "hls",
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
          if (seen[extractedUrl.toLowerCase()]) continue;
          providers.push(extractedUrl);
        }

        var providerChain = Promise.resolve();
        providers.forEach(function(providerUrl) {
          providerChain = providerChain.then(function() {
            return resolveProvider(providerUrl, wrapperUrl);
          }).then(function(list) {
            list.forEach(addStream);
          }).catch(function() {
            addStream(fallbackProviderStream(providerUrl));
          });
        });

        return providerChain.then(function() {
          return streams;
        });
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
