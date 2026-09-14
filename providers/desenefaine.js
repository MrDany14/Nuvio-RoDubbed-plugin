var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

var M3U8_RE = /(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\/master\.txt)(?:\?[^\s"'<>\\]*)?/gi;

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

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/[),;]+$/, "")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  var cleaned = cleanUrl(value);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.indexOf("//") === 0) return "https:" + cleaned;

  var originMatch = String(baseUrl).match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return null;
  if (cleaned.charAt(0) === "/") return originMatch[1] + cleaned;

  var basePath = String(baseUrl).split("?")[0].replace(/\/[^/]*$/, "/");
  return basePath + cleaned;
}

function decodeBase64(value) {
  var encoded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  encoded += "===".slice((encoded.length + 3) % 4);
  if (typeof atob === "function") return atob(encoded);

  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var output = "";
  var buffer = 0;
  var bits = 0;
  for (var index = 0; index < encoded.length; index += 1) {
    var valueIndex = alphabet.indexOf(encoded.charAt(index));
    if (valueIndex < 0) continue;
    buffer = (buffer << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 255);
    }
  }
  return output;
}

function decodeHex(value) {
  var text = "";
  for (var index = 0; index + 1 < value.length; index += 2) {
    text += String.fromCharCode(parseInt(value.slice(index, index + 2), 16));
  }
  return text;
}

function binaryBytes(value) {
  var bytes = new Uint8Array(value.length);
  for (var index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 255;
  }
  return bytes;
}

function base64UrlEncode(bytes) {
  var binary = "";
  for (var index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  if (typeof btoa === "function") {
    return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  return binary;
}

function textBytes(value) {
  // Byse's PoW input is ASCII nonce text plus a decimal counter.
  return binaryBytes(String(value));
}

function apiJson(url, options) {
  options = options || {};
  var headers = Object.assign({
    Accept: "application/json",
    "Content-Type": "application/json"
  }, options.headers || {});
  var request = {
    method: options.method || "GET",
    headers: headers
  };
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    return res.text().then(function(text) {
      var data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        data = { error: text };
      }
      if (!res.ok) throw new Error("HTTP " + res.status + ": " + (data.error || text));
      return data;
    });
  });
}

function byseCrypto() {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  return crypto;
}

function randomId() {
  var bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (var index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes);
}

function createByseFingerprint(apiOrigin) {
  var webCrypto = byseCrypto();
  if (!webCrypto || !webCrypto.subtle || !webCrypto.subtle.generateKey) {
    return Promise.resolve(null);
  }

  return apiJson(apiOrigin + "/api/videos/access/challenge", {
    method: "POST",
    body: "{}"
  }).then(function(challenge) {
    return webCrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    ).then(function(keys) {
      return Promise.all([
        webCrypto.subtle.exportKey("jwk", keys.publicKey),
        webCrypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          textBytes(challenge.nonce)
        )
      ]).then(function(values) {
        var viewerId = randomId();
        var deviceId = randomId();
        var client = {
          user_agent: FETCH_HEADERS["User-Agent"],
          languages: ["ro-RO", "en-US"],
          timezone: "UTC",
          extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] }
        };
        var body = {
          viewer_id: viewerId,
          device_id: deviceId,
          challenge_id: challenge.challenge_id,
          nonce: challenge.nonce,
          signature: base64UrlEncode(new Uint8Array(values[1])),
          public_key: values[0],
          client: client,
          storage: {},
          attributes: { entropy: "low" }
        };

        return apiJson(apiOrigin + "/api/videos/access/attest", {
          method: "POST",
          body: JSON.stringify(body)
        }).then(function(attestation) {
          if (!attestation.token) throw new Error("Byse fingerprint rejected");
          return {
            token: attestation.token,
            viewer_id: attestation.viewer_id || viewerId,
            device_id: attestation.device_id || deviceId,
            confidence: attestation.confidence || 0
          };
        });
      });
    });
  });
}

function byseRotate(value, shift) {
  return (value << shift | value >>> (32 - shift)) >>> 0;
}

