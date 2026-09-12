var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

var FETCH_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language":
    "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

var STREAM_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept": "*/*",
  "Accept-Language":
    "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function log(msg) {
  console.log("[" + PROVIDER_NAME + "] " + msg);
}

function fetchText(url, headers) {
  return fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: Object.assign(
      {},
      FETCH_HEADERS,
      headers || {}
    )
  }).then(function(res) {
    if (!res.ok) {
      throw new Error(
        "HTTP " + res.status + " -> " + url
      );
    }

    return res.text();
  });
}

function fetchJson(url, headers) {
  return fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: Object.assign(
      {},
      FETCH_HEADERS,
      headers || {}
    )
  }).then(function(res) {
    if (!res.ok) {
      throw new Error(
        "HTTP " + res.status + " -> " + url
      );
    }

    return res.json();
  });
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ş/g, "s")
    .replace(/ț/g, "t")
    .replace(/ţ/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ş/g, "s")
    .replace(/ț/g, "t")
    .replace(/ţ/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function absoluteUrl(base, value) {
  if (!value) {
    return null;
  }

  value = String(value)
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/\\\//g, "/");

  if (!value) {
    return null;
  }

  if (value.indexOf("//") === 0) {
    return "https:" + value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.indexOf("javascript:") === 0) {
    return null;
  }

  if (value.charAt(0) === "/") {
    var originMatch =
      String(base).match(
        /^(https?:\/\/[^\/]+)/i
      );

    return originMatch
      ? originMatch[1] + value
      : MAIN_URL + value;
  }

  var cleanBase =
    String(base).split("#")[0];

  var slash =
    cleanBase.lastIndexOf("/");

  if (slash >= 0) {
    cleanBase =
      cleanBase.substring(
        0,
        slash + 1
      );
  }

  return cleanBase + value;
}

function cleanValue(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\x26/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\x3a/gi, ":")
    .replace(/\\x2f/gi, "/")
    .replace(/\\x3f/gi, "?")
    .replace(/\\x3d/gi, "=")
    .replace(/^["'`]+/, "")
    .replace(/["'`;,]+$/, "");
}

function isHttp(url) {
  return /^https?:\/\//i.test(
    String(url || "")
  );
}

function isM3U8(url) {
  if (!url || !isHttp(url)) {
    return false;
  }

  var value =
    String(url).toLowerCase();

  return (
    value.indexOf(".m3u8") >= 0 ||
    value.indexOf("master.m3u8") >= 0 ||
    value.indexOf("playlist.m3u8") >= 0 ||
    value.indexOf("index.m3u8") >= 0
  );
}

function isMedia(url) {
  if (!url || !isHttp(url)) {
    return false;
  }

  var value =
    String(url).toLowerCase();

  return (
    isM3U8(url) ||
    value.indexOf(".mp4") >= 0 ||
    value.indexOf(".mkv") >= 0 ||
    value.indexOf(".webm") >= 0
  );
}

function getFormat(url) {
  return isM3U8(url)
    ? "m3u8"
    : String(url).toLowerCase().indexOf(".mkv") >= 0
    ? "mkv"
    : "mp4";
}

function getQuality(url) {
  var value =
    String(url || "").toLowerCase();

  if (
    value.indexOf("2160") >= 0 ||
    value.indexOf("4k") >= 0
  ) {
    return 2160;
  }

  if (value.indexOf("1440") >= 0) {
    return 1440;
  }

  if (value.indexOf("1080") >= 0) {
    return 1080;
  }

  if (value.indexOf("720") >= 0) {
    return 720;
  }

  if (value.indexOf("480") >= 0) {
    return 480;
  }

  return 1080;
}

function addUnique(array, value) {
  if (!value) {
    return;
  }

  for (var i = 0; i < array.length; i++) {
    if (array[i] === value) {
      return;
    }
  }

  array.push(value);
}

/*
 * ============================================================
 * M3U8 EXTRACTION
 * ============================================================
 *
 * This is the important part.
 *
 * DeseneFaine ultimately produces URLs like:
 *
 * https://edge1-madrid-sprintcdn.r66nv9ed.com/
 * hls2/.../master.m3u8?... 
 *
 * We therefore look for:
 *
 * 1. Full https://...m3u8 URLs
 * 2. Escaped URLs
 * 3. JSON/player configuration
 * 4. file:
 * 5. source:
 * 6. src:
 * 7. data-file
 * 8. data-src
 * 9. SprintCDN specifically
 */

