// providers/desenefaine.js
// Nuvio scraper for DeseneFaine (RO Dub)
// Fixes: 1) search / page discovery  2) iframe -> direct video URL resolution

const PROVIDER_NAME = "DeseneFaine";
const MAIN_URL = "https://desenefaine.com";

// --- TMDB -------------------------------------------------------------------
// Fill in your key, or leave blank if the incoming id is already a title.
const TMDB_API_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "ro-RO";

// --- Misc -------------------------------------------------------------------
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
};

const SCRAPER_TIMEOUT_MS = 25000;
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
// HTTP layer (fetch -> axios -> node https)
// ============================================================================

let _httpClient = null;

function getHttpClient() {
  if (_httpClient) return _httpClient;

  if (typeof fetch === "function") {
    log("HTTP client: fetch");
    _httpClient = async (url, opts = {}) => {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        : null;
      try {
        const res = await fetch(url, {
          method: "GET",
          headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
          redirect: "follow",
          signal: controller ? controller.signal : undefined,
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
        headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        responseType: "text",
        transformResponse: [(d) => d],
      });
      const text =
        typeof res.data === "string" ? res.data : JSON.stringify(res.data);
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
          { headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) } },
          (res) => {
            if (
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location &&
              (opts._redirects || 0) < 3
            ) {
              res.resume();
              const next = res.headers.location.startsWith("http")
                ? res.headers.location
                : new URL(res.headers.location, url).toString();
              return resolve(
                _httpClient(next, { ...opts, _redirects: (opts._redirects || 0) + 1 })
              );
            }
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (c) => (body += c));
            res.on("end", () =>
              resolve({
                status: res.statusCode,
                ok: res.statusCode >= 200 && res.statusCode < 300,
                text: async () => body,
                json: async () => JSON.parse(body),
              })
            );
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
  const res = await client(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJson(url, headers = {}) {
  const client = getHttpClient();
  const res = await client(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

// ============================================================================
// Helpers
// ============================================================================

function absoluteUrl(url) {
  if (!url) return null;
  url = String(url).trim();
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return MAIN_URL + url;
  return MAIN_URL + "/" + url;
}

function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8211;/g, "–");
}

function stripTags(s) {
  return s ? s.replace(/<[^>]+>/g, "").trim() : "";
}

function guessQuality(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("1080")) return "1080p";
  if (u.includes("720")) return "720p";
  if (u.includes("480")) return "480p";
  if (u.includes("360")) return "360p";
  return "auto";
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
  return /[a-zA-Z]/.test(String(id)) && !looksLikeImdbId(id);
}

async function resolveMeta(id, type, season, episode) {
  if (looksLikeTitle(id)) {
    log(`Incoming id is a title: "${id}"`);
    return { title: String(id), originalTitle: null, year: null, season, episode };
  }

  if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY") {
    log("TMDB key not set, using raw id");
    return { title: String(id), originalTitle: null, year: null, season, episode };
  }

  try {
    let tmdbId = null;
    if (looksLikeImdbId(id)) {
      const findUrl = `${TMDB_BASE}/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=${TMDB_LANG}`;
      const data = await fetchJson(findUrl, { Accept: "application/json" });
      const bucket = type === "movie" ? data.movie_results : data.tv_results;
      if (bucket && bucket.length) tmdbId = bucket[0].id;
    } else if (looksLikeTmdbId(id)) {
      tmdbId = id;
    }

    if (!tmdbId) {
      log(`Could not map ${id} to TMDB`);
      return { title: String(id), originalTitle: null, year: null, season, episode };
    }

    const endpoint = type === "movie" ? "movie" : "tv";
    const url = `${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${TMDB_LANG}`;
    const data = await fetchJson(url, { Accept: "application/json" });

    const title =
      data.title || data.name || data.original_title || data.original_name || null;
    const originalTitle = data.original_title || data.original_name || null;
    const dateStr = data.release_date || data.first_air_date || "";
    const year = dateStr ? dateStr.slice(0, 4) : null;

    log(`TMDB: "${title}" (${year})`);
    return { title, originalTitle, year, season, episode };
  } catch (e) {
    log(`TMDB error: ${e.message}`);
    return { title: String(id), originalTitle: null, year: null, season, episode };
  }
}

function buildSearchQueries(meta, type) {
  const { title, originalTitle, year, season, episode } = meta;
  const out = [];
  const push = (q) => {
    if (q && !out.includes(q)) out.push(q);
  };

  if (title) push(title);
  if (originalTitle && originalTitle !== title) push(originalTitle);
  if (title && year) push(`${title} ${year}`);
  if (title && year) push(`${title} (${year})`);
  if (type === "series" && title && season) {
    push(`${title} sezonul ${season}`);
    if (episode) push(`${title} sezonul ${season} episodul ${episode}`);
  }
  return out;
}

// ============================================================================
// Site search
// ============================================================================

async function trySearchUrl(template, query) {
  const url = template.replace("{q}", encodeURIComponent(query));
  try {
    const html = await fetchText(url, { Referer: MAIN_URL + "/" });
    return { url, html };
  } catch (e) {
    log(`Search URL failed (${url}): ${e.message}`);
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
    log(`Trying search: ${p.replace("{q}", query)}`);
    const result = await trySearchUrl(p, query);
    if (!result || !result.html) continue;
    const candidates = collectCandidates(result.html, query);
    if (candidates.length > 0) {
      log(`  -> best: ${candidates[0].href} (score ${candidates[0].score})`);
      return candidates[0].href;
    }
    log("  -> no candidates");
  }
  return null;
}

function collectCandidates(html, query) {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map();
  let m;
  const qWords = String(query)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  while ((m = linkRegex.exec(html)) !== null) {
    const href = absoluteUrl(m[1]);
    const text = decodeEntities(stripTags(m[2] || "")).toLowerCase();
    if (!href) continue;
    if (!href.startsWith(MAIN_URL)) continue;
    if (href.includes("/category/") || href.includes("/tag/")) continue;
    if (href.includes("/page/") || href.includes("/author/")) continue;
    if (href.includes("?s=")) continue;
    if (href === MAIN_URL || href === MAIN_URL + "/") continue;

    const path = href.replace(MAIN_URL, "").replace(/^\/|\/$/g, "");
    if (!path || path.length < 3) continue;
    if (/\.(png|jpe?g|gif|svg|css|js|ico|webp)$/i.test(path)) continue;

    const slug = decodeURIComponent(path).toLowerCase();
    let score = 0;
    for (const w of qWords) {
      if (slug.includes(w)) score += 5;
      if (text.includes(w)) score += 3;
    }
    if (slug.split("/").length >= 2 || slug.split("-").length >= 3) score += 2;

    const existing = map.get(href);
    if (!existing || existing.score < score) map.set(href, { href, score });
  }

  return [...map.values()].sort((a, b) => b.score - a.score);
}

// ============================================================================
// Iframe / embed resolution  (the critical fix)
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
  return SKIP_HOSTS.some((h) => l.includes(h));
}

