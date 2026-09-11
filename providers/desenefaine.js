var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};


function log(msg) {
  console.log("[" + PROVIDER_NAME + "] " + msg);
}


// ============================================================
// HTTP
// ============================================================

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
  }).then(function(res) {

    if (!res.ok) {
      throw new Error(
        "HTTP " + res.status + " -> " + url
      );
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
  }).then(function(res) {

    if (!res.ok) {
      throw new Error(
        "HTTP " + res.status + " -> " + url
      );
    }

    return res.json();
  });
}


// ============================================================
// TEXT NORMALIZATION
// ============================================================

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


// ============================================================
// URL RESOLUTION
// ============================================================

function resolveUrl(base, value) {

  if (!value) {
    return null;
  }

  value = String(value).trim();

  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.indexOf("//") === 0) {
    return "https:" + value;
  }

  var match =
    base.match(/^(https?:\/\/[^\/]+)/i);

  if (!match) {
    return null;
  }

  var origin = match[1];

  if (value.charAt(0) === "/") {
    return origin + value;
  }

  var slash =
    base.lastIndexOf("/");

  if (slash === -1) {
    return origin + "/" + value;
  }

  return base.substring(0, slash + 1) + value;
}


// ============================================================
// DUPLICATE PROTECTION
// ============================================================

function addStream(streams, stream) {

  if (
    !stream ||
    (!stream.url && !stream.externalUrl)
  ) {
    return;
  }

  var target =
    stream.url ||
    stream.externalUrl;

  for (var i = 0; i < streams.length; i++) {

    var existing =
      streams[i].url ||
      streams[i].externalUrl;

    if (existing === target) {
      return;
    }
  }

  streams.push(stream);
}


// ============================================================
// CHECK IF URL IS MEDIA
// ============================================================

function isMediaUrl(url) {

  if (!url) {
    return false;
  }

  var lower =
    url.toLowerCase();

  return (
    lower.indexOf(".m3u8") !== -1 ||
    lower.indexOf(".mp4") !== -1 ||
    lower.indexOf(".webm") !== -1 ||
    lower.indexOf(".mkv") !== -1
  );
}


// ============================================================
// CHECK IF URL IS DESENEFAINE EMBED WRAPPER
// ============================================================

function isDeseneEmbed(url) {

  if (!url) {
    return false;
  }

  var lower =
    url.toLowerCase();

  return (
    lower.indexOf("desenefaine.com/?trembed=") !== -1 ||
    lower.indexOf("desenefaine.com/?trid=") !== -1 ||
    lower.indexOf("desenefaine.com/?tid=") !== -1
  );
}


// ============================================================
// EXTRACT REAL PLAYER FROM EMBED PAGE
// ============================================================

function resolvePlayerUrl(
  startUrl,
  depth
) {

  depth = depth || 0;

  /*
   * Prevent infinite iframe loops.
   */
  if (depth > 3) {

    log(
      "Maximum embed depth reached: " +
      startUrl
    );

    return Promise.resolve(null);
  }


  log(
    "Resolving player level " +
    depth +
    ": " +
    startUrl
  );


  return fetchText(startUrl)
    .then(function(html) {

      if (!html) {
        return null;
      }


      var $ =
        cheerio.load(html);


      // ------------------------------------------------------
      // DIRECT VIDEO
      // ------------------------------------------------------

      var direct = null;

      $("video source, video").each(
        function(_, el) {

          if (direct) {
            return;
          }

          var src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-video");

          if (!src) {
            return;
          }

          var url =
            resolveUrl(startUrl, src);

          if (
            url &&
            isMediaUrl(url)
          ) {

            direct = url;
          }
        }
      );


      if (direct) {

        log(
          "REAL MEDIA FOUND: " +
          direct
        );

        return {
          type: "direct",
          url: direct
        };
      }


      // ------------------------------------------------------
      // SEARCH IFRAMES
      // ------------------------------------------------------

      var iframeUrls = [];


      $("iframe").each(
        function(_, el) {

          var src =
            $(el).attr("src") ||
            $(el).attr("data-src") ||
            $(el).attr("data-lazy-src");

          if (!src) {
            return;
          }

          var url =
            resolveUrl(startUrl, src);

          if (!url) {
            return;
          }


          /*
           * Ignore social/advertising iframes.
           */

          var lower =
            url.toLowerCase();

          if (
            lower.indexOf("facebook.com") !== -1 ||
            lower.indexOf("youtube.com") !== -1 ||
            lower.indexOf("doubleclick.net") !== -1 ||
            lower.indexOf("googletagmanager.com") !== -1
          ) {
            return;
          }


          iframeUrls.push(url);
        }
      );


      log(
        "Found " +
        iframeUrls.length +
        " iframe(s) at level " +
        depth
      );


      /*
       * Try each iframe.
       */
      function tryIframe(index) {

        if (
          index >= iframeUrls.length
        ) {
          return Promise.resolve(null);
        }

        var iframeUrl =
          iframeUrls[index];


        log(
          "Trying iframe: " +
          iframeUrl
        );


        /*
         * If this is an external player,
         * return it directly.
         *
         * If it is another DeseneFaine
         * wrapper, recurse.
         */

        if (
          !isDeseneEmbed(iframeUrl)
        ) {

          return resolvePlayerUrl(
            iframeUrl,
            depth + 1
          ).then(function(result) {

            if (result) {
              return result;
            }

            /*
             * We couldn't inspect the external
             * player, but the iframe itself may
             * be the actual player.
             */

            return {
              type: "external",
              url: iframeUrl
            };

          });
        }


        return resolvePlayerUrl(
          iframeUrl,
          depth + 1
        ).then(function(result) {

          if (result) {
            return result;
          }

          return tryIframe(index + 1);
        });
      }


      return tryIframe(0);

    })
    .catch(function(error) {

      log(
        "Player resolve error: " +
        error.message
      );

      return null;
    });
}


