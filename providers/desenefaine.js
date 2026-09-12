var cheerio = require("cheerio-without-node-native");
var CryptoJS = require("crypto-js");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

// EXACT headers structure used by working Nuvio-TV plugins
var STREAM_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Connection": "keep-alive",
  "Referer": MAIN_URL + "/",
  "Origin": MAIN_URL
};

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function log(msg) {
  console.log("[" + PROVIDER_NAME + "] " + msg);
}

function fetchText(url, options) {
  options = options || {};

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
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
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {}),
    body: options.body
  }).then(function(res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.json();
  });
}

// -----------------------------------------------------------------------------
// TEXT / URL HELPERS
// -----------------------------------------------------------------------------

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ţ/g, "t")
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
    .replace(/ţ/g, "t")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function absoluteUrl(url, baseUrl) {
  if (!url) return null;

  url = String(url).trim();

  if (!url) return null;

  if (url.indexOf("//") === 0) {
    return "https:" + url;
  }

  if (
    url.indexOf("http://") === 0 ||
    url.indexOf("https://") === 0
  ) {
    return url;
  }

  baseUrl = baseUrl || MAIN_URL;

  if (url.charAt(0) === "/") {
    var originMatch = baseUrl.match(/^(https?:\/\/[^\/]+)/i);

    if (originMatch) {
      return originMatch[1] + url;
    }

    return MAIN_URL + url;
  }

  var base = baseUrl;

  if (base.charAt(base.length - 1) !== "/") {
    base += "/";
  }

  return base + url;
}

