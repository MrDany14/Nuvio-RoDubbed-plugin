// providers/desenefaine.js
// Nuvio scraper for DeseneFaine (RO Dub)
//
// Discovery/search logic intentionally kept close to the original working
// version. The main change is iframe/player resolution.
//
// Flow:
// Nuvio IMDb ID
//    -> TMDB
//    -> Romanian title
//    -> DeseneFaine search
//    -> episode page
//    -> iframe
//    -> Player4Me / StreamP2P / SeekStreaming resolver
//    -> actual stream URL

const PROVIDER_NAME = "DeseneFaine";
const MAIN_URL = "https://desenefaine.com";

// TMDB
const TMDB_API_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "ro-RO";

// Misc
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
};

const SCRAPER_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_MS = 12000;

// ============================================================================
// Logging
// ============================================================================

function log(msg) {
  try {
    console.log(`[${PROVIDER_NAME}] ${msg}`);
  } catch (_) {}
}

// ============================================================================
// HTTP layer
// ============================================================================

let _httpClient = null;

function getHttpClient() {
  if (_httpClient) return _httpClient;

  if (typeof fetch === "function") {
    log("HTTP client: fetch");

    _httpClient = async (url, opts = {}) => {
      const controller =
        typeof AbortController !== "undefined"
          ? new AbortController()
          : null;

      const timer = controller
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;

      try {
        const res = await fetch(url, {
          method: opts.method || "GET",
          headers: {
            ...DEFAULT_HEADERS,
            ...(opts.headers || {}),
          },
          redirect: "follow",
          signal: controller ? controller.signal : undefined,
          body: opts.body,
        });

        const text = await res.text();

        return {
          status: res.status,
          ok: res.ok,
          text: async () => text,
          json: async () => JSON.parse(text),
        };
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    return _httpClient;
  }

  try {
    const axios = require("axios");

    log("HTTP client: axios");

    _httpClient = async (url, opts = {}) => {
      const res = await axios.get(url, {
        headers: {
          ...DEFAULT_HEADERS,
          ...(opts.headers || {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: "text",
        transformResponse: [(d) => d],
      });

      const text =
        typeof res.data === "string"
          ? res.data
          : JSON.stringify(res.data);

      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        text: async () => text,
        json: async () => JSON.parse(text),
      };
    };

    return _httpClient;
  } catch (_) {}

  try {
    const https = require("https");
    const http = require("http");

    log("HTTP client: node http");

    _httpClient = (url, opts = {}) =>
      new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https : http;

        const req = lib.get(
          url,
          {
            headers: {
              ...DEFAULT_HEADERS,
              ...(opts.headers || {}),
            },
          },
          (res) => {
            if (
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location &&
              (opts._redirects || 0) < 5
            ) {
              res.resume();

              const next = res.headers.location.startsWith("http")
                ? res.headers.location
                : new URL(res.headers.location, url).toString();

              return resolve(
                _httpClient(next, {
                  ...opts,
                  _redirects: (opts._redirects || 0) + 1,
                })
              );
            }

            let body = "";

            res.setEncoding("utf8");

            res.on("data", (c) => {
              body += c;
            });

            res.on("end", () => {
              resolve({
                status: res.statusCode,
                ok:
                  res.statusCode >= 200 &&
                  res.statusCode < 300,
                text: async () => body,
                json: async () => JSON.parse(body),
              });
            });
          }
        );

        req.on("error", reject);

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
          req.destroy(new Error("request timeout"));
        });
      });

    return _httpClient;
  } catch (_) {}

  throw new Error("No HTTP client available");
}