function byseMix(state) {
  state[0] = state[0] + state[1] >>> 0;
  state[3] = byseRotate(state[3] ^ state[0], 16);
  state[2] = state[2] + state[3] >>> 0;
  state[1] = byseRotate(state[1] ^ state[2], 12);
  state[0] = state[0] + state[1] >>> 0;
  state[3] = byseRotate(state[3] ^ state[0], 8);
  state[2] = state[2] + state[3] >>> 0;
  state[1] = byseRotate(state[1] ^ state[2], 7);
}

function bysePowHash(bytes) {
  var state = new Uint32Array([1779033703, 3144134277, 1013904242, 2773480762]);
  var index;
  for (index = 0; index < bytes.length; index += 1) {
    state[0] = state[0] + bytes[index] >>> 0;
    state[0] = byseRotate(state[0], 7);
    byseMix(state);
  }
  for (index = 0; index < 8; index += 1) byseMix(state);

  var table = new Uint32Array(512);
  for (index = 0; index < 512; index += 1) {
    byseMix(state);
    table[index] = (state[0] ^ state[2]) >>> 0;
  }

  var round;
  for (round = 0; round < 2; round += 1) {
    for (index = 0; index < 512; index += 1) {
      var target = table[index] & 511;
      var value = table[index] + table[target] >>> 0;
      value = byseRotate(value, 13);
      value = (value ^ Math.imul(table[(index + 1) & 511], 2654435761)) >>> 0;
      table[index] = value;
      state[0] = (state[0] ^ value) >>> 0;
      byseMix(state);
    }
  }

  var result = new Uint32Array(8);
  for (index = 0; index < 8; index += 1) {
    byseMix(state);
    var sum = state[0];
    var start = index * 64;
    for (var offset = 0; offset < 64; offset += 1) {
      var item = table[start + offset];
      sum = sum + item >>> 0;
      sum = byseRotate(sum, 5);
      sum = (sum ^ Math.imul(item, 2246822519)) >>> 0;
    }
    result[index] = (sum ^ state[2]) >>> 0;
  }
  return result;
}

function byseLeadingZeroBits(words) {
  var bits = 0;
  for (var index = 0; index < words.length; index += 1) {
    if (words[index] === 0) {
      bits += 32;
      continue;
    }
    return bits + Math.clz32(words[index]);
  }
  return bits;
}

function solveBysePow(nonce, difficulty, timeoutMs) {
  if (!difficulty || difficulty <= 0) return Promise.resolve("0");
  var prefix = String(nonce) + ":";
  var solution = 0;
  var started = Date.now();

  function step() {
    for (var count = 0; count < 1024; count += 1) {
      if (byseLeadingZeroBits(bysePowHash(textBytes(prefix + solution))) >= difficulty) {
        return Promise.resolve(String(solution));
      }
      solution += 1;
    }
    if (Date.now() - started > (timeoutMs || 20000)) return Promise.resolve(null);
    return new Promise(function(resolve) {
      setTimeout(function() { resolve(step()); }, 0);
    });
  }

  return step();
}

function decryptBysePlayback(playback) {
  var webCrypto = byseCrypto();
  if (!webCrypto || !webCrypto.subtle) return Promise.reject(new Error("AES-GCM unavailable"));

  var version = parseInt(playback.version, 10);
  var first = version;
  var second = 31 - version;
  var keyParts = playback.key_parts || [];
  if (!first || !second || !keyParts[first - 1] || !keyParts[second - 1]) {
    return Promise.reject(new Error("Unsupported Byse key version"));
  }

  var firstBytes = binaryBytes(decodeBase64(keyParts[first - 1]));
  var secondBytes = binaryBytes(decodeBase64(keyParts[second - 1]));
  var keyBytes = new Uint8Array(firstBytes.length + secondBytes.length);
  keyBytes.set(firstBytes, 0);
  keyBytes.set(secondBytes, firstBytes.length);

  return webCrypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  ).then(function(key) {
    return webCrypto.subtle.decrypt(
      { name: "AES-GCM", iv: binaryBytes(decodeBase64(playback.iv)) },
      key,
      binaryBytes(decodeBase64(playback.payload))
    );
  }).then(function(bytes) {
    var text = typeof TextDecoder === "function"
      ? new TextDecoder().decode(bytes)
      : String.fromCharCode.apply(null, new Uint8Array(bytes));
    return JSON.parse(text);
  });
}

