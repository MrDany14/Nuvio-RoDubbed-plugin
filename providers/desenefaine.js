var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439478a771f35c05022f9feabcca01c";

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


/* =========================================================
   FETCH
========================================================= */

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


/* =========================================================
   NORMALIZATION
========================================================= */

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


/* =========================================================
   URL HELPERS
========================================================= */

function absoluteUrl(url, baseUrl) {

  if (!url) {
    return null;
  }

  url = String(url).trim();

  if (!url) {
    return null;
  }

  if (url.indexOf("\\/") !== -1) {
    url = url.replace(/\\\//g, "/");
  }

  if (url.indexOf("&amp;") !== -1) {
    url = url.replace(/&amp;/g, "&");
  }

  if (url.indexOf("&quot;") !== -1) {
    url = url.replace(/&quot;/g, "\"");
  }

  if (url.indexOf("&#x2F;") !== -1) {
    url = url.replace(/&#x2F;/gi, "/");
  }

  if (url.indexOf("&#47;") !== -1) {
    url = url.replace(/&#47;/g, "/");
  }

  if (url.startsWith("//")) {
    return "https:" + url;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  try {
    return new URL(url, baseUrl).href;
  } catch (e) {
    if (url.startsWith("/")) {
      return MAIN_URL + url;
    }

    return MAIN_URL + "/" + url;
  }
}


/* =========================================================
   DECODE POSSIBLE JS ESCAPING
========================================================= */

function cleanText(text) {

  if (!text) {
    return "";
  }

  var value = String(text);

  value = value
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003A/gi, ":")
    .replace(/\\u003D/gi, "=")
    .replace(/\\u002E/gi, ".")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");

  return value;
}


/* =========================================================
   DETECT MEDIA URL
========================================================= */

function isMediaUrl(url) {

  if (!url) {
    return false;
  }

  var value = String(url).toLowerCase();

  return (
    value.indexOf(".m3u8") !== -1 ||
    value.indexOf(".mp4") !== -1 ||
    value.indexOf(".mkv") !== -1 ||
    value.indexOf(".webm") !== -1
  );
}


/* =========================================================
   EXTRACT MEDIA URLS FROM RAW HTML / JAVASCRIPT
========================================================= */

function extractMediaUrls(text, baseUrl) {

  var found = [];

  if (!text) {
    return found;
  }

  var source = cleanText(text);

  /*
   * Normal URLs
   */
  var regex1 = /https?:\/\/[^\s"'<>\\]+/gi;
  var match;

  while ((match = regex1.exec(source)) !== null) {

    var url = match[0];

    /*
     * Remove JS punctuation at the end.
     */
    url = url.replace(/[),;}'"\]]+$/g, "");

    if (isMediaUrl(url)) {
      found.push(url);
    }
  }


  /*
   * Specifically search for .m3u8 URLs that may contain
   * unusual characters such as commas in the path.
   */
  var regex2 = /https?:\/\/[^"'<> ]+?\.m3u8(?:\?[^"'<> ]+)?/gi;

  while ((match = regex2.exec(source)) !== null) {

    var m3u8 = match[0]
      .replace(/\\\//g, "/")
      .replace(/&amp;/g, "&")
      .replace(/[),;}'"\]]+$/g, "");

    found.push(m3u8);
  }


  /*
   * Relative .m3u8
   */
  var regex3 = /["']([^"']+\.m3u8(?:\?[^"']+)?)["']/gi;

  while ((match = regex3.exec(source)) !== null) {

    var relative = cleanText(match[1]);

    if (relative.indexOf("http") !== 0) {
      relative = absoluteUrl(relative, baseUrl);
    }

    if (relative) {
      found.push(relative);
    }
  }


  /*
   * Generic file/source/player configuration.
   *
   * Examples:
   *
   * file: "https://....m3u8"
   * source: "https://....m3u8"
   * src: "https://....m3u8"
   * url: "https://....m3u8"
   */
  var regex4 =
    /(?:file|source|src|url|stream|playlist|hls)\s*[:=]\s*["']([^"']+)["']/gi;

  while ((match = regex4.exec(source)) !== null) {

    var configUrl = cleanText(match[1]);

    if (isMediaUrl(configUrl)) {

      if (configUrl.indexOf("http") !== 0) {
        configUrl = absoluteUrl(configUrl, baseUrl);
      }

      if (configUrl) {
        found.push(configUrl);
      }
    }
  }


  /*
   * SprintCDN-specific detection.
   *
   * The M3U8 we found manually looks like:
   *
   * edge1-madrid-sprintcdn....
   * /hls2/....
   * master.m3u8
   */
  var regex5 =
    /https?:\/\/[^"'<> ]*sprintcdn[^"'<> ]*\/[^"'<> ]*\.m3u8(?:\?[^"'<> ]*)?/gi;

  while ((match = regex5.exec(source)) !== null) {

    var sprint = cleanText(match[0])
      .replace(/[),;}'"\]]+$/g, "");

    found.push(sprint);
  }


  /*
   * Remove duplicates while preserving order.
   */
  var unique = [];

  for (var i = 0; i < found.length; i++) {

    if (!found[i]) {
      continue;
    }

    var duplicate = false;

    for (var j = 0; j < unique.length; j++) {

      if (unique[j] === found[i]) {
        duplicate = true;
        break;
      }
    }

    if (!duplicate) {
      unique.push(found[i]);
    }
  }

  return unique;
}


/* =========================================================
   EXTRACT IFRAME URLS
========================================================= */

function extractIframeUrls(html, pageUrl) {

  var urls = [];
  var $ = cheerio.load(html);

  $("iframe").each(function(_, el) {

    var src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");

    if (!src) {
      return;
    }

    src = absoluteUrl(src, pageUrl);

    if (!src) {
      return;
    }

    if (
      src.indexOf("facebook.com") !== -1 ||
      src.indexOf("youtube.com") !== -1 ||
      src.indexOf("doubleclick") !== -1
    ) {
      return;
    }

    urls.push(src);
  });

  return urls;
}


/* =========================================================
   EXTRACT DESENEIFAINE EMBED / TID LINKS
========================================================= */

function extractInternalPlayerUrls(html, pageUrl) {

  var urls = [];

  /*
   * Look for:

   * ?trembed=0&trid=29030&trtype=1
   */
  var trembedRegex =
    /(?:https?:\/\/[^"'<> ]*)?\?trembed=\d+&trid=\d+&trtype=\d+/gi;

  var match;

  while ((match = trembedRegex.exec(html)) !== null) {

    var url = match[0];

    if (url.indexOf("?") === 0) {
      url = MAIN_URL + "/" + url;
    }

    url = absoluteUrl(url, pageUrl);

    if (url) {
      urls.push(url);
    }
  }


  /*
   * Look for:

   * ?tid=...&trhide=1
   *
   * This is important because DeseneFaine uses a second
   * internal player page before the actual media.
   */
  var tidRegex =
    /(?:https?:\/\/[^"'<> ]*)?\?tid=[a-zA-Z0-9]+&trhide=1/gi;

  while ((match = tidRegex.exec(html)) !== null) {

    var tidUrl = match[0];

    if (tidUrl.indexOf("?") === 0) {
      tidUrl = MAIN_URL + "/" + tidUrl;
    }

    tidUrl = absoluteUrl(tidUrl, pageUrl);

    if (tidUrl) {
      urls.push(tidUrl);
    }
  }


  /*
   * Also inspect links directly.
   */
  var $ = cheerio.load(html);

  $("a").each(function(_, el) {

    var href = $(el).attr("href");

    if (!href) {
      return;
    }

    if (
      href.indexOf("trembed=") !== -1 ||
      href.indexOf("tid=") !== -1
    ) {

      var absolute = absoluteUrl(href, pageUrl);

      if (absolute) {
        urls.push(absolute);
      }
    }
  });


  /*
   * Deduplicate.
   */
  var unique = [];

  for (var i = 0; i < urls.length; i++) {

    if (unique.indexOf(urls[i]) === -1) {
      unique.push(urls[i]);
    }
  }

  return unique;
}


/* =========================================================
   RESOLVE PLAYER RECURSIVELY
========================================================= */

function resolvePlayer(startUrl, depth, visited) {

  visited = visited || [];

  if (depth > 6) {
    log("Maximum resolver depth reached.");
    return Promise.resolve([]);
  }

  if (!startUrl) {
    return Promise.resolve([]);
  }


  /*
   * Avoid infinite loops.
   */
  if (visited.indexOf(startUrl) !== -1) {
    return Promise.resolve([]);
  }

  visited.push(startUrl);

  log("Resolver [" + depth + "] -> " + startUrl);


  /*
   * IMPORTANT:
   *
   * Referer must be the page from which this player was loaded,
   * not always the main DeseneFaine URL.
   */
  var headers = Object.assign({}, FETCH_HEADERS, {
    "Referer": startUrl
  });


  return fetchText(startUrl, {
    headers: headers
  }).then(function(html) {

    if (!html) {
      return [];
    }


    /*
     * FIRST:
     * Search the complete HTML AND JavaScript for actual media.
     */
    var media = extractMediaUrls(html, startUrl);

    if (media.length > 0) {

      log(
        "FOUND MEDIA at depth " +
        depth +
        ": " +
        media[0]
      );

      return media;
    }


    /*
     * SECOND:
     * Follow DeseneFaine's internal trembed/tid pages.
     */
    var internalUrls =
      extractInternalPlayerUrls(html, startUrl);


    /*
     * THIRD:
     * Follow normal iframes.
     */
    var iframeUrls =
      extractIframeUrls(html, startUrl);


    var nextUrls = [];


    for (var i = 0; i < internalUrls.length; i++) {

      if (nextUrls.indexOf(internalUrls[i]) === -1) {
        nextUrls.push(internalUrls[i]);
      }
    }


    for (var j = 0; j < iframeUrls.length; j++) {

      if (nextUrls.indexOf(iframeUrls[j]) === -1) {
        nextUrls.push(iframeUrls[j]);
      }
    }


    if (nextUrls.length === 0) {

      log(
        "No media or next player found at depth " +
        depth
      );

      return [];
    }


    log(
      "Found " +
      nextUrls.length +
      " next player URL(s) at depth " +
      depth
    );


    /*
     * Resolve sequentially.
     *
     * This is intentional for Hermes/Nuvio stability.
     */
    var chain = Promise.resolve([]);

    for (var k = 0; k < nextUrls.length; k++) {

      (function(nextUrl) {

        chain = chain.then(function(existing) {

          if (existing && existing.length > 0) {
            return existing;
          }

          return resolvePlayer(
            nextUrl,
            depth + 1,
            visited
          );
        });

      })(nextUrls[k]);
    }

    return chain;

  }).catch(function(error) {

    log(
      "Resolver error at depth " +
      depth +
      ": " +
      error.message
    );

    return [];
  });
}


/* =========================================================
   BUILD STREAM OBJECT
========================================================= */

function buildStream(url, referer, index) {

  /*
   * Keep the COMPLETE signed query string.
   *
   * This is critical for SprintCDN URLs because:
   *
   * ?t=...
   * &s=...
   * &e=...
   * &f=...
   * etc.
   *
   * are part of the authorization.
   */
  var headers = Object.assign({}, STREAM_HEADERS, {
    "Referer": referer || MAIN_URL + "/",
    "Origin": MAIN_URL
  });


  var title = "1080p | RO Dub";

  if (url.toLowerCase().indexOf(".m3u8") !== -1) {

    return {
      name: PROVIDER_NAME + " | HLS " + index,
      title: title,
      url: url,
      quality: "1080p",
      type: "m3u8",
      format: "m3u8",
      headers: headers,
      provider: "desenefaine"
    };
  }


  return {
    name: PROVIDER_NAME + " | Direct " + index,
    title: title,
    url: url,
    quality: "1080p",
    type: "mp4",
    format: "mp4",
    headers: headers,
    provider: "desenefaine"
  };
}


/* =========================================================
   SEARCH DESENEIFAINE
========================================================= */

function searchSite(query) {

  var searchUrl =
    MAIN_URL +
    "/?s=" +
    encodeURIComponent(query);


  return fetchText(searchUrl)
    .then(function(html) {

      var $ = cheerio.load(html);

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

        var href = $(el).attr("href");

        if (!href) {
          return;
        }

        if (href.indexOf("desenefaine.com") === -1) {
          return;
        }

        if (
          /\/(category|tag|author|page|feed|wp-)/i.test(href)
        ) {
          return;
        }


        var text =
          $(el).text().trim();

        if (text.length < 5) {
          return;
        }


        var normText =
          normalizeTitle(text);

        var matchCount = 0;


        queryWords.forEach(function(word) {

          if (normText.indexOf(word) !== -1) {
            matchCount++;
          }
        });


        if (
          matchCount >=
          Math.ceil(queryWords.length / 2)
        ) {

          if (
            !bestMatch ||
            text.length < bestMatch.text.length
          ) {

            bestMatch = {
              href: href,
              text: text,
              score: matchCount
            };
          }
        }
      });


      if (!bestMatch) {
        return null;
      }


      return fetchText(bestMatch.href)
        .then(function(pageHtml) {

          return {
            url: bestMatch.href,
            html: pageHtml
          };
        });

    })
    .catch(function() {
      return null;
    });
}


/* =========================================================
   MAIN
========================================================= */

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


  var isImdb =
    String(id).startsWith("tt");


  /*
   * FIXED IMDb endpoint.
   *
   * Your original code produced:
   *
   * /find/tt123...?external_source=imdb_id?api_key=...
   *
   * which is invalid.
   */
  var tmdbUrl;


  if (isImdb) {

    tmdbUrl =
      "https://api.themoviedb.org/3/find/" +
      id +
      "?external_source=imdb_id" +
      "&api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";

  } else {

    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      (
        type === "tv"
          ? "tv/"
          : "movie/"
      ) +
      id +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";
  }


  return fetchJson(tmdbUrl)

    .then(function(data) {

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
        "TMDB title: " +
        roTitle +
        " / " +
        enTitle
      );


      if (!roTitle && !enTitle) {

        log("TMDB returned no title.");

        return null;
      }


      /* =====================================================
         DIRECT URL
      ===================================================== */

      function tryDirectUrl(title) {

        if (!title) {
          return Promise.resolve(null);
        }


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
            ? ["epi", "serial", "desene"]
            : ["film", "desene"];


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
                  html.indexOf("does not exist") === -1 &&
                  html.indexOf("Nu am găsit") === -1
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


      /* =====================================================
         FIND PAGE
      ===================================================== */

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


                return searchSite(roTitle)
                  .then(function(searchResult) {

                    if (searchResult) {
                      return searchResult;
                    }

                    return searchSite(enTitle);
                  });
              });
          }


          return searchSite(roTitle);
        });

    })


    /* =======================================================
       RESOLVE ACTUAL PLAYER
    ======================================================= */

    .then(function(result) {

      if (!result || !result.html) {

        log("No valid page found.");

        return [];
      }


      log(
        "Found movie page: " +
        result.url
      );


      /*
       * IMPORTANT:
       *
       * Do NOT return the movie page iframe.
       *
       * Resolve it until we find the actual media.
       */
      return extractInternalPlayerUrls(
        result.html,
        result.url
      ).concat(
        extractIframeUrls(
          result.html,
          result.url
        )
      );

    })

    .then(function(playerUrls) {

      if (!playerUrls || playerUrls.length === 0) {

        log(
          "No player/iframe URLs found."
        );

        return [];
      }


      /*
       * Deduplicate.
       */
      var unique = [];

      for (var i = 0; i < playerUrls.length; i++) {

        if (
          playerUrls[i] &&
          unique.indexOf(playerUrls[i]) === -1
        ) {

          unique.push(playerUrls[i]);
        }
      }


      log(
        "Starting resolver with " +
        unique.length +
        " player URL(s)"
      );


      /*
       * Try each player sequentially.
       */
      var chain =
        Promise.resolve([]);


      for (
        var j = 0;
        j < unique.length;
        j++
      ) {

        (function(playerUrl) {

          chain =
            chain.then(function(existing) {

              if (
                existing &&
                existing.length > 0
              ) {

                return existing;
              }


              return resolvePlayer(
                playerUrl,
                0,
                []
              );
            });

        })(unique[j]);
      }


      return chain;
    })


    /* =======================================================
       RETURN ONLY REAL MEDIA TO NUVIO
    ======================================================= */

    .then(function(mediaUrls) {

      if (
        !mediaUrls ||
        mediaUrls.length === 0
      ) {

        log(
          "FINAL RESULT: No direct media found."
        );

        return [];
      }


      var streams = [];


      for (
        var i = 0;
        i < mediaUrls.length;
        i++
      ) {

        var mediaUrl =
          mediaUrls[i];


        /*
         * Absolutely do not give Nuvio:
         *
         * iframe HTML
         * trembed page
         * tid page
         *
         * Only media.
         */
        if (!isMediaUrl(mediaUrl)) {
          continue;
        }


        /*
         * Prefer HLS.
         */
        var duplicate = false;

        for (
          var j = 0;
          j < streams.length;
          j++
        ) {

          if (
            streams[j].url === mediaUrl
          ) {

            duplicate = true;
            break;
          }
        }


        if (!duplicate) {

          /*
           * We don't know the exact player page that
           * generated the URL here, so MAIN_URL is used
           * as fallback. The media URL itself remains
           * untouched.
           */
          streams.push(
            buildStream(
              mediaUrl,
              MAIN_URL + "/",
              streams.length + 1
            )
          );
        }
      }


      log(
        "FINAL RESULT: " +
        streams.length +
        " playable stream(s)"
      );


      for (
        var k = 0;
        k < streams.length;
        k++
      ) {

        log(
          "STREAM " +
          (k + 1) +
          ": " +
          streams[k].url
        );
      }


      return streams;
    })


    .catch(function(error) {

      log(
        "Fatal Error: " +
        error.message
      );

      return [];
    });
}


/* =========================================================
   EXPORT
========================================================= */

if (
  typeof module !== "undefined" &&
  module.exports
) {

  module.exports = {
    getStreams: getStreams
  };

} else {

  global.getStreams = getStreams;
}
