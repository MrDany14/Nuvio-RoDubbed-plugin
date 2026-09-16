var PROVIDER_NAME = "VeziSerialeOnline";
var MAIN_URL = "https://vezi-seriale-online.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
var REQUEST_TIMEOUT_MS = 15000;

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchWithTimeout(url, options) {
  var request = Object.assign({}, options || {});
  if (typeof setTimeout !== "function" || typeof Promise.race !== "function") {
    return fetch(url, request);
  }

  var timer = null;
  var timeoutPromise = new Promise(function(_, reject) {
    timer = setTimeout(function() {
      reject(new Error("Request timed out"));
    }, REQUEST_TIMEOUT_MS);
  });
  var requestPromise;
  try {
    requestPromise = fetch(url, request);
  } catch (error) {
    clearTimeout(timer);
    return Promise.reject(error);
  }

  return Promise.race([requestPromise, timeoutPromise]).then(function(result) {
    clearTimeout(timer);
    return result;
  }, function(error) {
    clearTimeout(timer);
    throw error;
  });
}

function fetchText(url, referer) {
  var headers = Object.assign({}, FETCH_HEADERS);
  if (referer) headers.Referer = referer;
  return fetchWithTimeout(url, { headers: headers }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return text;
    });
  });
}

function fetchJson(url) {
  return fetchWithTimeout(url, {
    headers: Object.assign({}, FETCH_HEADERS, { Accept: "application/json" })
  }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return data;
    });
  });
}

function normalizeTitle(value) {
  var text = String(value || "").toLowerCase();
  if (typeof text.normalize === "function") {
    text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  return text
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleWords(value) {
  return normalizeTitle(value).split(/\s+/).filter(function(word) {
    return word.length > 1 && !/^(the|a|an|film|filmul|movie|online)$/.test(word);
  });
}

function siteSlug(value) {
  return normalizeTitle(value).replace(/\s+/g, "-");
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function stripHtml(value) {
  return decodeEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tmdbUrl(id, type) {
  var value = String(id || "").trim();
  var imdb = value.match(/tt\d{7,}/i);
  var isTv = type === "tv" || type === "series";
  value = value.replace(/^(?:tmdb|movie|tv|series):/i, "");
  var endpoint = imdb
    ? "find/" + encodeURIComponent(imdb[0])
    : (isTv ? "tv/" : "movie/") + encodeURIComponent(value);
  var query = "?api_key=" + encodeURIComponent(TMDB_API_KEY) + "&language=ro-RO";
  if (imdb) query += "&external_source=imdb_id";
  return "https://api.themoviedb.org/3/" + endpoint + query;
}

function tmdbMetadata(id, type) {
  var isTv = type === "tv" || type === "series";
  return fetchJson(tmdbUrl(id, type)).then(function(data) {
    var result = String(id || "").match(/tt\d{7,}/i)
      ? ((isTv ? data.tv_results : data.movie_results) || [])[0]
      : data;
    if (!result) return null;

    var localized = isTv ? result.name : result.title;
    var original = isTv ? result.original_name : result.original_title;
    return {
      queries: [localized, original].filter(function(value, index, all) {
        return value && all.indexOf(value) === index;
      })
    };
  });
}

function addUnique(values, value) {
  var normalized = normalizeTitle(value);
  if (normalized && values.indexOf(normalized) < 0) values.push(normalized);
}

function slugCandidates(queries) {
  var slugs = [];
  (queries || []).forEach(function(query) {
    var slug = siteSlug(query);
    addUnique(slugs, slug);
    if (slug === "moana") addUnique(slugs, "vaiana-filmul");
    if (slug === "vaiana") addUnique(slugs, "vaiana-filmul");
    if (slug.slice(-6) === "-filmul") addUnique(slugs, slug.slice(0, -7));
    if (slug.slice(-5) === "-film") addUnique(slugs, slug.slice(0, -5));
  });
  return slugs;
}

function pageTitle(html) {
  var match = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(match ? match[1] : "");
}

function isRomanianDubbed(title) {
  var value = normalizeTitle(title);
  return value.indexOf("dublat in romana") >= 0 || value.indexOf("dublat romana") >= 0;
}

function titleMatches(title, queries) {
  var candidate = titleWords(title);
  return (queries || []).some(function(query) {
    var words = titleWords(query);
    if (!words.length) return false;
    var matched = words.filter(function(word) {
      return candidate.indexOf(word) >= 0;
    }).length;
    return matched === words.length || matched >= Math.min(2, words.length);
  });
}

function pageMediaUrls(html) {
  var urls = [];
  var seen = {};
  var sourceRe = /\b(?:src|data-src)\s*=\s*(["'])([\s\S]*?)\1/gi;
  var match;
  while ((match = sourceRe.exec(String(html || "")))) {
    var url = cleanUrl(decodeEntities(match[2]));
    if (!/^https?:\/\//i.test(url) || !/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) continue;
    if (!seen[url]) {
      seen[url] = true;
      urls.push(url);
    }
  }

  var directRe = /https?:[^"'< >\\]+\.(?:mp4|m3u8)(?:\?[^"'< >\\]*)?/gi;
  while ((match = directRe.exec(String(html || "")))) {
    var direct = cleanUrl(decodeEntities(match[0]));
    if (!seen[direct]) {
      seen[direct] = true;
      urls.push(direct);
    }
  }
  return urls;
}

function streamFor(url, pageUrl, index) {
  var hls = /\.m3u8(?:[?#]|$)/i.test(url);
  var originMatch = pageUrl.match(/^https?:\/\/[^/]+/i);
  var headers = {
    Referer: pageUrl,
    Origin: originMatch ? originMatch[0] : MAIN_URL,
    "User-Agent": FETCH_HEADERS["User-Agent"]
  };
  return {
    name: PROVIDER_NAME + " | Romanian Dub | Server " + (index + 1),
    title: "Romanian dubbed direct stream",
    url: url,
    quality: "1080p",
    type: hls ? "hls" : "mp4",
    isM3U8: hls,
    headers: headers,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: "veziserialeonline-ro-dub",
      proxyHeaders: { request: headers }
    },
    provider: "veziserialeonline"
  };
}

function findPage(queries, index) {
  var slugs = slugCandidates(queries);
  index = index || 0;
  if (index >= slugs.length) return Promise.resolve(null);

  var pageUrl = MAIN_URL + "/filme/" + slugs[index];
  return fetchText(pageUrl).then(function(html) {
    var title = pageTitle(html);
    if (!isRomanianDubbed(title) || !titleMatches(title, queries)) {
      return findPage(queries, index + 1);
    }
    var urls = pageMediaUrls(html);
    if (!urls.length) return findPage(queries, index + 1);
    return { url: pageUrl, urls: urls };
  }).catch(function() {
    return findPage(queries, index + 1);
  });
}

function getStreams(id, type) {
  if (type === "tv" || type === "series") return Promise.resolve([]);

  return tmdbMetadata(id, type).then(function(meta) {
    if (!meta || !meta.queries.length) return [];
    return findPage(meta.queries, 0).then(function(page) {
      if (!page) return [];
      return page.urls.map(function(url, index) {
        return streamFor(url, page.url, index);
      });
    });
  }).catch(function(error) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[VeziSerialeOnline] stream lookup failed", String(id || ""), String(error && error.message || error || "unknown error"));
    }
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