// --- OK.ru specific extractor -----------------------------------------------
function extractOkRuVideo(html) {
  if (!/ok\.ru|odnoklassniki/i.test(html)) return null;

  // OK.ru stores video data in a JSON blob: "videoUrl":"...", "hls":"..."
  const patterns = [
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /"hls"\s*:\s*"([^"]+)"/i,
    /"url"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i,
    /"video"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      let url = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      if (url.startsWith("//")) url = "https:" + url;
      if (url.startsWith("http")) return url;
    }
  }
  return null;
}

// --- Generic extractor -------------------------------------------------------
function extractVideoUrlFromHtml(html) {
  if (!html) return null;

  // OK.ru first
  const ok = extractOkRuVideo(html);
  if (ok) return ok;

  // <source src="...mp4|m3u8">
  let m = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
  if (m) return m[1];

  // file: "..." / "file":"..."
  m = html.match(/["']?file["']?\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
  if (m) return m[1];

  // sources: [{file:"..."}]
  m = html.match(
    /(?:sources|source)\s*:\s*\[\s*\{[^}]*?["']?(?:file|src)["']?\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i
  );
  if (m) return m[1];

  // jwplayer playlist
  m = html.match(/["']?playlist["']?\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
  if (m) return m[1];

  // Any bare .mp4/.m3u8 URL
  m = html.match(/https?:\/\/[^"'\s<>\\]+\.(?:mp4|m3u8)[^"'\s<>\\]*/i);
  if (m) return m[0];

  return null;
}

async function resolveIframe(iframeUrl, referer) {
  try {
    log(`Resolving iframe: ${iframeUrl}`);
    const html = await fetchText(iframeUrl, { Referer: referer });
    const videoUrl = extractVideoUrlFromHtml(html);
    if (!videoUrl) {
      log(`No video URL found in iframe: ${iframeUrl}`);
      // Log a snippet to help debugging (first 500 chars of body)
      log(`Iframe body preview: ${html.slice(0, 500).replace(/\s+/g, " ")}`);
      return null;
    }
    log(`Resolved -> ${videoUrl}`);
    return absoluteUrl(videoUrl);
  } catch (e) {
    log(`Iframe resolve failed (${iframeUrl}): ${e.message}`);
    return null;
  }
}

// ============================================================================
// Page extraction
// ============================================================================

function extractIframes(html) {
  const out = [];
  const tagRegex = /<iframe\b[^>]*>/gi;
  const tagMatches = html.match(tagRegex) || [];
  for (const tag of tagMatches) {
    const srcMatch = tag.match(
      /(?:src|data-src|data-lazy-src|data-url|data-embed)=["']([^"']+)["']/i
    );
    if (!srcMatch) continue;
    const src = absoluteUrl(srcMatch[1]);
    if (!src || shouldSkipIframe(src)) continue;
    out.push(src);
  }
  return [...new Set(out)];
}

function extractDirectLinks(html) {
  const out = [];
  const regex =
    /(?:src|href|file)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const u = absoluteUrl(m[1]);
    if (u) out.push(u);
  }
  return [...new Set(out)];
}

// ============================================================================
// Core scraper
// ============================================================================

async function processPage(pageUrl, streams) {
  let html;
  try {
    html = await fetchText(pageUrl, { Referer: MAIN_URL + "/" });
  } catch (e) {
    log(`Page fetch failed (${pageUrl}): ${e.message}`);
    return;
  }

  const baseHeaders = {
    Referer: pageUrl,
    "User-Agent": USER_AGENT,
    Origin: MAIN_URL,
  };

  // 1. Direct links on the page (rare but possible)
  for (const url of extractDirectLinks(html)) {
    streams.push({
      name: PROVIDER_NAME,
      title: `${guessQuality(url)} | RO Dub`,
      url,
      quality: guessQuality(url),
      headers: baseHeaders,
      provider: "desenefaine",
    });
  }

  // 2. Iframes -> resolve to direct URLs
  const iframes = extractIframes(html);
  log(`Found ${iframes.length} iframe(s) on ${pageUrl}`);

  const resolved = await Promise.all(
    iframes.map((src) => resolveIframe(src, pageUrl))
  );

  for (const videoUrl of resolved) {
    if (!videoUrl) continue;
    streams.push({
      name: PROVIDER_NAME,
      title: `${guessQuality(videoUrl)} | RO Dub`,
      url: videoUrl,
      quality: guessQuality(videoUrl),
      headers: baseHeaders,
      provider: "desenefaine",
    });
  }
}

async function actualGetStreams(id, type, season, episode) {
  const streams = [];
  log(`Invoked id=${id} type=${type} s=${season} e=${episode}`);

  const meta = await resolveMeta(id, type, season, episode);
  const queries = buildSearchQueries(meta, type);
  log(`Queries: ${JSON.stringify(queries)}`);

  let pageUrl = null;
  for (const q of queries) {
    pageUrl = await searchSite(q);
    if (pageUrl) break;
  }

  if (!pageUrl) {
    log("No matching page found.");
    return [];
  }

  log(`Using page: ${pageUrl}`);
  await processPage(pageUrl, streams);

  const seen = new Set();
  const deduped = streams.filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  log(`Returning ${deduped.length} stream(s)`);
  return deduped;
}

async function getStreams(id, type, season, episode) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Scraper timeout after ${SCRAPER_TIMEOUT_MS}ms`)),
      SCRAPER_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([
      actualGetStreams(id, type, season, episode),
      timeout,
    ]);
  } catch (e) {
    log(`Fatal: ${e.message}`);
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { getStreams };
