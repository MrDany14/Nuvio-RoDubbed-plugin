// providers/desenefaine.js
// Nuvio scraper for DeseneFaine (RO Dub)
//
// Current strategy:
// 1. Resolve the incoming IMDb/TMDB id through TMDB.
// 2. Try to locate the DeseneFaine /film/ page directly from the title.
// 3. Fall back to DeseneFaine search.
// 4. Extract iframe/embed/server URLs from HTML AND inline JS.
// 5. Resolve direct MP4/M3U8 URLs when available.
// 6. Resolve Player4me / StreamP2P / SeekStreaming embeds when possible.

const PROVIDER_NAME = "DeseneFaine";
const PROVIDER_ID = "desenefaine";

const MAIN_URL = "https://desenefaine.com";

// -----------------------------------------------------------------------------
// TMDB
// -----------------------------------------------------------------------------

const TMDB_API_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LANG = "ro-RO";

// -----------------------------------------------------------------------------
// HTTP
// -----------------------------------------------------------------------------

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_HEADERS = {
  "User-Agent": USER_AGENT,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8",
};

const REQUEST_TIMEOUT_MS = 12000;
const SCRAPER_TIMEOUT_MS = 25000;

let _httpClient = null;

function log(msg) {
  try {
    console.log("[" + PROVIDER_NAME + "] " + msg);
  } catch (_) {}
}

