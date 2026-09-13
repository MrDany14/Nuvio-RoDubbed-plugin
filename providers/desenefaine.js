var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
};

function fetchText(url, options) {
    options = options || {};
    return fetch(url, { headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); });
}

function fetchPage(url, options) {
    options = options || {};
    return fetch(url, { headers: Object.assign({}, FETCH_HEADERS, options.headers || {}) })
        .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text().then(function (text) { return { url: res.url || url, text: text }; });
        });
}

function fetchJson(url) {
    return fetch(url, { headers: FETCH_HEADERS })
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); });
}

function normalizeSlug(value) {
    return String(value || "").toLowerCase()
        .replace(/[\u0103\u0102\u00e2\u00c2]/g, "a")
        .replace(/[\u00ee\u00ce]/g, "i")
        .replace(/[\u0219\u0218]/g, "s")
        .replace(/[\u021b\u021a]/g, "t")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
    return String(value || "").toLowerCase()
        .replace(/[\u0103\u0102\u00e2\u00c2]/g, "a")
        .replace(/[\u00ee\u00ce]/g, "i")
        .replace(/[\u0219\u0218]/g, "s")
        .replace(/[\u021b\u021a]/g, "t")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function decodeBase64(str) {
    try { if (typeof Buffer !== "undefined") return Buffer.from(str, "base64").toString("utf-8"); } catch (e) { }
    try { if (typeof atob !== "undefined") return atob(str); } catch (e2) { }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var output = "";
    var i = 0;
    str = String(str || "").replace(/[^A-Za-z0-9\+\/\=]/g, "");
    while (i < str.length) {
        var enc1 = chars.indexOf(str.charAt(i++));
        var enc2 = chars.indexOf(str.charAt(i++));
        var enc3 = chars.indexOf(str.charAt(i++));
        var enc4 = chars.indexOf(str.charAt(i++));
        var chr1 = (enc1 << 2) | (enc2 >> 4);
        var chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
// Parse ?trhide splash pages. trde('HEX') stores the TID REVERSED, so the
// real trhex = reverse(that hex).
function extractTrhexId(html) {
    html = String(html || "");
    // trde('HEX') / trde("HEX")
    var p = html.indexOf("trde(");
    while (p !== -1) {
        var cq = html.charAt(p + 5);
        if (cq === "'" || cq === "\"") {
            var s = p + 6;
            var e = html.indexOf(cq, s);
            if (e !== -1) {
                var hex = html.substring(s, e);
                var onlyHex = true;
                for (var k = 0; k < hex.length; k++) {
                    var c = hex.charAt(k);
                    var ok = (c >= "0" && c <= "9") || (c >= "a" && c <= "f") || (c >= "A" && c <= "F");
                    if (!ok) { onlyHex = false; break; }
                }
                if (onlyHex && hex.length >= 16) return reverseStr(hex);
            }
        }
        p = html.indexOf("trde(", p + 1);
    }
    // trhex=HEX directly in HTML/JS string
    p = html.indexOf("trhex=");
    while (p !== -1) {
        var hex2 = "";
        var i2 = p + 6;
        while (i2 < html.length) {
            var c2 = html.charAt(i2);
            var ok2 = (c2 >= "0" && c2 <= "9") || (c2 >= "a" && c2 <= "f") || (c2 >= "A" && c2 <= "F");
            if (!ok2) break;
            hex2 += c2;
            i2++;
        }
        if (hex2.length >= 16) return hex2;
        p = html.indexOf("trhex=", p + 1);
    }
    return null;
}

function extractAllIframes(html) {
    var out = [];
    html = String(html || "");
    var pos = 0;
    while (true) {
        var f = html.indexOf("<iframe", pos);
        if (f === -1) break;
        var s1 = html.indexOf('src="', f);
        var q1 = "\"";
        if (s1 === -1) { s1 = html.indexOf("src='", f); q1 = "'"; }
        if (s1 === -1) { pos = f + 7; continue; }
        var v0 = s1 + 5;
        var v1 = html.indexOf(q1, v0);
        if (v1 === -1) break;
        var src = html.substring(v0, v1);
        if (src && out.indexOf(src) === -1) out.push(src);
        pos = v1 + 1;
    }
    return out;
}

var BACKSLASH = String.fromCharCode(92);

function cleanUrl(u) {
    if (!u) return null;
    var s = String(u).split(BACKSLASH).join("/").split("&amp;").join("&").trim();
    while (s.charAt(s.length - 1) === "&") s = s.substring(0, s.length - 1);
    s = s.trim();
    if (s.indexOf("//") === 0) return "https:" + s;
    if (s.indexOf("/") === 0) return MAIN_URL + s;
    var low = s.toLowerCase();
    if (low.indexOf("http://") === 0 || low.indexOf("https://") === 0) return s;
    return null;
}

function hostOf(url) {
    var s = String(url || "");
    var p = s.indexOf("://");
    if (p === -1) return "";
    var rest = s.substring(p + 3);
    var end = rest.length;
    var q1 = rest.indexOf("/");
    var q2 = rest.indexOf("?");
    var q3 = rest.indexOf("#");
    if (q1 !== -1 && q1 < end) end = q1;
    if (q2 !== -1 && q2 < end) end = q2;
    if (q3 !== -1 && q3 < end) end = q3;
    var h = rest.substring(0, end).toLowerCase();
    if (h.indexOf("www.") === 0) h = h.substring(4);
    return h;
}

function makeStream(url, label, referer) {
    return {
        name: PROVIDER_NAME + " | " + label,
        title: label + " | RO Dub",
        url: url,
        externalUrl: url,
        quality: "1080p",
        headers: { "Referer": referer, "User-Agent": FETCH_HEADERS["User-Agent"] },
        behaviorHints: {
            notWebReady: true,
            bingeGroup: "desenefaine-" + label,
            proxyHeaders: { request: { "Referer": referer, "User-Agent": FETCH_HEADERS["User-Agent"] } }
        },
        provider: "desenefaine"
    };
}
        var chr3 = ((enc3 & 3) << 6) | enc4;
        output += String.fromCharCode(chr1);
        if (enc3 !== 64) output += String.fromCharCode(chr2);
        if (enc4 !== 64) output += String.fromCharCode(chr3);
    }
    return output;
}

function reverseStr(s) { return String(s || "").split("").reverse().join(""); }