function hexBytes(value) {
  var bytes = new Uint8Array(Math.floor(String(value || "").length / 2));
  for (var index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(String(value).slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function player4meKey() {
  var webCrypto = byseCrypto();
  if (!webCrypto || !webCrypto.subtle) return Promise.reject(new Error("AES-CBC unavailable"));
  return webCrypto.subtle.importKey(
    "raw",
    binaryBytes("kiemtienmua911ca"),
    { name: "AES-CBC" },
    false,
    ["decrypt", "encrypt"]
  );
}

function decryptPlayer4meResponse(body) {
  return player4meKey().then(function(key) {
    return crypto.subtle.decrypt(
      { name: "AES-CBC", iv: binaryBytes("1234567890oiuytr") },
      key,
      hexBytes(body)
    );
  }).then(function(bytes) {
    var text = typeof TextDecoder === "function"
      ? new TextDecoder().decode(bytes)
      : String.fromCharCode.apply(null, new Uint8Array(bytes));
    return JSON.parse(text);
  });
}

function encryptPlayer4meValue(value) {
  return player4meKey().then(function(key) {
    return crypto.subtle.encrypt(
      { name: "AES-CBC", iv: binaryBytes("1234567890oiuytr") },
      key,
      binaryBytes(value)
    );
  }).then(function(bytes) {
    var result = "";
    var view = new Uint8Array(bytes);
    for (var index = 0; index < view.length; index += 1) {
      result += ("0" + view[index].toString(16)).slice(-2);
    }
    return result;
  });
}

function urlHost(url) {
  var match = String(url || "").match(/^https?:\/\/([^/]+)/i);
  return match ? match[1].replace(/^www\./i, "") : "";
}

function addPlayerKey(url, keyData) {
  if (!keyData || !keyData.k || /[?&]k=/i.test(url)) return url;
  var separator = url.indexOf("?") >= 0 ? "&" : "?";
  return url + separator + "k=" + encodeURIComponent(keyData.k) + "&kx=" + encodeURIComponent(keyData.kx || "");
}

function player4meSource(video, providerUrl, pageUrl) {
  var config = {};
  try {
    config = JSON.parse(video.streamingConfig || "{}");
  } catch (error) {
    config = {};
  }

  var sources = {
    Tiktok: video.hlsVideoTiktok,
    Google: video.hlsVideoGoogle,
    Cloudflare: video.cfNative || video.cf,
    "In-House": video.source
  };
  var order = Array.isArray(config.order)
    ? config.order
    : ["Tiktok", "Google", "Cloudflare", "In-House"];
  var adjust = config.adjust || {};
  var selected = null;
  var selectedKey = video.pk || null;

  order.some(function(provider) {
    var value = sources[provider];
    var settings = adjust[provider] || {};
    if (!value || settings.disabled) return false;
    var url = absoluteUrl(value, providerUrl);
    if (!url) return false;

    if (settings.domain && url.indexOf("/hls/") >= 0) {
      url = url.replace("/hls/", "/hlsmod/" + settings.domain + "/");
    }
    var params = settings.params || {};
    Object.keys(params).forEach(function(name) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + encodeURIComponent(name) + "=" + encodeURIComponent(params[name]);
    });
    selected = addPlayerKey(url, selectedKey);
    return true;
  });

  return selected;
}

function resolvePlayer4meProvider(providerUrl, pageUrl) {
  var originMatch = String(providerUrl).match(/^https?:\/\/[^/]+/i);
  var idMatch = String(providerUrl).match(/#([^&#]+)/);
  if (!originMatch || !idMatch) return Promise.reject(new Error("Player4me video id missing"));

  var origin = originMatch[0];
  var id = idMatch[1];
  var referrerHost = urlHost(pageUrl);
  var infoUrl = origin + "/api/v1/info?id=" + encodeURIComponent(id);
  var videoUrl = origin + "/api/v1/video?id=" + encodeURIComponent(id) + "&w=1920&h=1080&r=" + encodeURIComponent(referrerHost);

  return Promise.all([
    fetchText(infoUrl).then(decryptPlayer4meResponse),
    fetchText(videoUrl).then(decryptPlayer4meResponse)
  ]).then(function(values) {
    var info = values[0];
    var video = values[1];
    var keyData = video.pk;

    if (!keyData && video.metric) {
      var payload = {
        website: referrerHost || null,
        playing: true,
        sessionId: randomId(),
        userId: video.metric.userId,
        playerId: video.metric.playerId,
        videoId: video.metric.videoId || id,
        country: video.metric.country,
        platform: video.metric.platform,
        browser: video.metric.browser,
        os: video.metric.os
      };
      return encryptPlayer4meValue(JSON.stringify(payload)).then(function(encrypted) {
        return fetchJson(origin + "/api/v1/player?t=" + encrypted).then(function(token) {
          return { info: info, video: video, keyData: token };
        });
      });
    }

    return { info: info, video: video, keyData: keyData };
  }).then(function(result) {
    var video = result.video;
    if (!video.pk && result.keyData) video.pk = result.keyData;
    var streamUrl = player4meSource(video, providerUrl, pageUrl);
    if (!streamUrl || !/\.m3u8(?:\?|$)/i.test(streamUrl)) {
      throw new Error("Player4me returned no HLS source");
    }
    var stream = signedHlsStream(streamUrl, video.title || "Player4me HLS");
    stream.audioLanguage = (video.player && video.player.defaultAudio) || video.defaultAudio || video.audioLanguage || video.audio_language || (video.metric && video.metric.language);
    stream.resolution = video.resolution || video.quality || "1080p";
    return [stream];
  });
}

function directHlsStream(url, label, providerUrl, referrer) {
  var requestHeaders = {
    Referer: referrer || providerUrl,
    Origin: providerUrl ? String(providerUrl).match(/^https?:\/\/[^/]+/i)[0] : MAIN_URL,
    "User-Agent": FETCH_HEADERS["User-Agent"]
  };

  return {
    name: PROVIDER_NAME + " | " + label,
    title: "Direct HLS stream",
    url: url,
    quality: "1080p",
    type: "hls",
    isM3U8: true,
    headers: requestHeaders,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: "desenefaine-hls",
      proxyHeaders: { request: requestHeaders }
    },
    provider: "desenefaine"
  };
}

function signedHlsStream(url, label) {
  return {
    name: PROVIDER_NAME + " | " + label,
    title: "Direct HLS stream",
    url: url,
    quality: "1080p",
    type: "hls",
    isM3U8: true,
    behaviorHints: { bingeGroup: "desenefaine-signed-hls" },
    provider: "desenefaine"
  };
}

function streamSourceName(providerUrl) {
  var host = urlHost(providerUrl).toLowerCase();
  if (/byse/.test(host)) return "Bysewihe";
  if (/streamp2p|p2pplay/.test(host)) return "StreamP2P";
  if (/seekstream|embedseek/.test(host)) return "SeekStreaming";
  if (/4meplayer/.test(host)) return "4MePlayer";
  if (/player4me/.test(host)) return "Player4me";
  if (/dfbk/.test(host)) return "Dfbk";
  if (/desenefaine/.test(host)) return "DeseneFaine";
  return host || "DeseneFaine";
}

function streamAudioName(value) {
  var audio = normalizeTitle(value);
  if (!audio) return "RO";
  if (audio === "ro" || audio.indexOf("roman") >= 0) return "RO";
  if (audio === "en" || audio.indexOf("english") >= 0) return "EN";
  if (audio === "fr" || audio.indexOf("french") >= 0) return "FR";
  if (audio === "de" || audio.indexOf("german") >= 0) return "DE";
  return String(value).trim().toUpperCase();
}

function streamResolutionName(value) {
  var resolution = String(value || "").trim().toLowerCase();
  var dimensions = resolution.match(/(\d{3,4})\s*[x/]\s*(\d{3,4})/);
  if (dimensions) return dimensions[2] + "p";
  var height = resolution.match(/(\d{3,4})\s*p?/);
  if (height) return height[1] + "p";
  return "1080p";
}

function decorateStream(stream, displayTitle, providerUrl) {
  var title = String(displayTitle || "DeseneFaine")
    .replace(/\.(?:mkv|mp4|avi)$/i, "")
    .trim();
  var source = stream.sourceName || streamSourceName(providerUrl);
  var audio = streamAudioName(stream.audioLanguage || stream.audio || stream.language);
  var resolution = streamResolutionName(stream.resolution || stream.quality);

  stream.name = [title, source, audio, resolution].join(" | ");
  stream.title = title;
  stream.quality = resolution;
  return stream;
}

function uniqueStreams(streams) {
  var seen = {};
  return (streams || []).filter(function(stream) {
    var key = String(stream && stream.url || "");
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function findHlsUrls(html) {
  var candidates = [];
  var seen = {};
  M3U8_RE.lastIndex = 0;
  var match;
  while ((match = M3U8_RE.exec(String(html || ""))) !== null) {
    var url = cleanUrl(match[0]);
    var key = url.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      candidates.push(url);
    }
  }
  return candidates;
}

function titleScore(text, words) {
  var normalized = normalizeTitle(text);
  var score = 0;
  words.forEach(function(word) {
    if (normalized.indexOf(word) >= 0) score += 1;
  });
  return score;
}

function siteSlug(value) {
  return normalizeTitle(value).replace(/\s+/g, "-");
}

function readFilmPage(url, expectedWords) {
  return fetchText(url).then(function(html) {
    var normalized = normalizeTitle(html);
    var hasPlayer = /data-src=["'][^"']+["']/i.test(html) || /(?:trembed=|trhide=1&tid=)/i.test(html);
    var hasEpisodes = /s\s*\d+\s+e\s*\d+/i.test(normalized);
    var hasTitle = expectedWords.every(function(word) {
      return normalized.indexOf(word) >= 0;
    });
    if (!hasPlayer && !hasTitle && !hasEpisodes) return null;
    return { url: url, html: html };
  }).catch(function() {
    return null;
  });
}

function filmPageSlugs(query) {
  var slug = siteSlug(query);
  var slugs = [slug, slug + "-filmul", slug + "-film", slug + "-dublat-in-romana"];
  if (slug === "moana") slugs.unshift("vaiana-filmul");
  if (slug === "vaiana") slugs.unshift("vaiana-filmul");
  return slugs;
}

function findDirectFilmPage(query, words) {
  var slugs = filmPageSlugs(query);
  var result = Promise.resolve(null);
  slugs.forEach(function(slug) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(MAIN_URL + "/film/" + slug + "/", words);
    });
  });
  return result;
}

function episodePageSlugs(query, season, episode) {
  var slug = siteSlug(query);
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var paddedSeason = s < 10 ? "0" + s : String(s);
  var paddedEpisode = e < 10 ? "0" + e : String(e);
  return [
    slug + "-s" + s + "-ep" + e,
    slug + "-s" + paddedSeason + "-e" + paddedEpisode,
    slug + "-sezonul-" + s + "-episodul-" + e,
    slug + "-sezon-" + s + "-episodul-" + e
  ];
}

function findDirectEpisodePage(query, words, season, episode) {
  var slugs = episodePageSlugs(query, season, episode);
  var result = Promise.resolve(null);
  slugs.forEach(function(slug) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(MAIN_URL + "/epi/" + slug + "/", words);
    });
  });
  return result;
}