function extractM3U8(html, pageUrl) {
  var results = [];

  if (!html) {
    return results;
  }

  function add(value) {
    value = cleanValue(value);

    if (!value) {
      return;
    }

    if (value.indexOf("//") === 0) {
      value = "https:" + value;
    }

    if (!isHttp(value)) {
      value =
        absoluteUrl(
          pageUrl,
          value
        );
    }

    if (isM3U8(value)) {
      addUnique(results, value);
    }
  }

  /*
   * 1. Standard complete URLs.
   */
  var fullUrlPattern =
    /https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;

  var match;

  while (
    (match =
      fullUrlPattern.exec(html)) !==
    null
  ) {
    add(match[0]);
  }

  /*
   * 2. Escaped URLs inside JS.
   */
  var escapedPattern =
    /https?:\\\/\\\/[^"'<>\\\s]+?\.m3u8(?:\\?[^"'<>\\\s]*)?/gi;

  while (
    (match =
      escapedPattern.exec(html)) !==
    null
  ) {
    add(
      match[0]
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
    );
  }

  /*
   * 3. Player configuration.
   *
   * file: "..."
   * source: "..."
   * src: "..."
   * url: "..."
   */
  var configPattern =
    /(?:file|source|src|url|stream|video|playlist|hls)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi;

  while (
    (match =
      configPattern.exec(html)) !==
    null
  ) {
    add(match[1]);
  }

  /*
   * 4. JSON-style escaped configuration.
   */
  var jsonPattern =
    /"(?:file|source|src|url|stream|video|playlist|hls)"\s*:\s*"([^"]+)"/gi;

  while (
    (match =
      jsonPattern.exec(html)) !==
    null
  ) {
    add(match[1]);
  }

  /*
   * 5. Anything containing sprintcdn + m3u8.
   *
   * This is specifically aimed at the URL you found.
   */
  var sprintPattern =
    /https?:\/\/[^"'<>\\\s]*sprintcdn[^"'<>\\\s]*\.m3u8[^"'<>\\\s]*/gi;

  while (
    (match =
      sprintPattern.exec(html)) !==
    null
  ) {
    add(match[0]);
  }

  /*
   * 6. HTML video/source elements.
   */
  try {
    var $ =
      cheerio.load(html);

    $("video, source").each(
      function(_, el) {
        add(
          $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-file") ||
            $(el).attr("data-url")
        );
      }
    );

    /*
     * Some players store the source in attributes
     * that aren't standard video attributes.
     */
    $("*").each(
      function(_, el) {
        var attrs = el.attribs || {};

        for (var key in attrs) {
          if (
            !Object.prototype.hasOwnProperty.call(
              attrs,
              key
            )
          ) {
            continue;
          }

          var attrValue =
            attrs[key];

          if (
            String(attrValue)
              .toLowerCase()
              .indexOf(".m3u8") >= 0
          ) {
            add(attrValue);
          }
        }
      }
    );
  } catch (e) {}

  return results;
}

/*
 * ============================================================
 * IFRAME EXTRACTION
 * ============================================================
 */

function extractIframes(
  html,
  pageUrl
) {
  var results = [];

  if (!html) {
    return results;
  }

  function add(value) {
    value = cleanValue(value);

    if (!value) {
      return;
    }

    if (value.indexOf("//") === 0) {
      value = "https:" + value;
    }

    if (!isHttp(value)) {
      value =
        absoluteUrl(
          pageUrl,
          value
        );
    }

    if (!isHttp(value)) {
      return;
    }

    if (
      value.indexOf("youtube.com") >= 0 ||
      value.indexOf("facebook.com") >= 0 ||
      value.indexOf("doubleclick") >= 0
    ) {
      return;
    }

    addUnique(results, value);
  }

  try {
    var $ =
      cheerio.load(html);

    $("iframe").each(
      function(_, el) {
        add(
          $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-lazy-src") ||
            $(el).attr("data-url")
        );
      }
    );
  } catch (e) {}

  var pattern =
    /(?:src|data-src|data-lazy-src|data-url)\s*=\s*["']([^"']+)["']/gi;

  var match;

  while (
    (match =
      pattern.exec(html)) !==
    null
  ) {
    add(match[1]);
  }

  return results;
}

