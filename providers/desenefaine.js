/**
 * DeseneFaine Provider for Nuvio
 * Includes IMDB ID resolving and Async polyfill.
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => { try { step(generator.next(value)); } catch (e) { reject(e); } };
    var rejected = (value) => { try { step(generator.throw(value)); } catch (e) { reject(e); } };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

var TMDB_API_KEY = "5201b54eb0a60ac2778dc965256f3f01";
var BASE_URL = "https://desenefaine.com";

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function getStreams(tmdbId, mediaType = "movie", season = null, episode = null) {
  return __async(this, null, function* () {
    try {
      console.log(`[DeseneFaine] Request: ID=${tmdbId}, Type=${mediaType}`);
      
      // 1. Resolve ID (Handles IMDB 'tt' IDs sent by Nuvio Mobile)
      const mediaInfo = yield getMediaDetails(tmdbId, mediaType);
      if (!mediaInfo || !mediaInfo.title) {
        console.log("[DeseneFaine] TMDB match failed.");
        return [];
      }
      
      const title = mediaInfo.title;
      console.log(`[DeseneFaine] Searching for Romanian title: ${title}`);
      
      // 2. Search desenefaine
      const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(title)}`;
      const searchRes = yield fetch(searchUrl, { headers: HEADERS });
      const searchHtml = yield searchRes.text();
      
      // 3. Parse search results safely
      const linkRegex = /<a[^>]+href=["'](https:\/\/desenefaine\.com\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
      let match;
      let exactPostUrl = null;
      let firstValidPost = null;
      
      while ((match = linkRegex.exec(searchHtml)) !== null) {
        const link = match[1];
        const postText = match[2].toLowerCase();
        
        // Skip junk menu links
        if (link.includes('/category/') || link.includes('/tag/') || link.includes('/page/')) continue;
        if (link === "https://desenefaine.com/") continue;

        if (!firstValidPost) firstValidPost = link;

        if (mediaType === "tv") {
           const epPattern = `sezonul-${season}-episodul-${episode}`;
           if (link.includes(epPattern)) {
               exactPostUrl = link;
               break;
           }
        } else {
           if (postText.includes(title.toLowerCase())) {
               exactPostUrl = link;
               break;
           }
        }
      }
      
      // Fallback: If exact text match fails, grab the first valid post found on the search page
      if (!exactPostUrl) {
          if (firstValidPost) {
              exactPostUrl = firstValidPost;
              console.log(`[DeseneFaine] Strict match failed, using first result: ${exactPostUrl}`);
          } else {
              console.log("[DeseneFaine] No matching posts found.");
              return [];
          }
      }
      
      console.log(`[DeseneFaine] Fetching post: ${exactPostUrl}`);
      const postRes = yield fetch(exactPostUrl, { headers: HEADERS });
      const postHtml = yield postRes.text();
      
      // 4. Extract iframe players
      const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
      let iframeMatch;
      const streams = [];
      let serverCount = 1;
      
      while ((iframeMatch = iframeRegex.exec(postHtml)) !== null) {
          const src = iframeMatch[1];
          // Filter out trailers and social widgets
          if (!src.includes("facebook.com") && !src.includes("youtube.com") && !src.includes("doubleclick")) {
              streams.push({
                  name: "DeseneFaine",
                  title: `Server ${serverCount++} | RO Dub`,
                  url: src,
                  quality: "1080p",
                  headers: { 
                      "Referer": `${BASE_URL}/`,
                      "User-Agent": HEADERS["User-Agent"]
                  }
              });
          }
      }
      
      return streams;
    } catch (e) {
      console.error(`[DeseneFaine] Global Error: ${e.message}`);
      return [];
    }
  });
}

function getMediaDetails(id, type) {
  return __async(this, null, function* () {
    const isImdb = id.toString().startsWith("tt");
    const tmdbType = type === "tv" ? "tv" : "movie";
    try {
      if (isImdb) {
        // Essential for Nuvio Mobile: Route IMDB ID through TMDB's /find/ endpoint
        const findUrl = `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=ro-RO`;
        const res = yield fetch(findUrl);
        const data = yield res.json();
        const results = type === "tv" ? data.tv_results : data.movie_results;
        if (results && results.length > 0) {
          const item = results[0];
          return { id: item.id, title: type === "tv" ? item.name : item.title };
        }
        return null;
      } else {
        const url = `https://api.themoviedb.org/3/${tmdbType}/${id}?api_key=${TMDB_API_KEY}&language=ro-RO`;
        const res = yield fetch(url);
        const data = yield res.json();
        return { id: data.id, title: type === "tv" ? data.name : data.title };
      }
    } catch (e) {
      return null;
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