async function fetchText(url, headers = {}) {
  const client = getHttpClient();

  const res = await client(url, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

async function fetchJson(url, headers = {}) {
  const client = getHttpClient();

  const res = await client(url, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.json();
}

// ============================================================================
// Helpers
// ============================================================================

function absoluteUrl(url, base = MAIN_URL) {
  if (!url) return null;

  url = String(url).trim();

  if (!url) return null;

  if (url.startsWith("//")) {
    return "https:" + url;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("/")) {
    return MAIN_URL + url;
  }

  // Preserve the original scraper's behavior for DeseneFaine-relative URLs.
  if (base === MAIN_URL || base === MAIN_URL + "/") {
    return MAIN_URL + "/" + url;
  }

  try {
    return new URL(url, base).toString();
  } catch (_) {
    return MAIN_URL + "/" + url;
  }
}

function decodeEntities(s) {
  if (!s) return s;

  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–");
}

function decodeJsUrl(s) {
  if (!s) return s;

  return decodeEntities(String(s))
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\u003f/gi, "?")
    .replace(/\\"/g, '"');
}

function stripTags(s) {
  return s
    ? s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch (_) {
    const m = String(url || "").match(
      /^(https?:\/\/[^\/?#]+)/i
    );

    return m ? m[1] : MAIN_URL;
  }
}

function getHost(url) {
  try {
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function guessQuality(url) {
  const u = (url || "").toLowerCase();

  if (u.includes("2160") || u.includes("4k")) return "4K";
  if (u.includes("1440")) return "1440p";
  if (u.includes("1080")) return "1080p";
  if (u.includes("720")) return "720p";
  if (u.includes("576")) return "576p";
  if (u.includes("480")) return "480p";
  if (u.includes("360")) return "360p";

  return "auto";
}

function looksLikePlayableUrl(url) {
  if (!url) return false;

  const u = String(url).toLowerCase();

  return (
    u.includes(".m3u8") ||
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mkv") ||
    u.includes("/master") ||
    u.includes("/playlist") ||
    u.includes("/hls/") ||
    u.includes("/stream/")
  );
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

// ============================================================================
// TMDB
// ============================================================================

function looksLikeTmdbId(id) {
  return /^\d+$/.test(String(id));
}

function looksLikeImdbId(id) {
  return /^tt\d+$/i.test(String(id));
}

function looksLikeTitle(id) {
  return (
    /[a-zA-Z]/.test(String(id)) &&
    !looksLikeImdbId(id)
  );
}

async function resolveMeta(id, type, season, episode) {
  if (looksLikeTitle(id)) {
    log(`Incoming id is a title: "${id}"`);

    return {
      title: String(id),
      originalTitle: null,
      year: null,
      season,
      episode,
    };
  }

  if (
    !TMDB_API_KEY ||
    TMDB_API_KEY === "YOUR_TMDB_API_KEY"
  ) {
    log("TMDB key not set, using raw id");

    return {
      title: String(id),
      originalTitle: null,
      year: null,
      season,
      episode,
    };
  }

  try {
    let tmdbId = null;

    // Nuvio normally gives us IMDb ids here.
    if (looksLikeImdbId(id)) {
      log(`Resolving IMDb id through TMDB: ${id}`);

      const findUrl =
        `${TMDB_BASE}/find/${id}` +
        `?api_key=${TMDB_API_KEY}` +
        `&external_source=imdb_id` +
        `&language=${TMDB_LANG}`;

      const data = await fetchJson(findUrl, {
        Accept: "application/json",
      });

      const bucket =
        type === "movie"
          ? data.movie_results
          : data.tv_results;

      if (bucket && bucket.length) {
        tmdbId = bucket[0].id;
      }
    } else if (looksLikeTmdbId(id)) {
      tmdbId = id;
    }

    if (!tmdbId) {
      log(`Could not map ${id} to TMDB`);

      return {
        title: String(id),
        originalTitle: null,
        year: null,
        season,
        episode,
      };
    }

    const endpoint =
      type === "movie"
        ? "movie"
        : "tv";

    const url =
      `${TMDB_BASE}/${endpoint}/${tmdbId}` +
      `?api_key=${TMDB_API_KEY}` +
      `&language=${TMDB_LANG}`;

    const data = await fetchJson(url, {
      Accept: "application/json",
    });

    const title =
      data.title ||
      data.name ||
      data.original_title ||
      data.original_name ||
      null;

    const originalTitle =
      data.original_title ||
      data.original_name ||
      null;

    const dateStr =
      data.release_date ||
      data.first_air_date ||
      "";

    const year = dateStr
      ? dateStr.slice(0, 4)
      : null;

    log(`TMDB: "${title}" (${year})`);

    return {
      title,
      originalTitle,
      year,
      season,
      episode,
    };
  } catch (e) {
    log(`TMDB error: ${e.message}`);

    return {
      title: String(id),
      originalTitle: null,
      year: null,
      season,
      episode,
    };
  }
}

function buildSearchQueries(meta, type) {
  const {
    title,
    originalTitle,
    year,
    season,
    episode,
  } = meta;

  const out = [];

  const push = (q) => {
    if (q && !out.includes(q)) {
      out.push(q);
    }
  };

  if (title) {
    push(title);
  }

  if (
    originalTitle &&
    originalTitle !== title
  ) {
    push(originalTitle);
  }

  if (title && year) {
    push(`${title} ${year}`);
    push(`${title} (${year})`);
  }

  // Nuvio uses "tv", not "series".
  if (
    (type === "tv" || type === "series") &&
    title &&
    season
  ) {
    push(`${title} sezonul ${season}`);

    if (episode) {
      push(
        `${title} sezonul ${season} episodul ${episode}`
      );

      push(
        `${title} S${String(season).padStart(2, "0")}E${String(
          episode
        ).padStart(2, "0")}`
      );
    }
  }

  return out;
}

// ============================================================================
// Site search
// ============================================================================

async function trySearchUrl(template, query) {
  const url = template.replace(
    "{q}",
    encodeURIComponent(query)
  );

  try {
    const html = await fetchText(url, {
      Referer: MAIN_URL + "/",
    });

    return {
      url,
      html,
    };
  } catch (e) {
    log(
      `Search URL failed (${url}): ${e.message}`
    );

    return null;
  }
}

async function searchSite(query) {
  const patterns = [
    `${MAIN_URL}/?s={q}`,
    `${MAIN_URL}/cauta/{q}/`,
    `${MAIN_URL}/search/{q}/`,
  ];

  for (const p of patterns) {
    log(
      `Trying search: ${p.replace(
        "{q}",
        query
      )}`
    );

    const result =
      await trySearchUrl(
        p,
        query
      );

    if (!result || !result.html) {
      continue;
    }

    const candidates =
      collectCandidates(
        result.html,
        query
      );

    if (candidates.length > 0) {
      log(
        `  -> best: ${candidates[0].href} ` +
          `(score ${candidates[0].score})`
      );

      return candidates[0].href;
    }

    log("  -> no candidates");
  }

  return null;
}

function collectCandidates(html, query) {
  const linkRegex =
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  const map = new Map();

  let m;

  const qWords = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  while (
    (m = linkRegex.exec(html)) !== null
  ) {
    const href =
      absoluteUrl(m[1]);

    const text =
      decodeEntities(
        stripTags(m[2] || "")
      ).toLowerCase();

    if (!href) continue;

    if (!href.startsWith(MAIN_URL)) {
      continue;
    }

    if (
      href.includes("/category/") ||
      href.includes("/tag/")
    ) {
      continue;
    }

    if (
      href.includes("/page/") ||
      href.includes("/author/")
    ) {
      continue;
    }

    if (href.includes("?s=")) {
      continue;
    }

    if (
      href === MAIN_URL ||
      href === MAIN_URL + "/"
    ) {
      continue;
    }

    const path = href
      .replace(MAIN_URL, "")
      .replace(/^\/|\/$/g, "");

    if (!path || path.length < 3) {
      continue;
    }

    if (
      /\.(png|jpe?g|gif|svg|css|js|ico|webp)$/i.test(
        path
      )
    ) {
      continue;
    }

    let slug;

    try {
      slug =
        decodeURIComponent(
          path
        ).toLowerCase();
    } catch (_) {
      slug = path.toLowerCase();
    }

    let score = 0;

    for (const w of qWords) {
      if (slug.includes(w)) {
        score += 5;
      }

      if (text.includes(w)) {
        score += 3;
      }
    }

    if (
      slug.split("/").length >= 2 ||
      slug.split("-").length >= 3
    ) {
      score += 2;
    }

    // DeseneFaine episode pages use /epi/
    if (href.includes("/epi/")) {
      score += 5;
    }

    const existing =
      map.get(href);

    if (
      !existing ||
      existing.score < score
    ) {
      map.set(href, {
        href,
        score,
      });
    }
  }

  return [...map.values()].sort(
    (a, b) =>
      b.score - a.score
  );
}

// ============================================================================
// IFRAME / EMBED RESOLUTION
// ============================================================================

const SKIP_HOSTS = [
  "facebook.com",
  "youtube.com",
  "youtu.be",
  "doubleclick.net",
  "googletagmanager.com",
  "google-analytics.com",
  "disqus.com",
  "twitter.com",
  "instagram.com",
];

function shouldSkipIframe(src) {
  const l = src.toLowerCase();

  return SKIP_HOSTS.some((h) =>
    l.includes(h)
  );
}

// ============================================================================
// StreamEmbed hosts
//
// DeseneFaine currently uses hosts from the StreamEmbed family:
//
//   Player4Me
//   StreamP2P
//   SeekStreaming
//
// These hosts provide an /e/{filecode} player page.
// Their resolver API is:
//
//   /api/v1/video?id={filecode}&w=2048&h=1152&r=
//
// The response is encrypted and contains the actual stream/master URL.
//
// IMPORTANT:
// Discovery is completely independent from this resolver.
// If this resolver fails, the DeseneFaine page discovery still works.
// ============================================================================

const STREAMEMBED_HOSTS = [
  "player4me.com",
  "streamp2p.com",
  "seekstreaming.com",
];

const STREAMEMBED_KEY_HEX =
  "6b69656d7469656e6d75613931316361";

const STREAMEMBED_IV_HEX =
  "313233343536373839306f6975797472";

function isStreamEmbedHost(url) {
  const host = getHost(url);

  return STREAMEMBED_HOSTS.some(
    (h) =>
      host === h ||
      host.endsWith("." + h)
  );
}

function extractStreamEmbedFilecode(url) {
  if (!url) return null;

  const clean =
    String(url).split("#")[0];

  // /e/FILECODE
  let m = clean.match(
    /\/e\/([^\/?#]+)/i
  );

  if (m && m[1]) {
    return decodeURIComponentSafe(
      m[1]
    );
  }

  // /embed/FILECODE
  m = clean.match(
    /\/embed\/([^\/?#]+)/i
  );

  if (m && m[1]) {
    return decodeURIComponentSafe(
      m[1]
    );
  }

  // Some embeds may have ?id=FILECODE
  try {
    const parsed =
      new URL(url);

    const id =
      parsed.searchParams.get("id");

    if (id) {
      return id;
    }
  } catch (_) {}

  return null;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

// -----------------------------------------------------------------------------
// AES decrypt
// -----------------------------------------------------------------------------

function decryptStreamEmbedResponse(cipherText) {
  if (!cipherText) {
    throw new Error(
      "Empty encrypted response"
    );
  }

  cipherText =
    String(cipherText).trim();

  // Some versions may return JSON directly.
  if (
    cipherText.startsWith("{") &&
    cipherText.endsWith("}")
  ) {
    return JSON.parse(cipherText);
  }

  let CryptoJS;

  try {
    CryptoJS =
      require("crypto-js");
  } catch (e) {
    throw new Error(
      "crypto-js unavailable: " +
        e.message
    );
  }

  const key =
    CryptoJS.enc.Hex.parse(
      STREAMEMBED_KEY_HEX
    );

  const iv =
    CryptoJS.enc.Hex.parse(
      STREAMEMBED_IV_HEX
    );

  const cipherParams =
    CryptoJS.lib.CipherParams.create({
      ciphertext:
        CryptoJS.enc.Hex.parse(
          cipherText
        ),
    });

  const decrypted =
    CryptoJS.AES.decrypt(
      cipherParams,
      key,
      {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

  const plaintext =
    decrypted.toString(
      CryptoJS.enc.Utf8
    );

  if (!plaintext) {
    throw new Error(
      "AES decrypted to empty string"
    );
  }

  try {
    return JSON.parse(
      plaintext
    );
  } catch (e) {
    throw new Error(
      "Decrypted response is not JSON: " +
        plaintext.slice(0, 200)
    );
  }
}

// -----------------------------------------------------------------------------
// Resolve Player4Me / StreamP2P / SeekStreaming
// -----------------------------------------------------------------------------

async function resolveStreamEmbed(
  iframeUrl,
  referer
) {
  try {
    const host =
      getHost(iframeUrl);

    const origin =
      getOrigin(iframeUrl);

    const filecode =
      extractStreamEmbedFilecode(
        iframeUrl
      );

    log(
      `StreamEmbed detected: ${iframeUrl}`
    );

    if (!filecode) {
      log(
        `Could not extract filecode from ${iframeUrl}`
      );

      return null;
    }

    log(
      `StreamEmbed filecode: ${filecode}`
    );

    const apiUrl =
      `${origin}/api/v1/video` +
      `?id=${encodeURIComponent(filecode)}` +
      `&w=2048&h=1152&r=`;

    log(
      `StreamEmbed API: ${apiUrl}`
    );

    const encrypted =
      await fetchText(
        apiUrl,
        {
          Referer:
            iframeUrl,
          Origin:
            origin,
          Accept:
            "text/plain,application/json,*/*",
        }
      );

    log(
      `StreamEmbed response length: ${encrypted.length}`
    );

    const data =
      decryptStreamEmbedResponse(
        encrypted
      );

    log(
      `StreamEmbed decrypted keys: ${Object.keys(
        data || {}
      ).join(", ")}`
    );

    let videoUrl =
      data &&
      (
        data.source ||
        data.master ||
        data.masterUrl ||
        data.url ||
        data.stream ||
        data.file
      );

    if (!videoUrl) {
      log(
        "StreamEmbed response contains no source/master/url"
      );

      log(
        `Decrypted data preview: ${JSON.stringify(
          data
        ).slice(0, 500)}`
      );

      return null;
    }

    videoUrl =
      decodeJsUrl(
        videoUrl
      );

    if (
      videoUrl.startsWith("//")
    ) {
      videoUrl =
        "https:" +
        videoUrl;
    }

    if (
      videoUrl.startsWith("/")
    ) {
      videoUrl =
        origin +
        videoUrl;
    }

    if (
      !/^https?:\/\//i.test(
        videoUrl
      )
    ) {
      log(
        `Rejected invalid stream URL: ${videoUrl}`
      );

      return null;
    }

    log(
      `StreamEmbed RESOLVED: ${videoUrl}`
    );

    return {
      url: videoUrl,

      headers: {
        Referer:
          iframeUrl,
        Origin:
          origin,
        "User-Agent":
          USER_AGENT,
      },

      quality:
        guessQuality(
          videoUrl
        ),

      host,
    };
  } catch (e) {
    log(
      `StreamEmbed resolve failed (${iframeUrl}): ${e.message}`
    );

    return null;
  }
}

// ============================================================================
// OK.ru extractor
// ============================================================================

function extractOkRuVideo(html) {
  if (
    !/ok\.ru|odnoklassniki/i.test(
      html
    )
  ) {
    return null;
  }

  const patterns = [
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /"hls"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i,
    /"video"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i,
  ];

  for (const re of patterns) {
    const m =
      html.match(re);

    if (
      m &&
      m[1]
    ) {
      let url =
        decodeJsUrl(
          m[1]
        );

      if (
        url.startsWith("//")
      ) {
        url =
          "https:" +
          url;
      }

      if (
        url.startsWith("http")
      ) {
        return url;
      }
    }
  }

  return null;
}

// ============================================================================
// Generic direct video extractor
// ============================================================================

function extractVideoUrlFromHtml(
  html,
  baseUrl
) {
  if (!html) return null;

  // OK.ru first
  const ok =
    extractOkRuVideo(
      html
    );

  if (ok) {
    return ok;
  }

  let m;

  // <source src="...">
  m = html.match(
    /<source[^>]+src=["']([^"']+)["']/i
  );

  if (m) {
    const url =
      decodeJsUrl(
        m[1]
      );

    if (
      looksLikePlayableUrl(
        url
      )
    ) {
      return absoluteUrl(
        url,
        baseUrl
      );
    }
  }

  // file: "..."
  m = html.match(
    /["']?file["']?\s*[:=]\s*["']([^"']+)["']/i
  );

  if (m) {
    const url =
      decodeJsUrl(
        m[1]
      );

    if (
      looksLikePlayableUrl(
        url
      )
    ) {
      return absoluteUrl(
        url,
        baseUrl
      );
    }
  }

  // sources: [{file:"..."}]
  m = html.match(
    /(?:sources|source)\s*:\s*\[\s*\{[^}]*?["']?(?:file|src|url)["']?\s*:\s*["']([^"']+)["']/i
  );

  if (m) {
    const url =
      decodeJsUrl(
        m[1]
      );

    if (
      looksLikePlayableUrl(
        url
      )
    ) {
      return absoluteUrl(
        url,
        baseUrl
      );
    }
  }

  // jwplayer playlist
  m = html.match(
    /["']?playlist["']?\s*[:=]\s*["']([^"']+)["']/i
  );

  if (m) {
    const url =
      decodeJsUrl(
        m[1]
      );

    if (
      looksLikePlayableUrl(
        url
      )
    ) {
      return absoluteUrl(
        url,
        baseUrl
      );
    }
  }

  // Any bare .mp4/.m3u8 URL
  m = html.match(
    /https?:\/\/[^"'\s<>\\]+\.(?:mp4|m3u8)(?:\?[^"'\s<>\\]*)?/i
  );

  if (m) {
    return decodeJsUrl(
      m[0]
    );
  }

  return null;
}

// ============================================================================
// Generic nested iframe resolver
// ============================================================================

async function resolveNestedIframe(
  iframeUrl,
  referer,
  depth = 0
) {
  if (depth > 3) {
    log(
      `Nested iframe depth exceeded: ${iframeUrl}`
    );

    return null;
  }

  try {
    log(
      `Resolving nested iframe ${depth}: ${iframeUrl}`
    );

    // StreamEmbed hosts should always go through their API.
    if (
      isStreamEmbedHost(
        iframeUrl
      )
    ) {
      return await resolveStreamEmbed(
        iframeUrl,
        referer
      );
    }

    const html =
      await fetchText(
        iframeUrl,
        {
          Referer:
            referer ||
            MAIN_URL + "/",
        }
      );

    // First try direct stream extraction.
    const direct =
      extractVideoUrlFromHtml(
        html,
        iframeUrl
      );

    if (direct) {
      log(
        `Nested iframe direct stream: ${direct}`
      );

      return {
        url: direct,
        headers: {
          Referer:
            iframeUrl,
          Origin:
            getOrigin(
              iframeUrl
            ),
          "User-Agent":
            USER_AGENT,
        },
        quality:
          guessQuality(
            direct
          ),
      };
    }

    // Then look for another iframe.
    const nested =
      extractIframes(
        html,
        iframeUrl
      );

    for (const src of nested) {
      if (
        shouldSkipIframe(
          src
        )
      ) {
        continue;
      }

      const result =
        await resolveNestedIframe(
          src,
          iframeUrl,
          depth + 1
        );

      if (
        result &&
        result.url
      ) {
        return result;
      }
    }

    log(
      `No stream found in nested iframe: ${iframeUrl}`
    );

    return null;
  } catch (e) {
    log(
      `Nested iframe failed (${iframeUrl}): ${e.message}`
    );

    return null;
  }
}

// ============================================================================
// Main iframe resolver
// ============================================================================

async function resolveIframe(
  iframeUrl,
  referer
) {
  try {
    log(
      `Resolving iframe: ${iframeUrl}`
    );

    // IMPORTANT:
    // Do this BEFORE downloading the iframe.
    // Player4Me / StreamP2P / SeekStreaming pages do not necessarily
    // expose the actual m3u8 directly in their HTML.
    if (
      isStreamEmbedHost(
        iframeUrl
      )
    ) {
      const stream =
        await resolveStreamEmbed(
          iframeUrl,
          referer
        );

      if (stream) {
        return stream;
      }

      log(
        `StreamEmbed API resolver failed; trying generic iframe fallback`
      );
    }

    // Generic fallback
    const result =
      await resolveNestedIframe(
        iframeUrl,
        referer,
        0
      );

    return result;
  } catch (e) {
    log(
      `Iframe resolve failed (${iframeUrl}): ${e.message}`
    );

    return null;
  }
}

// ============================================================================
// Page extraction
// ============================================================================

function extractIframes(
  html,
  baseUrl = MAIN_URL
) {
  const out = [];

  const tagRegex =
    /<iframe\b[^>]*>/gi;

  const tagMatches =
    html.match(
      tagRegex
    ) || [];

  for (const tag of tagMatches) {
    const srcMatch =
      tag.match(
        /(?:src|data-src|data-lazy-src|data-url|data-embed|data-player)=["']([^"']+)["']/i
      );

    if (!srcMatch) {
      continue;
    }

    const raw =
      decodeJsUrl(
        srcMatch[1]
      );

    const src =
      absoluteUrl(
        raw,
        baseUrl
      );

    if (!src) {
      continue;
    }

    if (
      shouldSkipIframe(
        src
      )
    ) {
      continue;
    }

    out.push(src);
  }

  return unique(
    out
  );
}

function extractDirectLinks(
  html,
  baseUrl = MAIN_URL
) {
  const out = [];

  const regex =
    /(?:src|href|file)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)(?:\?[^"']*)?)["']/gi;

  let m;

  while (
    (m = regex.exec(html)) !== null
  ) {
    const u =
      absoluteUrl(
        decodeJsUrl(
          m[1]
        ),
        baseUrl
      );

    if (u) {
      out.push(u);
    }
  }

  return unique(
    out
  );
}

// ============================================================================
// Page processing
// ============================================================================

async function processPage(
  pageUrl,
  streams
) {
  let html;

  try {
    html =
      await fetchText(
        pageUrl,
        {
          Referer:
            MAIN_URL + "/",
        }
      );
  } catch (e) {
    log(
      `Page fetch failed (${pageUrl}): ${e.message}`
    );

    return;
  }

  // Keep DeseneFaine as the initial referer.
  const baseHeaders = {
    Referer:
      pageUrl,
    "User-Agent":
      USER_AGENT,
    Origin:
      MAIN_URL,
  };

  // --------------------------------------------------------------------------
  // 1. Direct links on page
  // --------------------------------------------------------------------------

  for (
    const url of extractDirectLinks(
      html,
      pageUrl
    )
  ) {
    streams.push({
      name:
        PROVIDER_NAME,

      title:
        `${guessQuality(
          url
        )} | RO Dub`,

      url,

      quality:
        guessQuality(
          url
        ),

      headers:
        baseHeaders,

      provider:
        "desenefaine",
    });
  }

  // --------------------------------------------------------------------------
  // 2. Iframes
  // --------------------------------------------------------------------------

  const iframes =
    extractIframes(
      html,
      pageUrl
    );

  log(
    `Found ${iframes.length} iframe(s) on ${pageUrl}`
  );

  if (!iframes.length) {
    log(
      "No iframe found on page."
    );

    log(
      `Page preview: ${html
        .slice(0, 1000)
        .replace(/\s+/g, " ")}`
    );
  }

  const resolved =
    await Promise.all(
      iframes.map(
        (src) =>
          resolveIframe(
            src,
            pageUrl
          )
      )
    );

  for (
    const result of resolved
  ) {
    if (
      !result ||
      !result.url
    ) {
      continue;
    }

    if (
      !looksLikePlayableUrl(
        result.url
      )
    ) {
      log(
        `Rejected non-playable result: ${result.url}`
      );

      continue;
    }

    // IMPORTANT:
    // Use the HOST iframe as Referer for the actual stream,
    // not DeseneFaine.
    //
    // This is important for Player4Me/StreamP2P/SeekStreaming.
    const headers =
      result.headers ||
      baseHeaders;

    streams.push({
      name:
        PROVIDER_NAME,

      title:
        `${guessQuality(
          result.url
        )} | RO Dub`,

      url:
        result.url,

      quality:
        result.quality ||
        guessQuality(
          result.url
        ),

      headers,

      provider:
        "desenefaine",
    });
  }
}

// ============================================================================
// Core scraper
// ============================================================================

async function actualGetStreams(
  id,
  type,
  season,
  episode
) {
  const streams = [];

  log(
    `Invoked id=${id} type=${type} s=${season} e=${episode}`
  );

  // --------------------------------------------------------------------------
  // 1. IMDb/TMDB resolution
  // --------------------------------------------------------------------------

  const meta =
    await resolveMeta(
      id,
      type,
      season,
      episode
    );

  // --------------------------------------------------------------------------
  // 2. Build DeseneFaine search queries
  // --------------------------------------------------------------------------

  const queries =
    buildSearchQueries(
      meta,
      type
    );

  log(
    `Queries: ${JSON.stringify(
      queries
    )}`
  );

  // --------------------------------------------------------------------------
  // 3. Find actual DeseneFaine page
  // --------------------------------------------------------------------------

  let pageUrl =
    null;

  for (
    const q of queries
  ) {
    pageUrl =
      await searchSite(
        q
      );

    if (pageUrl) {
      break;
    }
  }

  if (!pageUrl) {
    log(
      "No matching page found."
    );

    return [];
  }

  log(
    `Using page: ${pageUrl}`
  );

  // --------------------------------------------------------------------------
  // 4. Resolve players
  // --------------------------------------------------------------------------

  await processPage(
    pageUrl,
    streams
  );

  // --------------------------------------------------------------------------
  // 5. Deduplicate
  // --------------------------------------------------------------------------

  const seen =
    new Set();

  const deduped =
    streams.filter(
      (s) => {
        if (
          !s.url ||
          seen.has(
            s.url
          )
        ) {
          return false;
        }

        seen.add(
          s.url
        );

        return true;
      }
    );

  log(
    `Returning ${deduped.length} stream(s)`
  );

  for (
    const stream of deduped
  ) {
    log(
      `STREAM -> ${stream.url}`
    );
  }

  return deduped;
}

// ============================================================================
// Public Nuvio entry point
// ============================================================================

async function getStreams(
  id,
  type,
  season,
  episode
) {
  let timeoutId;

  const timeout =
    new Promise(
      (_, reject) => {
        timeoutId =
          setTimeout(
            () =>
              reject(
                new Error(
                  `Scraper timeout after ${SCRAPER_TIMEOUT_MS}ms`
                )
              ),
            SCRAPER_TIMEOUT_MS
          );
      }
    );

  try {
    return await Promise.race([
      actualGetStreams(
        id,
        type,
        season,
        episode
      ),
      timeout,
    ]);
  } catch (e) {
    log(
      `Fatal: ${e.message}`
    );

    return [];
  } finally {
    clearTimeout(
      timeoutId
    );
  }
}

module.exports = {
  getStreams,
};
