// providers/desenefaine.js
// Nuvio scraper for DeseneFaine
//
// Main fixes:
// 1. Correct Nuvio "tv" media type handling.
// 2. Detect DeseneFaine server/player URLs.
// 3. Resolve Player4me / StreamP2P / SeekStreaming embeds
//    through their encrypted /api/v1/video endpoint.
// 4. AES-128-CBC decrypt the StreamEmbed response.
// 5. Return the actual HLS master/source URL to Nuvio.
// 6. Use the hosting provider's own Referer/Origin for playback.
// 7. Keep a generic multi-hop iframe fallback.
// 8. Do not return HTML/player pages as playable streams.

const PROVIDER_NAME = "DeseneFaine";
const PROVIDER_ID = "desenefaine";
const MAIN_URL = "https://desenefaine.com";

// Keep your existing TMDB key here.
// IMPORTANT: the key currently visible in the public GitHub repository
// should be rotated if it is a real personal/API key.
const TMDB_API_KEY = "YOUR_TMDB_API_KEY";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "ro-RO";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15000;
const SCRAPER_TIMEOUT_MS = 30000;

// -----------------------------------------------------------------------------
// StreamEmbed constants
//
// These are the public constants used by the StreamEmbed family:
//   seekstreaming.com
//   streamp2p.com
//   player4me.com
//
// The hosts expose the same /api/v1/video API and return an encrypted
// response containing the actual source/master URL.
// -----------------------------------------------------------------------------

const STREAMEMBED_AES_KEY_HEX = "6b69656d7469656e6d75613931316361";
const STREAMEMBED_AES_IV_HEX = "313233343536373839306f6975797472";

const STREAMEMBED_HOSTS = [
  "seekstreaming.com",
  "streamp2p.com",
  "player4me.com"
];

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------

function log(message) {
  try {
    console.log("[" + PROVIDER_NAME + "] " + message);
  } catch (_) {}
}

// -----------------------------------------------------------------------------
// HTTP
// -----------------------------------------------------------------------------

let _httpClient = null;

function getHttpClient() {
  if (_httpClient) return _httpClient;

  if (typeof fetch === "function") {
    log("HTTP client: fetch");

    _httpClient = function (url, opts) {
      opts = opts || {};

      return new Promise(function (resolve, reject) {
        var controller =
          typeof AbortController !== "undefined"
            ? new AbortController()
            : null;

        var timer = controller
          ? setTimeout(function () {
              try {
                controller.abort();
              } catch (_) {}
            }, REQUEST_TIMEOUT_MS)
          : null;

        fetch(url, {
          method: opts.method || "GET",
          headers: opts.headers || {},
          redirect: "follow",
          body: opts.body,
          signal: controller ? controller.signal : undefined
        })
          .then(function (res) {
            return res.text().then(function (text) {
              resolve({
                status: res.status,
                ok: res.ok,
                text: function () {
                  return Promise.resolve(text);
                },
                json: function () {
                  try {
                    return Promise.resolve(JSON.parse(text));
                  } catch (e) {
                    return Promise.reject(e);
                  }
                }
              });
            });
          })
          .catch(reject)
          .then(
            function () {
              if (timer) clearTimeout(timer);
            },
            function () {
              if (timer) clearTimeout(timer);
            }
          );
      });
    };

    return _httpClient;
  }

  try {
    var axios = require("axios");

    log("HTTP client: axios");

    _httpClient = function (url, opts) {
      opts = opts || {};

      return axios
        .get(url, {
          headers: opts.headers || {},
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 5,
          validateStatus: function () {
            return true;
          },
          responseType: "text",
          transformResponse: [
            function (data) {
              return data;
            }
          ]
        })
        .then(function (res) {
          var text =
            typeof res.data === "string"
              ? res.data
              : JSON.stringify(res.data);

          return {
            status: res.status,
            ok: res.status >= 200 && res.status < 300,
            text: function () {
              return Promise.resolve(text);
            },
            json: function () {
              try {
                return Promise.resolve(JSON.parse(text));
              } catch (e) {
                return Promise.reject(e);
              }
            }
          };
        });
    };

    return _httpClient;
  } catch (_) {}

  throw new Error("No HTTP client available");
}

