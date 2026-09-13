var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

function fetchText(url, options) {
    options = options || {};
    return fetch(url, { method: options.method || "GET", headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); });
}

function fetchPage(url, options) {
    options = options || {};
    return fetch(url, { method: options.method || "GET", headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
        .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text().then(function (text) { return { url: res.url || url, text: text }; });
        });
}

function fetchJson(url, options) {
    options = options || {};
    return fetch(url, { method: options.method || "GET", headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); });
}

function normalizeSlug(value) {
    return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
    return String(value || "").toLowerCase().replace(/ă/g, "a").replace(/â/g, "a").replace(/î/g, "i").replace(/ș/g, "s").replace(/ț/g, "t").replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeBase64(str) {
    try { if (typeof atob !== 'undefined') return atob(str); } catch (e) { }
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = ''; var chr1, chr2, chr3, enc1, enc2, enc3, enc4; var i = 0;
    str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < str.length) {
        enc1 = chars.indexOf(str.charAt(i++)); enc2 = chars.indexOf(str.charAt(i++));
        enc3 = chars.indexOf(str.charAt(i++)); enc4 = chars.indexOf(str.charAt(i++));
        chr1 = (enc1 << 2) | (enc2 >> 4); chr2 = ((enc2 & 15) << 4) | (enc3 >> 2); chr3 = ((enc3 & 3) << 6) | enc4;
        output += String.fromCharCode(chr1);
        if (enc3 != 64) output += String.fromCharCode(chr2);
        if (enc4 != 64) output += String.fromCharCode(chr3);
    }
    return output;
}