function seriesPageSlugs(query) {
  var slug = siteSlug(query);
  return [slug, slug + "-serial", slug + "-sezonul-1"];
}

function seriesTitleVariants(query) {
  var variants = [query];
  var localized = String(query)
    .replace(/the first/ig, "intai")
    .replace(/royal magic/ig, "magia regala")
    .replace(/magical friends/ig, "prieteni magici");
  if (normalizeTitle(localized) !== normalizeTitle(query)) variants.push(localized);
  return variants;
}

function readEpisodeFromSeriesPage(seriesResult, words, season, episode) {
  if (!seriesResult) return Promise.resolve(null);
  var $ = cheerio.load(seriesResult.html);
  var seasonText = "s" + (parseInt(season, 10) || 1);
  var episodeText = "e" + (parseInt(episode, 10) || 1);
  var candidate = null;

  $("a[href]").each(function(_, element) {
    if (candidate) return;
    var href = absoluteUrl($(element).attr("href"), seriesResult.url);
    var text = normalizeTitle(($(element).text() || "") + " " + (href || ""));
    if (!href || !/\/(?:epi|episode)\//i.test(href)) return;
    if (text.indexOf(seasonText) < 0 || text.indexOf(episodeText) < 0) return;
    candidate = href;
  });

  return candidate ? readFilmPage(candidate, words) : Promise.resolve(null);
}

function findDirectSeriesEpisodePage(query, words, season, episode) {
  var slugs = seriesPageSlugs(query);
  var urls = [];
  slugs.forEach(function(slug) {
    urls.push(MAIN_URL + "/serial/" + slug + "/");
    urls.push(MAIN_URL + "/sez/" + slug + "/");
    urls.push(MAIN_URL + "/sez/" + slug + "-sezonul-1/");
  });
  var result = Promise.resolve(null);
  urls.forEach(function(url) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(url, words).then(function(seriesResult) {
        return readEpisodeFromSeriesPage(seriesResult, words, season, episode);
      });
    });
  });
  return result;
}

