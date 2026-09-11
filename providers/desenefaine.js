// providers/desenefaine.js
// Nuvio scraper for DeseneFaine (RO Dub)
// TMDB ID -> title lookup -> site search -> iframe resolution -> direct streams.

const PROVIDER_NAME = "DeseneFaine";
const MAIN_URL = "https://desenefaine.com";

// TMDB configuration. Replace with your own key or pull it from your
// plugin's manifest/config if Nuvio exposes one.
const TMDB_API_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "ro-RO"; // Change to "en-US" if you prefer English titles.

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
};

const SCRAPER_TIMEOUT_MS = 20000;

// ---------------------------------------------------------------------------
// Logging & small helpers
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[${PROVIDER_NAME}] ${msg}`);
}

function absoluteUrl(url) {
  if (!url) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http")) return url;
  return MAIN_URL + (url.startsWith("/") ? "" : "/") + url;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { ...DEFAULT_HEADERS, ...headers },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

// ---------------------------------------------------------------------------
// TMDB resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a TMDB id into a search-friendly title + year.
 * Nuvio passes the TMDB id as `id`, and `type` is "movie" or "series".
 */
async function resolveTmdb(id, type, season, episode) {
  if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY") {
    log("TMDB API key is not configured — falling back to raw id");
    return { title: String(id), year: null, season, episode };
  }

  const endpoint = type === "movie" ? "movie" : "tv";
  const url = `${TMDB_BASE}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=${TMDB_LANG}`;

  try {
    const data = await fetchJson(url);
    const title = data.title || data.name || data.original_title || data.original_name;
    const original =
      data.original_title || data.original_name || data.title || data.name;
    const dateStr = data.release_date || data.first_air_date || "";
    const year = dateStr ? dateStr.slice(0, 4) : null;

    log(`TMDB resolved: "${title}" (${year}) original="${original}"`);

    return {
      title,
      originalTitle: original,
      year,
      season,
      episode,
    };
  } catch (e) {
    log(`TMDB lookup failed for ${id}: ${e.message}`);
    return { title: String(id), year: null, season, episode };
  }
}

/**
 * Produce a prioritized list of search queries to try against the site.
 * DeseneFaine uses Romanian titles, so the localized TMDB title is first.
 */
function buildSearchQueries(meta, type) {
  const queries = [];
  const { title, originalTitle, year, season, episode } = meta;

  // For TV shows, the site likely groups all episodes under one page.
  // Include season/episode hints in a second pass only if needed.
  if (title) queries.push(title);
  if (originalTitle && originalTitle !== title) queries.push(originalTitle);
  if (title && year) queries.push(`${title} ${year}`);
  if (title && year) queries.push(`${title} (${year})`);
  if (type === "series" && season && episode) {
    queries.push(`${title} sezonul ${season}`);
    queries.push(`${title} episodul ${episode}`);
  }

  // Deduplicate, preserve order.
  return [...new Set(queries)];
}

// ---------------------------------------------------------------------------
// Site search
// ---------------------------------------------------------------------------

async function searchSite(query) {
  const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
  log(`Searching: ${searchUrl}`);
  const html = await fetchText(searchUrl, { Referer: MAIN_URL + "/" });

  // Collect candidate post URLs.
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
  const candidates = [];
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const href = absoluteUrl(m[1]);
    if (!href) continue;
    if (!href.startsWith(MAIN_URL)) continue;
    if (href.includes("/category/") || href.includes("/tag/")) continue;
    if (href.includes("/page/") || href.includes("/author/")) continue;
    if (href.includes("?s=")) continue;
    if (href === MAIN_URL || href === MAIN_URL + "/") continue;
    // Skip obvious non-post paths.
    const path = href.replace(MAIN_URL, "").replace(/^\/|\/$/g, "");
    if (!path || path.split("/").length < 1) continue;
    candidates.push(href);
  }

  // Score candidates so the most likely post comes first.
  const scored = candidates.map((href) => {
    const slug = decodeURIComponent(href).toLowerCase();
    const q = query.toLowerCase();
    let score = 0;
    // Word overlap between query and slug.
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);
    for (const w of qWords) if (slug.includes(w)) score += 5;
    // Penalize short/common paths.
    if (slug.split("-").length >= 3) score += 2;
    return { href, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  log(`Best candidate: ${scored[0].href} (score=${scored[0].score})`);
  return scored[0].href;
}

// ---------------------------------------------------------------------------
// Iframe resolution
// ---------------------------------------------------------------------------

const SKIP_HOSTS = [
  "facebook.com",
  "youtube.com",
  "youtu.be",
  "doubleclick.net",
  "googletagmanager.com",
  "google-analytics.com",
  "disqus.com",
];

function shouldSkipIframe(src) {
  const lower = src.toLowerCase();
  return SKIP_HOSTS.some((h) => lower.includes(h));
}

function extractVideoUrlFromHtml(html) {
  if (!html) return null;

  // 1. <source src="...mp4|m3u8">
  let m = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
  if (m) return m[1];

  // 2. JSON-style: "file":"..." or file: "..."
  m = html.match(/file\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i);
  if (m) return m[1];

  // 3. jwplayer / plyr / videojs sources array
  m = html.match(
    /(?:sources|source)\s*:\s*\[\s*\{[^}]*?(?:file|src)\s*:\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/i
  );
  if (m) return m[1];

  // 4. Any bare .mp4 / .m3u8 URL anywhere in the page
  m = html.match(/https?:\/\/[^"'\s<>]+\.(?:mp4|m3u8)[^"'\s<>]*/i);
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
      return null;
    }
    return absoluteUrl(videoUrl);
  } catch (e) {
    log(`Iframe resolve failed (${iframeUrl}): ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page extraction
