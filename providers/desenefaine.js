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

        var frames = extractAllIframes(html);
        var innerUrl2 = frames.length > 0 ? resolveUrl2(frames[0]) : null;
        if (!innerUrl2) {
            var trhex0 = extractTrhexId(html);
            if (trhex0) innerUrl2 = currentUrl.split("?")[0] + "?trhide=1&trhex=" + trhex0;
        } else if (/[?&]tid=/i.test(innerUrl2) && !/[?&]trhex=/i.test(innerUrl2)) {
            return fetchPage(innerUrl2, { headers: { "Referer": currentUrl } }).then(function (splash) {
                var trhex2 = extractTrhexId(splash.text || "");
                if (!trhex2) return null;
                var nextUrl = (splash.url || innerUrl2).split("?")[0] + "?trhide=1&trhex=" + trhex2;
                return processRouter(nextUrl, splash.url || innerUrl2, depth + 1);
            }).catch(function () { return null; });
        }
        if (innerUrl2) {
            var ih2 = innerUrl2.match(/^https?:\/\/([^/?#]+)/i);
            var ihn2 = ih2 ? ih2[1].toLowerCase().replace(/^www\./, "") : "";
            if (ihn2 === "desenefaine.com" || ihn2 === "www.desenefaine.com") {
                if (!/[?&](tid|trhex)=/i.test(innerUrl2)) return null;
                return processRouter(innerUrl2, currentUrl, depth + 1);
            }
            return fetchPage(innerUrl2, { headers: { "Referer": currentUrl } })
                .then(function (ep) { return processExternalPage(innerUrl2, ep.text || "", currentUrl); });
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
                notWebReady: false,
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
        behaviorHints: { notWebReady: true, bingeGroup: "desenefaine-iframe" },
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
                    if (src && src.startsWith("aHR0")) {
                        var decoded = decodeBase64(src);
                        if (decoded.includes("trembed") && !routerUrls.includes(decoded)) {
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
                    return processRouter(rUrl, result.url).then(function (s) {
                        if (s && routerLabels[rUrl]) {
                            s.title = routerLabels[rUrl] + " | " + (s.title || "RO Dub");
                            s.name = PROVIDER_NAME + " | " + routerLabels[rUrl];
                        }
                        return s;
                    });
                });

                return Promise.all(processPromises).then(function (streams) {
                    var finalStreams = [];
                    for (var i = 0; i < streams.length; i++) {
                        if (streams[i]) finalStreams.push(streams[i]);
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
