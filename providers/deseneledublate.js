var DESENELEDUBLATE_PLUGIN_VERSION = "0.1.9";
var PROVIDER_NAME = "DeseneleDublate";
var MAIN_URL = "https://deseneledublate.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Android TV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url, referer) {
  var headers = Object.assign({}, FETCH_HEADERS);
  if (referer) headers.Referer = referer;
  return fetch(url, { headers: headers }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return text;
    });
  });
}

function fetchPlayerOption(option) {
  var body = [
    "action=doo_player_ajax",
    "post=" + encodeURIComponent(option.post),
    "nume=" + encodeURIComponent(option.nume),
    "type=" + encodeURIComponent(option.type || "movie")
  ].join("&");
  return fetch(MAIN_URL + "/wp-admin/admin-ajax.php", {
    method: "POST",
    headers: Object.assign({}, FETCH_HEADERS, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json"
    }),
    body: body
  }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      try {
        return JSON.parse(text);
      } catch (error) {
        return null;
      }
    });
  });
}

function fetchJson(url, referer) {
  return fetchText(url, referer).then(function(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error("Invalid JSON response");
    }
  });
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/[),;]+$/, "")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  var url = cleanUrl(value);
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.indexOf("//") === 0) return "https:" + url;
  var origin = MAIN_URL;
  var match = String(baseUrl || "").match(/^(https?:\/\/[^/]+)/i);
  if (match) origin = match[1];
  if (url.charAt(0) === "/") return origin + url;
  return origin + "/" + url;
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

function htmlLinks(html, allowExternal) {
  var links = [];
  var regex = /<a\b[^>]*href\s*=\s*(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = regex.exec(String(html || "")))) {
    var href = absoluteUrl(match[2]);
    if (!href || (!allowExternal && href.indexOf("deseneledublate.com") < 0)) continue;
    links.push({ href: href, text: stripHtml(match[3]) });
  }
  return links;
}

function searchScore(candidate, query, type, year) {
  var path = String(candidate.href || "").toLowerCase();
  var isMovie = path.indexOf("/desen/") >= 0;
  var isSeries = path.indexOf("/serial/") >= 0;
  var isEpisode = path.indexOf("/episoade/") >= 0;
  if (type === "movie" && !isMovie) return -1;
  if (type === "series" && !isSeries) return -1;
  if (type === "episode" && !isEpisode) return -1;

  var words = titleWords(query);
  var haystack = normalizeTitle(candidate.href + " " + candidate.text);
  var matched = words.filter(function(word) {
    return haystack.split(" ").indexOf(word) >= 0;
  }).length;
  if (!matched) return -1;

  var score = matched * 10;
  if (matched === words.length) score += 35;
  if (year && haystack.indexOf(String(year)) >= 0) score += 20;
  if (isMovie || isSeries) score += 5;
  return score;
}

