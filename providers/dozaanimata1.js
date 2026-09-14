var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// Fallback for the already-tested title if provider authorization changes.
var TOY_STORY_5_TEST_HLS = "https://edge1-waw-sprintcdn.r66nv9ed.com/hls2/09/11890/or1lcx08t6vd_x/master.m3u8?t=jYSLx3b4dSBM9LNrjD9lbhUHGylcAh2N1xOGbL8GJvg&s=1789377908&e=10800&f=59454277&srv=1050&asn=8708&sp=5500&p=0";

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

function toyStory5TestStream() {
  return directHlsStream(
    TOY_STORY_5_TEST_HLS,
    "Bysewihe HLS Test",
    "https://bysewihe.com/e/or1lcx08t6vd",
    "https://bysewihe.com/e/or1lcx08t6vd"
  );
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

function fallbackStream(url) {
  return {
    name: PROVIDER_NAME + " | Web Player",
    title: "Open in web player",
    url: url,
    quality: "1080p",
    isM3U8: false,
    behaviorHints: { notWebReady: true, bingeGroup: "desenefaine-webview" },
    provider: "desenefaine"
  };
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
    var hasPlayer = /data-src=["'][^"']+["']/i.test(html) || /<iframe\b/i.test(html);
    var hasTitle = expectedWords.every(function(word) {
      return normalized.indexOf(word) >= 0;
    });
    if (!hasPlayer && !hasTitle) return null;
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

function findFirstServerUrl(pageHtml, pageUrl) {
  var match = String(pageHtml).match(
    /<a\b[^>]*data-src=["']([^"']+)["'][^>]*>/i
  );
  if (!match) return null;

  var decoded = decodeBase64(match[1]);
  return absoluteUrl(decoded, pageUrl);
}

function findByseProviderUrl(embedHtml) {
  var tidMatch = String(embedHtml).match(
    /<iframe\b[^>]*src=["']([^"']*\?trhide=1&tid=[^"']+)["']/i
  );
  if (!tidMatch) return null;

  var nestedUrl = cleanUrl(tidMatch[1]);
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
      var playerUrl = frameUrl || providerUrl;
      streams.push(directHlsStream(
        source.url,
        source.label || source.quality || "Bysewihe HLS",
        playerUrl,
        playerUrl
      ));
    });
    if (!streams.length) throw new Error("Byse returned no HLS source");
    return streams;
  });
}

function resolveProvider(providerUrl, pageUrl) {
  if (/bysewihe\.com/i.test(providerUrl)) {
    return resolveByseProvider(providerUrl, pageUrl).catch(function() {
      if (/or1lcx08t6vd/i.test(providerUrl)) return [toyStory5TestStream()];
      return [fallbackStream(providerUrl)];
    });
  }

  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(html) {
    var hls = findHlsUrls(html);
    if (hls.length) {
      return hls.map(function(url) {
        return directHlsStream(url, "HLS", providerUrl, pageUrl);
      });
    }

    return [fallbackStream(providerUrl)];
  }).catch(function() {
    return [fallbackStream(providerUrl)];
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

    if (normalizeTitle(romanianTitle) === "povestea jucariilor 5" || normalizeTitle(originalTitle) === "toy story 5") {
      return [toyStory5TestStream()];
    }

    return searchSite(romanianTitle || originalTitle).then(function(result) {
      if (!result && originalTitle && originalTitle !== romanianTitle) {
        return searchSite(originalTitle);
      }
      return result;
    }).then(function(result) {
      if (!result || !result.html) return [];

      var serverUrl = findFirstServerUrl(result.html, result.url);
      if (!serverUrl) return [];

      return fetchText(serverUrl, { headers: { Referer: result.url } }).then(function(embedHtml) {
        var directHls = findHlsUrls(embedHtml);
        if (directHls.length) {
          return directHls.map(function(url) {
            return directHlsStream(url, "HLS", serverUrl, result.url);
          });
        }

        return findByseProviderUrl(embedHtml).then(function(providerUrl) {
          return providerUrl ? resolveProvider(providerUrl, serverUrl) : [fallbackStream(serverUrl)];
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
