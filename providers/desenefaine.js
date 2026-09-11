/*
 * DeseneFaine Provider for Nuvio
 * ========================================
 * Adapted strictly from the working Nuvio-TV architecture.
 * Uses cheerio-without-node-native for safe DOM parsing.
 * Eliminates async/await to comply with Hermes engine constraints.
 */

var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var BASE_URL = "https://desenefaine.com";
var TMDB_API_KEY = "5201b54eb0a60ac2778dc965256f3f01";

var DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive"
};

// --- Helper Functions (From Working Architecture) ---

function assign(target, source) {
    var out = {};
    var k;
    target = target || {};
    source = source || {};
    for (k in target) out[k] = target[k];
    for (k in source) out[k] = source[k];
    return out;
}

function fetchText(url, options) {
    options = options || {};
    return fetch(url, {
        method: options.method || "GET",
        redirect: options.redirect || "follow",
        headers: assign(DEFAULT_HEADERS, options.headers || {}),
        body: options.body
    }).then(function(res) {
        if (!res.ok && res.status !== 301 && res.status !== 302) {
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
        headers: assign(DEFAULT_HEADERS, options.headers || {}),
        body: options.body
    }).then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status + " -> " + url);
        return res.json();
    });
}

// --- Scraper Logic ---

function getTmdbTitle(tmdbId, mediaType) {
    var type = mediaType === "movie" ? "movie" : "tv";
    // Using ro-RO to ensure we get the Romanian title the website uses
    var url = "https://api.themoviedb.org/3/" + type + "/" + tmdbId + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";
    
    return fetchJson(url).then(function(data) {
        return data.title || data.name || data.original_title || "";
    }).catch(function() {
        return "";
    });
}

function searchDeseneFaine(title, mediaType, season, episode) {
    var searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
    
    return fetchText(searchUrl).then(function(html) {
        var $ = cheerio.load(html);
        var exactPostUrl = null;

        // Desenefaine wraps posts in h2 with class entry-title
        $("h2.entry-title a").each(function(_, el) {
            var href = $(el).attr("href");
            var postTitle = $(el).text().toLowerCase();
            
            if (!href) return;

            if (mediaType === "tv") {
                // TV Match: Check if URL contains the season and episode pattern
                var epPattern = "sezonul-" + season + "-episodul-" + episode;
                if (href.indexOf(epPattern) !== -1) {
                    exactPostUrl = href;
                    return false; // Break Cheerio loop
                }
            } else {
                // Movie Match: Check if post title includes the requested movie title
                if (postTitle.indexOf(title.toLowerCase()) !== -1) {
                    exactPostUrl = href;
                    return false; // Break Cheerio loop
                }
            }
        });

        return exactPostUrl;
    }).catch(function(e) {
        console.log("[DeseneFaine] Search Error:", e.message);
        return null;
    });
}

function extractStreams(postUrl) {
    return fetchText(postUrl).then(function(html) {
        var $ = cheerio.load(html);
        var streams = [];
        var serverCount = 1;

        $("iframe").each(function(_, el) {
            var src = $(el).attr("src");
            
            if (src && src.indexOf("facebook.com") === -1 && src.indexOf("youtube.com") === -1) {
                streams.push({
                    name: PROVIDER_NAME,
                    title: "Server " + serverCount++ + " (RO Dub)",
                    url: src,
                    quality: "1080p",
                    headers: { "Referer": BASE_URL + "/" }
                });
            }
        });

        return streams;
    }).catch(function(e) {
        console.log("[DeseneFaine] Extract Error:", e.message);
        return [];
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    return getTmdbTitle(tmdbId, mediaType).then(function(title) {
        if (!title) return [];
        
        return searchDeseneFaine(title, mediaType, season, episode).then(function(postUrl) {
            if (!postUrl) return [];
            
            return extractStreams(postUrl);
        });
    }).catch(function(e) {
        console.log("[DeseneFaine] Core Error:", e.message);
        return [];
    });
}

module.exports = { getStreams: getStreams };