function searchSite(query, type, year) {
  if (!query) return Promise.resolve(null);
  return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(query)).then(function(html) {
    var best = null;
    var bestScore = -1;
    htmlLinks(html).forEach(function(candidate) {
      var score = searchScore(candidate, query, type, year);
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
    var date = isTv ? result.first_air_date : result.release_date;
    var year = parseInt(String(date || "").slice(0, 4), 10);
    return {
      queries: [localized, original].filter(function(value, index, all) {
        return value && all.indexOf(value) === index;
      }),
      year: isFinite(year) ? year : null
    };
  });
}

function episodeNumber(url, text) {
  var value = normalizeTitle(url + " " + text);
  var match = value.match(/sezonul\s+(\d+)\s+episodul\s+0*(\d+)/);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  match = value.match(/s(\d+)\s*e(\d+)/);
  if (match) return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
  match = value.match(/episodul\s+0*(\d+)/);
  if (match) return { season: 1, episode: parseInt(match[1], 10) };
  return null;
}

function findEpisodePage(seriesHtml, season, episode) {
  var best = null;
  htmlLinks(seriesHtml, true).forEach(function(candidate) {
    var numbers = episodeNumber(candidate.href, candidate.text);
    if (!numbers || numbers.season !== season || numbers.episode !== episode) return;
    best = candidate.href;
  });
  return best;
}

function resolveContentPage(pageUrl, html, audio) {
  var direct = genericMediaUrls(html).map(function(url) {
    return makeStream(url, sourceName(pageUrl, "Player"), pageUrl, audio, "1080p");
  });
  if (direct.length) return Promise.resolve(direct);

  var iframe = String(html || "").match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
  if (iframe) {
    return resolveEmbed(absoluteUrl(iframe[2], pageUrl), pageUrl, "Player", audio, 0);
  }

  if (String(pageUrl || "").indexOf(MAIN_URL) !== 0) {
    return Promise.resolve([makeStream(pageUrl, sourceName(pageUrl, "Player"), pageUrl, audio, "1080p", true)]);
  }
  return Promise.resolve([]);
}

function findContentPage(meta, type, season, episode) {
  var isTv = type === "tv" || type === "series";
  var queryIndex = 0;

  function nextQuery() {
    if (queryIndex >= meta.queries.length) return Promise.resolve(null);
    var query = meta.queries[queryIndex++];
    return searchSite(query, isTv ? "series" : "movie", meta.year).then(function(url) {
      if (!url) return nextQuery();
      if (!isTv) return url;
      return fetchText(url).then(function(html) {
        var episodeUrl = findEpisodePage(html, season, episode);
        if (episodeUrl) return episodeUrl;
        return searchSite(query + " sezonul " + season + " episodul " + episode, "episode");
      });
    });
  }

  return nextQuery();
}

function readAttribute(tag, name) {
  var regex = new RegExp(name + "\\s*=\\s*([\\\"'])([\\s\\S]*?)\\1", "i");
  var match = String(tag || "").match(regex);
  return match ? match[2] : "";
}

function playerOptions(html) {
  var options = [];
  var regex = /<li\b(?=[^>]*class\s*=\s*["'][^"']*dooplay_player_option)[^>]*>[\s\S]*?<\/li>/gi;
  var match;
  while ((match = regex.exec(String(html || "")))) {
    var tag = match[0];
    var nume = readAttribute(tag, "data-nume");
    var post = readAttribute(tag, "data-post");
    if (!nume || !post || /^trailer$/i.test(nume)) continue;
    var titleMatch = tag.match(/<span\b[^>]*class\s*=\s*["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
    var label = stripHtml(titleMatch ? titleMatch[1] : tag);
    options.push({
      nume: nume,
      post: post,
      type: readAttribute(tag, "data-type") || "movie",
      label: label
    });
  }
  return options;
}

function extractEmbedUrls(value, baseUrl) {
  var text = cleanUrl(value);
  var urls = decodePlayerIdSources(text);
  var iframe = text.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
  if (iframe) urls.push(iframe[2]);
  else if (/^(?:https?:)?\/\//i.test(text)) urls.push(text);

  return urls.map(function(url) {
    return absoluteUrl(url, baseUrl);
  }).filter(function(url, index, all) {
    return url && all.indexOf(url) === index && !/youtube\.com|youtu\.be/i.test(url);
  });
}

function decodePlayerIdSources(value) {
  var sources = [];
  var regex = /\bid\s*=\s*(["'])([0-9a-f]{30,})\1/gi;
  var match;
  while ((match = regex.exec(String(value || "")))) {
    var encoded = match[2];
    if (encoded.length % 3 !== 0) continue;
    var decoded = "";
    for (var index = 0; index < encoded.length; index += 3) {
      decoded += String.fromCharCode(parseInt("0" + encoded.slice(index, index + 3), 16));
    }
    try {
      var data = JSON.parse(decoded);
      if (data && data.v) {
        sources.push("https://hqq.tv/player/embed_player.php?vid=" + encodeURIComponent(data.v) + "&autoplay=none");
      }
    } catch (error) {
      // Other site IDs are not player payloads.
    }
  }
  return sources;
}

function sourceName(embedUrl, optionLabel) {
  var label = stripHtml(optionLabel).trim();
  if (label && !/^(tv|player|watch trailer)$/i.test(label)) return label;
  var host = String(embedUrl || "").match(/^https?:\/\/([^/]+)/i);
  host = host ? host[1].toLowerCase() : "";
  if (/streamtape/.test(host)) return "Streamtape";
  if (/ok\.ru|odnoklassniki/.test(host)) return "OK.ru";
  if (/embed4me/.test(host)) return "Embed4me";
  if (/dood/.test(host)) return "Doodstream";
  if (/playmogo/.test(host)) return "PlayMogo";
  if (/hqq\./.test(host)) return "HQQ";
  if (/gounlimited/.test(host)) return "Gounlimited";
  return label || host || PROVIDER_NAME;
}

function audioLabel(html, pageUrl) {
  var titleMatch = String(html || "").match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  var headingMatch = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  var text = normalizeTitle(pageUrl + " " + (titleMatch ? titleMatch[1] : "") + " " + (headingMatch ? headingMatch[1] : ""));
  if (text.indexOf("dublat") >= 0 || text.indexOf("limba romana") >= 0) return "🇷🇴 RO Dub";
  if (text.indexOf("subtitrat") >= 0) return "🌐 RO Sub";
  return "";
}

function makeStream(url, source, referer, audio, quality, isEmbed) {
  var isHls = /\.m3u8(?:\?|$)/i.test(url);
  var originMatch = String(referer || "").match(/^https?:\/\/[^/]+/i);
  var requestHeaders = {
    Referer: referer || MAIN_URL,
    Origin: originMatch ? originMatch[0] : MAIN_URL,
    "User-Agent": FETCH_HEADERS["User-Agent"]
  };
  var stream = {
    name: "✦ " + source + (audio ? "\n⭐ " + audio : ""),
    title: audio ? "⭐ " + audio : "",
    description: audio ? "⭐ " + audio : "",
    url: url,
    quality: quality || "1080p",
    type: isHls ? "hls" : "mp4",
    isM3U8: isHls,
    headers: requestHeaders,
    behaviorHints: {
      // Nuvio only applies proxyHeaders when the stream is marked not web-ready.
      notWebReady: true,
      bingeGroup: "deseneledublate-" + source.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      proxyHeaders: { request: requestHeaders }
    },
    provider: "deseneledublate"
  };
  return stream;
}

function decodeHex(value) {
  var bytes = [];
  var text = String(value || "");
  for (var index = 0; index + 1 < text.length; index += 2) {
    bytes.push(parseInt(text.slice(index, index + 2), 16));
  }
  return new Uint8Array(bytes);
}

function decryptEmbed4me(value) {
  if (typeof crypto === "undefined" || !crypto.subtle || typeof TextEncoder !== "function") {
    return Promise.reject(new Error("WebCrypto unavailable"));
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("kiemtienmua911ca"),
    { name: "AES-CBC" },
    false,
    ["decrypt"]
  ).then(function(key) {
    return crypto.subtle.decrypt(
      { name: "AES-CBC", iv: new TextEncoder().encode("1234567890oiuytr") },
      key,
      decodeHex(value)
    );
  }).then(function(buffer) {
    return new TextDecoder().decode(buffer);
  });
}

function resolveEmbed4me(embedUrl, pageUrl, source, audio) {
  var match = String(embedUrl).match(/#([^&]+)/);
  if (!match) return Promise.resolve([]);
  var id = match[1];
  var originMatch = String(embedUrl).match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return Promise.resolve([]);
  var api = originMatch[1] + "/api/v1/video?id=" + encodeURIComponent(id) + "&w=1920&h=1080&r=deseneledublate.com";
  return fetchText(api, embedUrl).then(function(encrypted) {
    return decryptEmbed4me(encrypted);
  }).then(function(text) {
    var data = JSON.parse(text);
    var urls = [data.hlsVideoTiktok, data.hlsVideoGoogle, data.cf, data.source, data.mp4].filter(function(url) {
      return /^https?:\/\//i.test(String(url || ""));
    });
    return urls.map(function(url, index) {
      return makeStream(url, source, embedUrl, audio, index === 0 ? "1080p" : "720p");
    });
  }).catch(function() {
    return [];
  });
}

function resolveStreamtape(embedUrl, pageUrl, source, audio) {
  var viewUrl = String(embedUrl).replace(/\/e\//i, "/v/");
  return fetchText(viewUrl, pageUrl).then(function(html) {
    // Streamtape's player uses captchalink; ideoooolink is an intentionally
    // obfuscated get_viddeo decoy and must not be preferred.
    var match = html.match(/<(?:span|div)\b[^>]*id\s*=\s*["'](?:captchalink|norobotlink|botlink|robotlink)["'][^>]*>([^<]+)<\//i);
    if (!match) match = html.match(/<(?:span|div)\b[^>]*id\s*=\s*["']captchalink["'][^>]*>([^<]+)<\//i);
    if (!match) match = html.match(/<(?:span|div)\b[^>]*id\s*=\s*["'](?:ideoooolink|ideoolink)["'][^>]*>([^<]+)<\//i);
    if (!match) match = html.match(/https?:?\\?\/\\?\/streamtape\.com\/get_video\?[^"'<\s]+/i);
    if (!match) throw new Error("Streamtape media URL missing");
    var url = cleanUrl(match[1] || match[0]);
    if (/^streamtape\.com\//i.test(url)) url = "https://" + url;
    url = absoluteUrl(url, viewUrl);
    url = url.replace(/^https?:\/\/streamtape\.com\/streamtape\.com\//i, "https://streamtape.com/");
    if (url.indexOf("&stream=") < 0) url += "&stream=1";
    var stream = makeStream(url, source, viewUrl, audio, "1080p");
    // Match the browser agent used to resolve the signed URL, but do not
    // forward Referer or Origin to the redirected CDN request.
    var playbackHeaders = { "User-Agent": FETCH_HEADERS["User-Agent"] };
    stream.headers = playbackHeaders;
    stream.behaviorHints.proxyHeaders = { request: playbackHeaders };
    return [stream];
  }).catch(function() {
    return [];
  });
}

function resolveHqq(embedUrl, pageUrl, source, audio) {
  return fetchText(embedUrl, pageUrl).then(function(html) {
    var direct = genericMediaUrls(html).map(function(url) {
      return makeStream(url, source, embedUrl, audio, "1080p");
    });
    if (direct.length) return direct;
    return [];
  }).catch(function() {
    return [];
  });
}

function resolveOkru(embedUrl, pageUrl, source, audio) {
  var idMatch = String(embedUrl).match(/videoembed\/(\d+)/i);
  if (!idMatch) return Promise.resolve([]);
  var metadataUrl = "https://ok.ru/dk?cmd=videoPlayerMetadata&mid=" + idMatch[1];
  return fetch(metadataUrl, {
    method: "POST",
    headers: Object.assign({}, FETCH_HEADERS, {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    }),
    body: ""
  }).then(function(res) {
    return res.text().then(function(text) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return JSON.parse(text);
    });
  }).then(function(data) {
    var movie = data && data.movie ? data.movie : data;
    var videos = data && Array.isArray(data.videos)
      ? data.videos
      : (movie && Array.isArray(movie.videos) ? movie.videos : []);
    var streams = videos.map(function(video) {
      var url = video && (video.url || video.src);
      if (!/^https?:\/\//i.test(String(url || ""))) return null;
      return makeStream(url, source, embedUrl, audio, video.name || video.quality || "1080p");
    }).filter(Boolean);
    var hls = (data && (data.hlsMasterPlaylistUrl || data.hlsMasterUrl || data.ondemandHls)) ||
      (movie && (movie.hlsMasterPlaylistUrl || movie.hlsMasterUrl));
    if (hls && /^https?:\/\//i.test(hls)) streams.push(makeStream(hls, source, embedUrl, audio, "1080p"));
    if (!streams.length) throw new Error("OK.ru media URL missing");
    return streams;
  }).catch(function() {
    return [makeStream(embedUrl, source, pageUrl, audio, "1080p", true)];
  });
}

function resolveDood(embedUrl, pageUrl, source, audio) {
  return fetchText(embedUrl, pageUrl).then(function(html) {
    var pass = html.match(/\/pass_md5\/[^"'<\s]+/i);
    if (!pass) throw new Error("Dood media path missing");
    var path = cleanUrl(pass[0]);
    var token = path.split("/").pop().split("?")[0];
    var passUrl = absoluteUrl(path, embedUrl);
    return fetchText(passUrl, embedUrl).then(function(mediaBase) {
      mediaBase = cleanUrl(mediaBase);
      if (!mediaBase || mediaBase === "RELOAD") throw new Error("Dood media path missing");
      if (!/^https?:\/\//i.test(mediaBase)) mediaBase = absoluteUrl(mediaBase, embedUrl);
      return [makeStream(mediaBase + randomToken(10) + "?token=" + encodeURIComponent(token) + "&expiry=" + Date.now(), source, embedUrl, audio, "1080p")];
    });
  }).catch(function() {
    return [];
  });
}

function randomToken(length) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var result = "";
  for (var index = 0; index < length; index += 1) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

function genericMediaUrls(html) {
  var urls = [];
  var source = String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  var regex = /https?:[^"'<\s\\]+?(?:\.m3u8|\.mp4)(?:\?[^"'<\s\\]*)?/gi;
  var match;
  while ((match = regex.exec(source))) {
    var url = cleanUrl(match[0]);
    if (urls.indexOf(url) < 0) urls.push(url);
  }
  return urls;
}

function resolveEmbed(embedUrl, pageUrl, optionLabel, audio, depth) {
  depth = depth || 0;
  var source = sourceName(embedUrl, optionLabel);
  if (/\.m3u8(?:\?|$)|\.mp4(?:\?|$)/i.test(embedUrl)) {
    return Promise.resolve([makeStream(embedUrl, source, pageUrl, audio)]);
  }
  if (/streamtape\.com/i.test(embedUrl)) return resolveStreamtape(embedUrl, pageUrl, source, audio);
  if (/hqq\./i.test(embedUrl)) return resolveHqq(embedUrl, pageUrl, source, audio);
  if (/ok\.ru|odnoklassniki/i.test(embedUrl)) return resolveOkru(embedUrl, pageUrl, source, audio);
  if (/embed4me/i.test(embedUrl)) return resolveEmbed4me(embedUrl, pageUrl, source, audio);
  if (/dood\w*\.|playmogo\./i.test(embedUrl)) return resolveDood(embedUrl, pageUrl, source, audio);
  if (depth > 1) return Promise.resolve([]);

  return fetchText(embedUrl, pageUrl).then(function(html) {
    var direct = genericMediaUrls(html).map(function(url) {
      return makeStream(url, source, embedUrl, audio);
    });
    if (direct.length) return direct;
    var iframe = html.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!iframe) return [];
    return resolveEmbed(absoluteUrl(iframe[2], embedUrl), embedUrl, optionLabel, audio, depth + 1);
  }).catch(function() {
    return [];
  });
}

function uniqueStreams(streams) {
  var seen = {};
  return (streams || []).filter(function(stream) {
    var url = String(stream && stream.url || "");
    if (!url || seen[url]) return false;
    seen[url] = true;
    return true;
  });
}

function resolveOption(option, pageUrl, audio) {
  return fetchPlayerOption(option).then(function(data) {
    if (!data || !data.embed_url || data.type === "trailer") return [];
    var urls = extractEmbedUrls(data.embed_url, pageUrl);
    return resolveEmbedList(urls, pageUrl, option.label, audio, 0);
  }).catch(function() {
    return [];
  });
}

function resolveEmbedList(urls, pageUrl, label, audio, index) {
  if (index >= urls.length) return Promise.resolve([]);
  return resolveEmbed(urls[index], pageUrl, label, audio, 0).then(function(streams) {
    return resolveEmbedList(urls, pageUrl, label, audio, index + 1).then(function(rest) {
      return streams.concat(rest);
    });
  });
}

function resolveOptions(options, pageUrl, audio, index) {
  if (index >= options.length) return Promise.resolve([]);
  return resolveOption(options[index], pageUrl, audio).then(function(streams) {
    return resolveOptions(options, pageUrl, audio, index + 1).then(function(rest) {
      return streams.concat(rest);
    });
  });
}

function getStreams(id, type, season, episode) {
  var wantedSeason = parseInt(season, 10) || 1;
  var wantedEpisode = parseInt(episode, 10) || 1;
  return tmdbMetadata(id, type).then(function(meta) {
    if (!meta) return null;
    return findContentPage(meta, type, wantedSeason, wantedEpisode);
  }).then(function(pageUrl) {
    if (!pageUrl) return [];
    return fetchText(pageUrl).then(function(html) {
      var options = playerOptions(html);
      var audio = audioLabel(html, pageUrl);
      if (options.length) return resolveOptions(options, pageUrl, audio, 0);
      return resolveContentPage(pageUrl, html, audio || "🇷🇴 RO Dub");
    }).catch(function() {
      if (String(pageUrl || "").indexOf(MAIN_URL) !== 0) {
        return [makeStream(pageUrl, sourceName(pageUrl, "Player"), pageUrl, "🇷🇴 RO Dub", "1080p", true)];
      }
      return [];
    });
  }).then(function(streams) {
    return uniqueStreams(streams);
  }).catch(function(error) {
    if (typeof console !== "undefined" && console.error) {
      console.error("[DeseneleDublate] stream lookup failed", String(id || ""), String(type || ""), String(error && error.message || error || "unknown error"));
    }
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
