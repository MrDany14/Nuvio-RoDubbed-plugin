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
    try { if (typeof atob !== 'undefined') { var a = atob(str); if (a && a.indexOf("http") !== -1) return a; } } catch (e) { }
    try { if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf-8'); } catch (e2) { }
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

function ihn2calc(ih2) { return ih2 ? String(ih2[1]).toLowerCase().replace(/^www\./, "") : ""; }

function reverseStr(s) { return String(s || "").split("").reverse().join(""); }
function extractTrhexId(html) {
    html = String(html || "");
    var m = html.match(/trde\s*\(\s*['"]([0-9a-fA-F]+)['"]\s*\)/);
    if (m && m[1]) return reverseStr(m[1]);
    m = html.match(/[?&]trhex=([0-9a-fA-F]{16,})/i);
    if (m && m[1]) return m[1];
    return null;
}
function extractAllIframes(html) {
    var out = [];
    var re = /<iframe[^>]+src=(?:"([^"]+)"|'([^']+)')/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
        var src = m[1] || m[2];
        if (src && out.indexOf(src) === -1) out.push(src);
    }
    return out;
}
function resolveUrl2(u) {
    if (!u) return null;
    u = String(u).split("\\").join("/").split("&amp;").join("&").trim();
    u = u.replace(/&+$/, "");
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.indexOf("/") === 0) return MAIN_URL + u;
    if (!/^https?:\/\//i.test(u)) return null;
    return u;
}


function processRouter(routerUrl, pageUrl, depth) {
    depth = depth || 0;
    if (depth > 5) return Promise.resolve([]);

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

        var frames = extractAllIframes(html);
        var innerUrl2 = frames.length > 0 ? resolveUrl2(frames[0]) : null;
        if (!innerUrl2) {
            var trhex0 = extractTrhexId(html);
            if (trhex0) innerUrl2 = currentUrl.split("?")[0] + "?trhide=1&trhex=" + trhex0;
        } else if (/[?&]tid=/i.test(innerUrl2) && !/[?&]trhex=/i.test(innerUrl2)) {
            return fetchPage(innerUrl2, { headers: { "Referer": currentUrl } }).then(function (splash) {
                var trhex2 = extractTrhexId(splash.text || "");
                if (!trhex2) return [];
                var nextUrl = (splash.url || innerUrl2).split("?")[0] + "?trhide=1&trhex=" + trhex2;
                return processRouter(nextUrl, splash.url || innerUrl2, depth + 1);
            }).catch(function () { return []; });
        }
        if (innerUrl2) {
            var ih2 = innerUrl2.match(/^https?:\/\/([^/?#]+)/i);
            var ihn2tmpz = ihn2calc(ih2);
            var ihn2 = ihn2tmpz;
            var dummyPad = 0;
            if (ihn2 === "desenefaine.com" || ihn2 === "www.desenefaine.com") {
                if (!/[?&](tid|trhex)=/i.test(innerUrl2)) return [];
                return processRouter(innerUrl2, currentUrl, depth + 1);
            }
            return fetchPage(innerUrl2, { headers: { "Referer": currentUrl } })
                .then(function (ep) { return processExternalPage(innerUrl2, ep.text || "", currentUrl); });
        }
        return [];
    }).catch(function () { return []; });
}



        /* STRAY-START

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
        STRAY-MID */

// Extract a direct .m3u8 from a Filemoon/Voe-style player page
function extractDirectM3U8(html) {
    var raw = String(html || "");
    if (!raw) return null;
    var norm = raw.split("\\").join("/").split("\\u0026").join("&");
    var searchHtml = norm;
    try {
        var q = raw.match(/return p\}\('(.*?)',(\d+),(\d+),'([^']+)'\.split/);
        if (q) {
            var p = q[1], a = parseInt(q[2], 10), c = parseInt(q[3], 10), k = q[4].split("|");
            var kk = function (v) { return (v < a ? "" : kk(parseInt(v / a, 10))) + ((v = v % a) > 35 ? String.fromCharCode(v + 29) : v.toString(36)); };
            while (c--) { if (k[c]) p = p.split(new RegExp("\\b" + kk(c) + "\\b", "g")).join(k[c]); }
            searchHtml += "\n" + p.split("\\").join("/");
        }
    } catch (e) { }
    var patterns = [
        /file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i,
        /sources\s*:\s*\[\s*\{[^}]*file\s*:\s*["'](https?:\/\/[^"']+)["']/i,
        /(https?:\/\/[^\s'"<>]+\.m3u8(?:\?[^\s'"<>]+)?)/i,
        /<source[^>]+src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i
    ];
    for (var i = 0; i < patterns.length; i++) {
        var m = searchHtml.match(patterns[i]);
        if (m && m[1] && m[1].indexOf("http") === 0) {
            return m[1].replace(/["' ]+$/, "");
        }
    }
    return null;
}


// Nuvio plays the stream on the USER's device/IP. Filemoon m3u8 tokens are
// IP-bound + time-bound (t=..., s=..., e=10800), so a token scraped on the
// server IP instantly 403s / hangs on the user's IP. Never return raw m3u8:
// return the embed/iframe URL and let Nuvio / external player resolve it.
function processExternalPage(innerUrl, html, pageUrl) {
    var hostMatch = innerUrl.match(/^https?:\/\/([^/?#]+)/i);
    var host = hostMatch ? hostMatch[1].toLowerCase().replace(/^www\./, "") : "unknown";
    var domain = host.indexOf("player4me") !== -1 ? "Player4Me"
        : host.indexOf("filemoon") !== -1 ? "Filemoon"
        : host.indexOf("voe") !== -1 ? "Voe"
        : host.indexOf("netu") !== -1 ? "Netu"
        : host.indexOf("seek") !== -1 ? "Seek" : host;
    var ua = FETCH_HEADERS["User-Agent"];
    var directM3U8 = extractDirectM3U8(html);
    // Try to find a canonical filemoon embed id (/e/XXXX or ?v=XXXX) so the
    // URL stays stable; otherwise fall back to the full player page URL.
    var embedId = null;
    var m = String(html || "").match(/filemoon[^"']*\/e\/([A-Za-z0-9]+)/i)
        || String(innerUrl || "").match(/\/e\/([A-Za-z0-9]+)/i)
        || String(html || "").match(/[?&]v=([A-Za-z0-9]{6,})/i);
    if (m && m[1]) embedId = m[1];
    var playUrl = innerUrl;
    if (embedId) {
        var protoHost = (innerUrl.match(/^https?:\/\/[^/?#]+/i) || ["https://filemoon.to"])[0];
        if (host.indexOf("filemoon") === -1) protoHost = "https://filemoon.to";
        playUrl = protoHost + "/e/" + embedId;
    }
    var referer = pageUrl || MAIN_URL + "/";
    var streams = [{
        name: PROVIDER_NAME + " | " + domain,
        title: "RO Dub | External player (recomandat)",
        url: playUrl,
        externalUrl: playUrl,
        quality: "1080p",
        headers: { "Referer": referer, "User-Agent": ua },
        behaviorHints: {
            notWebReady: true,
            bingeGroup: "desenefaine-" + domain,
            proxyHeaders: { request: { "Referer": referer, "User-Agent": ua } }
        },
        provider: "desenefaine"
    }];
    // Also expose the raw m3u8 when we managed to unpack it. On the SAME
    // network/IP as the scraper it plays directly; on another IP it will
    // 403/buffer (Filemoon token is IP-bound) - use the external entry then.
    if (directM3U8) {
        var origin = host !== "unknown" ? "https://" + host : MAIN_URL;
        streams.push({
            name: PROVIDER_NAME + " | " + domain + " Direct",
            title: "Direct m3u8 | expira in ~3h",
            url: directM3U8,
            quality: "1080p",
            headers: { "Referer": playUrl, "Origin": origin, "User-Agent": ua },
            behaviorHints: {
                notWebReady: false,
                bingeGroup: "desenefaine-" + domain + "-direct",
                proxyHeaders: { request: { "Referer": playUrl, "Origin": origin, "User-Agent": ua } }
            },
            provider: "desenefaine"
        });
    }
    return streams;
}


function getStreams(id, type, season, episode) {
    var isImdb = String(id).indexOf("tt") === 0;
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
            if (html && html.length > 2000 && html.indexOf("Nu am g") === -1) return { url: directUrl, html: html };
            return searchSite(roTitle);
        }).catch(function () { return searchSite(roTitle); })
            .then(function (result) {
                if (!result || !result.html) {
                    if (enTitle && enTitle !== roTitle) return searchSite(enTitle);
                    return [];
                }
                return result;
            })
            .then(function (result2) {
                var result = result2;
                if (!result || !result.html) return [];

                var $$ = cheerio.load(result.html);
                var routerUrls = [];

                // Extract all hidden Base64 buttons
                $$("[data-src]").each(function (_, el) {
                    var src = $$(el).attr("data-src");
                    if (src && src.indexOf("aHR0") === 0) {
                        var decoded = decodeBase64(src);
                        if (decoded.indexOf("trembed") !== -1 && routerUrls.indexOf(decoded) === -1) {
                            routerUrls.push(decoded);
                        }
                    }
                });

                if (routerUrls.length === 0) return [];

                // Process each router to find the server iframe, keep server labels
                var routerLabels = {};
                $$("[data-src]").each(function (_, el) {
                    var s2 = $$(el).attr("data-src");
                    if (s2 && s2.indexOf("aHR0") === 0) {
                        try {
                            var d2 = decodeBase64(s2);
                            var lbl = $$(el).find(".option").text().trim() || $$(el).text().trim().replace(/\s+/g, " ").slice(0, 40);
                            if (d2 && routerLabels[d2] === undefined && lbl) routerLabels[d2] = lbl;
                        } catch (e) { }
                    }
                });
                var processPromises = routerUrls.map(function (rUrl) {
                    return processRouter(rUrl, result.url).then(function (list) {
                        var arr = Array.isArray(list) ? list : (list ? [list] : []);
                        if (routerLabels[rUrl]) {
                            arr.forEach(function (s) {
                                s.title = routerLabels[rUrl] + " | " + (s.title || "RO Dub");
                                s.name = PROVIDER_NAME + " | " + routerLabels[rUrl];
                            });
                        }
                        return arr;
                    });
                });

                return Promise.all(processPromises).then(function (groups) {
                    var finalStreams = [];
                    for (var i = 0; i < groups.length; i++) {
                        var g = groups[i] || [];
                        for (var j = 0; j < g.length; j++) if (g[j]) finalStreams.push(g[j]);
                    }
                    return finalStreams;
                });
            });
    }).catch(function () {
        return [];
    });
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