function fetchText(url, headers) {
  headers = headers || {};

  var mergedHeaders = {
    "User-Agent": USER_AGENT,
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8"
  };

  Object.keys(headers).forEach(function (key) {
    mergedHeaders[key] = headers[key];
  });

  return getHttpClient()(url, {
    headers: mergedHeaders
  }).then(function (res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " for " + url);
    }

    return res.text();
  });
}

function fetchJson(url, headers) {
  headers = headers || {};

  var mergedHeaders = {
    "User-Agent": USER_AGENT,
    Accept: "application/json,text/plain,*/*",
    "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8"
  };

  Object.keys(headers).forEach(function (key) {
    mergedHeaders[key] = headers[key];
  });

  return getHttpClient()(url, {
    headers: mergedHeaders
  }).then(function (res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " for " + url);
    }

    return res.json();
  });
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function absoluteUrl(url, base) {
  if (!url) return null;

  url = String(url).trim();

  if (!url) return null;

  if (
    url.indexOf("javascript:") === 0 ||
    url.indexOf("#") === 0 ||
    url === "about:blank"
  ) {
    return null;
  }

  if (url.indexOf("//") === 0) {
    return "https:" + url;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  base = base || MAIN_URL;

  // Root-relative
  if (url.charAt(0) === "/") {
    var baseRoot = getOrigin(base);
    return baseRoot + url;
  }

  // Simple relative path
  var baseDir = base.replace(/\/[^\/]*$/, "/");
  return baseDir + url;
}

function getOrigin(url) {
  var match = String(url || "").match(/^(https?:\/\/[^\/?#]+)/i);

  if (match) {
    return match[1];
  }

  return MAIN_URL;
}

function getHost(url) {
  var match = String(url || "").match(/^https?:\/\/([^\/?#]+)/i);

  if (!match) return "";

  return match[1].toLowerCase().replace(/^www\./, "");
}

function decodeEntities(text) {
  if (!text) return text;

  return String(text)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#8217;/gi, "’")
    .replace(/&#8211;/gi, "–")
    .replace(/&#038;/gi, "&");
}

function decodeJsUrl(text) {
  if (!text) return text;

  return decodeEntities(String(text))
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u003f/gi, "?")
    .replace(/&quot;/gi, '"');
}

function stripTags(text) {
  if (!text) return "";

  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  var seen = {};
  var out = [];

  for (var i = 0; i < values.length; i++) {
    var value = values[i];

    if (!value) continue;

    if (seen[value]) continue;

    seen[value] = true;
    out.push(value);
  }

  return out;
}

function guessQuality(url) {
  var u = String(url || "").toLowerCase();

  if (u.indexOf("2160") >= 0 || u.indexOf("4k") >= 0) return "4K";
  if (u.indexOf("1440") >= 0) return "1440p";
  if (u.indexOf("1080") >= 0) return "1080p";
  if (u.indexOf("720") >= 0) return "720p";
  if (u.indexOf("576") >= 0) return "576p";
  if (u.indexOf("480") >= 0) return "480p";
  if (u.indexOf("360") >= 0) return "360p";

  return "auto";
}

function looksLikePlayableUrl(url) {
  if (!url) return false;

  var u = String(url).toLowerCase();

  if (u.indexOf(".m3u8") >= 0) return true;
  if (u.indexOf(".mp4") >= 0) return true;
  if (u.indexOf(".webm") >= 0) return true;
  if (u.indexOf(".mkv") >= 0) return true;

  // Some HLS servers return an extensionless URL.
  if (u.indexOf("/hls/") >= 0) return true;
  if (u.indexOf("/stream/") >= 0) return true;
  if (u.indexOf("/master") >= 0) return true;
  if (u.indexOf("/playlist") >= 0) return true;

  return false;
}

function isStreamEmbedHost(url) {
  var host = getHost(url);

  for (var i = 0; i < STREAMEMBED_HOSTS.length; i++) {
    var allowed = STREAMEMBED_HOSTS[i];

    if (host === allowed || host.endsWith("." + allowed)) {
      return true;
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// TMDB
// -----------------------------------------------------------------------------

function looksLikeTmdbId(id) {
  return /^\d+$/.test(String(id || ""));
}

function looksLikeImdbId(id) {
  return /^tt\d+$/i.test(String(id || ""));
}

function looksLikeTitle(id) {
  return (
    /[a-zA-Z]/.test(String(id || "")) &&
    !looksLikeImdbId(id)
  );
}

function resolveMeta(id, type, season, episode) {
  if (looksLikeTitle(id)) {
    log('Incoming id is a title: "' + id + '"');

    return Promise.resolve({
      title: String(id),
      originalTitle: null,
      year: null,
      season: season,
      episode: episode
    });
  }

  if (
    !TMDB_API_KEY ||
    TMDB_API_KEY === "YOUR_TMDB_API_KEY"
  ) {
    log("TMDB key not set; using raw id");

    return Promise.resolve({
      title: String(id),
      originalTitle: null,
      year: null,
      season: season,
      episode: episode
    });
  }

  var typeIsMovie = type === "movie";

  var tmdbIdPromise;

  if (looksLikeImdbId(id)) {
    var findUrl =
      TMDB_BASE +
      "/find/" +
      encodeURIComponent(id) +
      "?api_key=" +
      encodeURIComponent(TMDB_API_KEY) +
      "&external_source=imdb_id&language=" +
      encodeURIComponent(TMDB_LANG);

    tmdbIdPromise = fetchJson(findUrl, {
      Accept: "application/json"
    }).then(function (data) {
      var bucket = typeIsMovie
        ? data.movie_results
        : data.tv_results;

      if (bucket && bucket.length) {
        return bucket[0].id;
      }

      return null;
    });
  } else if (looksLikeTmdbId(id)) {
    tmdbIdPromise = Promise.resolve(id);
  } else {
    tmdbIdPromise = Promise.resolve(null);
  }

  return tmdbIdPromise
    .then(function (tmdbId) {
      if (!tmdbId) {
        log("Could not map TMDB id " + id);

        return {
          title: String(id),
          originalTitle: null,
          year: null,
          season: season,
          episode: episode
        };
      }

      var endpoint = typeIsMovie ? "movie" : "tv";

      var url =
        TMDB_BASE +
        "/" +
        endpoint +
        "/" +
        tmdbId +
        "?api_key=" +
        encodeURIComponent(TMDB_API_KEY) +
        "&language=" +
        encodeURIComponent(TMDB_LANG);

      return fetchJson(url, {
        Accept: "application/json"
      }).then(function (data) {
        var title =
          data.title ||
          data.name ||
          data.original_title ||
          data.original_name ||
          String(id);

        var originalTitle =
          data.original_title ||
          data.original_name ||
          null;

        var dateStr =
          data.release_date ||
          data.first_air_date ||
          "";

        var year = dateStr
          ? String(dateStr).slice(0, 4)
          : null;

        log(
          'TMDB: "' +
            title +
            '" (' +
            (year || "?") +
            ")"
        );

        return {
          title: title,
          originalTitle: originalTitle,
          year: year,
          season: season,
          episode: episode
        };
      });
    })
    .catch(function (e) {
      log("TMDB error: " + e.message);

      return {
        title: String(id),
        originalTitle: null,
        year: null,
        season: season,
        episode: episode
      };
    });
}

function buildSearchQueries(meta, type) {
  var title = meta.title;
  var originalTitle = meta.originalTitle;
  var year = meta.year;
  var season = meta.season;
  var episode = meta.episode;

  var out = [];

  function push(value) {
    if (value && out.indexOf(value) < 0) {
      out.push(value);
    }
  }

  push(title);

  if (originalTitle && originalTitle !== title) {
    push(originalTitle);
  }

  if (title && year) {
    push(title + " " + year);
    push(title + " (" + year + ")");
  }

  var isTv = type === "tv" || type === "series";

  if (isTv && title && season) {
    push(title + " sezonul " + season);

    if (episode) {
      push(
        title +
          " sezonul " +
          season +
          " episodul " +
          episode
      );

      push(
        title +
          " s" +
          String(season).padStart(2, "0") +
          "e" +
          String(episode).padStart(2, "0")
      );
    }
  }

  return out;
}

// -----------------------------------------------------------------------------
// DeseneFaine search
// -----------------------------------------------------------------------------

function collectCandidates(html, query) {
  var linkRegex =
    /<a\b[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  var map = {};
  var match;

  var queryWords = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(function (word) {
      return word.length > 2;
    });

  while ((match = linkRegex.exec(html)) !== null) {
    var href = absoluteUrl(
      decodeJsUrl(match[1]),
      MAIN_URL + "/"
    );

    var text = decodeEntities(
      stripTags(match[2] || "")
    ).toLowerCase();

    if (!href) continue;

    if (href.indexOf(MAIN_URL) !== 0) continue;

    if (
      href.indexOf("/category/") >= 0 ||
      href.indexOf("/tag/") >= 0 ||
      href.indexOf("/author/") >= 0
    ) {
      continue;
    }

    if (
      href.indexOf("/page/") >= 0 ||
      href.indexOf("?s=") >= 0
    ) {
      continue;
    }

    if (
      href === MAIN_URL ||
      href === MAIN_URL + "/"
    ) {
      continue;
    }

    var path = href
      .replace(MAIN_URL, "")
      .replace(/^\/|\/$/g, "");

    if (!path || path.length < 3) continue;

    if (
      /\.(png|jpe?g|gif|svg|css|js|ico|webp)$/i.test(path)
    ) {
      continue;
    }

    var slug = "";

    try {
      slug = decodeURIComponent(path).toLowerCase();
    } catch (_) {
      slug = path.toLowerCase();
    }

    var score = 0;

    for (var i = 0; i < queryWords.length; i++) {
      var word = queryWords[i];

      if (slug.indexOf(word) >= 0) {
        score += 5;
      }

      if (text.indexOf(word) >= 0) {
        score += 3;
      }
    }

    // Episode pages generally contain /epi/
    if (href.indexOf("/epi/") >= 0) {
      score += 6;
    }

    // More specific/longer slugs should beat generic results.
    if (slug.split("/").length >= 2) {
      score += 2;
    }

    if (slug.split("-").length >= 3) {
      score += 2;
    }

    if (!map[href] || map[href] < score) {
      map[href] = score;
    }
  }

  var results = Object.keys(map).map(function (href) {
    return {
      href: href,
      score: map[href]
    };
  });

  results.sort(function (a, b) {
    return b.score - a.score;
  });

  return results;
}

function searchSite(query) {
  var patterns = [
    MAIN_URL + "/?s={q}",
    MAIN_URL + "/cauta/{q}/",
    MAIN_URL + "/search/{q}/"
  ];

  var index = 0;

  function next() {
    if (index >= patterns.length) {
      return Promise.resolve(null);
    }

    var url = patterns[index++].replace(
      "{q}",
      encodeURIComponent(query)
    );

    log("Trying search: " + url);

    return fetchText(url, {
      Referer: MAIN_URL + "/"
    })
      .then(function (html) {
        var candidates = collectCandidates(
          html,
          query
        );

        if (candidates.length) {
          log(
            "Best result: " +
              candidates[0].href +
              " score=" +
              candidates[0].score
          );

          return candidates[0].href;
        }

        return null;
      })
      .catch(function (e) {
        log(
          "Search failed: " +
            url +
            " :: " +
            e.message
        );

        return next();
      });
  }

  return next();
}

// -----------------------------------------------------------------------------
// Extract iframe/player URLs from DeseneFaine
// -----------------------------------------------------------------------------

function extractIframeUrls(html, pageUrl) {
  var urls = [];

  // Standard iframe src/data attributes.
  var iframeRegex =
    /<iframe\b[^>]*>/gi;

  var iframeTags =
    html.match(iframeRegex) || [];

  for (var i = 0; i < iframeTags.length; i++) {
    var tag = iframeTags[i];

    var srcMatch = tag.match(
      /(?:src|data-src|data-lazy-src|data-url|data-embed|data-player)=["']([^"']+)["']/i
    );

    if (!srcMatch) continue;

    var iframeUrl = absoluteUrl(
      decodeJsUrl(srcMatch[1]),
      pageUrl
    );

    if (iframeUrl) {
      urls.push(iframeUrl);
    }
  }

  // Server/player URLs can also appear in data attributes or JS.
  var serverRegex =
    /https?:\/\/(?:www\.)?(?:seekstreaming\.com|streamp2p\.com|player4me\.com)\/[^"'<>\s\\]+/gi;

  var serverMatches =
    html.match(serverRegex) || [];

  for (var j = 0; j < serverMatches.length; j++) {
    urls.push(
      decodeJsUrl(serverMatches[j])
    );
  }

  return unique(urls);
}

// -----------------------------------------------------------------------------
// StreamEmbed resolver
//
// DeseneFaine -> Player4me/StreamP2P/SeekStreaming
//                          |
//                          v
//              /api/v1/video?id=FILECODE...
//                          |
//                     AES-CBC hex
//                          |
//                          v
//                 decrypted JSON
//                          |
//                   source/master
//                          |
//                          v
//                       m3u8
// -----------------------------------------------------------------------------

function extractStreamEmbedFilecode(url) {
  if (!url) return null;

  var clean = String(url).split("#")[0];
  clean = clean.split("?")[0];

  var match = clean.match(
    /\/(?:embed|e)\/([^\/?#]+)/i
  );

  if (!match || !match[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

function decryptStreamEmbedResponse(cipherHex) {
  if (!cipherHex) {
    throw new Error("Empty StreamEmbed response");
  }

  cipherHex = String(cipherHex).trim();

  // Some deployments may return JSON directly.
  if (
    cipherHex.charAt(0) === "{" &&
    cipherHex.charAt(cipherHex.length - 1) === "}"
  ) {
    return JSON.parse(cipherHex);
  }

  var CryptoJS;

  try {
    CryptoJS = require("crypto-js");
  } catch (e) {
    throw new Error(
      "crypto-js module unavailable: " + e.message
    );
  }

  var key = CryptoJS.enc.Hex.parse(
    STREAMEMBED_AES_KEY_HEX
  );

  var iv = CryptoJS.enc.Hex.parse(
    STREAMEMBED_AES_IV_HEX
  );

  var cipherParams =
    CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Hex.parse(cipherHex)
    });

  var decrypted = CryptoJS.AES.decrypt(
    cipherParams,
    key,
    {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    }
  );

  var plaintext =
    decrypted.toString(CryptoJS.enc.Utf8);

  if (!plaintext) {
    throw new Error(
      "AES decrypted to empty plaintext"
    );
  }

  try {
    return JSON.parse(plaintext);
  } catch (e) {
    throw new Error(
      "Invalid decrypted JSON: " +
        plaintext.slice(0, 150)
    );
  }
}

function resolveStreamEmbed(embedUrl) {
  var host = getHost(embedUrl);
  var origin = getOrigin(embedUrl);
  var filecode =
    extractStreamEmbedFilecode(embedUrl);

  if (!filecode) {
    log(
      "StreamEmbed URL has no filecode: " +
        embedUrl
    );

    return Promise.resolve(null);
  }

  var apiUrl =
    origin +
    "/api/v1/video?id=" +
    encodeURIComponent(filecode) +
    "&w=2048&h=1152&r=";

  log(
    "StreamEmbed resolver: " +
      host +
      " filecode=" +
      filecode
  );

  return fetchText(apiUrl, {
    Referer: origin + "/",
    Origin: origin,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Accept: "text/plain,*/*"
  })
    .then(function (cipherHex) {
      var payload =
        decryptStreamEmbedResponse(
          cipherHex
        );

      if (!payload) {
        throw new Error(
          "No decrypted payload"
        );
      }

      log(
        "StreamEmbed payload keys: " +
          Object.keys(payload).join(", ")
      );

      var streamUrl =
        payload.source ||
        payload.master ||
        payload.masterUrl ||
        payload.url ||
        null;

      if (!streamUrl) {
        log(
          "No source/master in decrypted payload"
        );

        return null;
      }

      streamUrl = decodeJsUrl(streamUrl);

      if (
        streamUrl.indexOf("//") === 0 ||
        streamUrl.charAt(0) === "/"
      ) {
        streamUrl = absoluteUrl(
          streamUrl,
          origin + "/"
        );
      }

      if (!/^https?:\/\//i.test(streamUrl)) {
        log(
          "Rejected non-http stream URL: " +
            streamUrl
        );

        return null;
      }

      log(
        "StreamEmbed resolved -> " +
          streamUrl
      );

      return {
        url: streamUrl,
        headers: {
          Referer: origin + "/",
          Origin: origin,
          "User-Agent": USER_AGENT
        },
        title:
          payload.title ||
          ("StreamEmbed | " + host),
        quality: guessQuality(streamUrl),
        providerHost: host,
        thumbnail:
          payload.thumbnail ||
          payload.poster ||
          null
      };
    })
    .catch(function (e) {
      log(
        "StreamEmbed resolver failed: " +
          embedUrl +
          " :: " +
          e.message
      );

      return null;
    });
}

// -----------------------------------------------------------------------------
// Generic iframe/player resolver
// -----------------------------------------------------------------------------

function extractDirectVideoUrls(html, baseUrl) {
  var urls = [];

  var patterns = [
    /<source[^>]+src=["']([^"']+)["']/gi,
    /["'](?:file|src|url|hls|master|masterUrl)["']?\s*[:=]\s*["']([^"']+)["']/gi,
    /(?:sources|source)\s*:\s*\[\s*\{[^}]*?(?:file|src|url)\s*:\s*["']([^"']+)["']/gi,
    /https?:\/\/[^"'<>\\\s]+(?:\.m3u8|\.mp4|\.webm)(?:\?[^"'<>\\\s]*)?/gi
  ];

  for (var i = 0; i < patterns.length; i++) {
    var regex = patterns[i];
    var match;

    while ((match = regex.exec(html)) !== null) {
      var raw = match[1] || match[0];

      raw = decodeJsUrl(raw);

      var absolute = absoluteUrl(
        raw,
        baseUrl
      );

      if (absolute && looksLikePlayableUrl(absolute)) {
        urls.push(absolute);
      }
    }
  }

  return unique(urls);
}

function resolveGenericPage(url, depth) {
  depth = depth || 0;

  if (depth > 3) {
    log(
      "Generic resolver depth limit reached: " +
        url
    );

    return Promise.resolve([]);
  }

  return fetchText(url, {
    Referer: MAIN_URL + "/"
  })
    .then(function (html) {
      var results =
        extractDirectVideoUrls(
          html,
          url
        );

      if (results.length) {
        return results.map(function (streamUrl) {
          return {
            url: streamUrl,
            headers: {
              Referer: url,
              Origin: getOrigin(url),
              "User-Agent": USER_AGENT
            },
            title:
              "Direct stream",
            quality:
              guessQuality(streamUrl),
            providerHost:
              getHost(streamUrl)
          };
        });
      }

      var nextUrls =
        extractIframeUrls(
          html,
          url
        );

      var promises =
        nextUrls.map(function (nextUrl) {
          if (isStreamEmbedHost(nextUrl)) {
            return resolveStreamEmbed(
              nextUrl
            );
          }

          return resolveGenericPage(
            nextUrl,
            depth + 1
          ).then(function (items) {
            return items[0] || null;
          });
        });

      return Promise.all(promises).then(
        function (resolved) {
          return resolved.filter(
            function (item) {
              return !!item;
            }
          );
        }
      );
    })
    .catch(function (e) {
      log(
        "Generic resolver failed: " +
          url +
          " :: " +
          e.message
      );

      return [];
    });
}

// -----------------------------------------------------------------------------
// DeseneFaine episode page processing
// -----------------------------------------------------------------------------

function processPage(pageUrl, streams) {
  log("Processing page: " + pageUrl);

  return fetchText(pageUrl, {
    Referer: MAIN_URL + "/"
  })
    .then(function (html) {
      var pageIframes =
        extractIframeUrls(
          html,
          pageUrl
        );

      log(
        "Found " +
          pageIframes.length +
          " player URL(s)"
      );

      var directUrls =
        extractDirectVideoUrls(
          html,
          pageUrl
        );

      directUrls.forEach(function (url) {
        streams.push({
          name: PROVIDER_NAME,
          title:
            guessQuality(url) +
            " | RO Dub",
          url: url,
          quality:
            guessQuality(url),
          headers: {
            Referer: pageUrl,
            Origin: getOrigin(pageUrl),
            "User-Agent": USER_AGENT
          },
          provider: PROVIDER_ID
        });
      });

      var resolvers =
        pageIframes.map(function (iframeUrl) {
          if (isStreamEmbedHost(iframeUrl)) {
            return resolveStreamEmbed(
              iframeUrl
            );
          }

          return resolveGenericPage(
            iframeUrl,
            0
          ).then(function (items) {
            return items[0] || null;
          });
        });

      return Promise.all(resolvers).then(
        function (resolved) {
          for (
            var i = 0;
            i < resolved.length;
            i++
          ) {
            var item = resolved[i];

            if (!item || !item.url) {
              continue;
            }

            if (
              !looksLikePlayableUrl(
                item.url
              )
            ) {
              log(
                "Rejected non-playable URL: " +
                  item.url
              );

              continue;
            }

            streams.push({
              name: PROVIDER_NAME,
              title:
                (item.title ||
                  "RO Dub") +
                " | " +
                (item.quality ||
                  guessQuality(
                    item.url
                  )),
              url: item.url,
              quality:
                item.quality ||
                guessQuality(
                  item.url
                ),
              headers:
                item.headers || {
                  Referer: pageUrl,
                  Origin:
                    getOrigin(pageUrl),
                  "User-Agent":
                    USER_AGENT
                },
              provider: PROVIDER_ID
            });
          }
        }
      );
    })
    .catch(function (e) {
      log(
        "Page processing failed: " +
          e.message
      );
    });
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

function actualGetStreams(
  id,
  type,
  season,
  episode
) {
  var streams = [];

  log(
    "Invoked id=" +
      id +
      " type=" +
      type +
      " s=" +
      season +
      " e=" +
      episode
  );

  return resolveMeta(
    id,
    type,
    season,
    episode
  )
    .then(function (meta) {
      var queries =
        buildSearchQueries(
          meta,
          type
        );

      log(
        "Queries: " +
          JSON.stringify(queries)
      );

      return searchQueries(
        queries
      );
    })
    .then(function (pageUrl) {
      if (!pageUrl) {
        log(
          "No matching DeseneFaine page found"
        );

        return [];
      }

      log(
        "Using page: " +
          pageUrl
      );

      return processPage(
        pageUrl,
        streams
      ).then(function () {
        var seen = {};

        var deduped =
          streams.filter(
            function (stream) {
              if (
                !stream ||
                !stream.url
              ) {
                return false;
              }

              if (
                seen[stream.url]
              ) {
                return false;
              }

              seen[stream.url] =
                true;

              return true;
            }
          );

        log(
          "Returning " +
            deduped.length +
            " stream(s)"
        );

        return deduped;
      });
    });
}

function searchQueries(
  queries
) {
  var index = 0;

  function next() {
    if (index >= queries.length) {
      return Promise.resolve(null);
    }

    var query =
      queries[index++];

    return searchSite(query)
      .then(function (pageUrl) {
        if (pageUrl) {
          return pageUrl;
        }

        return next();
      })
      .catch(function () {
        return next();
      });
  }

  return next();
}

function getStreams(
  id,
  type,
  season,
  episode
) {
  var timeoutId;

  var timeout =
    new Promise(function (_, reject) {
      timeoutId =
        setTimeout(
          function () {
            reject(
              new Error(
                "Scraper timeout after " +
                  SCRAPER_TIMEOUT_MS +
                  "ms"
              )
            );
          },
          SCRAPER_TIMEOUT_MS
        );
    });

  return Promise.race([
    actualGetStreams(
      id,
      type,
      season,
      episode
    ),
    timeout
  ])
    .then(function (streams) {
      return streams || [];
    })
    .catch(function (e) {
      log(
        "Fatal: " +
          e.message
      );

      return [];
    })
    .then(function (result) {
      clearTimeout(timeoutId);

      return result;
    });
}

module.exports = {
  getStreams: getStreams
};