function cleanUrl(url) {
  if (!url) return null;

  return String(url)
    .trim()
    .replace(/^['"`]+/, "")
    .replace(/['"`]+$/, "")
    .replace(/&amp;/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'");
}

function isDirectVideoUrl(url) {
  if (!url) return false;

  var lower = String(url).toLowerCase();

  return (
    lower.indexOf(".m3u8") !== -1 ||
    lower.indexOf(".mp4") !== -1 ||
    lower.indexOf(".mkv") !== -1
  );
}

function guessQuality(url) {
  var lower = String(url || "").toLowerCase();

  if (
    lower.indexOf("2160") !== -1 ||
    lower.indexOf("4k") !== -1
  ) {
    return "2160p";
  }

  if (lower.indexOf("1440") !== -1) {
    return "1440p";
  }

  if (lower.indexOf("1080") !== -1) {
    return "1080p";
  }

  if (lower.indexOf("720") !== -1) {
    return "720p";
  }

  if (lower.indexOf("576") !== -1) {
    return "576p";
  }

  if (lower.indexOf("480") !== -1) {
    return "480p";
  }

  return "auto";
}

function uniqueArray(values) {
  var result = [];

  values.forEach(function(value) {
    if (!value) return;

    if (result.indexOf(value) === -1) {
      result.push(value);
    }
  });

  return result;
}

// -----------------------------------------------------------------------------
// TMDB
// -----------------------------------------------------------------------------

function getStreams(id, type, season, episode) {
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

  var isImdb = String(id).startsWith("tt");

  // FIX:
  // The previous code created:
  // ?external_source=imdb_id?api_key=...
  //
  // which is malformed.
  //
  // We now build the TMDB URL correctly.
  var tmdbUrl;

  if (isImdb) {
    tmdbUrl =
      "https://api.themoviedb.org/3/find/" +
      encodeURIComponent(id) +
      "?api_key=" +
      TMDB_API_KEY +
      "&external_source=imdb_id" +
      "&language=ro-RO";
  } else {
    var mediaEndpoint =
      type === "tv"
        ? "tv/"
        : "movie/";

    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      mediaEndpoint +
      encodeURIComponent(id) +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";
  }

  log("TMDB request: " + tmdbUrl);

  return fetchJson(tmdbUrl)
    .then(function(data) {
      var roTitle = "";
      var enTitle = "";
      var year = "";

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

          if (results[0].first_air_date) {
            year = results[0].first_air_date.substring(0, 4);
          }

          if (results[0].release_date) {
            year = results[0].release_date.substring(0, 4);
          }
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

        if (data.first_air_date) {
          year =
            data.first_air_date.substring(0, 4);
        }

        if (data.release_date) {
          year =
            data.release_date.substring(0, 4);
        }
      }

      if (!roTitle && !enTitle) {
        log("TMDB returned no title.");
        return [];
      }

      log(
        "TMDB title: " +
          roTitle +
          " | Original: " +
          enTitle +
          " | Year: " +
          year
      );

      // -----------------------------------------------------------------------
      // DIRECT DESENEFAINE URL
      // -----------------------------------------------------------------------

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
          prefixes.map(function(prefix) {
            var url =
              MAIN_URL +
              "/" +
              prefix +
              "/" +
              slug +
              "/";

            return fetchText(url)
              .then(function(html) {
                if (
                  html &&
                  html.length > 2000 &&
                  html.indexOf(
                    "does not exist"
                  ) === -1 &&
                  html.indexOf(
                    "Nu am găsit"
                  ) === -1
                ) {
                  return {
                    url: url,
                    html: html
                  };
                }

                return null;
              })
              .catch(function() {
                return null;
              });
          });

        return Promise.all(promises)
          .then(function(results) {
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

      // -----------------------------------------------------------------------
      // SEARCH
      // -----------------------------------------------------------------------

      function searchSite(query) {
        var searchUrl =
          MAIN_URL +
          "/?s=" +
          encodeURIComponent(query);

        log(
          "Searching DeseneFaine: " +
            query
        );

        return fetchText(searchUrl)
          .then(function(html) {
            var $ =
              cheerio.load(html);

            var bestMatch = null;

            var normQuery =
              normalizeTitle(query);

            var queryWords =
              normQuery
                .split(" ")
                .filter(function(w) {
                  return w.length > 2;
                });

            $("a").each(function(_, el) {
              var href =
                $(el).attr("href");

              if (!href) return;

              if (
                href.indexOf(
                  "desenefaine.com"
                ) === -1
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

              if (text.length < 5) {
                return;
              }

              var normText =
                normalizeTitle(text);

              var matchCount = 0;

              queryWords.forEach(
                function(word) {
                  if (
                    normText.indexOf(
                      word
                    ) !== -1
                  ) {
                    matchCount++;
                  }
                }
              );

              if (
                matchCount >=
                Math.ceil(
                  queryWords.length / 2
                )
              ) {
                if (
                  !bestMatch ||
                  text.length <
                    bestMatch.text.length
                ) {
                  bestMatch = {
                    href: href,
                    text: text,
                    score: matchCount
                  };
                }
              }
            });

            if (bestMatch) {
              log(
                "Search match: " +
                  bestMatch.href
              );

              return fetchText(
                bestMatch.href
              ).then(function(html) {
                return {
                  url: bestMatch.href,
                  html: html
                };
              });
            }

            return null;
          })
          .catch(function(e) {
            log(
              "Search failed: " +
                e.message
            );

            return null;
          });
      }

      // -----------------------------------------------------------------------
      // FIND THE PAGE
      // -----------------------------------------------------------------------

      return tryDirectUrl(roTitle)
        .then(function(result) {
          if (result) {
            return result;
          }

          if (
            enTitle &&
            enTitle !== roTitle
          ) {
            return tryDirectUrl(enTitle)
              .then(function(enResult) {
                if (enResult) {
                  return enResult;
                }

                return searchSite(
                  roTitle
                ).then(function(
                  searchResult
                ) {
                  if (searchResult) {
                    return searchResult;
                  }

                  return searchSite(
                    enTitle
                  );
                });
              });
          }

          return searchSite(
            roTitle
          );
        });
    })
    .then(function(result) {
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

      var $ =
        cheerio.load(result.html);

      var streams = [];

      var serverCount = 1;

      var currentHeaders =
        Object.assign(
          {},
          STREAM_HEADERS,
          {
            "Referer":
              result.url,
            "Origin":
              MAIN_URL
          }
        );

      // -----------------------------------------------------------------------
      // 1. DIRECT MP4 / M3U8
      // -----------------------------------------------------------------------

      $("source, video").each(
        function(_, el) {
          var src =
            $(el).attr("src");

          if (
            !src &&
            $(el).attr("data-src")
          ) {
            src =
              $(el).attr(
                "data-src"
              );
          }

          if (
            !src ||
            !isDirectVideoUrl(src)
          ) {
            return;
          }

          src = cleanUrl(src);

          src =
            absoluteUrl(
              src,
              result.url
            );

          log(
            "FOUND DIRECT VIDEO: " +
              src
          );

          streams.push({
            name:
              PROVIDER_NAME +
              " | Direct",
            title:
              guessQuality(src) +
              " | RO Dub",
            url: src,
            quality:
              guessQuality(src),
            headers:
              currentHeaders,
            provider:
              "desenefaine"
          });
        }
      );

      // -----------------------------------------------------------------------
      // 2. ALL IFRAMES
      // -----------------------------------------------------------------------
      //
      // This is the important part.
      //
      // Your current version pushes the iframe URL directly into Nuvio.
      // That is what causes the loading loop.
      //
      // We instead:
      //
      //   iframe
      //      ↓
      //   resolveIframe()
      //      ↓
      //   m3u8/mp4
      //
      // -----------------------------------------------------------------------

      var iframeUrls = [];

      $("iframe").each(
        function(_, el) {
          var src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr(
              "data-lazy-src"
            ) ||
            $(el).attr(
              "data-url"
            ) ||
            $(el).attr(
              "data-embed"
            ) ||
            $(el).attr(
              "data-player"
            );

          if (!src) return;

          src = cleanUrl(src);

          src =
            absoluteUrl(
              src,
              result.url
            );

          if (!src) return;

          if (
            src.indexOf(
              "facebook.com"
            ) !== -1 ||
            src.indexOf(
              "youtube.com"
            ) !== -1 ||
            src.indexOf(
              "doubleclick"
            ) !== -1
          ) {
            return;
          }

          if (
            iframeUrls.indexOf(src) ===
            -1
          ) {
            iframeUrls.push(src);
          }
        }
      );

      // -----------------------------------------------------------------------
      // 3. ALSO LOOK FOR PLAYER URLS IN ATTRIBUTES
      // -----------------------------------------------------------------------
      //
      // DeseneFaine can have server-selection code where the actual
      // player URL isn't necessarily the iframe's initial src.
      //
      // Look through common data attributes.
      // -----------------------------------------------------------------------

      var attributeSelectors = [
        "[data-src]",
        "[data-url]",
        "[data-embed]",
        "[data-player]",
        "[data-video]",
        "[data-link]",
        "[data-href]"
      ];

      attributeSelectors.forEach(
        function(selector) {
          $(selector).each(
            function(_, el) {
              var attributes = [
                "data-src",
                "data-url",
                "data-embed",
                "data-player",
                "data-video",
                "data-link",
                "data-href"
              ];

              for (
                var i = 0;
                i < attributes.length;
                i++
              ) {
                var value =
                  $(el).attr(
                    attributes[i]
                  );

                if (!value) continue;

                value =
                  cleanUrl(value);

                if (
                  value.indexOf(
                    "http"
                  ) !== 0 &&
                  value.indexOf(
                    "//"
                  ) !== 0
                ) {
                  continue;
                }

                value =
                  absoluteUrl(
                    value,
                    result.url
                  );

                if (
                  value &&
                  iframeUrls.indexOf(
                    value
                  ) === -1
                ) {
                  iframeUrls.push(
                    value
                  );
                }
              }
            }
          );
        }
      );

      log(
        "Found " +
          iframeUrls.length +
          " iframe/player URLs."
      );

      // -----------------------------------------------------------------------
      // RESOLVE EACH PLAYER
      // -----------------------------------------------------------------------

      function resolveIframe(
        iframeUrl
      ) {
        log(
          "Resolving player: " +
            iframeUrl
        );

        // ---------------------------------------------------------------------
        // STREAM EMBED HOSTS
        // ---------------------------------------------------------------------

        var isStreamEmbed =
          iframeUrl.indexOf(
            "player4me.com"
          ) !== -1 ||
          iframeUrl.indexOf(
            "streamp2p.com"
          ) !== -1 ||
          iframeUrl.indexOf(
            "seekstreaming.com"
          ) !== -1;

        if (isStreamEmbed) {
          return resolveStreamEmbed(
            iframeUrl
          ).then(function(videoUrl) {
            if (videoUrl) {
              return {
                url: videoUrl,
                referer: iframeUrl
              };
            }

            // If API resolution fails, try loading
            // the actual player HTML.
            return resolveGenericIframe(
              iframeUrl
            );
          });
        }

        return resolveGenericIframe(
          iframeUrl
        );
      }

      // -----------------------------------------------------------------------
      // GENERIC IFRAME RESOLVER
      // -----------------------------------------------------------------------

      function resolveGenericIframe(
        iframeUrl
      ) {
        return fetchText(
          iframeUrl,
          {
            headers: {
              "User-Agent":
                STREAM_HEADERS[
                  "User-Agent"
                ],
              "Accept": "*/*",
              "Referer":
                result.url,
              "Origin":
                MAIN_URL
            }
          }
        )
          .then(function(html) {
            // Direct <source>.
            var $$ =
              cheerio.load(html);

            var foundUrl = null;

            $$(
              "source, video"
            ).each(function(_, el) {
              if (foundUrl) return;

              var src =
                $$(el).attr(
                  "src"
                ) ||
                $$(el).attr(
                  "data-src"
                );

              if (
                src &&
                isDirectVideoUrl(
                  src
                )
              ) {
                foundUrl =
                  absoluteUrl(
                    cleanUrl(src),
                    iframeUrl
                  );
              }
            });

            if (foundUrl) {
              return {
                url: foundUrl,
                referer: iframeUrl
              };
            }

            // Search raw HTML for .m3u8.
            var m3u8 =
              html.match(
                /https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*/i
              );

            if (
              m3u8 &&
              m3u8[0]
            ) {
              return {
                url:
                  cleanUrl(
                    m3u8[0]
                  ),
                referer:
                  iframeUrl
              };
            }

            // Search raw HTML for .mp4.
            var mp4 =
              html.match(
                /https?:\/\/[^"'<>\\\s]+\.mp4[^"'<>\\\s]*/i
              );

            if (
              mp4 &&
              mp4[0]
            ) {
              return {
                url:
                  cleanUrl(
                    mp4[0]
                  ),
                referer:
                  iframeUrl
              };
            }

            // Sometimes another embed is nested.
            var nested = [];

            $$("iframe").each(
              function(_, el) {
                var src =
                  $$(el).attr(
                    "src"
                  ) ||
                  $$(el).attr(
                    "data-src"
                  );

                if (!src) {
                  return;
                }

                src =
                  absoluteUrl(
                    cleanUrl(src),
                    iframeUrl
                  );

                if (
                  src &&
                  nested.indexOf(
                    src
                  ) === -1
                ) {
                  nested.push(src);
                }
              }
            );

            if (
              nested.length === 0
            ) {
              return null;
            }

            var nestedChain =
              Promise.resolve(
                null
              );

            nested.forEach(
              function(nestedUrl) {
                nestedChain =
                  nestedChain.then(
                    function(previous) {
                      if (
                        previous
                      ) {
                        return previous;
                      }

                      return resolveIframe(
                        nestedUrl
                      );
                    }
                  );
              }
            );

            return nestedChain;
          })
          .catch(function(e) {
            log(
              "Generic iframe error: " +
                e.message
            );

            return null;
          });
      }

      // -----------------------------------------------------------------------
      // STREAMEMBED RESOLVER
      // -----------------------------------------------------------------------
      //
      // Player4me / StreamP2P / SeekStreaming use the same StreamEmbed-style
      // API.
      //
      // The API endpoint is:
      //
      //   /api/v1/video?id=FILECODE&w=2048&h=1152&r=
      //
      // The response is AES-128-CBC encrypted hex.
      //
      // -----------------------------------------------------------------------

      function resolveStreamEmbed(
        iframeUrl
      ) {
        var hostMatch =
          iframeUrl.match(
            /^https?:\/\/([^\/]+)/i
          );

        if (
          !hostMatch ||
          !hostMatch[1]
        ) {
          return Promise.resolve(
            null
          );
        }

        var host =
          hostMatch[1];

        // ---------------------------------------------------------------
        // Extract file code.
        // ---------------------------------------------------------------

        var filecode = null;

        var queryMatch =
          iframeUrl.match(
            /[?&](?:id|file|code|filecode)=([^&#]+)/i
          );

        if (
          queryMatch &&
          queryMatch[1]
        ) {
          filecode =
            decodeURIComponent(
              queryMatch[1]
            );
        }

        if (!filecode) {
          var pathMatch =
            iframeUrl.match(
              /\/(?:e|embed|video|v|play|watch)\/([^\/?#]+)/i
            );

          if (
            pathMatch &&
            pathMatch[1]
          ) {
            filecode =
              decodeURIComponent(
                pathMatch[1]
              );
          }
        }

        // Some hosts use the final path component.
        if (!filecode) {
          var genericPath =
            iframeUrl.match(
              /\/([^\/?#]+)\/?(?:\?.*)?$/i
            );

          if (
            genericPath &&
            genericPath[1]
          ) {
            var candidate =
              decodeURIComponent(
                genericPath[1]
              );

            if (
              candidate.length >= 3 &&
              candidate.indexOf(
                ".html"
              ) === -1 &&
              candidate.indexOf(
                ".php"
              ) === -1
            ) {
              filecode =
                candidate;
            }
          }
        }

        if (!filecode) {
          log(
            "Could not extract filecode from: " +
              iframeUrl
          );

          return Promise.resolve(
            null
          );
        }

        log(
          "StreamEmbed filecode: " +
            filecode
        );

        var apiUrl =
          "https://" +
          host +
          "/api/v1/video?id=" +
          encodeURIComponent(
            filecode
          ) +
          "&w=2048&h=1152&r=";

        log(
          "StreamEmbed API: " +
            apiUrl
        );

        return fetchText(
          apiUrl,
          {
            headers: {
              "User-Agent":
                STREAM_HEADERS[
                  "User-Agent"
                ],
              "Accept": "*/*",
              "Referer":
                iframeUrl,
              "Origin":
                "https://" +
                host
            }
          }
        )
          .then(function(body) {
            // -----------------------------------------------------------
            // Sometimes the endpoint may already return a usable URL.
            // -----------------------------------------------------------

            var plainUrl =
              extractVideoUrl(
                body
              );

            if (plainUrl) {
              log(
                "StreamEmbed returned direct URL: " +
                  plainUrl
              );

              return plainUrl;
            }

            // -----------------------------------------------------------
            // Otherwise decrypt AES response.
            // -----------------------------------------------------------

            var decrypted;

            try {
              var key =
                CryptoJS.enc.Hex.parse(
                  "6b69656d7469656e6d75613931316361"
                );

              var iv =
                CryptoJS.enc.Hex.parse(
                  "313233343536373839306f6975797472"
                );

              var encrypted =
                CryptoJS.enc.Hex.parse(
                  String(
                    body
                  ).trim()
                );

              var decryptedBytes =
                CryptoJS.AES.decrypt(
                  {
                    ciphertext:
                      encrypted
                  },
                  key,
                  {
                    iv: iv,
                    mode:
                      CryptoJS.mode.CBC,
                    padding:
                      CryptoJS.pad.Pkcs7
                  }
                );

              decrypted =
                decryptedBytes.toString(
                  CryptoJS.enc.Utf8
                );
            } catch (e) {
              log(
                "AES decrypt error: " +
                  e.message
              );

              return null;
            }

            if (!decrypted) {
              log(
                "StreamEmbed decrypted response is empty."
              );

              return null;
            }

            log(
              "StreamEmbed decrypted successfully."
            );

            // -----------------------------------------------------------
            // Extract stream URL from decrypted response.
            // -----------------------------------------------------------

            var resolved =
              extractVideoUrl(
                decrypted
              );

            if (resolved) {
              log(
                "RESOLVED STREAM: " +
                  resolved
              );

              return resolved;
            }

            // JSON payload.
            try {
              var json =
                JSON.parse(
                  decrypted
                );

              var candidates = [
                json.source,
                json.master,
                json.masterUrl,
                json.master_url,
                json.url,
                json.file,
                json.playlist
              ];

              for (
                var i = 0;
                i <
                candidates.length;
                i++
              ) {
                if (
                  candidates[i] &&
                  typeof candidates[
                    i
                  ] === "string" &&
                  candidates[
                    i
                  ].indexOf(
                    "http"
                  ) === 0
                ) {
                  log(
                    "RESOLVED JSON STREAM: " +
                      candidates[i]
                  );

                  return candidates[i];
                }
              }

              if (
                json.data
              ) {
                var nestedJson =
                  json.data;

                var nestedCandidates = [
                  nestedJson.source,
                  nestedJson.master,
                  nestedJson.masterUrl,
                  nestedJson.master_url,
                  nestedJson.url,
                  nestedJson.file,
                  nestedJson.playlist
                ];

                for (
                  var j = 0;
                  j <
                  nestedCandidates.length;
                  j++
                ) {
                  if (
                    nestedCandidates[
                      j
                    ] &&
                    typeof nestedCandidates[
                      j
                    ] ===
                      "string" &&
                    nestedCandidates[
                      j
                    ].indexOf(
                      "http"
                    ) === 0
                  ) {
                    log(
                      "RESOLVED NESTED STREAM: " +
                        nestedCandidates[
                          j
                        ]
                    );

                    return nestedCandidates[
                      j
                    ];
                  }
                }
              }
            } catch (_) {
              // Not JSON; continue.
            }

            log(
              "Could not extract media URL from StreamEmbed response."
            );

            return null;
          })
          .catch(function(e) {
            log(
              "StreamEmbed API error: " +
                e.message
            );

            return null;
          });
      }

      // -----------------------------------------------------------------------
      // Extract a video URL from arbitrary text.
      // -----------------------------------------------------------------------

      function extractVideoUrl(
        text
      ) {
        if (!text) {
          return null;
        }

        var value =
          String(text)
            .replace(
              /\\\//g,
              "/"
            )
            .replace(
              /\\u0026/gi,
              "&"
            )
            .replace(
              /\\u002F/gi,
              "/"
            );

        // Direct URL.
        if (
          value.indexOf(
            "http://"
          ) === 0 ||
          value.indexOf(
            "https://"
          ) === 0
        ) {
          if (
            isDirectVideoUrl(
              value
            )
          ) {
            return value;
          }
        }

        // m3u8 anywhere in payload.
        var m3u8 =
          value.match(
            /https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*/i
          );

        if (
          m3u8 &&
          m3u8[0]
        ) {
          return cleanUrl(
            m3u8[0]
          );
        }

        // mp4 anywhere in payload.
        var mp4 =
          value.match(
            /https?:\/\/[^"'<>\\\s]+\.mp4[^"'<>\\\s]*/i
          );

        if (
          mp4 &&
          mp4[0]
        ) {
          return cleanUrl(
            mp4[0]
          );
        }

        // source/master/masterUrl style JSON.
        var source =
          value.match(
            /["']?(?:source|master|masterUrl|master_url|url|file|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i
          );

        if (
          source &&
          source[1]
        ) {
          return cleanUrl(
            source[1]
          );
        }

        return null;
      }

      // -----------------------------------------------------------------------
      // Resolve all iframe URLs sequentially.
      // -----------------------------------------------------------------------

      var resolveChain =
        Promise.resolve();

      iframeUrls.forEach(
        function(iframeUrl) {
          resolveChain =
            resolveChain.then(
              function() {
                return resolveIframe(
                  iframeUrl
                ).then(
                  function(resolved) {
                    if (
                      !resolved ||
                      !resolved.url
                    ) {
                      log(
                        "Could not resolve: " +
                          iframeUrl
                      );

                      return;
                    }

                    var finalUrl =
                      resolved.url;

                    // VERY IMPORTANT:
                    // Never send the player iframe itself to Nuvio.
                    //
                    // Only accept actual media URLs here.
                    if (
                      !isDirectVideoUrl(
                        finalUrl
                      )
                    ) {
                      log(
                        "Resolved URL is not a direct media URL, skipping: " +
                          finalUrl
                      );

                      return;
                    }

                    var streamHeaders =
                      Object.assign(
                        {},
                        STREAM_HEADERS,
                        {
                          "Referer":
                            resolved.referer ||
                            iframeUrl,
                          "Origin":
                            MAIN_URL
                        }
                      );

                    var quality =
                      guessQuality(
                        finalUrl
                      );

                    log(
                      "FINAL STREAM: " +
                        finalUrl
                    );

                    streams.push({
                      name:
                        PROVIDER_NAME +
                        " | Server " +
                        serverCount++,

                      title:
                        quality +
                        " | RO Dub",

                      url:
                        finalUrl,

                      quality:
                        quality,

                      headers:
                        streamHeaders,

                      provider:
                        "desenefaine"
                    });
                  }
                );
              }
            );
        }
      );

      return resolveChain.then(
        function() {
          // -------------------------------------------------------------------
          // Remove duplicate URLs.
          // -------------------------------------------------------------------

          var uniqueStreams =
            [];

          streams.forEach(
            function(stream) {
              var exists =
                uniqueStreams.some(
                  function(existing) {
                    return (
                      existing.url ===
                      stream.url
                    );
                  }
                );

              if (!exists) {
                uniqueStreams.push(
                  stream
                );
              }
            }
          );

          log(
            "Extracted " +
              uniqueStreams.length +
              " PLAYABLE streams."
          );

          return uniqueStreams;
        }
      );
    })
    .catch(function(e) {
      log(
        "Fatal Error: " +
          e.message
      );

      return [];
    });
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams:
      getStreams
  };
} else {
  global.getStreams =
    getStreams;
}