function processRouter(routerUrl, pageUrl, depth) {
    depth = depth || 0;
    if (depth > 5) return Promise.resolve(null);

    return fetchPage(routerUrl, { headers: { "Referer": pageUrl } }).then(function (page) {
        var html = page.text;
        var currentUrl = page.url || routerUrl;
        var hostMatch = currentUrl.match(/^https?:\/\/([^/?#]+)/i);
        var host = hostMatch ? hostMatch[1].toLowerCase().replace(/^www\./, "") : "";

        // fetch() follows redirects. If the router already ended at an external player,
        // process that final page instead of returning the DeseneFaine URL.
        if (host && host !== "desenefaine.com" && host !== "www.desenefaine.com") {
            return processExternalPage(currentUrl, html, pageUrl);
        }

        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        var encodedNext = html.match(/trhex=([^'"&]+)/i);
        var innerUrl = iframeMatch && iframeMatch[1];

        // The intermediate trhide page creates the next iframe in JavaScript.
        if (!innerUrl && encodedNext) {
            innerUrl = currentUrl.split("?")[0] + "?trhide=1&trhex=" + encodedNext[1];
        }
        if (!innerUrl) return null;

        innerUrl = innerUrl.replace(/\\\//g, "/");
        if (innerUrl.startsWith("//")) innerUrl = "https:" + innerUrl;
        else if (innerUrl.startsWith("/")) innerUrl = MAIN_URL + innerUrl;

        var innerHostMatch = innerUrl.match(/^https?:\/\/([^/?#]+)/i);
        var innerHost = innerHostMatch ? innerHostMatch[1].toLowerCase().replace(/^www\./, "") : "";
        if (innerHost === "desenefaine.com" || innerHost === "www.desenefaine.com") {
            return processRouter(innerUrl, currentUrl, depth + 1);
        }

        return fetchPage(innerUrl, { headers: { "Referer": currentUrl } })
            .then(function (externalPage) { return processExternalPage(innerUrl, externalPage.text, currentUrl); });
    }).catch(function () { return null; });
}

function processExternalPage(innerUrl, html, pageUrl) {
    var hostMatch = innerUrl.match(/^https?:\/\/([^/?#]+)/i);
    var host = hostMatch ? hostMatch[1].toLowerCase().replace(/^www\./, "") : "unknown";
    var domain = host.includes("player4me") ? "Player4Me" : host.includes("filemoon") ? "Filemoon" : host.includes("byse") ? "ByseHD" : host.includes("streamp2p") ? "StreamP2P" : host;
    var norm = String(html || "").replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
    var searchHtml = norm;

    // Filemoon may hide the playlist in a packed eval() payload.
    var pMatch = String(html || "").match(/eval\(function\(p,a,c,k,e,d\)\{.*?return p\}\('(.*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
    if (pMatch) {
        var p = pMatch[1], a = parseInt(pMatch[2]), c = parseInt(pMatch[3]), k = pMatch[4].split("|");
        var unpackKey = function (value) { return (value < a ? "" : unpackKey(parseInt(value / a))) + ((value = value % a) > 35 ? String.fromCharCode(value + 29) : value.toString(36)); };
        while (c--) { if (k[c]) p = p.replace(new RegExp("\\b" + unpackKey(c) + "\\b", "g"), k[c]); }
        searchHtml += "\n" + p.replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
    }

    var m3u8Match = searchHtml.match(/(https?:\/\/[^\s'"<>]+?\.m3u8(?:\?[^\s'"<>]+)?)/i);

    if (m3u8Match) {
        var streamUrl = m3u8Match[1].replace(/[\\"']+$/, "");
        var origin = host ? "https://" + host : MAIN_URL;
        return {
            name: PROVIDER_NAME + " | " + domain + " Direct",
            title: "1080p | RO Dub | Extracted",
            url: streamUrl,
            quality: "1080p",
            isM3U8: true,
            headers: { "Referer": innerUrl, "Origin": origin, "User-Agent": FETCH_HEADERS["User-Agent"] },
            behaviorHints: {
                bingeGroup: "desenefaine-1080p",
                proxyHeaders: { request: { "Referer": innerUrl, "Origin": origin, "User-Agent": FETCH_HEADERS["User-Agent"] } }
            },
            provider: "desenefaine"
        };
    }

    return {
        name: PROVIDER_NAME + " | " + domain,
        title: "1080p | RO Dub | Iframe",
        url: innerUrl,
        quality: "1080p",
        headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
        provider: "desenefaine"
    };
}

function getStreams(id, type, season, episode) {
    var isImdb = String(id).startsWith("tt");
    var endpoint = isImdb ? "find/" + id + "?external_source=imdb_id" : (type === "tv" ? "tv/" : "movie/") + id;
    var tmdbUrl = "https://api.themoviedb.org/3/" + endpoint + "?api_key=" + TMDB_API_KEY + "&language=ro-RO";

    return fetchJson(tmdbUrl).then(function (data) {
        var roTitle = ""; var enTitle = "";
        if (isImdb) {
            var results = type === "tv" ? data.tv_results : data.movie_results;
            if (results && results.length > 0) { roTitle = type === "tv" ? results[0].name : results[0].title; enTitle = type === "tv" ? results[0].original_name : results[0].original_title; }
        } else { roTitle = type === "tv" ? data.name : data.title; enTitle = type === "tv" ? data.original_name : data.original_title; }

        if (!roTitle) return [];

        function searchSite(query) {
            return fetchText(MAIN_URL + "/?s=" + encodeURIComponent(query)).then(function (html) {
                var $ = cheerio.load(html); var bestMatch = null; var queryWords = normalizeTitle(query).split(" ").filter(function (w) { return w.length > 2; });
                $("a").each(function (_, el) {
                    var href = $(el).attr("href");
                    if (!href || !href.includes("desenefaine.com") || /\/(category|tag|author|page|feed|wp-)/i.test(href)) return;
                    var text = normalizeTitle($(el).text().trim());
                    var matchCount = 0; queryWords.forEach(function (word) { if (text.includes(word)) matchCount++; });
                    if (matchCount >= Math.ceil(queryWords.length / 2)) { if (!bestMatch || text.length < bestMatch.text.length) bestMatch = { href: href, text: text, score: matchCount }; }
                });
                if (bestMatch) return fetchText(bestMatch.href).then(function (resHtml) { return { url: bestMatch.href, html: resHtml }; });
                return null;
            }).catch(function () { return null; });
        }

        var slug = normalizeSlug(roTitle);
        if (type === "tv" && season && episode) slug = normalizeSlug(roTitle) + "-sezonul-" + season + "-episodul-" + episode;
        var directUrl = MAIN_URL + "/film/" + slug + "/";

        return fetchText(directUrl).then(function (html) {
            if (html && html.length > 2000 && !html.includes("Nu am găsit")) return { url: directUrl, html: html };
            return searchSite(roTitle);
        }).catch(function () { return searchSite(roTitle); })
            .then(function (result) {
                if (!result || !result.html) return [];

                var $$ = cheerio.load(result.html);
                var routerUrls = [];

                // Extract all hidden Base64 buttons
                $$("[data-src]").each(function (_, el) {
                    var src = $$(el).attr("data-src");
                    if (src && src.startsWith("aHR0")) {
                        var decoded = decodeBase64(src);
                        if (decoded.includes("trembed") && !routerUrls.includes(decoded)) {
                            routerUrls.push(decoded);
                        }
                    }
                });

                if (routerUrls.length === 0) {
                    return [{ name: "Scrape Error", title: "No Base64 Routers Found on Page", url: "http://err", quality: "1080p", provider: "desenefaine" }];
                }

                // Process each router to find the server iframe
                var processPromises = routerUrls.map(function (rUrl) {
                    return processRouter(rUrl, result.url);
                });

                return Promise.all(processPromises).then(function (streams) {
                    var finalStreams = [];
                    for (var i = 0; i < streams.length; i++) {
                        if (streams[i]) finalStreams.push(streams[i]);
                    }
                    return finalStreams.length > 0 ? finalStreams : [{ name: "Error", title: "Could not extract any iframes", url: "http://err", quality: "1080p", provider: "desenefaine" }];
                });
            });
    }).catch(function () {
        return [];
    });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