// ============================================================
// SITE SEARCH
// ============================================================

function searchSite(query) {

  log(
    "Searching: " +
    query
  );

  var searchUrl =
    MAIN_URL +
    "/?s=" +
    encodeURIComponent(query);


  return fetchText(searchUrl)
    .then(function(html) {

      var $ =
        cheerio.load(html);

      var bestMatch = null;

      var normalized =
        normalizeTitle(query);

      var words =
        normalized
          .split(" ")
          .filter(function(word) {
            return word.length > 2;
          });


      $("a").each(
        function(_, el) {

          var href =
            $(el).attr("href");

          if (!href) {
            return;
          }

          if (
            href.indexOf(
              "desenefaine.com"
            ) === -1
          ) {
            return;
          }

          if (
            /\/(category|tag|author|page|feed|wp-)/i
              .test(href)
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

          var score = 0;


          words.forEach(
            function(word) {

              if (
                normText.indexOf(word) !== -1
              ) {
                score++;
              }

            }
          );


          if (
            words.length > 0 &&
            score >=
              Math.ceil(words.length / 2)
          ) {

            if (
              !bestMatch ||
              score > bestMatch.score
            ) {

              bestMatch = {
                href: href,
                text: text,
                score: score
              };
            }
          }

        }
      );


      if (!bestMatch) {
        return null;
      }


      log(
        "Search match: " +
        bestMatch.href
      );


      return fetchText(
        bestMatch.href
      ).then(function(pageHtml) {

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


// ============================================================
// DIRECT PAGE LOOKUP
// ============================================================

function tryDirectUrl(
  title,
  type,
  season,
  episode
) {

  if (!title) {
    return Promise.resolve(null);
  }


  var slug =
    normalizeSlug(title);

  var urls = [];


  if (
    type === "tv" &&
    season &&
    episode
  ) {

    urls.push(
      MAIN_URL +
      "/epi/" +
      slug +
      "-sezonul-" +
      season +
      "-episodul-" +
      episode +
      "/"
    );
  }


  urls.push(
    MAIN_URL +
    "/film/" +
    slug +
    "/"
  );

  urls.push(
    MAIN_URL +
    "/desene/" +
    slug +
    "/"
  );

  urls.push(
    MAIN_URL +
    "/serial/" +
    slug +
    "/"
  );


  function next(index) {

    if (index >= urls.length) {
      return Promise.resolve(null);
    }


    var url =
      urls[index];


    log(
      "Trying page: " +
      url
    );


    return fetchText(url)
      .then(function(html) {

        if (
          !html ||
          html.length < 1000
        ) {
          return next(index + 1);
        }


        var lower =
          html.toLowerCase();


        if (
          lower.indexOf(
            "nu am găsit"
          ) !== -1 ||
          lower.indexOf(
            "nu am gasit"
          ) !== -1
        ) {
          return next(index + 1);
        }


        return {
          url: url,
          html: html
        };

      })
      .catch(function() {

        return next(index + 1);

      });
  }


  return next(0);
}


// ============================================================
// FIND PAGE
// ============================================================

function findPage(
  roTitle,
  enTitle,
  type,
  season,
  episode
) {

  return tryDirectUrl(
    roTitle,
    type,
    season,
    episode
  )
  .then(function(result) {

    if (result) {
      return result;
    }

    if (
      enTitle &&
      enTitle !== roTitle
    ) {

      return tryDirectUrl(
        enTitle,
        type,
        season,
        episode
      );
    }

    return null;

  })
  .then(function(result) {

    if (result) {
      return result;
    }

    return searchSite(roTitle);

  })
  .then(function(result) {

    if (result) {
      return result;
    }

    if (
      enTitle &&
      enTitle !== roTitle
    ) {
      return searchSite(enTitle);
    }

    return null;

  });
}


// ============================================================
// MAIN STREAM FUNCTION
// ============================================================

function getStreams(
  id,
  type,
  season,
  episode
) {

  log(
    "Requested: ID=" +
    id +
    " Type=" +
    type +
    " S=" +
    season +
    " E=" +
    episode
  );


  var isImdb =
    String(id || "")
      .indexOf("tt") === 0;


  var tmdbUrl;


  // ----------------------------------------------------------
  // TMDB
  // ----------------------------------------------------------

  if (isImdb) {

    tmdbUrl =
      "https://api.themoviedb.org/3/find/" +
      encodeURIComponent(id) +
      "?api_key=" +
      encodeURIComponent(TMDB_API_KEY) +
      "&external_source=imdb_id" +
      "&language=ro-RO";

  } else {

    var endpoint =
      type === "tv"
        ? "tv/"
        : "movie/";


    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      endpoint +
      encodeURIComponent(id) +
      "?api_key=" +
      encodeURIComponent(TMDB_API_KEY) +
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
          results.length
        ) {

          if (type === "tv") {

            roTitle =
              results[0].name || "";

            enTitle =
              results[0].original_name || "";

          } else {

            roTitle =
              results[0].title || "";

            enTitle =
              results[0].original_title || "";
          }
        }

      } else {

        if (type === "tv") {

          roTitle =
            data.name || "";

          enTitle =
            data.original_name || "";

        } else {

          roTitle =
            data.title || "";

          enTitle =
            data.original_title || "";
        }
      }


      log(
        "Titles: RO=" +
        roTitle +
        " | EN=" +
        enTitle
      );


      if (
        !roTitle &&
        !enTitle
      ) {
        return [];
      }


      return findPage(
        roTitle,
        enTitle,
        type,
        season,
        episode
      );

    })


    // --------------------------------------------------------
    // PAGE FOUND
    // --------------------------------------------------------

    .then(function(page) {

      if (
        !page ||
        !page.html
      ) {

        log(
          "No page found."
        );

        return [];
      }


      log(
        "PAGE FOUND: " +
        page.url
      );


      /*
       * Instead of immediately returning the
       * first iframe, follow the iframe chain.
       */

      return resolvePlayerUrl(
        page.url,
        0
      ).then(function(player) {


        if (!player) {

          log(
            "No player found."
          );

          return [];
        }


        var streams = [];


        // ----------------------------------------------------
        // DIRECT MEDIA
        // ----------------------------------------------------

        if (
          player.type === "direct"
        ) {

          log(
            "Returning direct media: " +
            player.url
          );


          addStream(streams, {

            name:
              PROVIDER_NAME +
              " | Direct",

            title:
              "Direct stream",

            url:
              player.url,

            quality:
              "HD",

            headers: {

              "User-Agent":
                FETCH_HEADERS["User-Agent"],

              "Referer":
                page.url

            },

            provider:
              "desenefaine"

          });


          return streams;
        }


        // ----------------------------------------------------
        // EXTERNAL PLAYER
        // ----------------------------------------------------

        if (
          player.type === "external"
        ) {

          log(
            "Returning external player: " +
            player.url
          );


          addStream(streams, {

            name:
              PROVIDER_NAME +
              " | Player",

            title:
              "Open video player",

            externalUrl:
              player.url,

            provider:
              "desenefaine"

          });


          return streams;
        }


        return streams;

      });

    })


    .catch(function(error) {

      log(
        "Fatal error: " +
        error.message
      );

      return [];

    });
}


// ============================================================
// EXPORT
// ============================================================

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
```
