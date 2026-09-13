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

function processRouter(routerUrl, pageUrl) {
    return fetchText(routerUrl, { headers: { "Referer": pageUrl } }).then(function (html) {
        var iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
        if (!iframeMatch || !iframeMatch[1]) return null;

        var innerUrl = iframeMatch[1].replace(/\\\//g, "/");
        if (innerUrl.startsWith("//")) innerUrl = "https:" + innerUrl;

        var hostMatch = innerUrl.match(/^https?:\/\/([^/?#]+)/i);
        var domain = hostMatch ? hostMatch[1].replace("www.", "") : "Unknown Server";

        // Friendly names for known servers
        if (domain.includes("player4me")) domain = "Player4Me";
        else if (domain.includes("filemoon")) domain = "Filemoon";
        else if (domain.includes("byse")) domain = "ByseHD";
        else if (domain.includes("streamp2p")) domain = "StreamP2P";

        // Attempt a quick Filemoon unpacking if it's Filemoon
        if (domain === "Filemoon") {
            return fetchText(innerUrl, { headers: { "Referer": MAIN_URL } }).then(function (fmHtml) {
                // Try multiple strategies to extract a .m3u8 URL from Filemoon pages
                try {
                    // Normalize common escape sequences to make regexes simpler
                    var norm = fmHtml.replace(/\\\//g, "/").replace(/\\u0026/gi, "&");

                    // 1) Try old-school packed eval(unpack) pattern
                    var pMatch = fmHtml.match(/eval\(function\(p,a,c,k,e,d\)\{.*?return p\}\('(.*?)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/);
                    if (pMatch) {
                        var p = pMatch[1], a = parseInt(pMatch[2]), c = parseInt(pMatch[3]), k = pMatch[4].split('|');
                        var e = function (c) { return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36)); };
                        while (c--) { if (k[c]) p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]); }
                        var m3u8Match = p.match(/(https?:\/\/[^\s'"<>]+?\.m3u8(?:\?[^\s'"<>]+)?)/i);
                        if (m3u8Match) {
                            return {
                                name: PROVIDER_NAME + " | Filemoon Direct",
                                title: "1080p | RO Dub | Extracted",
                                url: m3u8Match[1].replace(/\\\//g, "/").replace(/\\u0026/gi, "&"),
                                quality: "1080p",
                                isM3U8: true,
                                headers: { "Referer": "https://filemoon.sx/", "Origin": "https://filemoon.sx", "User-Agent": FETCH_HEADERS["User-Agent"] },
                                behaviorHints: { bingeGroup: "desenefaine-1080p" },
                                provider: "desenefaine"
                            };
                        }
                    }

                    // 2) Generic search in normalized HTML for any .m3u8 URL (covers many embedding styles)
                    var genericMatch = norm.match(/(https?:\/\/[^\s'"<>]+?\.m3u8(?:\?[^\s'"<>]+)?)/i);
                    if (genericMatch) {
                        return {
                            name: PROVIDER_NAME + " | Filemoon Direct",
                            title: "1080p | RO Dub | Extracted",
                            url: genericMatch[1],
                            quality: "1080p",
                            isM3U8: true,
                            headers: { "Referer": innerUrl, "Origin": (new URL(innerUrl)).origin, "User-Agent": FETCH_HEADERS["User-Agent"] },
                            behaviorHints: { bingeGroup: "desenefaine-1080p" },
                            provider: "desenefaine"
                        };
                    }
                } catch (e) {
                    // fallthrough to fallback below
                }
                throw new Error("Fallback");
            }).catch(function () {
                // Fallback to returning the raw iframe
                return {
                    name: PROVIDER_NAME + " | Filemoon Iframe",
                    title: "1080p | RO Dub | May Loop",
                    url: innerUrl,
                    quality: "1080p",
                    headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
                    provider: "desenefaine"
                };
            });
        }

        // Return raw iframe for all other servers
        return {
            name: PROVIDER_NAME + " | " + domain,
            title: "1080p | RO Dub | Iframe",
            url: innerUrl,
            quality: "1080p",
            headers: { "Referer": pageUrl, "User-Agent": FETCH_HEADERS["User-Agent"] },
            provider: "desenefaine"
        };
    }).catch(function () { return null; });
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