function searchSeries(query, season, episode) {
  var words = normalizeTitle(query).split(" ").filter(function(word) {
    return word.length > 2;
  });
  if (!words.length) return Promise.resolve(null);

  var variants = seriesTitleVariants(query);
  var directResult = Promise.resolve(null);
  variants.forEach(function(variant) {
    directResult = directResult.then(function(result) {
      if (result) return result;
      var variantWords = normalizeTitle(variant).split(" ").filter(function(word) {
        return word.length > 2;
      });
      return findDirectEpisodePage(variant, variantWords, season, episode).then(function(episodeResult) {
        if (episodeResult) return episodeResult;
        return findDirectSeriesEpisodePage(variant, variantWords, season, episode);
      });
    });
  });

  return directResult.then(function(result) {
    if (result) return result;

    var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
    return fetchText(searchUrl).then(function(html) {
      var $ = cheerio.load(html);
      var best = null;
      $("a[href]").each(function(_, element) {
        var href = absoluteUrl($(element).attr("href"), searchUrl);
        if (!href || !/\/(?:serial|epi|sez)\//i.test(href)) return;
        var text = normalizeTitle($(element).text() || $(element).attr("title") || href);
        var score = titleScore(text, words);
        if (/\/epi\//i.test(href)) score += 2;
        if (score < Math.ceil(words.length / 2)) return;
        if (!best || score > best.score) best = { href: href, score: score };
      });
      if (!best) return null;
      return fetchText(best.href).then(function(pageHtml) {
        var page = { url: best.href, html: pageHtml };
        if (/\/epi\//i.test(best.href)) return page;
        return readEpisodeFromSeriesPage(page, words, season, episode);
      });
    });
  }).catch(function() {
    return null;
  });
}

function searchSite(query) {
  var words = normalizeTitle(query).split(" ").filter(function(word) {
    return word.length > 2;
  });
  if (!words.length) return Promise.resolve(null);

  return findDirectFilmPage(query, words).then(function(directResult) {
    if (directResult) return directResult;

    var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(query);
    return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var best = null;

    $("a[href]").each(function(_, element) {
      var href = absoluteUrl($(element).attr("href"), searchUrl);
      if (!href || !/desenefaine\.com\/film\//i.test(href)) return;
      if (/\/film\/$/i.test(href)) return;

      var text = normalizeTitle($(element).text() || $(element).attr("title"));
      var score = titleScore(text, words);
      if (score < Math.ceil(words.length / 2)) return;

      if (!best || score > best.score || (score === best.score && text.length < best.text.length)) {
        best = { href: href, text: text, score: score };
      }
    });

      if (!best) return null;
      return fetchText(best.href).then(function(pageHtml) {
        return { url: best.href, html: pageHtml };
      });
    });
  }).catch(function() {
    return null;
  });
}

function findServerUrls(pageHtml, pageUrl) {
  var urls = [];
  var seen = {};
  var serverRe = /<a\b[^>]*data-src=["']([^"']+)["'][^>]*>/gi;
  var match;
  while ((match = serverRe.exec(String(pageHtml))) !== null) {
    var url = absoluteUrl(decodeBase64(match[1]), pageUrl);
    if (url && !seen[url]) {
      seen[url] = true;
      urls.push(url);
    }
  }
  return urls;
}

function findByseProviderUrl(embedHtml) {
  var tidMatch = String(embedHtml).match(
    /<iframe\b[^>]*src=["']([^"']*\?trhide=1(?:&|&amp;)tid=[^"']+)["']/i
  );
  if (!tidMatch) return null;

  var nestedUrl = cleanUrl(tidMatch[1]);
  var tokenMatch = nestedUrl.match(/[?&]tid=([0-9a-f]+)(?:&|$)/i);
  if (tokenMatch) {
    var directDecoded = decodeHex(tokenMatch[1].split("").reverse().join(""));
    if (/^https?:\/\//i.test(directDecoded)) return Promise.resolve(directDecoded);
  }

  return fetchText(nestedUrl).then(function(nestedHtml) {
    var hexMatch = String(nestedHtml).match(/trde\(\s*["']([0-9a-f]+)["']\s*\)/i);
    if (!hexMatch) return null;

    var reversed = hexMatch[1].split("").reverse().join("");
    return decodeHex(reversed);
  }).catch(function() {
    return null;
  });
}

function resolveByseProvider(providerUrl, pageUrl) {
  var codeMatch = String(providerUrl).match(/\/e\/([^/?#]+)/i);
  if (!codeMatch) return Promise.reject(new Error("Byse video code missing"));
  var code = codeMatch[1];

  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(html) {
    var frameMatch = String(html).match(
      /<iframe\b[^>]*src=["'](https?:\/\/[^"']+\/[^"']*\/[^"']+)["']/i
    );
    var frameUrl = frameMatch ? cleanUrl(frameMatch[1]) : null;
    var apiOrigin = frameMatch
      ? frameUrl.match(/^https?:\/\/[^/]+/i)[0]
      : String(providerUrl).match(/^https?:\/\/[^/]+/i)[0];

    return createByseFingerprint(apiOrigin).catch(function() {
      return null;
    }).then(function(fingerprint) {
      var requestBody = fingerprint ? { fingerprint: fingerprint } : {};
      var captchaUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/captcha";

      return apiJson(captchaUrl, {
        method: "POST",
        body: JSON.stringify(requestBody)
      }).then(function(captcha) {
        return solveBysePow(captcha.pow_nonce, captcha.pow_difficulty, 30000).then(function(solution) {
          if (solution === null) throw new Error("Byse proof of work timed out");

          var verifyBody = {
            pow_token: captcha.pow_token,
            solution: solution
          };
          if (fingerprint) verifyBody.fingerprint = fingerprint;

          return apiJson(captchaUrl + "/verify", {
            method: "POST",
            body: JSON.stringify(verifyBody)
          });
        });
      }).then(function(verified) {
        if (!verified.token) throw new Error("Byse CAPTCHA token missing");

        var playbackBody = fingerprint ? { fingerprint: fingerprint } : {};
        return apiJson(apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/playback", {
          method: "POST",
          headers: { "X-Captcha-Token": verified.token },
          body: JSON.stringify(playbackBody)
        });
      });
    });
  }).then(function(response) {
    if (!response.playback) throw new Error("Byse playback payload missing");
    return decryptBysePlayback(response.playback);
  }).then(function(playback) {
    var sources = playback.sources || [];
    var streams = [];
    sources.forEach(function(source) {
      if (!source || !source.url) return;
      var mime = String(source.mime_type || "").toLowerCase();
      if (mime.indexOf("mpegurl") < 0 && !/\.m3u8(?:\?|$)/i.test(source.url)) return;
      var stream = signedHlsStream(
        source.url,
        source.label || source.quality || "Bysewihe HLS"
      );
      stream.audioLanguage = source.audio_language || source.audioLanguage || source.language || playback.default_audio || playback.defaultAudio;
      stream.resolution = source.resolution || source.quality;
      streams.push(stream);
    });
    if (!streams.length) throw new Error("Byse returned no HLS source");
    return streams;
  });
}

function resolveProvider(providerUrl, pageUrl, displayTitle) {
  if (/byse(?:wihe)?\./i.test(providerUrl)) {
    return resolveByseProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }
  if (/(?:player4me|4meplayer|embed4me|streamp2p|p2pplay|seekstream|embedseek)\./i.test(providerUrl)) {
    return resolvePlayer4meProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }

  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(html) {
    var hls = findHlsUrls(html);
    if (hls.length) {
      return hls.map(function(url) {
        return decorateStream(
          directHlsStream(url, "HLS", providerUrl, pageUrl),
          displayTitle,
          providerUrl
        );
      });
    }

    return [];
  }).catch(function() {
    return [];
  });
}

function resolveServerUrls(serverUrls, pageUrl, index, displayTitle) {
  if (index >= serverUrls.length) return Promise.resolve([]);

  return fetchText(serverUrls[index], { headers: { Referer: pageUrl } }).then(function(embedHtml) {
    var directHls = findHlsUrls(embedHtml);
    if (directHls.length) {
      return directHls.map(function(url) {
        return decorateStream(
          directHlsStream(url, "HLS", serverUrls[index], pageUrl),
          displayTitle,
          serverUrls[index]
        );
      });
    }

    return findByseProviderUrl(embedHtml).then(function(providerUrl) {
      return providerUrl ? resolveProvider(providerUrl, serverUrls[index], displayTitle) : [];
    });
  }).catch(function() {
    return [];
  }).then(function(streams) {
    return resolveServerUrls(serverUrls, pageUrl, index + 1, displayTitle).then(function(nextStreams) {
      return uniqueStreams((streams || []).concat(nextStreams || []));
    });
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
    var romanianTitle;
    var originalTitle;

    if (isImdb) {
      var results = isTv ? data.tv_results : data.movie_results;
      var result = results && results[0];
      romanianTitle = result && (isTv ? result.name : result.title);
      originalTitle = result && (isTv ? result.original_name : result.original_title);
    } else {
      romanianTitle = isTv ? data.name : data.title;
      originalTitle = isTv ? data.original_name : data.original_title;
    }

    var findPage = isTv ? searchSeries : searchSite;
    var displayTitle = originalTitle || romanianTitle;
    var pageResult = isTv
      ? findPage(romanianTitle || originalTitle, season, episode)
      : findPage(romanianTitle || originalTitle);

    return pageResult.then(function(result) {
      if (!result && originalTitle && originalTitle !== romanianTitle) {
        return isTv
          ? searchSeries(originalTitle, season, episode)
          : searchSite(originalTitle);
      }
      return result;
    }).then(function(result) {
      if (!result || !result.html) return [];

       var serverUrls = findServerUrls(result.html, result.url);
       if (!serverUrls.length) return [];
        return resolveServerUrls(serverUrls, result.url, 0, displayTitle);
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