// ---------------------------------------------------------------------------

function extractIframes(html) {
  const iframes = [];
  const regex = /<iframe[^>]+>/gi;
  const tagMatches = html.match(regex) || [];
  for (const tag of tagMatches) {
    const srcMatch = tag.match(
      /(?:src|data-src|data-lazy-src|data-url)=["']([^"']+)["']/i
    );
    if (!srcMatch) continue;
    const src = absoluteUrl(srcMatch[1]);
    if (!src || shouldSkipIframe(src)) continue;
    iframes.push(src);
  }
  return [...new Set(iframes)];
}

function extractDirectLinks(html) {
  const links = [];
  const regex =
    /(?:src|href|file)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)[^"']*)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const url = absoluteUrl(m[1]);
    if (url) links.push(url);
  }
  return [...new Set(links)];
}

function guessQuality(url) {
  const lower = url.toLowerCase();
  if (lower.includes("1080")) return "1080p";
  if (lower.includes("720")) return "720p";
  if (lower.includes("480")) return "480p";
  if (lower.includes("360")) return "360p";
  return "auto";
}

// ---------------------------------------------------------------------------
// Core scraper
// ---------------------------------------------------------------------------

async function fetchAndExtractPage(pageUrl, streams, currentHeaders) {
  let pageHtml;
  try {
    pageHtml = await fetchText(pageUrl, { Referer: MAIN_URL + "/" });
  } catch (e) {
    log(`Failed to fetch page ${pageUrl}: ${e.message}`);
    return;
  }

  // Direct links embedded on the page.
  for (const url of extractDirectLinks(pageHtml)) {
    streams.push({
      name: PROVIDER_NAME,
      title: `${guessQuality(url)} | RO Dub`,
      url,
      quality: guessQuality(url),
      headers: currentHeaders,
      provider: "desenefaine",
    });
  }

  // Iframes → resolve to direct URLs.
  const iframes = extractIframes(pageHtml);
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
      headers: { ...currentHeaders, Referer: pageUrl },
      provider: "desenefaine",
    });
  }
}

async function actualGetStreams(id, type, season, episode) {
  const streams = [];
  const currentHeaders = {
    Referer: MAIN_URL + "/",
    "User-Agent": USER_AGENT,
  };

  // 1. TMDB: id -> title/year.
  const meta = await resolveTmdb(id, type, season, episode);

  // 2. Build search queries from the resolved metadata.
  const queries = buildSearchQueries(meta, type);
  log(`Search queries: ${JSON.stringify(queries)}`);

  // 3. Try each query until one yields a page.
  let pageUrl = null;
  for (const q of queries) {
    try {
      pageUrl = await searchSite(q);
      if (pageUrl) break;
    } catch (e) {
      log(`Search failed for "${q}": ${e.message}`);
    }
  }

  if (!pageUrl) {
    log("No matching page found on site.");
    return [];
  }

  // 4. Extract streams from the matched page.
  await fetchAndExtractPage(pageUrl, streams, currentHeaders);

  // 5. Deduplicate by URL.
  const seen = new Set();
  const deduped = streams.filter((s) => {
    if (seen.has(s.url)) return false;
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
