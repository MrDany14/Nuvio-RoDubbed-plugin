var cheerio = require("cheerio-without-node-native");

var PROVIDER_NAME = "DeseneFaine";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

var FETCH_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

var STREAM_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept": "*/*",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "identity",
  "Connection": "keep-alive"
};

function log(msg) {
  console.log("[" + PROVIDER_NAME + "] " + msg);
}

function fetchText(url, options) {
  options = options || {};

  var headers = Object.assign({}, FETCH_HEADERS, options.headers || {});

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: headers,
    body: options.body
  }).then(function(res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};

  var headers = Object.assign({}, FETCH_HEADERS, options.headers || {});

  return fetch(url, {
    method: options.method || "GET",
    redirect: options.redirect || "follow",
    headers: headers,
    body: options.body
  }).then(function(res) {
    if (!res.ok) {
      throw new Error("HTTP " + res.status + " -> " + url);
    }

    return res.json();
  });
}

function normalizeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ş/g, "s")
    .replace(/ț/g, "t")
    .replace(/ţ/g, "t")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ş/g, "s")
    .replace(/ț/g, "t")
    .replace(/ţ/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function absoluteUrl(base, value) {
  if (!value) {
    return null;
  }

  value = String(value).trim();

  if (!value) {
    return null;
  }

  if (value.indexOf("//") === 0) {
    return "https:" + value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.indexOf("javascript:") === 0) {
    return null;
  }

  if (value.charAt(0) === "/") {
    var originMatch = String(base).match(/^(https?:\/\/[^\/]+)/i);

    if (originMatch) {
      return originMatch[1] + value;
    }

    return MAIN_URL + value;
  }

  var cleanBase = String(base).split("#")[0];

  if (cleanBase.charAt(cleanBase.length - 1) !== "/") {
    cleanBase += "/";
  }

  return cleanBase + value;
}

function getOrigin(url) {
  var match = String(url || "").match(/^(https?:\/\/[^\/]+)/i);
  return match ? match[1] : MAIN_URL;
}

function cleanUrl(url) {
  if (!url) {
    return null;
  }

  var value = String(url)
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/^["']+/, "")
    .replace(/["']+$/, "");

  if (value.indexOf("\\x3a") >= 0) {
    value = value.replace(/\\x3a/g, ":");
  }

  if (value.indexOf("\\x2f") >= 0) {
    value = value.replace(/\\x2f/g, "/");
  }

  return value;
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function isDirectVideoUrl(url) {
  if (!url) {
    return false;
  }

  var value = String(url).toLowerCase();

  if (!isHttpUrl(url)) {
    return false;
  }

  if (
    value.indexOf(".m3u8") >= 0 ||
    value.indexOf(".mp4") >= 0 ||
    value.indexOf(".mkv") >= 0 ||
    value.indexOf(".webm") >= 0
  ) {
    return true;
  }

  if (
    value.indexOf("/master.m3u8") >= 0 ||
    value.indexOf("/playlist.m3u8") >= 0 ||
    value.indexOf("/index.m3u8") >= 0
  ) {
    return true;
  }

  return false;
}

function guessFormat(url) {
  var value = String(url || "").toLowerCase();

  if (
    value.indexOf(".m3u8") >= 0 ||
    value.indexOf("master.m3u8") >= 0 ||
    value.indexOf("playlist.m3u8") >= 0
  ) {
    return "m3u8";
  }

  if (value.indexOf(".mkv") >= 0) {
    return "mkv";
  }

  return "mp4";
}

function guessQuality(url) {
  var value = String(url || "").toLowerCase();

  if (value.indexOf("2160") >= 0 || value.indexOf("4k") >= 0) {
    return 2160;
  }

  if (value.indexOf("1440") >= 0) {
    return 1440;
  }

  if (value.indexOf("1080") >= 0 || value.indexOf("fhd") >= 0) {
    return 1080;
  }

  if (value.indexOf("720") >= 0 || value.indexOf("hd") >= 0) {
    return 720;
  }

  if (value.indexOf("480") >= 0) {
    return 480;
  }

  return 1080;
}

function uniquePush(array, value) {
  if (!value) {
    return;
  }

  for (var i = 0; i < array.length; i++) {
    if (array[i] === value) {
      return;
    }
  }

  array.push(value);
}

function extractDirectUrls(html, pageUrl) {
  var urls = [];

  if (!html) {
    return urls;
  }

  function add(value) {
    value = cleanUrl(value);

    if (!value) {
      return;
    }

    if (value.indexOf("//") === 0) {
      value = "https:" + value;
    }

    if (!isHttpUrl(value)) {
      value = absoluteUrl(pageUrl, value);
    }

    if (isDirectVideoUrl(value)) {
      uniquePush(urls, value);
    }
  }

  var patterns = [
    /https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi,
    /https?:\/\/[^"'<>\\\s]+?\.mp4(?:\?[^"'<>\\\s]*)?/gi,
    /https?:\/\/[^"'<>\\\s]+?\.mkv(?:\?[^"'<>\\\s]*)?/gi,
    /https?:\/\/[^"'<>\\\s]+?\.webm(?:\?[^"'<>\\\s]*)?/gi,
    /["'](https?:\/\/[^"']+?\/(?:master|playlist|index)\.m3u8[^"']*)["']/gi
  ];

  patterns.forEach(function(pattern) {
    var match;

    while ((match = pattern.exec(html)) !== null) {
      add(match[1] || match[0]);
    }
  });

  var $;

  try {
    $ = cheerio.load(html);
  } catch (e) {
    return urls;
  }

  $("source, video, track").each(function(_, el) {
    var src =
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-url") ||
      $(el).attr("data-file") ||
      $(el).attr("data-video");

    if (src) {
      add(src);
    }
  });

  return urls;
}

function extractIframeUrls(html, pageUrl) {
  var urls = [];

  if (!html) {
    return urls;
  }

  function add(value) {
    value = cleanUrl(value);

    if (!value) {
      return;
    }

    if (value.indexOf("//") === 0) {
      value = "https:" + value;
    }

    if (!isHttpUrl(value)) {
      value = absoluteUrl(pageUrl, value);
    }

    if (!isHttpUrl(value)) {
      return;
    }

    if (
      value.indexOf("facebook.com") >= 0 ||
      value.indexOf("youtube.com") >= 0 ||
      value.indexOf("googlevideo.com") >= 0 ||
      value.indexOf("doubleclick.net") >= 0
    ) {
      return;
    }

    uniquePush(urls, value);
  }

  try {
    var $ = cheerio.load(html);

    $("iframe").each(function(_, el) {
      add(
        $(el).attr("src") ||
          $(el).attr("data-src") ||
          $(el).attr("data-url") ||
          $(el).attr("data-lazy-src")
      );
    });
  } catch (e) {}

  var regex =
    /(?:src|data-src|data-url|data-lazy-src)\s*=\s*["']([^"']+)["']/gi;

  var match;

  while ((match = regex.exec(html)) !== null) {
    add(match[1]);
  }

  return urls;
}

function extractTrembedUrls(html, pageUrl) {
  var urls = [];

  if (!html) {
    return urls;
  }

  function add(url) {
    url = cleanUrl(url);

    if (!url) {
      return;
    }

    if (url.indexOf("//") === 0) {
      url = "https:" + url;
    }

    if (!isHttpUrl(url)) {
      url = absoluteUrl(pageUrl, url);
    }

    if (isHttpUrl(url)) {
      uniquePush(urls, url);
    }
  }

  /*
   * Examples:
   *
   * ?trembed=4&trid=1319&trtype=1
   * trembed=4&trid=1319&trtype=1
   */

  var regex =
    /(?:https?:\/\/[^"'<> ]*)?\??trembed\s*=\s*(\d+)[^"'<> ]*trid\s*=\s*(\d+)(?:[^"'<> ]*trtype\s*=\s*(\d+))?/gi;

  var match;

  while ((match = regex.exec(html)) !== null) {
    var embed = match[1];
    var trid = match[2];
    var trtype = match[3] || "1";

    if (!embed) {
      add(
        MAIN_URL +
          "/?trembed=" +
          embed +
          "&trid=" +
          trid +
          "&trtype=" +
          trtype
      );
    }
  }

  /*
   * Direct server selector URLs can also appear encoded.
   */

  var hrefRegex =
    /(?:href|data-href|data-url)\s*=\s*["']([^"']*(?:trembed|trid)[^"']*)["']/gi;

  while ((match = hrefRegex.exec(html)) !== null) {
    if (
      match[1].indexOf("trembed") >= 0 &&
      match[1].indexOf("trid") >= 0
    ) {
      add(match[1]);
    }
  }

  return urls;
}