/*
 * ============================================================
 * DESENEFAINE SERVER LINKS
 * ============================================================
 */

function extractTrid(html) {
  var ids = [];

  var patterns = [
    /trid\s*=\s*["']?(\d+)/gi,
    /trid["']?\s*[:=]\s*["']?(\d+)/gi,
    /["']trid["']\s*:\s*["']?(\d+)/gi
  ];

  patterns.forEach(
    function(pattern) {
      var match;

      while (
        (match =
          pattern.exec(html || "")) !==
        null
      ) {
        addUnique(
          ids,
          match[1]
        );
      }
    }
  );

  return ids;
}

function extractTrembedUrls(html) {
  var results = [];

  var trids =
    extractTrid(html);

  /*
   * Preserve exact trembed URLs if present.
   */
  var exact =
    /(?:https?:\/\/[^"'<> ]*)?\??trembed=(\d+)[^"'<> ]*trid=(\d+)[^"'<> ]*/gi;

  var match;

  while (
    (match =
      exact.exec(html || "")) !==
    null
  ) {
    addUnique(
      results,
      MAIN_URL +
        "/?trembed=" +
        match[1] +
        "&trid=" +
        match[2] +
        "&trtype=1"
    );
  }

  /*
   * Build all server candidates.
   */
  trids.forEach(
    function(trid) {
      for (
        var i = 0;
        i <= 12;
        i++
      ) {
        addUnique(
          results,
          MAIN_URL +
            "/?trembed=" +
            i +
            "&trid=" +
            trid +
            "&trtype=1"
        );
      }
    }
  );

  return results;
}

/*
 * ============================================================
 * PLAYER PAGE RESOLUTION
 * ============================================================
 */

function resolvePage(
  url,
  depth
) {
  depth =
    depth || 0;

  if (depth > 5) {
    log(
      "Maximum recursion reached: " +
        url
    );

    return Promise.resolve([]);
  }

  log(
    "RESOLVE [" +
      depth +
      "]: " +
      url
  );

  /*
   * Already a direct stream.
   */
  if (isMedia(url)) {
    return Promise.resolve([
      {
        url: url,
        source: url
      }
    ]);
  }

  return fetchText(
    url,
    {
      "Referer":
        MAIN_URL + "/",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  )
    .then(
      function(html) {
        log(
          "HTML LENGTH: " +
            String(
              html || ""
            ).length
        );

        /*
         * FIRST PRIORITY:
         * Find the actual M3U8.
         */
        var streams =
          extractM3U8(
            html,
            url
          );

        if (
          streams.length > 0
        ) {
          log(
            "M3U8 FOUND: " +
              streams.length
          );

          streams.forEach(
            function(stream) {
              log(
                "STREAM URL: " +
                  stream
              );
            }
          );

          return streams.map(
            function(stream) {
              return {
                url: stream,
                source: url
              };
            }
          );
        }

        /*
         * SECOND:
         * Find nested iframe.
         */
        var iframes =
          extractIframes(
            html,
            url
          );

        /*
         * THIRD:
         * DeseneFaine trembed links.
         */
        var trembeds =
          extractTrembedUrls(
            html
          );

        trembeds.forEach(
          function(embed) {
            addUnique(
              iframes,
              embed
            );
          }
        );

        log(
          "CHILD CANDIDATES: " +
            iframes.length
        );

        if (
          iframes.length === 0
        ) {
          log(
            "NO M3U8 AND NO CHILD PAGE"
          );

          return [];
        }

        /*
         * Resolve candidates in parallel.
         *
         * Limit to 16 so one page can't explode
         * into hundreds of requests.
         */
        var jobs =
          iframes
            .slice(0, 16)
            .map(
              function(child) {
                return resolvePage(
                  child,
                  depth + 1
                ).catch(
                  function(error) {
                    log(
                      "CHILD FAILED: " +
                        child +
                        " -> " +
                        (
                          error &&
                          error.message
                            ? error.message
                            : String(
                                error
                              )
                        )
                    );

                    return [];
                  }
                );
              }
            );

        return Promise.all(
          jobs
        ).then(
          function(all) {
            var merged = [];

            all.forEach(
              function(list) {
                (list || []).forEach(
                  function(item) {
                    if (
                      item &&
                      item.url
                    ) {
                      var exists =
                        false;

                      for (
                        var i = 0;
                        i <
                        merged.length;
                        i++
                      ) {
                        if (
                          merged[i]
                            .url ===
                          item.url
                        ) {
                          exists =
                            true;
                          break;
                        }
                      }

                      if (
                        !exists
                      ) {
                        merged.push(
                          item
                        );
                      }
                    }
                  }
                );
              }
            );

            return merged;
          }
        );
      }
    )
    .catch(
      function(error) {
        log(
          "RESOLVE ERROR: " +
            (
              error &&
              error.message
                ? error.message
                : String(error)
            )
        );

        return [];
      }
    );
}

/*
 * ============================================================
 * DESENEFAINE SEARCH
 * ============================================================
 */

function searchSite(query) {
  log(
    "SEARCHING: " +
      query
  );

  var url =
    MAIN_URL +
    "/?s=" +
    encodeURIComponent(
      query
    );

  return fetchText(url)
    .then(
      function(html) {
        var $ =
          cheerio.load(html);

        var candidates =
          [];

        var words =
          normalizeTitle(
            query
          )
            .split(" ")
            .filter(
              function(word) {
                return (
                  word.length > 2
                );
              }
            );

        $("a").each(
          function(_, el) {
            var href =
              $(el).attr(
                "href"
              );

            if (!href) {
              return;
            }

            var full =
              absoluteUrl(
                url,
                href
              );

            if (
              !full ||
              full.indexOf(
                "desenefaine.com"
              ) < 0
            ) {
              return;
            }

            if (
              /\/(category|tag|author|page|feed|wp-)/i.test(
                full
              )
            ) {
              return;
            }

            var text =
              $(el)
                .text()
                .trim();

            if (
              text.length < 4
            ) {
              return;
            }

            var normalized =
              normalizeTitle(
                text
              );

            var score = 0;

            words.forEach(
              function(word) {
                if (
                  normalized.indexOf(
                    word
                  ) >= 0
                ) {
                  score++;
                }
              }
            );

            if (
              score >=
              Math.max(
                1,
                Math.ceil(
                  words.length /
                    2
                )
              )
            ) {
              candidates.push({
                url: full,
                score: score,
                text: text
              });
            }
          }
        );

        candidates.sort(
          function(a, b) {
            if (
              b.score !==
              a.score
            ) {
              return (
                b.score -
                a.score
              );
            }

            return (
              a.text.length -
              b.text.length
            );
          }
        );

        function tryCandidate(
          index
        ) {
          if (
            index >=
            candidates.length
          ) {
            return Promise.resolve(
              null
            );
          }

          var candidate =
            candidates[index];

          return fetchText(
            candidate.url
          )
            .then(
              function(page) {
                if (
                  page &&
                  page.length >
                    1000
                ) {
                  return {
                    url:
                      candidate.url,
                    html:
                      page
                  };
                }

                return tryCandidate(
                  index + 1
                );
              }
            )
            .catch(
              function() {
                return tryCandidate(
                  index + 1
                );
              }
            );
        }

        return tryCandidate(
          0
        );
      }
    )
    .catch(
      function(error) {
        log(
          "SEARCH ERROR: " +
            (
              error &&
              error.message
                ? error.message
                : String(error)
            )
        );

        return null;
      }
    );
}

/*
 * ============================================================
 * DIRECT PAGE LOOKUP
 * ============================================================
 */

function findDirectPage(
  title,
  type,
  season,
  episode
) {
  var slug =
    normalizeSlug(
      title
    );

  if (
    type === "tv" &&
    season != null &&
    episode != null
  ) {
    slug =
      slug +
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

  var jobs =
    prefixes.map(
      function(prefix) {
        var url =
          MAIN_URL +
          "/" +
          prefix +
          "/" +
          slug +
          "/";

        return fetchText(url)
          .then(
            function(html) {
              if (
                html &&
                html.length >
                  1500 &&
                !/does not exist/i.test(
                  html
                ) &&
                !/nu am găsit/i.test(
                  html
                )
              ) {
                return {
                  url: url,
                  html: html
                };
              }

              return null;
            }
          )
          .catch(
            function() {
              return null;
            }
          );
      }
    );

  return Promise.all(
    jobs
  ).then(
    function(results) {
      for (
        var i = 0;
        i < results.length;
        i++
      ) {
        if (
          results[i]
        ) {
          log(
            "DIRECT PAGE: " +
              results[i].url
          );

          return results[i];
        }
      }

      return null;
    }
  );
}

/*
 * ============================================================
 * BUILD STREAM
 * ============================================================
 */

function makeStream(
  item,
  pageUrl,
  index
) {
  var url =
    cleanValue(
      item.url
    );

  if (
    !isMedia(url)
  ) {
    return null;
  }

  var format =
    getFormat(url);

  var quality =
    getQuality(url);

  /*
   * IMPORTANT:
   *
   * The CDN URL is temporary/signed.
   * Do NOT modify it.
   *
   * In particular:
   * - don't remove query parameters
   * - don't rebuild the URL
   * - don't URL-encode it again
   *
   * Those parameters are part of the CDN authorization.
   */

  var referer =
    item.source ||
    pageUrl ||
    MAIN_URL + "/";

  var originMatch =
    String(referer).match(
      /^(https?:\/\/[^\/]+)/i
    );

  var origin =
    originMatch
      ? originMatch[1]
      : MAIN_URL;

  return {
    name:
      PROVIDER_NAME +
      " | Server " +
      index,

    title:
      String(quality) +
      "p | RO Dub",

    url: url,

    quality: quality,

    format: format,

    type: format,

    provider:
      "desenefaine",

    headers: {
      "User-Agent":
        USER_AGENT,
      "Accept":
        "*/*",
      "Referer":
        referer,
      "Origin":
        origin
    }
  };
}

/*
 * ============================================================
 * MAIN
 * ============================================================
 */

function getStreams(
  id,
  type,
  season,
  episode
) {
  log(
    "========================================"
  );

  log(
    "REQUEST: ID=" +
      id +
      " TYPE=" +
      type +
      " S=" +
      season +
      " E=" +
      episode
  );

  var isImdb =
    String(id || "")
      .indexOf("tt") ===
    0;

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
    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      (
        type === "tv"
          ? "tv/"
          : "movie/"
      ) +
      encodeURIComponent(id) +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";
  }

  log(
    "TMDB: " +
      tmdbUrl
  );

  return fetchJson(
    tmdbUrl
  )
    .then(
      function(data) {
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
            if (
              type === "tv"
            ) {
              roTitle =
                results[0].name ||
                "";
              enTitle =
                results[0]
                  .original_name ||
                "";
            } else {
              roTitle =
                results[0].title ||
                "";
              enTitle =
                results[0]
                  .original_title ||
                "";
            }
          }
        } else {
          if (
            type === "tv"
          ) {
            roTitle =
              data.name || "";
            enTitle =
              data.original_name ||
              "";
          } else {
            roTitle =
              data.title || "";
            enTitle =
              data.original_title ||
              "";
          }
        }

        log(
          "RO TITLE: " +
            roTitle
        );

        log(
          "EN TITLE: " +
            enTitle
        );

        var titles = [];

        if (roTitle) {
          titles.push(
            roTitle
          );
        }

        if (
          enTitle &&
          enTitle !==
            roTitle
        ) {
          titles.push(
            enTitle
          );
        }

        function tryTitle(
          index
        ) {
          if (
            index >=
            titles.length
          ) {
            return Promise.resolve(
              null
            );
          }

          return findDirectPage(
            titles[index],
            type,
            season,
            episode
          ).then(
            function(page) {
              if (page) {
                return page;
              }

              return tryTitle(
                index + 1
              );
            }
          );
        }

        return tryTitle(
          0
        ).then(
          function(page) {
            if (page) {
              return page;
            }

            return searchSite(
              roTitle ||
                enTitle ||
                String(id)
            );
          }
        );
      }
    )
    .catch(
      function(error) {
        log(
          "TMDB ERROR: " +
            (
              error &&
              error.message
                ? error.message
                : String(error)
            )
        );

        /*
         * Fallback search.
         */
        return searchSite(
          String(id)
        );
      }
    )
    .then(
      function(page) {
        if (
          !page ||
          !page.html
        ) {
          log(
            "NO DESENEFAINE PAGE"
          );

          return [];
        }

        log(
          "USING PAGE: " +
            page.url
        );

        /*
         * First check whether the actual movie page
         * already contains the M3U8.
         */
        var direct =
          extractM3U8(
            page.html,
            page.url
          );

        if (
          direct.length > 0
        ) {
          log(
            "DIRECT M3U8 ON MOVIE PAGE!"
          );

          return direct.map(
            function(url) {
              return {
                url: url,
                source: page.url
              };
            }
          );
        }

        /*
         * Get iframe candidates.
         */
        var embeds =
          extractIframes(
            page.html,
            page.url
          );

        /*
         * Add trembed/trid candidates.
         */
        var trembeds =
          extractTrembedUrls(
            page.html
          );

        trembeds.forEach(
          function(url) {
            addUnique(
              embeds,
              url
            );
          }
        );

        log(
          "EMBED CANDIDATES: " +
            embeds.length
        );

        embeds.forEach(
          function(url, index) {
            log(
              "EMBED " +
                (index + 1) +
                ": " +
                url
            );
          }
        );

        if (
          embeds.length ===
          0
        ) {
          log(
            "NO EMBEDS"
          );

          return [];
        }

        /*
         * Resolve all server choices.
         */
        var jobs =
          embeds
            .slice(0, 16)
            .map(
              function(embed) {
                return resolvePage(
                  embed,
                  0
                );
              }
            );

        return Promise.all(
          jobs
        ).then(
          function(all) {
            var resolved =
              [];

            all.forEach(
              function(list) {
                (list || []).forEach(
                  function(item) {
                    if (
                      !item ||
                      !item.url
                    ) {
                      return;
                    }

                    for (
                      var i = 0;
                      i <
                      resolved.length;
                      i++
                    ) {
                      if (
                        resolved[i]
                          .url ===
                        item.url
                      ) {
                        return;
                      }
                    }

                    resolved.push(
                      item
                    );
                  }
                );
              }
            );

            log(
              "RESOLVED MEDIA: " +
                resolved.length
            );

            var streams =
              [];

            resolved.forEach(
              function(item, index) {
                var stream =
                  makeStream(
                    item,
                    page.url,
                    index + 1
                  );

                if (stream) {
                  log(
                    "================================"
                  );

                  log(
                    "FINAL STREAM " +
                      (index + 1)
                  );

                  log(
                    "URL: " +
                      stream.url
                  );

                  log(
                    "TYPE: " +
                      stream.type
                  );

                  log(
                    "REFERER: " +
                      stream.headers
                        .Referer
                  );

                  streams.push(
                    stream
                  );
                }
              }
            );

            /*
             * M3U8 first.
             */
            streams.sort(
              function(a, b) {
                if (
                  a.type ===
                    "m3u8" &&
                  b.type !==
                    "m3u8"
                ) {
                  return -1;
                }

                if (
                  a.type !==
                    "m3u8" &&
                  b.type ===
                    "m3u8"
                ) {
                  return 1;
                }

                return (
                  Number(
                    b.quality ||
                      0
                  ) -
                  Number(
                    a.quality ||
                      0
                  )
                );
              }
            );

            log(
              "RETURNING " +
                streams.length +
                " STREAMS"
            );

            return streams;
          }
        );
      }
    )
    .catch(
      function(error) {
        log(
          "FATAL: " +
            (
              error &&
              error.message
                ? error.message
                : String(error)
            )
        );

        return [];
      }
    );
}

if (
  typeof module !==
    "undefined" &&
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
