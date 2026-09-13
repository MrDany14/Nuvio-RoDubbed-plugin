var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var PROVIDER_ID = "desenefaine";
var MAIN_URL = "https://desenefaine.com";

var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

var STREAM_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "*/*",
  "Connection": "keep-alive",
  "Referer": MAIN_URL + "/",
  "Origin": MAIN_URL
};

var FETCH_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

var SCRAPER_TIMEOUT_MS = 30000;

/* ============================================================================
   LOGGING
============================================================================ */

function log(msg) {
  try {
    console.log("[" + PROVIDER_NAME + "] " + msg);
  } catch (_) {}
}

/* ============================================================================
   HTTP
============================================================================ */

function fetchText(url, options) {
  options = options || {};

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: Object.assign(
      {},
      FETCH_HEADERS,
      options.headers || {}
    ),
    body: options.body
  }).then(function (res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: Object.assign(
      {},
      FETCH_HEADERS,
      options.headers || {}
    ),
    body: options.body
  }).then(function (res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.json();
  });
}

/* ============================================================================
   NORMALIZATION
============================================================================ */

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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

/* ============================================================================
   URL HELPERS
============================================================================ */

function getHost(url) {
  if (!url) return null;

  var m = String(url).match(/^https?:\/\/([^/?#]+)/i);

  return m ? m[1] : null;
}

function getOrigin(url) {
  var host = getHost(url);

  if (!host) return null;

  return "https://" + host;
}

function absoluteUrl(url, baseUrl) {
  if (!url) return null;

  url = String(url).trim();

  if (url.indexOf("\\/") === 0) {
    url = url.replace(/\\\//g, "/");
  }

  if (url.indexOf("//") === 0) {
    return "https:" + url;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.charAt(0) === "/") {
    var origin = getOrigin(baseUrl || MAIN_URL);

    return origin + url;
  }

  if (baseUrl) {
    var baseOrigin = getOrigin(baseUrl);

    if (baseOrigin) {
      return baseOrigin + "/" + url.replace(/^\/+/, "");
    }
  }

  return MAIN_URL + "/" + url.replace(/^\/+/, "");
}

/* ============================================================================
   DIRECT VIDEO EXTRACTION
============================================================================ */

function normalizeExtractedUrl(url) {
  if (!url) return null;

  return String(url)
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&amp;/gi, "&")
    .trim();
}

function extractDirectVideoUrl(text) {
  if (!text) return null;

  var html = String(text);

  var patterns = [
    /*
     * <source src="...m3u8">
     */
    /<source[^>]+src=["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/i,

    /*
     * file: "..."
     */
    /["']?file["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/i,

    /*
     * sources: [{file:"..."}]
     */
    /(?:sources|source)\s*:\s*\[\s*\{[^}]*?["']?(?:file|src)["']?\s*:\s*["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/i,

    /*
     * playlist: "..."
     */
    /["']?playlist["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/i,

    /*
     * url: "..."
     */
    /["']?(?:url|video|source|hls|masterUrl|master_url)["']?\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)(?:[?#][^"']*)?)["']/i,

    /*
     * Absolute m3u8
     */
    /(https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*)/i,

    /*
     * Absolute mp4
     */
    /(https?:\/\/[^"'<>\\\s]+\.mp4[^"'<>\\\s]*)/i
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = html.match(patterns[i]);

    if (match && match[1]) {
      return normalizeExtractedUrl(match[1]);
    }
  }

  /*
   * OK.ru-style payloads
   */
  var okPatterns = [
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /"hls"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"([^"]+\.(?:m3u8|mp4)[^"]*)"/i
  ];

  for (var j = 0; j < okPatterns.length; j++) {
    var okMatch = html.match(okPatterns[j]);

    if (okMatch && okMatch[1]) {
      return normalizeExtractedUrl(okMatch[1]);
    }
  }

  return null;
}

/* ============================================================================
   PLAYER4ME / STREAM EMBED
============================================================================ */

function isStreamEmbedHost(url) {
  if (!url) return false;

  var host = getHost(url);

  if (!host) return false;

  host = host.toLowerCase();

  return (
    host.indexOf("player4me") !== -1 ||
    host.indexOf("streamp2p") !== -1 ||
    host.indexOf("seekstreaming") !== -1 ||
    host.indexOf("streamembed") !== -1 ||
    host.indexOf("streamflow") !== -1
  );
}

function extractFilecode(url) {
  if (!url) return null;

  var value = String(url);

  /*
   * Query-string formats:
   *
   * ?id=CODE
   * ?file=CODE
   * ?code=CODE
   * ?filecode=CODE
   */
  var queryPatterns = [
    /[?&](?:id|file|code|filecode)=([^&#]+)/i
  ];

  for (var i = 0; i < queryPatterns.length; i++) {
    var qm = value.match(queryPatterns[i]);

    if (qm && qm[1]) {
      try {
        return decodeURIComponent(qm[1]);
      } catch (_) {
        return qm[1];
      }
    }
  }

  /*
   * Common embed paths:
   *
   * /e/CODE
   * /embed/CODE
   * /video/CODE
   * /v/CODE
   * /play/CODE
   * /watch/CODE
   */
  var pathPatterns = [
    /\/(?:e|embed|video|v|play|watch)\/([^/?#]+)/i,
    /\/([^/?#]+)\/?(?:\?.*)?$/i
  ];

  for (var j = 0; j < pathPatterns.length; j++) {
    var pm = value.match(pathPatterns[j]);

    if (pm && pm[1]) {
      var candidate = pm[1];

      try {
        candidate = decodeURIComponent(candidate);
      } catch (_) {}

      if (
        candidate.length >= 3 &&
        candidate.indexOf(".html") === -1 &&
        candidate.indexOf(".php") === -1
      ) {
        return candidate;
      }
    }
  }

  return null;
}

function getStreamEmbedApiUrl(host, filecode) {
  if (!host || !filecode) return null;

  return (
    "https://" +
    host +
    "/api/v1/video?id=" +
    encodeURIComponent(filecode) +
    "&w=2048&h=1152&r="
  );
}

/* ============================================================================
   AES DECRYPTION
============================================================================ */

function decryptStreamEmbedResponse(text) {
  try {
    /*
     * Require crypto-js here rather than at plugin startup.
     * This avoids killing the entire provider if the runtime does not expose
     * crypto-js correctly.
     */
    var CryptoJS = require("crypto-js");

    /*
     * These are the AES constants used by the StreamEmbed/Player4Me
     * implementation contained in the original working resolver.
     */
    var keyHex =
      "6b69656d7469656e6d75613931316361";

    var ivHex =
      "313233343536373839306f6975797472";

    var key = CryptoJS.enc.Hex.parse(keyHex);
    var iv = CryptoJS.enc.Hex.parse(ivHex);

    var encrypted = CryptoJS.enc.Hex.parse(
      String(text).trim()
    );

    var decrypted = CryptoJS.AES.decrypt(
      {
        ciphertext: encrypted
      },
      key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    var result = decrypted.toString(
      CryptoJS.enc.Utf8
    );

    return result || null;

  } catch (e) {
    log(
      "AES decrypt failed: " +
      (e && e.message ? e.message : e)
    );

    return null;
  }
}

/* ============================================================================
   DECRYPTED PAYLOAD PARSER
============================================================================ */

function extractMasterUrlFromPayload(payload) {
  if (!payload) return null;

  var text = String(payload).trim();

  /*
   * Sometimes the decrypted result is JSON.
   */
  try {
    var obj = JSON.parse(text);

    if (obj) {
      var candidates = [
        obj.source,
        obj.master,
        obj.masterUrl,
        obj.master_url,
        obj.url,
        obj.file,
        obj.playlist
      ];

      for (var i = 0; i < candidates.length; i++) {
        var value = candidates[i];

        if (
          value &&
          typeof value === "string" &&
          /^https?:\/\//i.test(value)
        ) {
          return normalizeExtractedUrl(value);
        }
      }

      /*
       * Nested data object
       */
      if (obj.data) {
        var nested = extractMasterUrlFromPayload(
          JSON.stringify(obj.data)
        );

        if (nested) return nested;
      }
    }

  } catch (_) {
    /*
     * Not JSON. Continue with regex extraction.
     */
  }

  /*
   * Non-standard JSON / JS object
   */
  var patterns = [
    /["']?(?:source|masterUrl|master_url|master|url|file|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /(https?:\/\/[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*)/i,
    /(https?:\/\/[^"'\\\s<>]+\.mp4[^"'\\\s<>]*)/i
  ];

  for (var j = 0; j < patterns.length; j++) {
    var match = text.match(patterns[j]);

    if (match && match[1]) {
      return normalizeExtractedUrl(match[1]);
    }
  }

  /*
   * Sometimes the decrypted response itself is simply the URL.
   */
  if (/^https?:\/\//i.test(text)) {
    return normalizeExtractedUrl(text);
  }

  return null;
}

/* ============================================================================
   PLAYER4ME API RESOLVER
============================================================================ */

function resolveStreamEmbed(embedUrl) {
  if (!isStreamEmbedHost(embedUrl)) {
    return Promise.resolve(null);
  }

  var filecode = extractFilecode(embedUrl);

  if (!filecode) {
    log("No filecode extracted from: " + embedUrl);
    return Promise.resolve(null);
  }

  var host = getHost(embedUrl);

  var apiUrl = getStreamEmbedApiUrl(
    host,
    filecode
  );

  if (!apiUrl) {
    return Promise.resolve(null);
  }

  log(
    "StreamEmbed host=" +
    host +
    " filecode=" +
    filecode
  );

  log("Fetching StreamEmbed API");

  return fetchText(apiUrl, {
    headers: {
      "Referer": embedUrl,
      "Origin": "https://" + host,
      "User-Agent": USER_AGENT,
      "Accept": "*/*"
    }
  })
    .then(function (body) {

      /*
       * First try an unencrypted response.
       */
      var direct =
        extractMasterUrlFromPayload(body);

      if (direct) {
        log(
          "StreamEmbed direct -> " +
          direct
        );

        return direct;
      }

      /*
       * Then try AES encrypted response.
       */
      var decrypted =
        decryptStreamEmbedResponse(body);

      if (!decrypted) {
        log(
          "StreamEmbed response could not be decrypted."
        );

        return null;
      }

      log("StreamEmbed response decrypted.");

      direct =
        extractMasterUrlFromPayload(
          decrypted
        );

      if (direct) {
        log(
          "StreamEmbed decrypted -> " +
          direct
        );

        return direct;
      }

      log(
        "Decrypted payload contained no video URL."
      );

      return null;

    })
    .catch(function (e) {
      log(
        "StreamEmbed API failed: " +
        (e && e.message ? e.message : e)
      );

      return null;
    });
}

/* ============================================================================
   GENERIC IFRAME RESOLVER
============================================================================ */

function resolveIframe(iframeUrl, referer) {

  log(
    "Resolving iframe: " +
    iframeUrl
  );

  /*
   * First attempt: if it is a known StreamEmbed/Player4Me host,
   * use its API resolver.
   */
  if (isStreamEmbedHost(iframeUrl)) {

    return resolveStreamEmbed(
      iframeUrl
    ).then(function (direct) {

      if (direct) {
        return direct;
      }

      /*
       * If the API route failed, still fetch the iframe itself.
       */
      return fetchText(
        iframeUrl,
        {
          headers: {
            "Referer": referer || MAIN_URL
          }
        }
      ).then(function (html) {

        var directFromHtml =
          extractDirectVideoUrl(html);

        if (directFromHtml) {
          return absoluteUrl(
            directFromHtml,
            iframeUrl
          );
        }

        return null;

      }).catch(function () {
        return null;
      });

    });
  }

  /*
   * Generic iframe.
   */
  return fetchText(
    iframeUrl,
    {
      headers: {
        "Referer": referer || MAIN_URL
      }
    }
  )
    .then(function (html) {

      var direct =
        extractDirectVideoUrl(html);

      if (direct) {
        var finalUrl =
          absoluteUrl(
            direct,
            iframeUrl
          );

        log(
          "Generic iframe resolved -> " +
          finalUrl
        );

        return finalUrl;
      }

      /*
       * Sometimes the iframe contains another iframe.
       */
      var $ = cheerio.load(html);

      var nestedIframe = null;

      $("iframe").each(function (_, el) {
        if (nestedIframe) return;

        var src =
          $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-lazy-src");

        if (src) {
          nestedIframe =
            absoluteUrl(
              src,
              iframeUrl
            );
        }
      });

      if (nestedIframe) {
        return resolveIframe(
          nestedIframe,
          iframeUrl
        );
      }

      return null;

    })
    .catch(function (e) {

      log(
        "Generic iframe failed: " +
        (e && e.message ? e.message : e)
      );

      return null;
    });
}

/* ============================================================================
   QUALITY
============================================================================ */

function guessQuality(url) {
  if (!url) return "1080p";

  var text = String(url);

  if (/2160|4k/i.test(text)) return "2160p";
  if (/1440/i.test(text)) return "1440p";
  if (/1080/i.test(text)) return "1080p";
  if (/720/i.test(text)) return "720p";
  if (/480/i.test(text)) return "480p";
  if (/360/i.test(text)) return "360p";

  return "1080p";
}

/* ============================================================================
   STREAM OBJECT
============================================================================ */

function makeStream(
  name,
  videoUrl,
  referer,
  origin
) {
  if (!videoUrl) return null;

  var isHls =
    /\.m3u8(?:[?#]|$)/i.test(
      videoUrl
    );

  var headers = {
    "User-Agent": USER_AGENT
  };

  if (referer) {
    headers["Referer"] = referer;
  }

  if (origin) {
    headers["Origin"] = origin;
  }

  return {
    name: name,
    title:
      guessQuality(videoUrl) +
      " | RO Dub",
    url: videoUrl,
    quality:
      guessQuality(videoUrl),

    /*
     * Keep this for compatibility with the older Nuvio provider code.
     */
    isM3U8: isHls,

    /*
     * Current Nuvio/Cloudstream bridge maps M3U8 to "hls".
     */
    type: isHls ? "hls" : "mp4",

    headers: headers,

    provider: PROVIDER_ID
  };
}

/* ============================================================================
   MAIN
============================================================================ */

function getStreams(
  id,
  type,
  season,
  episode
) {

  log(
    "Requested: ID=" +
    id +
    ", Type=" +
    type +
    ", S=" +
    season +
    ", E=" +
    episode
  );

  var isImdb =
    String(id).startsWith("tt");

  /*
   * IMPORTANT:
   * Keep the original Nuvio request contract.
   */
  var endpoint =
    isImdb
      ? "find/" +
        id +
        "?external_source=imdb_id"
      : (
          type === "tv"
            ? "tv/"
            : "movie/"
        ) + id;

  var tmdbUrl =
    "https://api.themoviedb.org/3/" +
    endpoint +
    "&api_key=" +
    TMDB_API_KEY +
    "&language=ro-RO";

  /*
   * The IMDb endpoint above already contains ?external_source...
   * Normal TMDB endpoints need ?api_key...
   *
   * Fix the separator automatically.
   */
  if (!isImdb) {
    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      endpoint +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";
  }

  return fetchJson(tmdbUrl)

    .then(function (data) {

      var roTitle = "";
      var enTitle = "";

      if (isImdb) {

        var results =
          type === "tv"
            ? data.tv_results
            : data.movie_results;

        if (
          results &&
          results.length > 0
        ) {

          roTitle =
            type === "tv"
              ? results[0].name
              : results[0].title;

          enTitle =
            type === "tv"
              ? results[0].original_name
              : results[0].original_title;
        }

      } else {

        roTitle =
          type === "tv"
            ? data.name
            : data.title;

        enTitle =
          type === "tv"
            ? data.original_name
            : data.original_title;
      }

      log(
        "TMDB titles: RO=" +
        roTitle +
        " EN=" +
        enTitle
      );

      if (!roTitle && !enTitle) {
        log(
          "TMDB returned no title."
        );

        return [];
      }

      /* ======================================================================
         DIRECT URL
      ====================================================================== */

      function tryDirectUrl(title) {

        var slug =
          normalizeSlug(title);

        if (
          type === "tv" &&
          season &&
          episode
        ) {

          slug =
            normalizeSlug(title) +
            "-sezonul-" +
            season +
            "-episodul-" +
            episode;
        }

        var prefixes =
          type === "tv"
            ? [
                "epi",
                "serial",
                "desene"
              ]
            : [
                "film",
                "desene"
              ];

        var promises =
          prefixes.map(function (
            prefix
          ) {

            var url =
              MAIN_URL +
              "/" +
              prefix +
              "/" +
              slug +
              "/";

            return fetchText(url)
              .then(function (html) {

                if (
                  html &&
                  html.length > 2000 &&
                  !html.includes(
                    "does not exist"
                  ) &&
                  !html.includes(
                    "Nu am găsit"
                  )
                ) {

                  return {
                    url: url,
                    html: html
                  };
                }

                return null;

              })
              .catch(function () {
                return null;
              });
          });

        return Promise.all(
          promises
        ).then(function (results) {

          for (
            var i = 0;
            i < results.length;
            i++
          ) {

            if (results[i]) {

              log(
                "Direct URL match: " +
                results[i].url
              );

              return results[i];
            }
          }

          return null;
        });
      }

      /* ======================================================================
         SITE SEARCH
      ====================================================================== */

      function searchSite(query) {

        var searchUrl =
          MAIN_URL +
          "/?s=" +
          encodeURIComponent(
            query
          );

        log(
          "Searching DeseneFaine: " +
          query
        );

        return fetchText(searchUrl)

          .then(function (html) {

            var $ =
              cheerio.load(html);

            var bestMatch =
              null;

            var normQuery =
              normalizeTitle(query);

            var queryWords =
              normQuery
                .split(" ")
                .filter(
                  function (w) {
                    return w.length > 2;
                  }
                );

            $("a").each(
              function (_, el) {

                var href =
                  $(el).attr("href");

                if (
                  !href ||
                  !href.includes(
                    "desenefaine.com"
                  )
                ) {
                  return;
                }

                if (
                  /\/(category|tag|author|page|feed|wp-)/i.test(
                    href
                  )
                ) {
                  return;
                }

                var text =
                  $(el)
                    .text()
                    .trim();

                if (
                  text.length < 5
                ) {
                  return;
                }

                var normText =
                  normalizeTitle(
                    text
                  );

                var matchCount = 0;

                queryWords.forEach(
                  function (word) {

                    if (
                      normText.includes(
                        word
                      )
                    ) {
                      matchCount++;
                    }
                  }
                );

                if (
                  matchCount >=
                  Math.ceil(
                    queryWords.length /
                    2
                  )
                ) {

                  if (
                    !bestMatch ||
                    text.length <
                      bestMatch.text
                        .length
                  ) {

                    bestMatch = {
                      href: href,
                      text: text,
                      score:
                        matchCount
                    };
                  }
                }
              }
            );

            if (bestMatch) {

              log(
                "Search match: " +
                bestMatch.href
              );

              return fetchText(
                bestMatch.href
              ).then(function (
                pageHtml
              ) {

                return {
                  url:
                    bestMatch.href,
                  html:
                    pageHtml
                };
              });
            }

            return null;

          })
          .catch(function () {
            return null;
          });
      }

      /* ======================================================================
         DISCOVER PAGE
      ====================================================================== */

      return tryDirectUrl(
        roTitle
      )
        .then(function (result) {

          if (result) {
            return result;
          }

          if (
            enTitle &&
            enTitle !== roTitle
          ) {

            return tryDirectUrl(
              enTitle
            ).then(function (
              enResult
            ) {

              if (enResult) {
                return enResult;
              }

              return searchSite(
                roTitle
              ).then(
                function (
                  searchResult
                ) {

                  if (
                    searchResult
                  ) {
                    return searchResult;
                  }

                  return searchSite(
                    enTitle
                  );
                }
              );
            });
          }

          return searchSite(
            roTitle
          );
        })

        /* ====================================================================
           PROCESS PAGE
        ==================================================================== */

        .then(function (result) {

          if (
            !result ||
            !result.html
          ) {

            log(
              "No valid DeseneFaine page found."
            );

            return [];
          }

          log(
            "Extracting from: " +
            result.url
          );

          var $$ =
            cheerio.load(
              result.html
            );

          var streamPromises =
            [];

          var serverCount = 1;

          /*
           * ================================================================
           * 1. DIRECT MP4 / M3U8
           * ================================================================
           */

          $$(
            "source, video"
          ).each(
            function (_, el) {

              var src =
                $$(el).attr("src");

              if (
                !src ||
                (
                  src.indexOf(
                    ".mp4"
                  ) === -1 &&
                  src.indexOf(
                    ".m3u8"
                  ) === -1
                )
              ) {
                return;
              }

              src =
                absoluteUrl(
                  src,
                  result.url
                );

              var isHls =
                /\.m3u8(?:[?#]|$)/i.test(
                  src
                );

              var stream =
                makeStream(
                  PROVIDER_NAME +
                    " | Direct",
                  src,
                  result.url,
                  MAIN_URL
                );

              if (stream) {

                streamPromises.push(
                  Promise.resolve(
                    stream
                  )
                );
              }
            }
          );

          /*
           * ================================================================
           * 2. IFRAMES
           * ================================================================
           */

          $$(
            "iframe"
          ).each(
            function (_, el) {

              var src =
                $$(el).attr(
                  "src"
                ) ||
                $$(el).attr(
                  "data-src"
                ) ||
                $$(el).attr(
                  "data-lazy-src"
                );

              if (!src) {
                return;
              }

              src =
                absoluteUrl(
                  src,
                  result.url
                );

              /*
               * Ignore irrelevant embeds.
               */
              if (
                src.includes(
                  "facebook.com"
                ) ||
                src.includes(
                  "youtube.com"
                ) ||
                src.includes(
                  "doubleclick"
                )
              ) {
                return;
              }

              log(
                "FOUND IFRAME: " +
                src
              );

              /*
               * Resolve iframe -> direct video.
               */
              var promise =
                resolveIframe(
                  src,
                  result.url
                ).then(
                  function (
                    directVideoUrl
                  ) {

                    if (
                      !directVideoUrl
                    ) {

                      log(
                        "Could not resolve iframe: " +
                        src
                      );

                      return null;
                    }

                    directVideoUrl =
                      normalizeExtractedUrl(
                        directVideoUrl
                      );

                    var iframeOrigin =
                      getOrigin(src);

                    var iframeReferer =
                      src;

                    log(
                      "DIRECT VIDEO: " +
                      directVideoUrl
                    );

                    /*
                     * IMPORTANT:
                     *
                     * The direct media URL is now what Nuvio receives.
                     * It is NOT the Player4Me HTML page.
                     */
                    var stream =
                      makeStream(
                        PROVIDER_NAME +
                          " | Server " +
                          serverCount++,
                        directVideoUrl,
                        iframeReferer,
                        iframeOrigin
                      );

                    return stream;
                  }
                );

              streamPromises.push(
                promise
              );
            }
          );

          /*
           * ================================================================
           * 3. WAIT FOR ALL RESOLVERS
           * ================================================================
           */

          return Promise.all(
            streamPromises
          ).then(
            function (
              resolvedStreams
            ) {

              var finalStreams =
                resolvedStreams.filter(
                  function (stream) {
                    return (
                      stream !== null &&
                      stream.url
                    );
                  }
                );

              /*
               * Deduplicate URLs.
               */
              var seen = {};
              var deduped = [];

              finalStreams.forEach(
                function (stream) {

                  if (
                    !seen[
                      stream.url
                    ]
                  ) {

                    seen[
                      stream.url
                    ] = true;

                    deduped.push(
                      stream
                    );
                  }
                }
              );

              log(
                "Extracted " +
                deduped.length +
                " valid stream(s)."
              );

              return deduped;
            }
          );
        });

    })

    .catch(function (e) {

      log(
        "Fatal Error: " +
        (
          e &&
          e.message
            ? e.message
            : e
        )
      );

      return [];
    });
}

/* ============================================================================
   NUVIO EXPORT
============================================================================ */

if (
  typeof module !== "undefined" &&
  module.exports
) {

  module.exports = {
    getStreams: getStreams
  };

} else {

  global.getStreams =
    getStreams;
}