/*
 * DeseneFaine's current embed system uses trembed/trid/trtype.
 *
 * Because the page can change the selected server through JavaScript,
 * we also construct the likely server variants ourselves.
 */
function buildServerVariants(html, pageUrl) {
  var urls = [];

  var trids = [];
  var trtypes = [];
  var embeds = [];

  function addUnique(array, value) {
    if (!value) {
      return;
    }

    value = String(value);

    if (array.indexOf(value) === -1) {
      array.push(value);
    }
  }

  var tridRegex = /(?:trid|postid|post_id)\s*[=:]\s*["']?(\d+)/gi;
  var match;

  while ((match = tridRegex.exec(html || "")) !== null) {
    addUnique(trids, match[1]);
  }

  var embedRegex = /trembed\s*[=:]\s*["']?(\d+)/gi;

  while ((match = embedRegex.exec(html || "")) !== null) {
    addUnique(embeds, match[1]);
  }

  var typeRegex = /trtype\s*[=:]\s*["']?(\d+)/gi;

  while ((match = typeRegex.exec(html || "")) !== null) {
    addUnique(trtypes, match[1]);
  }

  /*
   * The actual page currently exposes a numeric trid.
   * If parsing doesn't catch it, inspect links/scripts for it.
   */
  if (trids.length === 0) {
    var broadId =
      String(html || "").match(/trid[^0-9]{0,20}(\d{2,})/i);

    if (broadId) {
      addUnique(trids, broadId[1]);
    }
  }

  if (trtypes.length === 0) {
    trtypes.push("1");
  }

  /*
   * Preserve any exact URLs found in the HTML.
   */
  extractTrembedUrls(html, pageUrl).forEach(function(url) {
    uniquePush(urls, url);
  });

  /*
   * Construct several server variants.
   *
   * We intentionally don't assume which number corresponds to which
   * provider because DeseneFaine can change server ordering.
   */
  if (trids.length > 0) {
    trids.forEach(function(trid) {
      trtypes.forEach(function(trtype) {
        var maxServers = 12;

        for (var i = 1; i <= maxServers; i++) {
          uniquePush(
            urls,
            MAIN_URL +
              "/?trembed=" +
              i +
              "&trid=" +
              trid +
              "&trtype=" +
              trtype
          );
        }
      });
    });
  }

  return urls;
}

/* ============================================================
 * StreamEmbed AES implementation
 * ============================================================
 *
 * This avoids crypto-js entirely.
 *
 * Known StreamEmbed key:
 *   6b69656d7469656e6d75613931316361
 *
 * Known IV:
 *   313233343536373839306f6975797472
 *
 * AES-128-CBC.
 */

var AES_SBOX = [
  99,124,119,123,242,107,111,197,48,1,103,43,254,215,171,118,
  202,130,201,125,250,89,71,240,173,212,162,175,156,164,114,192,
  183,253,147,38,54,63,247,204,52,165,229,241,113,216,49,21,
  4,199,35,195,24,150,5,154,7,18,128,226,235,39,178,117,
  9,131,44,26,27,110,90,160,82,59,214,179,41,227,47,132,
  83,209,0,237,32,252,177,91,106,203,190,57,74,76,88,207,
  208,239,170,251,67,77,51,133,69,249,2,127,80,60,159,168,
  81,163,64,143,146,157,56,245,188,182,218,33,16,255,243,
  210,205,12,19,236,95,151,68,23,196,167,126,61,100,93,
  25,115,96,129,79,220,34,42,144,136,70,238,184,20,222,
  94,11,219,224,50,58,10,73,6,36,92,194,211,172,98,145,
  149,228,121,231,200,55,109,141,213,78,169,108,86,244,
  234,101,122,174,8,186,120,37,46,28,166,180,198,232,221,
  116,31,75,189,139,138,112,62,181,102,72,3,246,14,97,
  53,87,185,134,193,29,158,225,248,152,17,105,217,142,
  148,155,30,135,233,206,85,40,223,140,161,137,13,191,
  230,66,104,65,153,45,15,176,84,187,22
];

var AES_RCON = [
  0,1,2,4,8,16,32,64,128,27,54
];

function aesRotWord(word) {
  return [word[1], word[2], word[3], word[0]];
}

function aesSubWord(word) {
  return [
    AES_SBOX[word[0]],
    AES_SBOX[word[1]],
    AES_SBOX[word[2]],
    AES_SBOX[word[3]]
  ];
}

function aesKeyExpansion(key) {
  var Nk = 4;
  var Nb = 4;
  var Nr = 10;

  var w = new Array(Nb * (Nr + 1));
  var i;

  for (i = 0; i < Nk; i++) {
    w[i] = [
      key[4 * i],
      key[4 * i + 1],
      key[4 * i + 2],
      key[4 * i + 3]
    ];
  }

  for (i = Nk; i < Nb * (Nr + 1); i++) {
    var temp = w[i - 1].slice();

    if (i % Nk === 0) {
      temp = aesSubWord(aesRotWord(temp));
      temp[0] ^= AES_RCON[i / Nk];
    }

    w[i] = [
      w[i - Nk][0] ^ temp[0],
      w[i - Nk][1] ^ temp[1],
      w[i - Nk][2] ^ temp[2],
      w[i - Nk][3] ^ temp[3]
    ];
  }

  var roundKeys = [];

  for (i = 0; i <= Nr; i++) {
    var round = [];

    for (var j = 0; j < 4; j++) {
      round = round.concat(w[i * 4 + j]);
    }

    roundKeys.push(round);
  }

  return roundKeys;
}

function aesAddRoundKey(state, key) {
  for (var i = 0; i < 16; i++) {
    state[i] ^= key[i];
  }
}

function aesSubBytes(state) {
  for (var i = 0; i < 16; i++) {
    state[i] = AES_SBOX[state[i]];
  }
}

function aesInvSubBytes(state) {
  var inverse = new Array(256);

  for (var i = 0; i < 256; i++) {
    inverse[AES_SBOX[i]] = i;
  }

  for (var j = 0; j < 16; j++) {
    state[j] = inverse[state[j]];
  }
}

function aesShiftRows(state) {
  var t = state.slice();

  state[0] = t[0];
  state[1] = t[5];
  state[2] = t[10];
  state[3] = t[15];

  state[4] = t[4];
  state[5] = t[9];
  state[6] = t[14];
  state[7] = t[3];

  state[8] = t[8];
  state[9] = t[13];
  state[10] = t[2];
  state[11] = t[7];

  state[12] = t[12];
  state[13] = t[1];
  state[14] = t[6];
  state[15] = t[11];
}

function aesInvShiftRows(state) {
  var t = state.slice();

  state[0] = t[0];
  state[1] = t[13];
  state[2] = t[10];
  state[3] = t[7];

  state[4] = t[4];
  state[5] = t[1];
  state[6] = t[14];
  state[7] = t[11];

  state[8] = t[8];
  state[9] = t[5];
  state[10] = t[2];
  state[11] = t[15];

  state[12] = t[12];
  state[13] = t[9];
  state[14] = t[6];
  state[15] = t[3];
}

function aesGmul(a, b) {
  var p = 0;

  for (var counter = 0; counter < 8; counter++) {
    if (b & 1) {
      p ^= a;
    }

    var hiBitSet = a & 0x80;

    a = (a << 1) & 0xff;

    if (hiBitSet) {
      a ^= 0x1b;
    }

    b >>= 1;
  }

  return p & 0xff;
}

function aesMixColumns(state) {
  for (var c = 0; c < 4; c++) {
    var i = c * 4;

    var a0 = state[i];
    var a1 = state[i + 1];
    var a2 = state[i + 2];
    var a3 = state[i + 3];

    state[i] =
      aesGmul(a0, 2) ^
      aesGmul(a1, 3) ^
      a2 ^
      a3;

    state[i + 1] =
      a0 ^
      aesGmul(a1, 2) ^
      aesGmul(a2, 3) ^
      a3;

    state[i + 2] =
      a0 ^
      a1 ^
      aesGmul(a2, 2) ^
      aesGmul(a3, 3);

    state[i + 3] =
      aesGmul(a0, 3) ^
      a1 ^
      a2 ^
      aesGmul(a3, 2);
  }
}

function aesInvMixColumns(state) {
  for (var c = 0; c < 4; c++) {
    var i = c * 4;

    var a0 = state[i];
    var a1 = state[i + 1];
    var a2 = state[i + 2];
    var a3 = state[i + 3];

    state[i] =
      aesGmul(a0, 14) ^
      aesGmul(a1, 11) ^
      aesGmul(a2, 13) ^
      aesGmul(a3, 9);

    state[i + 1] =
      aesGmul(a0, 9) ^
      aesGmul(a1, 14) ^
      aesGmul(a2, 11) ^
      aesGmul(a3, 13);

    state[i + 2] =
      aesGmul(a0, 13) ^
      aesGmul(a1, 9) ^
      aesGmul(a2, 14) ^
      aesGmul(a3, 11);

    state[i + 3] =
      aesGmul(a0, 11) ^
      aesGmul(a1, 13) ^
      aesGmul(a2, 9) ^
      aesGmul(a3, 14);
  }
}

function aesDecryptBlock(block, roundKeys) {
  var state = block.slice();

  aesAddRoundKey(state, roundKeys[10]);

  for (var round = 9; round >= 1; round--) {
    aesInvShiftRows(state);
    aesInvSubBytes(state);
    aesAddRoundKey(state, roundKeys[round]);
    aesInvMixColumns(state);
  }

  aesInvShiftRows(state);
  aesInvSubBytes(state);
  aesAddRoundKey(state, roundKeys[0]);

  return state;
}

function hexToBytes(hex) {
  hex = String(hex || "").replace(/[^0-9a-f]/gi, "");

  var bytes = [];

  for (var i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }

  return bytes;
}

function bytesToString(bytes) {
  var result = "";

  for (var i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }

  return result;
}

function aesCbcDecryptHex(cipherHex, keyHex, ivHex) {
  var cipher = hexToBytes(cipherHex);
  var key = hexToBytes(keyHex);
  var iv = hexToBytes(ivHex);

  if (key.length !== 16 || iv.length !== 16) {
    throw new Error("Invalid AES key or IV");
  }

  if (cipher.length === 0 || cipher.length % 16 !== 0) {
    throw new Error("Invalid AES ciphertext length");
  }

  var roundKeys = aesKeyExpansion(key);
  var output = [];
  var previous = iv.slice();

  for (var offset = 0; offset < cipher.length; offset += 16) {
    var block = cipher.slice(offset, offset + 16);
    var decrypted = aesDecryptBlock(block, roundKeys);

    for (var i = 0; i < 16; i++) {
      decrypted[i] ^= previous[i];
    }

    output = output.concat(decrypted);
    previous = block;
  }

  /*
   * PKCS#7
   */
  var pad = output[output.length - 1];

  if (pad >= 1 && pad <= 16) {
    var validPadding = true;

    for (var p = output.length - pad; p < output.length; p++) {
      if (output[p] !== pad) {
        validPadding = false;
        break;
      }
    }

    if (validPadding) {
      output = output.slice(0, output.length - pad);
    }
  }

  return bytesToString(output);
}

function tryParseJsonString(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

function extractUrlsFromObject(obj) {
  var urls = [];

  if (!obj) {
    return urls;
  }

  function inspect(value) {
    if (!value) {
      return;
    }

    if (typeof value === "string") {
      if (isDirectVideoUrl(value)) {
        uniquePush(urls, cleanUrl(value));
      }

      var parsed = tryParseJsonString(value);

      if (parsed) {
        inspect(parsed);
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        continue;
      }

      var child = value[key];

      if (
        typeof child === "string" &&
        (
          key.toLowerCase().indexOf("url") >= 0 ||
          key.toLowerCase().indexOf("source") >= 0 ||
          key.toLowerCase().indexOf("file") >= 0 ||
          key.toLowerCase().indexOf("master") >= 0
        )
      ) {
        if (isDirectVideoUrl(child)) {
          uniquePush(urls, cleanUrl(child));
        }
      }

      if (typeof child === "object") {
        inspect(child);
      }
    }
  }

  inspect(obj);

  return urls;
}

/* ============================================================
 * StreamEmbed resolver
 * ============================================================ */

function extractFileCodes(url) {
  var codes = [];

  if (!url) {
    return codes;
  }

  var value = String(url);

  var patterns = [
    /[?&](?:id|filecode|file_code|code)=([^&#]+)/i,
    /\/(?:e|d|v|embed|video)\/([A-Za-z0-9_-]+)/i,
    /\/([A-Za-z0-9_-]{5,})(?:[?#]|$)/i
  ];

  patterns.forEach(function(pattern) {
    var match = value.match(pattern);

    if (match && match[1]) {
      uniquePush(codes, decodeURIComponent(match[1]));
    }
  });

  return codes;
}

function isStreamEmbedHost(url) {
  var value = String(url || "").toLowerCase();

  return (
    value.indexOf("player4me") >= 0 ||
    value.indexOf("streamp2p") >= 0 ||
    value.indexOf("seekstreaming") >= 0 ||
    value.indexOf("streamembed") >= 0
  );
}

function resolveStreamEmbed(url) {
  var filecodes = extractFileCodes(url);

  if (filecodes.length === 0) {
    log("No filecode found in embed: " + url);
    return Promise.resolve([]);
  }

  var hostMatch = String(url).match(
    /^https?:\/\/([^\/]+)/i
  );

  var host = hostMatch ? hostMatch[1] : "";

  if (!host) {
    return Promise.resolve([]);
  }

  var results = [];

  function tryCode(index) {
    if (index >= filecodes.length) {
      return Promise.resolve(results);
    }

    var filecode = filecodes[index];

    var apiUrl =
      "https://" +
      host +
      "/api/v1/video?id=" +
      encodeURIComponent(filecode) +
      "&w=2048&h=1152&r=";

    log("StreamEmbed API: " + apiUrl);

    return fetchText(apiUrl, {
      headers: Object.assign({}, FETCH_HEADERS, {
        "Referer": url,
        "Origin": getOrigin(url),
        "Accept": "*/*"
      })
    })
      .then(function(responseText) {
        var response = String(responseText || "").trim();

        log(
          "StreamEmbed response length: " +
            response.length
        );

        /*
         * Some versions may return JSON/plaintext directly.
         */
        var parsed = tryParseJsonString(response);

        if (parsed) {
          var jsonUrls = extractUrlsFromObject(parsed);

          jsonUrls.forEach(function(found) {
            uniquePush(results, found);
          });

          if (jsonUrls.length > 0) {
            return tryCode(index + 1);
          }
        }

        /*
         * Hex AES response.
         */
        var hexOnly = response.replace(/[\r\n\s]/g, "");

        if (
          /^[0-9a-f]+$/i.test(hexOnly) &&
          hexOnly.length % 32 === 0
        ) {
          try {
            var decrypted = aesCbcDecryptHex(
              hexOnly,
              "6b69656d7469656e6d75613931316361",
              "313233343536373839306f6975797472"
            );

            log(
              "AES decrypted response: " +
                decrypted.substring(0, 250)
            );

            var decryptedJson =
              tryParseJsonString(decrypted);

            if (decryptedJson) {
              var decryptedUrls =
                extractUrlsFromObject(decryptedJson);

              decryptedUrls.forEach(function(found) {
                uniquePush(results, found);
              });
            }

            /*
             * Sometimes the decrypted data itself contains
             * a raw URL.
             */
            var rawUrls =
              extractDirectUrls(decrypted, url);

            rawUrls.forEach(function(found) {
              uniquePush(results, found);
            });

            /*
             * Also inspect possible fields manually.
             */
            var sourceMatch = decrypted.match(
              /"(?:source|master|masterUrl|url)"\s*:\s*"([^"]+)"/i
            );

            if (sourceMatch && sourceMatch[1]) {
              var direct = cleanUrl(sourceMatch[1]);

              if (isDirectVideoUrl(direct)) {
                uniquePush(results, direct);
              }
            }
          } catch (e) {
            log(
              "AES decrypt failed: " +
                (e && e.message
                  ? e.message
                  : String(e))
            );
          }
        }

        return tryCode(index + 1);
      })
      .catch(function(error) {
        log(
          "StreamEmbed request failed: " +
            (error && error.message
              ? error.message
              : String(error))
        );

        return tryCode(index + 1);
      });
  }

  return tryCode(0);
}

/* ============================================================
 * Generic embed resolver
 * ============================================================ */

function resolveEmbedPage(url, depth) {
  depth = depth || 0;

  if (depth > 4) {
    log("Embed recursion limit reached.");
    return Promise.resolve([]);
  }

  log(
    "Resolving embed depth " +
      depth +
      ": " +
      url
  );

  if (isDirectVideoUrl(url)) {
    return Promise.resolve([url]);
  }

  if (isStreamEmbedHost(url)) {
    return resolveStreamEmbed(url);
  }

  return fetchText(url, {
    headers: Object.assign({}, FETCH_HEADERS, {
      "Referer": MAIN_URL + "/",
      "Accept": "text/html,application/xhtml+xml"
    })
  })
    .then(function(html) {
      var streams = [];

      extractDirectUrls(html, url).forEach(function(found) {
        uniquePush(streams, found);
      });

      if (streams.length > 0) {
        log(
          "Found " +
            streams.length +
            " direct media URL(s) in embed."
        );

        return streams;
      }

      /*
       * If this is a StreamEmbed host, use its API.
       */
      if (isStreamEmbedHost(url)) {
        return resolveStreamEmbed(url);
      }

      var childIframes =
        extractIframeUrls(html, url);

      /*
       * Also detect DeseneFaine trembed variants.
       */
      var serverUrls =
        buildServerVariants(html, url);

      serverUrls.forEach(function(serverUrl) {
        uniquePush(childIframes, serverUrl);
      });

      if (childIframes.length === 0) {
        log("No child iframe/embed found.");
        return [];
      }

      /*
       * Don't explode requests indefinitely.
       */
      childIframes = childIframes.slice(0, 16);

      var requests = childIframes.map(function(child) {
        return resolveEmbedPage(child, depth + 1)
          .then(function(found) {
            return found || [];
          })
          .catch(function() {
            return [];
          });
      });

      return Promise.all(requests).then(function(all) {
        var merged = [];

        all.forEach(function(list) {
          list.forEach(function(item) {
            uniquePush(merged, item);
          });
        });

        return merged;
      });
    })
    .catch(function(error) {
      log(
        "Embed page failed: " +
          (error && error.message
            ? error.message
            : String(error))
      );

      /*
       * Last chance: if it looks like a StreamEmbed host,
       * still try its API.
       */
      if (isStreamEmbedHost(url)) {
        return resolveStreamEmbed(url);
      }

      return [];
    });
}

/* ============================================================
 * Search / discovery
 * ============================================================ */

function searchSite(query) {
  log("Searching DeseneFaine for: " + query);

  var searchUrl =
    MAIN_URL +
    "/?s=" +
    encodeURIComponent(query);

  return fetchText(searchUrl)
    .then(function(html) {
      var $ = cheerio.load(html);

      var candidates = [];
      var normQuery = normalizeTitle(query);

      var queryWords = normQuery
        .split(" ")
        .filter(function(word) {
          return word.length > 2;
        });

      $("a").each(function(_, el) {
        var href = $(el).attr("href");

        if (!href) {
          return;
        }

        if (
          href.indexOf("desenefaine.com") === -1 &&
          href.indexOf("/") !== 0
        ) {
          return;
        }

        if (
          /\/(category|tag|author|page|feed|wp-)/i.test(
            href
          )
        ) {
          return;
        }

        var text = $(el)
          .text()
          .trim();

        if (text.length < 4) {
          return;
        }

        var normText =
          normalizeTitle(text);

        var matchCount = 0;

        queryWords.forEach(function(word) {
          if (normText.indexOf(word) >= 0) {
            matchCount++;
          }
        });

        if (
          queryWords.length === 0 ||
          matchCount >=
            Math.max(
              1,
              Math.ceil(queryWords.length / 2)
            )
        ) {
          var absolute =
            absoluteUrl(searchUrl, href);

          if (!absolute) {
            return;
          }

          candidates.push({
            href: absolute,
            text: text,
            score: matchCount
          });
        }
      });

      candidates.sort(function(a, b) {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return (
          a.text.length - b.text.length
        );
      });

      if (candidates.length === 0) {
        return null;
      }

      /*
       * Try several candidates instead of only one.
       */
      candidates = candidates.slice(0, 6);

      function tryCandidate(index) {
        if (index >= candidates.length) {
          return Promise.resolve(null);
        }

        var candidate =
          candidates[index];

        return fetchText(candidate.href)
          .then(function(page) {
            if (
              page &&
              page.length > 1000
            ) {
              return {
                url: candidate.href,
                html: page
              };
            }

            return tryCandidate(index + 1);
          })
          .catch(function() {
            return tryCandidate(index + 1);
          });
      }

      return tryCandidate(0);
    })
    .catch(function(error) {
      log(
        "Search failed: " +
          (error && error.message
            ? error.message
            : String(error))
      );

      return null;
    });
}

/* ============================================================
 * Direct DeseneFaine page resolver
 * ============================================================ */

function tryDirectUrl(title, type, season, episode) {
  var slug = normalizeSlug(title);

  if (
    type === "tv" &&
    season !== undefined &&
    season !== null &&
    episode !== undefined &&
    episode !== null
  ) {
    slug =
      slug +
      "-sezonul-" +
      season +
      "-episodul-" +
      episode;
  }

  var prefixes =
    type === "tv"
      ? ["epi", "serial", "desene"]
      : ["film", "desene"];

  var requests = prefixes.map(
    function(prefix) {
      var url =
        MAIN_URL +
        "/" +
        prefix +
        "/" +
        slug +
        "/";

      return fetchText(url)
        .then(function(html) {
          if (
            html &&
            html.length > 1500 &&
            !/does not exist/i.test(html) &&
            !/nu am găsit/i.test(html)
          ) {
            return {
              url: url,
              html: html
            };
          }

          return null;
        })
        .catch(function() {
          return null;
        });
    }
  );

  return Promise.all(requests).then(
    function(results) {
      for (
        var i = 0;
        i < results.length;
        i++
      ) {
        if (results[i]) {
          log(
            "Direct page match: " +
              results[i].url
          );

          return results[i];
        }
      }

      return null;
    }
  );
}

/* ============================================================
 * Page -> embeds
 * ============================================================ */

function extractPageEmbeds(pageHtml, pageUrl) {
  var urls = [];

  /*
   * Direct media first.
   */
  extractDirectUrls(
    pageHtml,
    pageUrl
  ).forEach(function(url) {
    uniquePush(urls, url);
  });

  /*
   * Standard iframe(s).
   */
  extractIframeUrls(
    pageHtml,
    pageUrl
  ).forEach(function(url) {
    uniquePush(urls, url);
  });

  /*
   * trembed/trid links.
   */
  extractTrembedUrls(
    pageHtml,
    pageUrl
  ).forEach(function(url) {
    uniquePush(urls, url);
  });

  /*
   * Construct server variants.
   */
  buildServerVariants(
    pageHtml,
    pageUrl
  ).forEach(function(url) {
    uniquePush(urls, url);
  });

  return urls;
}

/* ============================================================
 * Stream object creation
 * ============================================================ */

function makeStream(url, sourceUrl, index) {
  url = cleanUrl(url);

  if (!isDirectVideoUrl(url)) {
    return null;
  }

  var format = guessFormat(url);
  var quality = guessQuality(url);

  var mediaOrigin =
    getOrigin(url);

  /*
   * Important:
   *
   * Referer should normally be the page/player which generated
   * the media URL, NOT blindly DeseneFaine.
   *
   * Origin should correspond to the host making the request
   * when the CDN requires it.
   */
  var headers = Object.assign(
    {},
    STREAM_HEADERS
  );

  if (sourceUrl) {
    headers["Referer"] = sourceUrl;
    headers["Origin"] =
      getOrigin(sourceUrl);
  } else {
    headers["Referer"] =
      MAIN_URL + "/";
    headers["Origin"] =
      MAIN_URL;
  }

  /*
   * Keep a conservative fallback for hosts where the direct
   * media server accepts the player origin.
   */
  if (!headers["Origin"]) {
    headers["Origin"] =
      mediaOrigin;
  }

  return {
    name:
      PROVIDER_NAME +
      " | Server " +
      index,
    title:
      String(quality) +
      "p | RO Dub",
    url: url,
    quality: quality,
    format: format,
    type: format === "m3u8"
      ? "m3u8"
      : format,
    headers: headers,
    provider: "desenefaine"
  };
}

/* ============================================================
 * Main getStreams
 * ============================================================ */

function getStreams(
  id,
  type,
  season,
  episode
) {
  log(
    "========================================"
  );

  log(
    "Requested: ID=" +
      id +
      ", Type=" +
      type +
      ", S=" +
      season +
      ", E=" +
      episode
  );

  var isImdb =
    String(id || "").indexOf("tt") === 0;

  /*
   * IMPORTANT:
   *
   * Correct TMDB find URL:
   *
   * /find/ttxxxx?api_key=...&external_source=imdb_id
   *
   * The previous version accidentally generated two '?'
   */
  var tmdbUrl;

  if (isImdb) {
    tmdbUrl =
      "https://api.themoviedb.org/3/find/" +
      encodeURIComponent(id) +
      "?api_key=" +
      TMDB_API_KEY +
      "&external_source=imdb_id" +
      "&language=ro-RO";
  } else {
    tmdbUrl =
      "https://api.themoviedb.org/3/" +
      (type === "tv"
        ? "tv/"
        : "movie/") +
      encodeURIComponent(id) +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=ro-RO";
  }

  log("TMDB request: " + tmdbUrl);

  return fetchJson(tmdbUrl)
    .then(function(data) {
      var roTitle = "";
      var enTitle = "";

      if (isImdb) {
        var results =
          type === "tv"
            ? data.tv_results
            : data.movie_results;

        if (
          results &&
          results.length > 0
        ) {
          if (type === "tv") {
            roTitle =
              results[0].name || "";
            enTitle =
              results[0].original_name ||
              "";
          } else {
            roTitle =
              results[0].title || "";
            enTitle =
              results[0].original_title ||
              "";
          }
        }
      } else {
        if (type === "tv") {
          roTitle =
            data.name || "";
          enTitle =
            data.original_name || "";
        } else {
          roTitle =
            data.title || "";
          enTitle =
            data.original_title || "";
        }
      }

      log(
        "TMDB titles: RO='" +
          roTitle +
          "' EN='" +
          enTitle +
          "'"
      );

      /*
       * Don't fail completely if TMDB doesn't respond.
       */
      var titleCandidates = [];

      if (roTitle) {
        titleCandidates.push(roTitle);
      }

      if (
        enTitle &&
        enTitle !== roTitle
      ) {
        titleCandidates.push(enTitle);
      }

      function tryTitles(index) {
        if (
          index >=
          titleCandidates.length
        ) {
          return Promise.resolve(null);
        }

        return tryDirectUrl(
          titleCandidates[index],
          type,
          season,
          episode
        ).then(function(result) {
          if (result) {
            return result;
          }

          return tryTitles(index + 1);
        });
      }

      /*
       * If TMDB returned nothing, try the ID itself as a
       * fallback search term rather than returning immediately.
       */
      if (
        titleCandidates.length === 0
      ) {
        titleCandidates.push(
          String(id)
        );
      }

      return tryTitles(0)
        .then(function(result) {
          if (result) {
            return result;
          }

          /*
           * Search Romanian title first.
           */
          if (roTitle) {
            return searchSite(
              roTitle
            ).then(function(found) {
              if (found) {
                return found;
              }

              if (
                enTitle &&
                enTitle !== roTitle
              ) {
                return searchSite(
                  enTitle
                );
              }

              return null;
            });
          }

          return searchSite(
            enTitle || String(id)
          );
        });
    })
    .catch(function(error) {
      log(
        "TMDB failed: " +
          (error && error.message
            ? error.message
            : String(error))
      );

      /*
       * Critical fallback:
       *
       * Don't let TMDB failure prevent a DeseneFaine
       * search.
       */
      return searchSite(
        String(id)
      );
    })
    .then(function(page) {
      if (
        !page ||
        !page.html
      ) {
        log(
          "No valid DeseneFaine page found."
        );

        return [];
      }

      log(
        "Using DeseneFaine page: " +
          page.url
      );

      var embeds =
        extractPageEmbeds(
          page.html,
          page.url
        );

      log(
        "Found " +
          embeds.length +
          " embed/server candidate(s)."
      );

      /*
       * Log candidates individually.
       */
      embeds.forEach(function(url, i) {
        log(
          "Candidate " +
            (i + 1) +
            ": " +
            url
        );
      });

      /*
       * Resolve all candidates concurrently.
       *
       * This is much better than waiting for one broken
       * server before trying the next.
       */
      var requests =
        embeds
          .slice(0, 16)
          .map(function(embedUrl) {
            if (
              isDirectVideoUrl(
                embedUrl
              )
            ) {
              return Promise.resolve([
                {
                  url: embedUrl,
                  source: page.url
                }
              ]);
            }

            return resolveEmbedPage(
              embedUrl,
              0
            ).then(function(urls) {
              return (urls || []).map(
                function(url) {
                  return {
                    url: url,
                    source: embedUrl
                  };
                }
              );
            });
          });

      return Promise.all(requests)
        .then(function(all) {
          var resolved = [];

          all.forEach(function(list) {
            list.forEach(
              function(item) {
                if (
                  !item ||
                  !item.url
                ) {
                  return;
                }

                var exists =
                  resolved.some(
                    function(existing) {
                      return (
                        existing.url ===
                        item.url
                      );
                    }
                  );

                if (!exists) {
                  resolved.push(item);
                }
              }
            );
          });

          log(
            "Resolved " +
              resolved.length +
              " direct stream(s)."
          );

          var streams = [];

          resolved.forEach(
            function(item, index) {
              var stream =
                makeStream(
                  item.url,
                  item.source ||
                    page.url,
                  index + 1
                );

              if (stream) {
                log(
                  "FINAL STREAM " +
                    (index + 1) +
                    ": " +
                    stream.url
                );

                log(
                  "FORMAT: " +
                    stream.format +
                    " QUALITY: " +
                    stream.quality
                );

                streams.push(stream);
              }
            }
          );

          /*
           * Sort best quality first.
           */
          streams.sort(
            function(a, b) {
              return (
                Number(b.quality || 0) -
                Number(a.quality || 0)
              );
            }
          );

          /*
           * If direct resolution failed, don't return the
           * old iframe because that is exactly what caused
           * your loading loop.
           *
           * We want either a real playable stream or [].
           */
          log(
            "Returning " +
              streams.length +
              " playable stream(s)."
          );

          return streams;
        });
    })
    .catch(function(error) {
      log(
        "FATAL PROVIDER ERROR: " +
          (error && error.message
            ? error.message
            : String(error))
      );

      return [];
    });
}

if (
  typeof module !== "undefined" &&
  module.exports
) {
  module.exports = {
    getStreams: getStreams
  };
} else {
  global.getStreams = getStreams;
}
