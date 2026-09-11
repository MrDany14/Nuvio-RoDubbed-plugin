```javascript
var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";

// TMDB API key
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};


// ============================================================
// LOGGING
// ============================================================

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


// ============================================================
// NORMALIZATION
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
// URL RESOLVER
// ============================================================

function resolveUrl(base, value) {

  if (!value) {
    return null;
  }

  value = String(value).trim();

  if (!value) {
    return null;
  }

  // Already absolute
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Protocol-relative
  if (value.indexOf("//") === 0) {
    return "https:" + value;
  }

  // Extract origin
  var match = base.match(/^(https?:\/\/[^\/]+)/i);

  if (!match) {
    return null;
  }

  var origin = match[1];

  // Absolute path
  if (value.charAt(0) === "/") {
    return origin + value;
  }

  // Relative path
  var slashIndex = base.lastIndexOf("/");

  if (slashIndex === -1) {
    return origin + "/" + value;
  }

  return base.substring(0, slashIndex + 1) + value;
}


// ============================================================
// REMOVE DUPLICATES
// ============================================================

function addStream(streams, stream) {

  if (!stream || !stream.url && !stream.externalUrl) {
    return;
  }

  var target = stream.url || stream.externalUrl;

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
// SITE SEARCH
// ============================================================

function searchSite(query) {

  log("Searching site for: " + query);

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
          .filter(function(word) {
            return word.length > 2;
          });

      $("a").each(function(_, el) {

        var href = $(el).attr("href");

        if (!href) {
          return;
        }

        if (
          href.indexOf("desenefaine.com") === -1
        ) {
          return;
        }

        if (
          /\/(category|tag|author|page|feed|wp-)/i.test(href)
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

        queryWords.forEach(function(word) {

          if (normText.indexOf(word) !== -1) {
            matchCount++;
          }
        });

        if (
          queryWords.length > 0 &&
          matchCount >= Math.ceil(queryWords.length / 2)
        ) {

          if (
            !bestMatch ||
            matchCount > bestMatch.score ||
            (
              matchCount === bestMatch.score &&
              text.length < bestMatch.text.length
            )
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
        log("No search result found.");
        return null;
      }

      log(
        "Search match: " +
        bestMatch.text +
        " -> " +
        bestMatch.href
      );

      return fetchText(bestMatch.href)
        .then(function(pageHtml) {

          return {
            url: bestMatch.href,
            html: pageHtml
          };

        });

    })
    .catch(function(error) {

      log(
        "Search failed: " +
        error.message
      );

      return null;
    });
}


// ============================================================
// DIRECT URL GUESSING
// ============================================================

function tryDirectUrl(title, type, season, episode) {

  if (!title) {
    return Promise.resolve(null);
  }

  var slug =
    normalizeSlug(title);

  var urls = [];

  // TV episode URLs
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

    urls.push(
      MAIN_URL +
      "/serial/" +
      slug +
      "-sezonul-" +
      season +
      "-episodul-" +
      episode +
      "/"
    );

    urls.push(
      MAIN_URL +
      "/desene/" +
      slug +
      "-sezonul-" +
      season +
      "-episodul-" +
      episode +
      "/"
    );
  }

  // Normal title pages
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

  function testNext(index) {

    if (index >= urls.length) {
      return Promise.resolve(null);
    }

    var url = urls[index];

    log("Trying: " + url);

    return fetchText(url)
      .then(function(html) {

        if (!html) {
          return testNext(index + 1);
        }

        if (html.length < 1000) {
          return testNext(index + 1);
        }

        var lower =
          html.toLowerCase();

        if (
          lower.indexOf("does not exist") !== -1 ||
          lower.indexOf("nu am găsit") !== -1 ||
          lower.indexOf("nu am gasit") !== -1 ||
          lower.indexOf("404") !== -1
        ) {
          return testNext(index + 1);
        }

        log("Direct URL match: " + url);

        return {
          url: url,
          html: html
        };

      })
      .catch(function() {

        return testNext(index + 1);

      });
  }

  return testNext(0);
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
// STREAM EXTRACTION
// ============================================================

function extractStreams(page) {

  var $ = cheerio.load(page.html);

  var streams = [];

  var serverCount = 1;


  // ----------------------------------------------------------
  // 1. DIRECT VIDEO SOURCES
  // ----------------------------------------------------------

  $("video source, video").each(function(_, el) {

    var src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-video");

    if (!src) {
      return;
    }

    var mediaUrl =
      resolveUrl(page.url, src);

    if (!mediaUrl) {
      return;
    }

    var lower =
      mediaUrl.toLowerCase();

    // Only accept obvious media URLs
    var isMedia =
      lower.indexOf(".m3u8") !== -1 ||
      lower.indexOf(".mp4") !== -1 ||
      lower.indexOf(".mkv") !== -1 ||
      lower.indexOf(".webm") !== -1;

    if (!isMedia) {
      return;
    }

    log(
      "DIRECT MEDIA FOUND: " +
      mediaUrl
    );

    addStream(streams, {

      name:
        PROVIDER_NAME +
        " | Direct",

      title:
        "Direct stream",

      url:
        mediaUrl,

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

  });


  // ----------------------------------------------------------
  // 2. IFRAMES / EMBED PLAYERS
  // ----------------------------------------------------------

  $("iframe").each(function(_, el) {

    var src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");

    if (!src) {
      return;
    }

    var iframeUrl =
      resolveUrl(page.url, src);

    if (!iframeUrl) {
      return;
    }

    var lower =
      iframeUrl.toLowerCase();


    // Ignore obvious irrelevant embeds
    if (
      lower.indexOf("facebook.com") !== -1 ||
      lower.indexOf("youtube.com") !== -1 ||
      lower.indexOf("doubleclick.net") !== -1 ||
      lower.indexOf("googletagmanager.com") !== -1
    ) {
      return;
    }


    log(
      "IFRAME FOUND: " +
      iframeUrl
    );


    // IMPORTANT:
    // This is an HTML player page, NOT a media file.
    //
    // externalUrl prevents Nuvio from attempting to
    // buffer the iframe URL as if it were an MP4/HLS file.

    addStream(streams, {

      name:
        PROVIDER_NAME +
        " | Server " +
        serverCount++,

      title:
        "Open player",

      externalUrl:
        iframeUrl,

      provider:
        "desenefaine"

    });

  });


  // ----------------------------------------------------------
  // 3. DATA ATTRIBUTES
  // ----------------------------------------------------------

  $("[data-video], [data-video-url], [data-player]").each(
    function(_, el) {

      var src =
        $(el).attr("data-video") ||
        $(el).attr("data-video-url") ||
        $(el).attr("data-player");

      if (!src) {
        return;
      }

      var playerUrl =
        resolveUrl(page.url, src);

      if (!playerUrl) {
        return;
      }

      var lower =
        playerUrl.toLowerCase();

      if (
        lower.indexOf(".m3u8") !== -1 ||
        lower.indexOf(".mp4") !== -1
      ) {

        log(
          "DATA MEDIA FOUND: " +
          playerUrl
        );

        addStream(streams, {

          name:
            PROVIDER_NAME +
            " | Direct",

          title:
            "Direct stream",

          url:
            playerUrl,

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

      } else {

        log(
          "DATA PLAYER FOUND: " +
          playerUrl
        );

        addStream(streams, {

          name:
            PROVIDER_NAME +
            " | Server " +
            serverCount++,

          title:
            "Open player",

          externalUrl:
            playerUrl,

          provider:
            "desenefaine"

        });

      }

    }
  );


  log(
    "Extracted " +
    streams.length +
    " stream(s)."
  );

  return streams;
}


// ============================================================
// MAIN
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
    ", Type=" +
    type +
    ", S=" +
    season +
    ", E=" +
    episode
  );


  var isImdb =
    String(id || "").indexOf("tt") === 0;


  // ----------------------------------------------------------
  // TMDB REQUEST
  // ----------------------------------------------------------

  var tmdbUrl;


  if (isImdb) {

    // FIXED:
    // The original code accidentally created:
    //
    // ?external_source=imdb_id?api_key=...
    //
    // which is invalid.

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


  log(
    "TMDB request: " +
    tmdbUrl
  );


  return fetchJson(tmdbUrl)

    .then(function(data) {


      // ------------------------------------------------------
      // GET TITLES
      // ------------------------------------------------------

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
        "TMDB titles: RO=\"" +
        roTitle +
        "\" EN=\"" +
        enTitle +
        "\""
      );


      if (!roTitle && !enTitle) {

        log(
          "TMDB returned no title."
        );

        return [];
      }


      // ------------------------------------------------------
      // FIND DESENESFAINE PAGE
      // ------------------------------------------------------

      return findPage(
        roTitle,
        enTitle,
        type,
        season,
        episode
      );

    })


    // --------------------------------------------------------
    // EXTRACT
    // --------------------------------------------------------

    .then(function(page) {

      if (
        !page ||
        !page.html
      ) {

        log(
          "No valid DeseneFaine page found."
        );

        return [];
      }


      log(
        "Extracting from: " +
        page.url
      );


      return extractStreams(page);

    })


    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    .catch(function(error) {

      log(
        "Fatal Error: " +
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
