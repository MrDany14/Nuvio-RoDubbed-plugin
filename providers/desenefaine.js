var PROVIDER_NAME = "Extractor Test";

// ---> PASTE YOUR EXACT WORKING M3U8 LINK HERE <---
var TARGET_URL = "https://edge1.sprintcdn.com/master.m3u8?token=PASTE_YOUR_LINK_HERE"; 

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Referer": "https://player4me.com/",
  "Origin": "https://player4me.com"
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
        streams.push({
            name: "T" + testNum + " | " + status,
            title: approachName + "\nExtracted: " + (extractedString ? extractedString.substring(0, 30) + "..." : "null"),
            url: isSuccess ? TARGET_URL : "http://example.com/loop",
            quality: "1080p",
            isM3U8: isSuccess,
            headers: FETCH_HEADERS,
            behaviorHints: { bingeGroup: "test-group" },
            provider: "desenefaine"
        });
    }

    // 1. Direct Baseline (Control Test)
    check(1, "Direct String Baseline", TARGET_URL);

    // 2. Standard JSON Parse
    var sim2 = '{"file": "' + TARGET_URL + '"}';
    try { check(2, "JSON.parse Extraction", JSON.parse(sim2).file); } catch(e) { check(2, "JSON.parse", null); }

    // 3. Regex on JSON Array
    var sim3 = '{"sources":[{"file":"' + TARGET_URL + '"}]}';
    var m3 = sim3.match(/"file"\s*:\s*"(https?:\/\/[^"]+)"/);
    check(3, "Regex on JSON Array", m3 ? m3[1] : null);

    // 4. Split Method
    var sim4 = 'video_url="' + TARGET_URL + '";';
    var s4 = sim4.split('video_url="')[1] ? sim4.split('video_url="')[1].split('"')[0] : null;
    check(4, "String Split Method", s4);

    // 5. Unescape Slashes (\/)
    var sim5 = TARGET_URL.replace(/\//g, '\\/');
    var m5 = sim5.match(/(https?:\\[/][/][^"'\s<>]+)/);
    check(5, "Unescape Forward Slashes", m5 ? m5[1].replace(/\\\//g, "/") : null);

    // 6. Base64 Decode
    var sim6 = encodeBase64(TARGET_URL);
    var dec6 = decodeBase64(sim6);
    check(6, "Base64 Decoding", dec6);

    // 7. General M3U8 Regex
    var sim7 = '<a href="' + TARGET_URL + '">Click</a>';
    var m7 = sim7.match(/(https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/i);
    check(7, "Broad M3U8 Regex", m7 ? m7[1] : null);

    // 8. Unicode Unescape (\u0026)
    var sim8 = TARGET_URL.replace(/&/g, '\\u0026');
    var s8 = sim8.replace(/\\u0026/gi, "&");
    check(8, "Unicode Ampersand Unescape", s8);

    // 9. DOM <source> Regex
    var sim9 = '<video><source src="' + TARGET_URL + '" type="application/x-mpegURL"></video>';
    var m9 = sim9.match(/<source[^>]+src=["']([^"']+)["']/i);
    check(9, "DOM Source Attribute", m9 ? m9[1] : null);

    // 10. Query Parameter Extraction
    var sim10 = 'https://player4me.com/api?redirect=' + encodeURIComponent(TARGET_URL);
    var m10 = sim10.match(/redirect=([^&]+)/);
    check(10, "URI Component Decode", m10 ? decodeURIComponent(m10[1]) : null);

    // 11. Iframe Data-Src
    var sim11 = '<iframe data-src="' + TARGET_URL + '"></iframe>';
    var m11 = sim11.match(/data-src=["']([^"']+)["']/i);
    check(11, "Iframe data-src Regex", m11 ? m11[1] : null);

    // 12. ATOB Javascript Match
    var sim12 = 'var link = atob("' + encodeBase64(TARGET_URL) + '");';
    var m12 = sim12.match(/atob\(['"]([^'"]+)['"]\)/i);
    check(12, "Embedded atob() Match", m12 ? decodeBase64(m12[1]) : null);

    // 13. IndexOf / Substring
    var sim13 = 'stream_link:' + TARGET_URL + '|end';
    var start13 = sim13.indexOf('stream_link:') + 12;
    var end13 = sim13.indexOf('|end');
    check(13, "IndexOf Substring", sim13.substring(start13, end13));

    // 14. Nested JSON Stringified Parse
    var sim14 = '{"data": "' + TARGET_URL.replace(/"/g, '\\"') + '"}';
    try { check(14, "Nested Object Parse", JSON.parse(sim14).data); } catch(e) { check(14, "Nested Object Parse", null); }

    // 15. Regex specific to SprintCDN edge format
    var sim15 = 'src="' + TARGET_URL + '"';
    var m15 = sim15.match(/(https?:\/\/(?:edge[0-9]+|eu)[^\s"'<>]+sprintcdn[^\s"'<>]+)/i);
    check(15, "SprintCDN Specific Regex", m15 ? m15[1] : null);

    // 16. Single Quote Regex
    var sim16 = "file: '" + TARGET_URL + "'";
    var m16 = sim16.match(/file:\s*'([^']+)'/i);
    check(16, "Single Quote Boundary", m16 ? m16[1] : null);

    // 17. Base Domain Assembly
    var parts = TARGET_URL.split('?');
    var sim17Domain = parts[0];
    var sim17Query = parts[1];
    check(17, "String Assembly (Domain + Query)", sim17Domain + '?' + sim17Query);

    // 18. Match Without Protocol (//edge1...)
    var sim18 = TARGET_URL.replace("https://", "//");
    var m18 = sim18.match(/(\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/i);
    check(18, "Protocol-less Assembly", m18 ? "https:" + m18[1] : null);

    // 19. Eval Sandbox Simulation (Regexing packed code)
    var sim19 = 'eval(function(p,a,c,k,e,d){return "' + TARGET_URL + '"})';
    var m19 = sim19.match(/return\s+["'](https?:\/\/[^"']+)["']/i);
    check(19, "Packed Eval Regex", m19 ? m19[1] : null);

    // 20. URL Object Protocol Enforcement
    try {
        var u = new URL(TARGET_URL);
        check(20, "URL Object Parsing", u.href);
    } catch(e) {
        check(20, "URL Object Parsing", null);
    }

    return Promise.resolve(streams);
}

if (typeof module !== "undefined" && module.exports) module.exports = { getStreams: getStreams };
else global.getStreams = getStreams;
