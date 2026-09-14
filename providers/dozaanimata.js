var PROVIDER_NAME = "DozaAnimata";
var MAIN_URL = "https://www.dozaanimata.net";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url) {
  return fetch(url, { headers: FETCH_HEADERS }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return text;
    });
  });
}

function fetchJson(url) {
  return fetch(url, { headers: Object.assign({}, FETCH_HEADERS, { Accept: "application/json" }) }).then(function(res) {
    return res.json().then(function(data) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return data;
    });
  });
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/[),;]+$/, "")
    .trim();
}

function absoluteUrl(value) {
  var url = cleanUrl(value);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  if (url.charAt(0) === "/") return MAIN_URL + url;
  return MAIN_URL + "/" + url;
}

function decodeBase64(value) {
  var encoded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  encoded += "===".slice((encoded.length + 3) % 4);
  if (typeof atob === "function") return atob(encoded);
  if (typeof Buffer !== "undefined") return Buffer.from(encoded, "base64").toString("utf8");
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var output = "";
  var buffer = 0;
  var bits = 0;
  for (var index = 0; index < encoded.length; index += 1) {
    var digit = alphabet.indexOf(encoded.charAt(index));
    if (digit < 0) continue;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 255);
    }
  }
  return output;
}

function decodeAtHex(value) {
  return String(value || "").replace(/@([0-9a-f]{2})/gi, function(_, hex) {
    return String.fromCharCode(parseInt(hex, 16));
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

function titleWords(value) {
  return normalizeTitle(value).split(/\s+/).filter(function(word) {
    return word.length > 1 && !/^(the|a|an|film|movie|serial|series|sezonul|season|episodul|episode)$/.test(word);
  });
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0*39;/gi, "'")
    .replace(/&#0*34;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function htmlLinks(html) {
  var links = [];
  var regex = /<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = regex.exec(String(html || "")))) {
    var href = absoluteUrl(match[2]);
    if (!href || href.indexOf("dozaanimata.net") < 0) continue;
    links.push({ href: href, text: stripHtml(match[3]) });
  }
  return links;
}

function searchScore(candidate, query, expectedType, year) {
  var path = normalizeTitle(candidate.href);
  if (/[?&]s=/i.test(candidate.href) || /\/(?:genre|tag|release-year|country|movies|articles|episode-date)\//i.test(candidate.href)) return -1;
  var isEpisode = path.indexOf(" episode ") >= 0;
  var isSeries = path.indexOf(" series ") >= 0;
  if (expectedType === "movie" && (isEpisode || isSeries)) return -1;
  if (expectedType === "series" && !isSeries) return -1;
  if (expectedType === "episode" && !isEpisode) return -1;

  var words = titleWords(query);
  var haystack = normalizeTitle(candidate.href + " " + candidate.text);
  var matched = words.filter(function(word) {
    return haystack.split(" ").indexOf(word) >= 0;
  }).length;
  if (!matched) return -1;

  var score = matched * 10;
  if (matched === words.length) score += 30;
  if (year && haystack.indexOf(String(year)) >= 0) score += 20;
  if (isSeries || isEpisode) score += 5;
  return score;
}

function searchSite(query, expectedType, year) {
  if (!query) return Promise.resolve(null);
  var url = MAIN_URL + "/?s=" + encodeURIComponent(query);
  return fetchText(url).then(function(html) {
    var best = null;
    var bestScore = -1;
    htmlLinks(html).forEach(function(candidate) {
      var score = searchScore(candidate, query, expectedType, year);
      if (score > bestScore) {
        bestScore = score;
        best = candidate.href;
      }
    });
    return best;
  }).catch(function() {
    return null;
  });
}

function tmdbUrl(id, type) {
  var value = String(id || "").trim();
  var isTv = type === "tv" || type === "series";
  var imdb = value.match(/tt\d{7,}/i);
  value = value.replace(/^tmdb:/i, "").replace(/^(?:movie|tv|series):/i, "");
  var endpoint = imdb
    ? "find/" + encodeURIComponent(imdb[0])
    : (isTv ? "tv/" : "movie/") + encodeURIComponent(value.replace(/^tmdb:/i, ""));
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
    var date = isTv ? result.first_air_date : result.release_date;
    var year = parseInt(String(date || "").slice(0, 4), 10);
    return {
      queries: [localized, original].filter(function(value, index, all) {
        return value && all.indexOf(value) === index;
      }),
      year: isFinite(year) ? year : null,
      isTv: isTv
    };
  });
}

function findPage(queries, type, year, index) {
  index = index || 0;
  if (index >= queries.length) return Promise.resolve(null);
  return searchSite(queries[index], type, year).then(function(url) {
    return url || findPage(queries, type, year, index + 1);
  });
}

