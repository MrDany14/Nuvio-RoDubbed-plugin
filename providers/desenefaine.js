var PROVIDER_NAME = "Filemoon Extractor Test";
var TARGET_URL = "https://edge1-moscow-sprintcdn.owphbf24.com/hls2/06/06323/7lw4veaf96an_x/master.m3u8?t=hQZXGlVjsBmcbheQb5MKKKGAB0wguj61GZHK-1ElqWs&s=1789300723&e=10800&f=45949933&srv=1070&asn=8708&sp=5500&p=0";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://filemoon.sx/",
  "Origin": "https://filemoon.sx"
};

function decodeBase64(str) {
    try { if (typeof atob !== 'undefined') return atob(str); } catch (e) {}
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

function encodeBase64(str) {
    try { if (typeof btoa !== 'undefined') return btoa(str); } catch (e) {}
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = ''; var chr1, chr2, chr3, enc1, enc2, enc3, enc4; var i = 0;
    while (i < str.length) {
        chr1 = str.charCodeAt(i++); chr2 = str.charCodeAt(i++); chr3 = str.charCodeAt(i++);
        enc1 = chr1 >> 2; enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
        enc3 = ((chr2 & 15) << 2) | (chr3 >> 6); enc4 = chr3 & 63;
        if (isNaN(chr2)) { enc3 = enc4 = 64; } else if (isNaN(chr3)) { enc4 = 64; }
        output += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
    }
    return output;
}

function getStreams(id, type, season, episode) {
    var streams = [];

    function check(testNum, approachName, extractedString) {
        var isSuccess = (extractedString === TARGET_URL);
        var status = isSuccess ? "SUCCESS" : "FAILED";
        var diagText = extractedString ? extractedString.substring(0, 45) + "..." : "null";
        
        // If it failed but extracted something, show what got cut off
        if (!isSuccess && extractedString && extractedString.includes("m3u8")) {
            diagText = "TRUNCATED: " + extractedString.split("?")[1]; 
        }

        streams.push({
            name: "T" + testNum + " | " + status,
            title: approachName + "\nResult: " + diagText,
            url: isSuccess ? TARGET_URL : "http://example.com/loop",
            quality: "1080p",
            isM3U8: isSuccess,
            headers: FETCH_HEADERS,
            behaviorHints: { bingeGroup: "test-group" },
            provider: "desenefaine"
        });
    }

    // 1. Direct Baseline (Verifies Nuvio plays this exact link)
    check(1, "Hardcoded Working Link", TARGET_URL);

    // 2. Standard JSON Parse
    var sim2 = '{"file": "' + TARGET_URL + '"}';
    try { check(2, "JSON.parse Extraction", JSON.parse(sim2).file); } catch(e) { check(2, "JSON.parse", null); }

    // 3. Regex on JSON (Stopping at quotes)
    var sim3 = '{"sources":[{"file":"' + TARGET_URL + '"}]}';
    var m3 = sim3.match(/"file"\s*:\s*"(https?:\/\/[^"]+)"/);
    check(3, "Regex to next Quote", m3 ? m3[1] : null);

    // 4. Loose M3U8 Regex (Often truncates query params!)
    var sim4 = '<a href="' + TARGET_URL + '">Click</a>';
    var m4 = sim4.match(/(https?:\/\/[^\s"'<>]+?\.m3u8)/i);
    check(4, "Loose M3U8 Regex (No Params)", m4 ? m4[1] : null);

    // 5. Strict M3U8 Regex (Captures query params properly)
    var sim5 = "src='" + TARGET_URL + "'";
    var m5 = sim5.match(/(https?:\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]+)?)/i);
    check(5, "Strict M3U8 Regex (With Params)", m5 ? m5[1] : null);

    // 6. Base64 Decode
    var sim6 = encodeBase64(TARGET_URL);
    var dec6 = decodeBase64(sim6);
    check(6, "Base64 Decoding", dec6);

    // 7. Unicode Ampersand Fix
    var sim7 = TARGET_URL.replace(/&/g, '\\u0026');
    var s7 = sim7.replace(/\\u0026/gi, "&");
    check(7, "Unicode Ampersand Unescape", s7);

    // 8. Unescape Forward Slashes
    var sim8 = TARGET_URL.replace(/\//g, '\\/');
    var m8 = sim8.match(/(https?:\\[/][/][^"'\s<>]+(?:\?[^"'\s<>]+)?)/);
    check(8, "Unescape Forward Slashes", m8 ? m8[1].replace(/\\\//g, "/") : null);

    // 9. Iframe Data-Src with Params
    var sim9 = '<iframe data-src="' + TARGET_URL + '"></iframe>';
    var m9 = sim9.match(/data-src=["']([^"']+)["']/i);
    check(9, "Iframe data-src Boundary Regex", m9 ? m9[1] : null);

    // 10. Split String Method
    var sim10 = 'file:"' + TARGET_URL + '",label';
    var s10 = sim10.split('file:"')[1] ? sim10.split('file:"')[1].split('"')[0] : null;
    check(10, "Split String Method", s10);

    // 11. HTML5 Video Tag Source
    var sim11 = '<video><source src="' + TARGET_URL + '" type="application/x-mpegURL"></video>';
    var m11 = sim11.match(/<source[^>]+src=["']([^"']+)["']/i);
    check(11, "DOM Source Attribute", m11 ? m11[1] : null);

    // 12. Packed Eval Regex (Filemoon often uses this)
    var sim12 = 'eval(function(p,a,c,k,e,d){return "' + TARGET_URL + '"})';
    var m12 = sim12.match(/return\s+["'](https?:\/\/[^"']+)["']/i);
    check(12, "Packed Eval Regex", m12 ? m12[1] : null);

    // 13. Filemoon Specific File Parameter
    var sim13 = 'file:"' + TARGET_URL + '",';
    var m13 = sim13.match(/file\s*:\s*["'](https?:\/\/[^"']+)["']/i);
    check(13, "Filemoon 'file:' JS Regex", m13 ? m13[1] : null);

    // 14. Nested Object Parse
    var sim14 = '{"video": {"url": "' + TARGET_URL.replace(/"/g, '\\"') + '"}}';
    try { check(14, "Nested JSON Parse", JSON.parse(sim14).video.url); } catch(e) { check(14, "Nested JSON", null); }

    // 15. ATOB Extraction
    var sim15 = 'var link = atob("' + encodeBase64(TARGET_URL) + '");';
    var m15 = sim15.match(/atob\(['"]([^'"]+)['"]\)/i);
    check(15, "Embedded atob() JS Match", m15 ? decodeBase64(m15[1]) : null);

    // 16. URL Parsing Verification
    try { var u = new URL(TARGET_URL); check(16, "Native URL Object", u.href); } catch(e) { check(16, "URL Object", null); }

    // 17. JwPlayer Format Regex
    var sim17 = '[{file:"' + TARGET_URL + '"}]';
    var m17 = sim17.match(/\{file:\s*["']([^"']+)["']/i);
    check(17, "JWPlayer Array Format", m17 ? m17[1] : null);

    // 18. Protocol-less Extraction
    var sim18 = TARGET_URL.replace("https://", "//");
    var m18 = sim18.match(/(\/\/[^\s"'<>]+?\.m3u8(?:\?[^\s"'<>]+)?)/i);
    check(18, "Protocol-less (//edge...) Assembly", m18 ? "https:" + m18[1] : null);

    // 19. SprintCDN Subdomain Regex
    var sim19 = "link='" + TARGET_URL + "'";
    var m19 = sim19.match(/(https?:\/\/(?:edge[0-9]+-.*?)sprintcdn[^\s"'<>]+)/i);
    check(19, "SprintCDN Dedicated Regex", m19 ? m19[1] : null);

    // 20. URI Component Decoding
    var sim20 = 'https://filemoon.sx/api?redirect=' + encodeURIComponent(TARGET_URL);
    var m20 = sim20.match(/redirect=([^&]+)/);
    check(20, "URI Component Decoding", m20 ? decodeURIComponent(m20[1]) : null);

    return Promise.resolve(streams);
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
