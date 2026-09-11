/**
 * DeseneFaine Provider for Nuvio
 * Rebuilt using the stable AllMovieLand transpiled architecture with Cheerio parsing.
 */
var __create = Object.create;
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var import_cheerio_without_node_native = __toESM(require("cheerio-without-node-native"));

var TMDB_API_KEY = "5201b54eb0a60ac2778dc965256f3f01";
var TMDB_BASE_URL = "https://api.themoviedb.org/3";
var MAIN_URL = "https://desenefaine.com";
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function getTMDBDetails(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const isImdb = tmdbId.toString().startsWith("tt");
    if (isImdb) {
        const findUrl = `${TMDB_BASE_URL}/find/${tmdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ro-RO`;
        const response = yield fetch(findUrl, { method: "GET", headers: HEADERS });
        const data = yield response.json();
        const results = mediaType === "tv" ? data.tv_results : data.movie_results;
        if (results && results.length > 0) {
            const item = results[0];
            return { id: item.id, title: mediaType === "tv" ? item.name : item.title, year: (item.first_air_date || item.release_date || "").substring(0, 4) };
        }
        return null;
    } else {
        const endpoint = mediaType === "tv" ? "tv" : "movie";
        const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=ro-RO`;
        const response = yield fetch(url, { method: "GET", headers: HEADERS });
        const data = yield response.json();
        return { id: data.id, title: mediaType === "tv" ? data.name : data.title, year: (data.first_air_date || data.release_date || "").substring(0, 4) };
    }
  });
}

function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    console.log(`[DeseneFaine] Fetching streams for TMDB/IMDB ID: ${tmdbId}, Type: ${mediaType}`);
    try {
      const mediaInfo = yield getTMDBDetails(tmdbId, mediaType);
      if (!mediaInfo || !mediaInfo.title) {
          console.log("[DeseneFaine] TMDB match failed.");
          return [];
      }
      
      const query = mediaInfo.title;
      const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
      console.log(`[DeseneFaine] Searching: ${searchUrl}`);
      
      const res = yield fetch(searchUrl, { headers: HEADERS });
      const html = yield res.text();
      const $ = import_cheerio_without_node_native.default.load(html);
      
      let exactPostUrl = null;
      let firstValidPost = null;
      
      // Create a URL-safe slug from the Romanian title (e.g., "regele-leu")
      const titleSlug = query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      $("a").each((i, el) => {
          let href = $(el).attr("href");
          if (!href || href === MAIN_URL + "/" || href.includes('/category/') || href.includes('/tag/') || href.includes('/page/')) return;

          // Convert relative links to absolute
          if (href.startsWith("/")) href = MAIN_URL + href;

          if (!firstValidPost && href.includes(titleSlug)) firstValidPost = href;

          if (mediaType === "tv") {
              const epSlug = `sezonul-${season}-episodul-${episode}`;
              if (href.includes(epSlug)) {
                  exactPostUrl = href;
                  return false; // Break loop
              }
          } else {
              // Ensure we aren't clicking a TV episode when searching for a movie
              if (href.includes(titleSlug) && !href.includes('sezonul-')) {
                  exactPostUrl = href;
                  return false; // Break loop
              }
          }
      });
      
      if (!exactPostUrl) {
          if (mediaType === "movie" && firstValidPost) {
              exactPostUrl = firstValidPost;
              console.log(`[DeseneFaine] Exact match failed, falling back to: ${exactPostUrl}`);
          } else {
              console.log("[DeseneFaine] No confident match found on search page.");
              return [];
          }
      }

      console.log(`[DeseneFaine] Extracting from: ${exactPostUrl}`);
      const postRes = yield fetch(exactPostUrl, { headers: HEADERS });
      const postHtml = yield postRes.text();
      const post$ = import_cheerio_without_node_native.default.load(postHtml);
      
      const streams = [];
      let serverCount = 1;

      post$("iframe").each((i, el) => {
          // Check standard src as well as common lazy-loading attributes
          let src = post$(el).attr("src") || post$(el).attr("data-src") || post$(el).attr("data-lazy-src");
          
          if (src && !src.includes("facebook.com") && !src.includes("youtube.com") && !src.includes("doubleclick")) {
              // Fix protocol-relative URLs (e.g., //player.com/video)
              if (src.startsWith("//")) src = "https:" + src;
              
              streams.push({
                  name: "DeseneFaine",
                  title: `Server ${serverCount++} | RO Dub`,
                  url: src,
                  quality: "1080p",
                  headers: {
                      "Referer": `${MAIN_URL}/`,
                      "User-Agent": HEADERS["User-Agent"]
                  }
              });
          }
      });

      if (streams.length === 0) {
          console.log("[DeseneFaine] No iframes found in post.");
      }

      return streams;
    } catch (error) {
      console.error(`[DeseneFaine] Global Error: ${error.message}`);
      return [];
    }
  });
}

module.exports = { getStreams };