function getHttpClient() {
  if (_httpClient) return _httpClient;

  if (typeof fetch === "function") {
    log("HTTP client: fetch");

    _httpClient = async function (url, opts) {
      opts = opts || {};

      const controller =
        typeof AbortController !== "undefined"
          ? new AbortController()
          : null;

      const timer = controller
        ? setTimeout(function () {
            try {
              controller.abort();
            } catch (_) {}
          }, REQUEST_TIMEOUT_MS)
        : null;

      try {
        const res = await fetch(url, {
          method: "GET",
          headers: Object.assign({}, DEFAULT_HEADERS, opts.headers || {}),
          redirect: "follow",
          signal: controller ? controller.signal : undefined,
        });

        const text = await res.text();

        return {
          status: res.status,
          ok: res.ok,
          text: async function () {
            return text;
          },
          json: async function () {
            return JSON.parse(text);
          },
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

    _httpClient = async function (url, opts) {
      opts = opts || {};

      const res = await axios.get(url, {
        headers: Object.assign({}, DEFAULT_HEADERS, opts.headers || {}),
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: function () {
          return true;
        },
        responseType: "text",
        transformResponse: [
          function (data) {
            return data;
          },
        ],
      });

      const text =
        typeof res.data === "string"
          ? res.data
          : JSON.stringify(res.data);

      return {
        status: res.status,
        ok: res.status >= 200 && res.status < 300,
        text: async function () {
          return text;
        },
        json: async function () {
          return JSON.parse(text);
        },
      };
    };

    return _httpClient;
  } catch (_) {}

  try {
    const https = require("https");
    const http = require("http");

    log("HTTP client: node http");

    _httpClient = function (url, opts) {
      opts = opts || {};

      return new Promise(function (resolve, reject) {
        const lib = url.startsWith("https") ? https : http;

        const req = lib.get(
          url,
          {
            headers: Object.assign(
              {},
              DEFAULT_HEADERS,
              opts.headers || {}
            ),
          },
          function (res) {
            if (
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location &&
              (opts._redirects || 0) < 3
            ) {
              res.resume();

              let next = res.headers.location;

              if (!next.startsWith("http")) {
                if (next.startsWith("/")) {
                  next = MAIN_URL + next;
                } else {
                  next = MAIN_URL + "/" + next;
                }
              }

              return resolve(
                _httpClient(next, {
                  ...opts,
                  _redirects: (opts._redirects || 0) + 1,
                })
              );
            }

            let body = "";

            res.setEncoding("utf8");

            res.on("data", function (c) {
              body += c;
            });

            res.on("end", function () {
              resolve({
                status: res.statusCode,
                ok:
                  res.statusCode >= 200 &&
                  res.statusCode < 300,
                text: async function () {
                  return body;
                },
                json: async function () {
                  return JSON.parse(body);
                },
              });
            });
          }
        );

        req.on("error", reject);

        req.setTimeout(REQUEST_TIMEOUT_MS, function () {
          req.destroy(new Error("request timeout"));
        });
      });
    };

    return _httpClient;
  } catch (_) {}

  throw new Error("No HTTP client available");
}

async function fetchText(url, headers) {
  const client = getHttpClient();
  const res = await client(url, { headers: headers || {} });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return await res.text();
}

async function fetchJson(url, headers) {
  const client = getHttpClient();
  const res = await client(url, { headers: headers || {} });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return await res.json();
}

// -----------------------------------------------------------------------------
// General helpers
// -----------------------------------------------------------------------------

function absoluteUrl(url) {
  if (!url) return null;
  url = String(url).trim();
  if (!url) return null;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) return MAIN_URL + url;
  return MAIN_URL + "/" + url;
}

function cleanUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  u = u
    .replace(/^['"`]+/, "")
    .replace(/['"`]+$/, "")
    .replace(/&amp;/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/gi, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  return u.trim();
}

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/");
}

function stripTags(s) {
  if (!s) return "";
  return decodeEntities(String(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function guessQuality(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("2160") || u.includes("4k")) return "2160p";
  if (u.includes("1440")) return "1440p";
  if (u.includes("1080")) return "1080p";
  if (u.includes("720")) return "720p";
  if (u.includes("576")) return "576p";
  if (u.includes("480")) return "480p";
  if (u.includes("360")) return "360p";
  return "auto";
}

function uniqueStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const value of arr || []) {
    if (!value) continue;
    const v = String(value).trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function uniqueStreams(streams) {
  const seen = new Set();
  const out = [];
  for (const stream of streams || []) {
    if (!stream || !stream.url) continue;
    const key = String(stream.url).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(stream);
  }
  return out;
}

function removeDiacritics(s) {
  if (!s) return "";
  return String(s)
    .replace(/[ăĂ]/g, "a").replace(/[âÂ]/g, "a").replace(/[îÎ]/g, "i")
    .replace(/[șȘşŞ]/g, "s").replace(/[țȚţŢ]/g, "t")
    .replace(/[áÁàÀäÄâÂãÃåÅ]/g, "a").replace(/[éÉèÈëËêÊ]/g, "e")
    .replace(/[íÍìÌïÏîÎ]/g, "i").replace(/[óÓòÒöÖôÔõÕ]/g, "o")
    .replace(/[úÚùÙüÜûÛ]/g, "u");
}

function slugify(text) {
  if (!text) return "";
  let s = removeDiacritics(String(text));
  return s.toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+/g, "").replace(/-+$/g, "");
}

function titleWords(text) {
  return removeDiacritics(String(text || "")).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(function (x) { return x.length >= 3; });
}

// -----------------------------------------------------------------------------
// TMDB
// -----------------------------------------------------------------------------

function looksLikeTmdbId(id) { return /^\d+$/.test(String(id)); }
function looksLikeImdbId(id) { return /^tt\d+$/i.test(String(id)); }
function looksLikeTitle(id) { return (/[a-zA-Z]/.test(String(id)) && !looksLikeImdbId(id)); }

async function resolveMeta(id, type, season, episode) {
  if (looksLikeTitle(id)) {
    return { title: String(id), originalTitle: null, year: null, tmdbId: null, season: season, episode: episode };
  }
  if (!TMDB_API_KEY || TMDB_API_KEY === "YOUR_TMDB_API_KEY") {
    return { title: String(id), originalTitle: null, year: null, tmdbId: null, season: season, episode: episode };
  }
  try {
    let tmdbId = null;
    if (looksLikeImdbId(id)) {
      const findUrl = TMDB_BASE + "/find/" + encodeURIComponent(id) + "?api_key=" + TMDB_API_KEY + "&external_source=imdb_id&language=" + TMDB_LANG;
      const data = await fetchJson(findUrl, { Accept: "application/json" });
      let bucket = type === "movie" ? data.movie_results : data.tv_results;
      if ((!bucket || !bucket.length) && type !== "movie") bucket = data.tv_results;
      if (bucket && bucket.length) tmdbId = bucket[0].id;
    } else if (looksLikeTmdbId(id)) {
      tmdbId = id;
    }
    if (!tmdbId) return { title: String(id), originalTitle: null, year: null, tmdbId: null, season: season, episode: episode };
    
    const endpoint = type === "movie" ? "movie" : "tv";
    const detailUrl = TMDB_BASE + "/" + endpoint + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=" + TMDB_LANG;
    const data = await fetchJson(detailUrl, { Accept: "application/json" });
    
    const title = data.title || data.name || data.original_title || data.original_name || null;
    const originalTitle = data.original_title || data.original_name || null;
    const dateStr = data.release_date || data.first_air_date || "";
    const year = dateStr && dateStr.length >= 4 ? dateStr.slice(0, 4) : null;
    
    return { title: title, originalTitle: originalTitle, year: year, tmdbId: tmdbId, season: season, episode: episode };
  } catch (e) {
    return { title: String(id), originalTitle: null, year: null, tmdbId: null, season: season, episode: episode };
  }
}

// -----------------------------------------------------------------------------
// Search
// -----------------------------------------------------------------------------

function buildSearchQueries(meta, type) {
  const { title, originalTitle, year, season, episode } = meta;
  const out = [];
  function push(q) { if (q && !out.includes(q)) out.push(q); }

  if (title) push(title);
  if (originalTitle && originalTitle.toLowerCase() !== String(title || "").toLowerCase()) push(originalTitle);
  if (title && year) { push(title + " " + year); push(title + " (" + year + ")"); }
  if (originalTitle && year) push(originalTitle + " " + year);
  if ((type === "tv" || type === "series") && title && season) {
    push(title + " sezonul " + season);
    if (episode) push(title + " sezonul " + season + " episodul " + episode);
  }
  return out;
}

async function trySearchUrl(template, query) {
  const url = template.replace("{q}", encodeURIComponent(query));
  try {
    const html = await fetchText(url, { Referer: MAIN_URL + "/" });
    return { url: url, html: html };
  } catch (e) { return null; }
}

function collectCandidates(html, query) {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const map = new Map();
  let m;
  const qWords = titleWords(query);

  while ((m = linkRegex.exec(html)) !== null) {
    let href = cleanUrl(m[1]);
    if (!href) continue;
    href = absoluteUrl(href);
    if (!href || !href.startsWith(MAIN_URL)) continue;
    
    const lowerHref = href.toLowerCase();
    if (lowerHref.includes("/category/") || lowerHref.includes("/tag/") || lowerHref.includes("/author/") || lowerHref.includes("/page/") || lowerHref.includes("?s=")) continue;
    if (href === MAIN_URL || href === MAIN_URL + "/") continue;
    
    const path = href.replace(MAIN_URL, "").replace(/^\/|\/$/g, "");
    if (!path || path.length < 3 || /\.(png|jpe?g|gif|svg|css|js|ico|webp)$/i.test(path)) continue;

    const slug = removeDiacritics(path).toLowerCase();
    const text = stripTags(m[2] || "").toLowerCase();
    let score = 0;

    for (const word of qWords) {
      if (slug.includes(word)) score += 8;
      if (text.includes(word)) score += 5;
    }
    if (lowerHref.includes("/film/")) score += 12;
    if (lowerHref.includes("/desen/") || lowerHref.includes("/serial/")) score += 5;
    
    if (score > 0) {
      const existing = map.get(href);
      if (!existing || existing.score < score) map.set(href, { href: href, score: score });
    }
  }
  return Array.from(map.values()).sort(function (a, b) { return b.score - a.score; });
}

async function searchSite(query) {
  const patterns = [MAIN_URL + "/?s={q}", MAIN_URL + "/cauta/{q}/", MAIN_URL + "/search/{q}/"];
  for (const pattern of patterns) {
    const result = await trySearchUrl(pattern, query);
    if (!result || !result.html) continue;
    const candidates = collectCandidates(result.html, query);
    if (candidates.length > 0) return candidates[0].href;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Direct /film/ discovery
// -----------------------------------------------------------------------------

async function checkFilmPage(url, expectedTitle) {
  try {
    const html = await fetchText(url, { Referer: MAIN_URL + "/" });
    if (!html || html.length < 100) return null;
    const lower = html.toLowerCase();
    const looksLikeFilm = lower.includes("server 01") || lower.includes("server 02") || lower.includes("player4me") || lower.includes("streamp2p") || lower.includes("seekstreaming") || lower.includes("<iframe") || lower.includes("video");
    if (!looksLikeFilm) return null;
    return { url: url, html: html };
  } catch (e) { return null; }
}

async function findDirectFilmPage(meta) {
  const names = [];
  if (meta.title) names.push(meta.title);
  if (meta.originalTitle && meta.originalTitle !== meta.title) names.push(meta.originalTitle);

  const slugs = [];
  for (const name of names) {
    const slug = slugify(name);
    if (slug) slugs.push(slug);
  }
  for (const slug of slugs.slice()) {
    if (slug.includes("-and-")) slugs.push(slug.replace(/-and-/g, "-"));
  }

  const uniqueSlugs = uniqueStrings(slugs);
  for (const slug of uniqueSlugs) {
    const url = MAIN_URL + "/film/" + slug + "/";
    const result = await checkFilmPage(url, meta.title);
    if (result) return result.url;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Embed/server URL extraction
// -----------------------------------------------------------------------------

const SKIP_HOSTS = [ "facebook.com", "youtube.com", "youtu.be", "doubleclick.net", "googletagmanager.com", "google-analytics.com", "disqus.com", "twitter.com", "instagram.com", "google.com" ];
const EMBED_HOSTS = [ "player4me.com", "streamp2p.com", "seekstreaming.com", "seekstreaming", "byse", "dsvplay" ];

function shouldSkipUrl(url) {
  if (!url) return true;
  const l = String(url).toLowerCase();
  return SKIP_HOSTS.some(function (host) { return l.includes(host); });
}

function isEmbedHost(url) {
  if (!url) return false;
  const l = String(url).toLowerCase();
  return EMBED_HOSTS.some(function (host) { return l.includes(host); });
}

function normalizeExtractedUrl(url) {
  if (!url) return null;
  let u = cleanUrl(url);
  if (!u) return null;
  u = u.replace(/\\x3a/gi, ":").replace(/\\x2f/gi, "/").replace(/\\u003a/gi, ":").replace(/\\u002f/gi, "/").replace(/\\u0026/gi, "&");
  if (u.startsWith("//")) u = "https:" + u;
  return u;
}

function extractUrlsFromText(html) {
  const out = [];
  if (!html) return out;
  const absoluteRegex = /https?:\/\/[^"'<>\\\s]+/gi;
  let m;
  while ((m = absoluteRegex.exec(html)) !== null) {
    let url = normalizeExtractedUrl(m[0]);
    if (!url) continue;
    url = url.replace(/[),;}\]]+$/, "");
    if (!shouldSkipUrl(url)) out.push(url);
  }
  const protocolRelativeRegex = /["'`(=]\s*(\/\/[^"'`<>\s]+)/gi;
  while ((m = protocolRelativeRegex.exec(html)) !== null) {
    let url = normalizeExtractedUrl(m[1]);
    if (!url) continue;
    if (!shouldSkipUrl(url)) out.push(url);
  }
  return uniqueStrings(out);
}

function extractIframes(html) {
  const out = [];
  if (!html) return out;
  const tagRegex = /<iframe\b[^>]*>/gi;
  const tags = html.match(tagRegex) || [];
  for (const tag of tags) {
    const attrRegex = /(?:src|data-src|data-lazy-src|data-url|data-embed|data-player|data-video|data-link|data-href)\s*=\s*["']([^"']+)["']/gi;
    let m;
    while ((m = attrRegex.exec(tag)) !== null) {
      const src = normalizeExtractedUrl(m[1]);
      if (!src) continue;
      const finalUrl = src.startsWith("http") || src.startsWith("//") ? src : absoluteUrl(src);
      if (!finalUrl) continue;
      if (!shouldSkipUrl(finalUrl)) out.push(finalUrl);
    }
  }
  return uniqueStrings(out);
}

function extractAttributeEmbedUrls(html) {
  const out = [];
  if (!html) return out;
  const patterns = [
    /(?:src|href|data-src|data-url|data-embed|data-player|data-video|data-link|data-href)\s*=\s*["']([^"']+)["']/gi,
    /(?:src|href|data-src|data-url|data-embed|data-player|data-video|data-link|data-href)\s*=\s*([^>\s]+)/gi,
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(html)) !== null) {
      let url = normalizeExtractedUrl(m[1]);
      if (!url) continue;
      if (!url.startsWith("http") && !url.startsWith("//") && !url.startsWith("/")) continue;
      if (url.startsWith("/")) url = absoluteUrl(url);
      if (!url) continue;
      if (isEmbedHost(url) && !shouldSkipUrl(url)) out.push(url);
    }
  }
  return uniqueStrings(out);
}

function extractInlineJsEmbedUrls(html) {
  const out = [];
  if (!html) return out;
  const all = extractUrlsFromText(html);
  for (const url of all) {
    if (isEmbedHost(url)) out.push(url);
  }
  const escapedRegex = /(?:https?:)?\\\/\\\/[^"'`\s<>]+/gi;
  let m;
  while ((m = escapedRegex.exec(html)) !== null) {
    let url = m[0].replace(/\\\//g, "/").replace(/\\u002f/gi, "/").replace(/\\u003a/gi, ":");
    if (!url.startsWith("http") && url.startsWith("//")) url = "https:" + url;
    if (isEmbedHost(url) && !shouldSkipUrl(url)) out.push(url);
  }
  return uniqueStrings(out);
}

// -----------------------------------------------------------------------------
// StreamEmbed / Player4me style resolution
// -----------------------------------------------------------------------------

const STREAM_EMBED_HOSTS = [ "player4me.com", "streamp2p.com", "seekstreaming.com" ];

function getHostFromUrl(url) {
  if (!url) return "";
  const m = String(url).match(/^https?:\/\/([^\/?#]+)/i);
  return m ? m[1].toLowerCase() : "";
}

function isStreamEmbedHost(url) {
  const host = getHostFromUrl(url);
  return STREAM_EMBED_HOSTS.some(function (item) { return host.includes(item); });
}

function extractFilecode(url) {
  if (!url) return null;
  const u = String(url);
  const queryPatterns = [ /[?&](?:id|file|code|filecode)=([^&#]+)/i ];
  for (const re of queryPatterns) {
    const m = u.match(re);
    if (m && m[1]) return decodeURIComponent(m[1]);
  }
  const pathPatterns = [ /\/(?:e|embed|video|v|play|watch)\/([^/?#]+)/i, /\/([^/?#]+)\/?(?:\?.*)?$/i ];
  for (const re of pathPatterns) {
    const m = u.match(re);
    if (m && m[1]) {
      const candidate = decodeURIComponent(m[1]);
      if (candidate.length >= 3 && !candidate.includes(".html") && !candidate.includes(".php")) return candidate;
    }
  }
  return null;
}

function getStreamEmbedApiUrl(host, filecode) {
  if (!host || !filecode) return null;
  return "https://" + host + "/api/v1/video?id=" + encodeURIComponent(filecode) + "&w=2048&h=1152&r=";
}

function hexToWordArray(CryptoJS, hex) {
  return CryptoJS.enc.Hex.parse(hex);
}

function decryptStreamEmbedResponse(text) {
  try {
    const CryptoJS = require("crypto-js");
    const keyHex = "6b69656d7469656e6d75613931316361";
    const ivHex = "313233343536373839306f6975797472";
    const key = hexToWordArray(CryptoJS, keyHex);
    const iv = hexToWordArray(CryptoJS, ivHex);
    const encrypted = CryptoJS.enc.Hex.parse(String(text).trim());
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, key, { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 });
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    return result || null;
  } catch (e) { return null; }
}

function extractMasterUrlFromPayload(payload) {
  if (!payload) return null;
  let text = String(payload).trim();
  try {
    const obj = JSON.parse(text);
    if (obj) {
      const candidates = [ obj.source, obj.master, obj.masterUrl, obj.master_url, obj.url, obj.file, obj.playlist ];
      for (const value of candidates) {
        if (value && typeof value === "string" && /^https?:\/\//i.test(value)) return value;
      }
      if (obj.data) {
        const nested = extractMasterUrlFromPayload(JSON.stringify(obj.data));
        if (nested) return nested;
      }
    }
  } catch (_) {}
  const patterns = [
    /["']?(?:source|masterUrl|master_url|master|url|file|playlist)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i,
    /(https?:\/\/[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*)/i,
    /(https?:\/\/[^"'\\\s<>]+\.mp4[^"'\\\s<>]*)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  }
  if (/^https?:\/\//i.test(text)) return text;
  return null;
}

async function resolveStreamEmbed(embedUrl, referer) {
  if (!isStreamEmbedHost(embedUrl)) return null;
  const filecode = extractFilecode(embedUrl);
  if (!filecode) return null;
  const host = getHostFromUrl(embedUrl);
  const apiUrl = getStreamEmbedApiUrl(host, filecode);
  if (!apiUrl) return null;

  try {
    const client = getHttpClient();
    const res = await client(apiUrl, {
      headers: { Referer: embedUrl, Origin: "https://" + host, "User-Agent": USER_AGENT, Accept: "*/*" },
    });
    if (!res.ok) return null;
    const body = await res.text();
    
    let direct = extractMasterUrlFromPayload(body);
    if (direct) return direct;
    
    const decrypted = decryptStreamEmbedResponse(body);
    if (!decrypted) return null;
    
    direct = extractMasterUrlFromPayload(decrypted);
    if (direct) return direct;
    return null;
  } catch (e) { return null; }
}

// -----------------------------------------------------------------------------
// Generic iframe/player resolver
// -----------------------------------------------------------------------------

function extractOkRuVideo(html) {
  if (!html || !/ok\.ru|odnoklassniki/i.test(html)) return null;
  const patterns = [ /"videoUrl"\s*:\s*"([^"]+)"/i, /"hls"\s*:\s*"([^"]+)"/i, /"url"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i, /"video"\s*:\s*"([^"]+\.(?:mp4|m3u8)[^"]*)"/i ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      let url = m[1].replace(/\\\//g, "/").replace(/\\u0026/g, "&");
      if (url.startsWith("//")) url = "https:" + url;
      if (url.startsWith("http://") || url.startsWith("https://")) return url;
    }
  }
  return null;
}

function extractVideoUrlFromHtml(html) {
  if (!html) return null;
  const ok = extractOkRuVideo(html);
  if (ok) return ok;

  let m = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (m && m[1]) return normalizeExtractedUrl(m[1]);
  m = html.match(/["']?file["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (m && m[1]) {
    const url = normalizeExtractedUrl(m[1]);
    if (url && /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) return url;
  }
  m = html.match(/(?:sources|source)\s*:\s*\[\s*\{[^}]*?["']?(?:file|src)["']?\s*:\s*["']([^"']+)["']/i);
  if (m && m[1]) return normalizeExtractedUrl(m[1]);
  m = html.match(/["']?playlist["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (m && m[1]) {
    const url = normalizeExtractedUrl(m[1]);
    if (url && /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) return url;
  }
  m = html.match(/https?:\/\/[^"'<>\\\s]+\.m3u8[^"'<>\\\s]*/i);
  if (m && m[0]) return normalizeExtractedUrl(m[0]);
  m = html.match(/https?:\/\/[^"'<>\\\s]+\.mp4[^"'<>\\\s]*/i);
  if (m && m[0]) return normalizeExtractedUrl(m[0]);
  return null;
}

async function resolveIframe(iframeUrl, referer) {
  try {
    if (isStreamEmbedHost(iframeUrl)) {
      const stream = await resolveStreamEmbed(iframeUrl, referer);
      if (stream) return stream;
    }
    const html = await fetchText(iframeUrl, { Referer: referer });
    const direct = extractVideoUrlFromHtml(html);
    if (direct) return absoluteUrl(direct);

    const nested = extractInlineJsEmbedUrls(html).concat(extractAttributeEmbedUrls(html));
    const nestedUnique = uniqueStrings(nested);
    for (const url of nestedUnique) {
      if (isStreamEmbedHost(url)) {
        const stream = await resolveStreamEmbed(url, iframeUrl);
        if (stream) return stream;
      }
    }
    return null;
  } catch (e) { return null; }
}

// -----------------------------------------------------------------------------
// Page extraction
// -----------------------------------------------------------------------------

function extractDirectLinks(html) {
  const out = [];
  if (!html) return out;
  const patterns = [ /(?:src|href|file)\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8)(?:[^"']*)?)["']/gi, /https?:\/\/[^"'<>\\\s]+\.(?:mp4|m3u8)(?:[^"'<>\\\s]*)/gi ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(html)) !== null) {
      const url = normalizeExtractedUrl(m[1] || m[0]);
      if (url && /\.(?:mp4|m3u8)(?:[?#]|$)/i.test(url)) out.push(absoluteUrl(url));
    }
  }
  return uniqueStrings(out);
}

function extractAllEmbeds(html) {
  const out = [];
  out.push.apply(out, extractIframes(html));
  out.push.apply(out, extractAttributeEmbedUrls(html));
  out.push.apply(out, extractInlineJsEmbedUrls(html));
  return uniqueStrings(out.filter(function (url) { return (url && !shouldSkipUrl(url)); }));
}

async function processPage(pageUrl, streams) {
  let html;
  try {
    html = await fetchText(pageUrl, { Referer: MAIN_URL + "/" });
  } catch (e) { return; }

  const baseHeaders = { Referer: pageUrl, "User-Agent": USER_AGENT, Origin: MAIN_URL };

  // 1. Direct Links
  const directLinks = extractDirectLinks(html);
  for (const url of directLinks) {
    streams.push({
      name: PROVIDER_NAME,
      title: guessQuality(url) + " | RO Dub",
      url: url,
      quality: guessQuality(url),
      headers: baseHeaders,
      isM3U8: url.includes(".m3u8"), // [ADDED THIS TO FIX LOADING LOOP]
      provider: PROVIDER_ID,
    });
  }

  // 2. Embeds
  const embeds = extractAllEmbeds(html);
  
  // 3. Resolve Embeds
  for (const embedUrl of embeds) {
    if (!isEmbedHost(embedUrl) && !/\/embed\/|\/e\/|\/player\/|\/video\/|\/watch\//i.test(embedUrl)) continue;
    const videoUrl = await resolveIframe(embedUrl, pageUrl);
    if (!videoUrl) continue;

    streams.push({
      name: PROVIDER_NAME,
      title: guessQuality(videoUrl) + " | RO Dub",
      url: videoUrl,
      quality: guessQuality(videoUrl),
      headers: {
        Referer: embedUrl,
        "User-Agent": USER_AGENT,
        Origin: MAIN_URL, // Reverted to original working auth logic
      },
      isM3U8: videoUrl.includes(".m3u8"), // [ADDED THIS TO FIX LOADING LOOP]
      provider: PROVIDER_ID,
    });
  }

  // 4. Raw Server URLs
  const rawUrls = extractUrlsFromText(html);
  const streamHosts = rawUrls.filter(function (url) { return isStreamEmbedHost(url); });
  const uniqueStreamHosts = uniqueStrings(streamHosts);
  for (const embedUrl of uniqueStreamHosts) {
    const already = streams.some(function (s) { return (s && s.url && s.url === embedUrl); });
    if (already) continue;

    const videoUrl = await resolveStreamEmbed(embedUrl, pageUrl);
    if (!videoUrl) continue;

    streams.push({
      name: PROVIDER_NAME,
      title: guessQuality(videoUrl) + " | RO Dub",
      url: videoUrl,
      quality: guessQuality(videoUrl),
      headers: {
        Referer: embedUrl,
        "User-Agent": USER_AGENT,
        Origin: MAIN_URL, // Reverted to original working auth logic
      },
      isM3U8: videoUrl.includes(".m3u8"), // [ADDED THIS TO FIX LOADING LOOP]
      provider: PROVIDER_ID,
    });
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function actualGetStreams(id, type, season, episode) {
  const streams = [];
  const normalizedType = type === "series" ? "tv" : type;
  const meta = await resolveMeta(id, normalizedType, season, episode);
  let pageUrl = await findDirectFilmPage(meta);

  if (!pageUrl) {
    const queries = buildSearchQueries(meta, normalizedType);
    for (const query of queries) {
      pageUrl = await searchSite(query);
      if (pageUrl) break;
    }
  }

  if (!pageUrl) return [];
  await processPage(pageUrl, streams);
  return uniqueStreams(streams);
}

// -----------------------------------------------------------------------------
// Public Nuvio entry point
// -----------------------------------------------------------------------------

async function getStreams(id, type, season, episode) {
  let timeoutId;
  const timeout = new Promise(function (_, reject) {
    timeoutId = setTimeout(function () {
      reject(new Error("Scraper timeout after " + SCRAPER_TIMEOUT_MS + "ms"));
    }, SCRAPER_TIMEOUT_MS);
  });

  try {
    return await Promise.race([ actualGetStreams(id, type, season, episode), timeout ]);
  } catch (e) {
    return [];
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

module.exports = { getStreams };