function episodeNumber(url, text) {
  var value = normalizeTitle(url + " " + text);
  var match = value.match(/sezonul\s+(\d+)\s+episodul\s+0*(\d+)/);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  match = value.match(/episodul\s+0*(\d+)/);
  if (match) return { season: 1, episode: parseInt(match[1], 10) };
  return null;
}

function findEpisode(html, season, episode) {
  var best = null;
  htmlLinks(html).forEach(function(candidate) {
    if (candidate.href.indexOf("/episode/") < 0) return;
    var numbers = episodeNumber(candidate.href, candidate.text);
    if (!numbers || numbers.season !== season || numbers.episode !== episode) return;
    best = candidate.href;
  });
  return best;
}

function encodedPlayerIdSources(html) {
  var sources = [];
  var regex = /\bid\s*=\s*(["'])([0-9a-f]{30,})\1/gi;
  var match;
  while ((match = regex.exec(String(html || "")))) {
    var id = match[2];
    if (id.length % 3 !== 0) continue;
    var decoded = "";
    for (var index = 0; index < id.length; index += 3) {
      decoded += String.fromCharCode(parseInt("0" + id.slice(index, index + 3), 16));
    }
    try {
      var data = JSON.parse(decoded);
      if (data && data.v) sources.push("https://hqq.tv/player/embed_player.php?vid=" + encodeURIComponent(data.v) + "&autoplay=none");
    } catch (error) {
      // Other site IDs are not player payloads.
    }
  }
  return sources;
}

function iframeSources(html) {
  var decoded = decodeAtHex(html);
  var sources = encodedPlayerIdSources(html);
  var regex = /<iframe\b[^>]*?\b(?:src|data-src)\s*=\s*(["'])([\s\S]*?)\1/gi;
  var match;
  while ((match = regex.exec(decoded))) sources.push(cleanUrl(match[2]));
  var metaRegex = /<meta\b[^>]*property\s*=\s*(["'])og:video(?::url|:secure_url)?\1[^>]*content\s*=\s*(["'])([\s\S]*?)\2/gi;
  while ((match = metaRegex.exec(decoded))) sources.push(cleanUrl(match[3]));

  return sources.map(function(source) {
    var url = /^(?:https?:)?\/\//i.test(source) ? absoluteUrl(source) : null;
    var hidden = url && url.match(/hideiframe\.com\/[^?]+\?([A-Za-z0-9_-]{20,})/i);
    if (hidden) {
      var unwrapped = decodeBase64(hidden[1]);
      if (/^https?:\/\//i.test(unwrapped)) url = unwrapped;
    }
    return cleanUrl(url);
  }).filter(function(url, index, all) {
    if (!/^https?:\/\//i.test(url)) return false;
    if (/youtube\.com|youtu\.be|dozaanimata\.net|storage\.googleapis\.com|about:blank/i.test(url)) return false;
    if (!/(?:hqq\.tv|playmogo\.|hideiframe\.|dood\w*\.|\.m3u8(?:\?|$)|\.mp4(?:\?|$)|\/embed|\/e\/)/i.test(url)) return false;
    return all.indexOf(url) === index;
  });
}

function makeStream(url, index) {
  return {
    name: PROVIDER_NAME + " | Server " + (index + 1),
    title: "External player",
    url: url,
    quality: "HD Rip",
    behaviorHints: {
      notWebReady: true,
      bingeGroup: "dozaanimata"
    },
    provider: "dozaanimata"
  };
}

function getStreams(id, type, season, episode) {
  var isTv = type === "tv" || type === "series";
  var wantedSeason = parseInt(season, 10) || 1;
  var wantedEpisode = parseInt(episode, 10) || 1;

  return tmdbMetadata(id, type).then(function(meta) {
    if (!meta) return null;
    return findPage(meta.queries, isTv ? "series" : "movie", meta.year).then(function(pageUrl) {
      if (!pageUrl) return null;
      if (!isTv) return pageUrl;
      return fetchText(pageUrl).then(function(seriesHtml) {
        var episodeUrl = findEpisode(seriesHtml, wantedSeason, wantedEpisode);
        if (episodeUrl) return episodeUrl;
        var query = (meta.queries[0] || "") + " sezonul " + wantedSeason + " episodul " + wantedEpisode;
        return searchSite(query, "episode", null);
      });
    });
  }).then(function(pageUrl) {
    if (!pageUrl) return [];
    return fetchText(pageUrl).then(function(html) {
      return iframeSources(html).map(makeStream);
    });
  }).catch(function(error) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[DozaAnimata] stream lookup failed", String(id || ""), String(type || ""), String(error && error.message || error || "unknown error"));
    }
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
