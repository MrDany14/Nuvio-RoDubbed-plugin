var cheerio = require("cheerio-without-node-native");
var CryptoJS = null;
try {
  CryptoJS = require("crypto-js");
} catch (error) {
  CryptoJS = null;
}

var PROVIDER_NAME = "DeseneFaine";
var DESENEFAINE_PLUGIN_VERSION = "1.7.40";
var MAIN_URL = "https://desenefaine.com";
var TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";

var FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

var M3U8_RE = /(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\/master\.txt)(?:\?[^\s"'<>\\]*)?/gi;
var BYSE_STREAM_CACHE_MS = 10 * 60 * 1000;
var byseStreamCache = {};

function fetchText(url, options) {
  options = options || {};
  var request = {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  };
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.text();
  });
}

function fetchJson(url, options) {
  options = options || {};
  var request = {
    method: options.method || "GET",
    headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
  };
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  });
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanUrl(value) {
  return String(value || "")
    .replace(/\\\//g, "/")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/[),;]+$/, "")
    .trim();
}

function absoluteUrl(value, baseUrl) {
  var cleaned = cleanUrl(value);
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.indexOf("//") === 0) return "https:" + cleaned;

  var originMatch = String(baseUrl).match(/^(https?:\/\/[^/]+)/i);
  if (!originMatch) return null;
  if (cleaned.charAt(0) === "/") return originMatch[1] + cleaned;

  var basePath = String(baseUrl).split("?")[0].replace(/\/[^/]*$/, "/");
  return basePath + cleaned;
}

function decodeBase64(value) {
  var encoded = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  encoded += "===".slice((encoded.length + 3) % 4);
  if (typeof atob === "function") return atob(encoded);

  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var output = "";
  var buffer = 0;
  var bits = 0;
  for (var index = 0; index < encoded.length; index += 1) {
    var valueIndex = alphabet.indexOf(encoded.charAt(index));
    if (valueIndex < 0) continue;
    buffer = (buffer << 6) | valueIndex;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 255);
    }
  }
  return output;
}

function decodeHex(value) {
  var text = "";
  for (var index = 0; index + 1 < value.length; index += 2) {
    text += String.fromCharCode(parseInt(value.slice(index, index + 2), 16));
  }
  return text;
}

function binaryBytes(value) {
  var bytes = new Uint8Array(value.length);
  for (var index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index) & 255;
  }
  return bytes;
}

function base64UrlEncode(bytes) {
  var binary = "";
  for (var index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  if (typeof btoa === "function") {
    return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  return binary;
}

function textBytes(value) {
  // Byse's PoW input is ASCII nonce text plus a decimal counter.
  return binaryBytes(String(value));
}

function apiJson(url, options) {
  options = options || {};
  var headers = Object.assign({
    Accept: "application/json",
    "Content-Type": "application/json"
  }, options.headers || {});
  var request = {
    method: options.method || "GET",
    headers: headers
  };
  if (options.credentials) request.credentials = options.credentials;
  if (options.body !== undefined) request.body = options.body;

  return fetch(url, request).then(function(res) {
    return res.text().then(function(text) {
      var data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (error) {
        data = { error: text };
      }
      if (!res.ok) throw new Error("HTTP " + res.status + ": " + (data.error || text));
      return data;
    });
  });
}

function byseAccessHeaders(apiOrigin) {
  return { Referer: apiOrigin, Origin: apiOrigin };
}

function byseCrypto() {
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto;
  try {
    var nodeCrypto = require("crypto");
    if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) return nodeCrypto.webcrypto;
  } catch (error) {
    // Browser runtimes do not expose Node's crypto module.
  }
  return null;
}

function createByseNodeFingerprint(apiOrigin) {
  var nodeCrypto;
  try {
    nodeCrypto = require("crypto");
  } catch (error) {
    return Promise.resolve(null);
  }
  if (!nodeCrypto || !nodeCrypto.generateKeyPairSync || !nodeCrypto.createSign) {
    return Promise.resolve(null);
  }

  return apiJson(apiOrigin + "/api/videos/access/challenge", {
    method: "POST",
    credentials: "include",
    headers: byseAccessHeaders(apiOrigin),
    body: "{}"
  }).then(function(challenge) {
    var pair = nodeCrypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    var publicKey = pair.publicKey.export({ format: "jwk" });
    var signature = nodeCrypto.createSign("SHA256")
      .update(String(challenge.nonce))
      .sign({ key: pair.privateKey, dsaEncoding: "ieee-p1363" });
    var viewerId = randomId();
    var deviceId = randomId();
    var client = {
      user_agent: FETCH_HEADERS["User-Agent"],
      languages: ["ro-RO", "en-US"],
      timezone: "UTC",
      extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] }
    };

    return apiJson(apiOrigin + "/api/videos/access/attest", {
      method: "POST",
      credentials: "include",
      headers: byseAccessHeaders(apiOrigin),
      body: JSON.stringify({
        viewer_id: viewerId,
        device_id: deviceId,
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        signature: base64UrlEncode(signature),
        public_key: publicKey,
        client: client,
        storage: {},
        attributes: { entropy: "low" }
      })
    }).then(function(attestation) {
      if (!attestation.token) throw new Error("Byse fingerprint rejected");
      return {
        token: attestation.token,
        viewer_id: attestation.viewer_id || viewerId,
        device_id: attestation.device_id || deviceId,
        confidence: attestation.confidence || 0
      };
    });
  });
}

function byseRandomBytes(length) {
  var bytes = new Uint8Array(length);
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
      return bytes;
    }
  } catch (error) {
    // Fall through to the runtime's Node-compatible crypto module.
  }
  try {
    var nodeCrypto = require("crypto");
    if (nodeCrypto.randomBytes) return new Uint8Array(nodeCrypto.randomBytes(length));
    if (nodeCrypto.randomFillSync) return nodeCrypto.randomFillSync(bytes);
  } catch (error) {
    // Some QuickJS hosts expose neither WebCrypto nor Node crypto.
  }
  for (var index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function byseHex(bytes) {
  var text = "";
  for (var index = 0; index < bytes.length; index += 1) {
    text += ("0" + bytes[index].toString(16)).slice(-2);
  }
  return text;
}

function byseBigIntFromBytes(bytes) {
  return BigInt("0x" + byseHex(bytes));
}

function byseBigIntToBytes(value, length) {
  var bytes = new Uint8Array(length);
  var mask = BigInt(255);
  var shift = BigInt(8);
  for (var index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(value & mask);
    value >>= shift;
  }
  return bytes;
}

function byseMod(value, modulus) {
  var result = value % modulus;
  return result < BigInt(0) ? result + modulus : result;
}

function byseModInverse(value, modulus) {
  var oldR = byseMod(value, modulus);
  var r = modulus;
  var oldS = BigInt(1);
  var s = BigInt(0);
  while (r !== BigInt(0)) {
    var quotient = oldR / r;
    var nextR = oldR - quotient * r;
    var nextS = oldS - quotient * s;
    oldR = r;
    r = nextR;
    oldS = s;
    s = nextS;
  }
  if (oldR !== BigInt(1)) throw new Error("Byse elliptic-curve inverse failed");
  return byseMod(oldS, modulus);
}

function byseP256Curve() {
  var B = BigInt;
  var p = B("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
  return {
    p: p,
    a: p - B(3),
    n: B("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),
    gx: B("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),
    gy: B("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")
  };
}

function bysePointAdd(left, right, curve) {
  if (!left) return right;
  if (!right) return left;
  var slope;
  if (left.x === right.x) {
    if (byseMod(left.y + right.y, curve.p) === BigInt(0)) return null;
    slope = byseMod(
      (BigInt(3) * left.x * left.x + curve.a) *
        byseModInverse(BigInt(2) * left.y, curve.p),
      curve.p
    );
  } else {
    slope = byseMod(
      (right.y - left.y) * byseModInverse(right.x - left.x, curve.p),
      curve.p
    );
  }
  var x = byseMod(slope * slope - left.x - right.x, curve.p);
  var y = byseMod(slope * (left.x - x) - left.y, curve.p);
  return { x: x, y: y };
}

function bysePointMultiply(scalar, point, curve) {
  var result = null;
  var one = BigInt(1);
  while (scalar > BigInt(0)) {
    if ((scalar & one) === one) result = bysePointAdd(result, point, curve);
    point = bysePointAdd(point, point, curve);
    scalar >>= one;
  }
  return result;
}

function byseP256KeyPair() {
  var curve = byseP256Curve();
  var one = BigInt(1);
  var privateKey = byseBigIntFromBytes(byseRandomBytes(32)) % (curve.n - one) + one;
  var publicPoint = bysePointMultiply(privateKey, { x: curve.gx, y: curve.gy }, curve);
  return {
    curve: curve,
    privateKey: privateKey,
    publicKey: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(byseBigIntToBytes(publicPoint.x, 32)),
      y: base64UrlEncode(byseBigIntToBytes(publicPoint.y, 32))
    }
  };
}

function byseSha256Hex(message) {
  if (CryptoJS && CryptoJS.SHA256 && CryptoJS.enc && CryptoJS.enc.Hex) {
    return CryptoJS.SHA256(String(message)).toString(CryptoJS.enc.Hex);
  }

  var bytes = textBytes(String(message));
  var bitLength = bytes.length * 8;
  var paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  var padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  padded[paddedLength - 4] = (bitLength >>> 24) & 255;
  padded[paddedLength - 3] = (bitLength >>> 16) & 255;
  padded[paddedLength - 2] = (bitLength >>> 8) & 255;
  padded[paddedLength - 1] = bitLength & 255;

  var constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  var hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  var words = new Uint32Array(64);

  function rotateRight(value, shift) {
    return (value >>> shift) | (value << (32 - shift));
  }

  for (var block = 0; block < paddedLength; block += 64) {
    for (var index = 0; index < 16; index += 1) {
      var offset = block + index * 4;
      words[index] = (
        (padded[offset] << 24) |
        (padded[offset + 1] << 16) |
        (padded[offset + 2] << 8) |
        padded[offset + 3]
      ) >>> 0;
    }
    for (var schedule = 16; schedule < 64; schedule += 1) {
      var x = words[schedule - 15];
      var y = words[schedule - 2];
      var sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      var sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[schedule] = (words[schedule - 16] + sigma0 + words[schedule - 7] + sigma1) >>> 0;
    }

    var a = hash[0];
    var b = hash[1];
    var c = hash[2];
    var d = hash[3];
    var e = hash[4];
    var f = hash[5];
    var g = hash[6];
    var h = hash[7];

    for (var round = 0; round < 64; round += 1) {
      var sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      var choose = (e & f) ^ (~e & g);
      var temp1 = (h + sum1 + choose + constants[round] + words[round]) >>> 0;
      var sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      var majority = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  var output = "";
  for (var part = 0; part < hash.length; part += 1) {
    output += ("00000000" + hash[part].toString(16)).slice(-8);
  }
  return output;
}

function byseP256Sign(message, pair) {
  var curve = pair.curve;
  var digest = byseSha256Hex(String(message));
  var z = BigInt("0x" + digest);
  var one = BigInt(1);
  var r = BigInt(0);
  var s = BigInt(0);
  while (r === BigInt(0) || s === BigInt(0)) {
    var k = byseBigIntFromBytes(byseRandomBytes(32)) % (curve.n - one) + one;
    var point = bysePointMultiply(k, { x: curve.gx, y: curve.gy }, curve);
    r = point.x % curve.n;
    if (r !== BigInt(0)) {
      s = byseMod(
        byseModInverse(k, curve.n) * (z + r * pair.privateKey),
        curve.n
      );
    }
  }
  var signature = new Uint8Array(64);
  signature.set(byseBigIntToBytes(r, 32), 0);
  signature.set(byseBigIntToBytes(s, 32), 32);
  return signature;
}

function createByseJsFingerprint(apiOrigin) {
  if (typeof BigInt !== "function") return Promise.resolve(null);
  return apiJson(apiOrigin + "/api/videos/access/challenge", {
    method: "POST",
    credentials: "include",
    headers: byseAccessHeaders(apiOrigin),
    body: "{}"
  }).then(function(challenge) {
    var pair = byseP256KeyPair();
    var signature = byseP256Sign(challenge.nonce, pair);
    var viewerId = randomId();
    var deviceId = randomId();
    var client = {
      user_agent: FETCH_HEADERS["User-Agent"],
      languages: ["ro-RO", "en-US"],
      timezone: "UTC",
      extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] }
    };
    return apiJson(apiOrigin + "/api/videos/access/attest", {
      method: "POST",
      credentials: "include",
      headers: byseAccessHeaders(apiOrigin),
      body: JSON.stringify({
        viewer_id: viewerId,
        device_id: deviceId,
        challenge_id: challenge.challenge_id,
        nonce: challenge.nonce,
        signature: base64UrlEncode(signature),
        public_key: pair.publicKey,
        client: client,
        storage: {},
        attributes: { entropy: "low" }
      })
    }).then(function(attestation) {
      if (!attestation.token) throw new Error("Byse fingerprint rejected");
      return {
        token: attestation.token,
        viewer_id: attestation.viewer_id || viewerId,
        device_id: attestation.device_id || deviceId,
        confidence: attestation.confidence || 0
      };
    });
  });
}

function createByseFallbackFingerprint(apiOrigin) {
  return createByseNodeFingerprint(apiOrigin).then(function(fingerprint) {
    return fingerprint || createByseJsFingerprint(apiOrigin);
  }).catch(function() {
    return createByseJsFingerprint(apiOrigin);
  });
}

function randomId() {
  return base64UrlEncode(byseRandomBytes(16));
}

function createByseFingerprint(apiOrigin) {
  var webCrypto = byseCrypto();
  if (!webCrypto || !webCrypto.subtle || !webCrypto.subtle.generateKey) {
    return createByseFallbackFingerprint(apiOrigin);
  }

  var keyPairPromise;
  try {
    keyPairPromise = webCrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
  } catch (error) {
    return createByseFallbackFingerprint(apiOrigin);
  }

  return Promise.resolve(keyPairPromise).then(function(keys) {
    return apiJson(apiOrigin + "/api/videos/access/challenge", {
      method: "POST",
      credentials: "include",
      headers: byseAccessHeaders(apiOrigin),
      body: "{}"
    }).then(function(challenge) {
      return Promise.all([
        webCrypto.subtle.exportKey("jwk", keys.publicKey),
        webCrypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          textBytes(challenge.nonce)
        )
      ]).then(function(values) {
        var viewerId = randomId();
        var deviceId = randomId();
        var client = {
          user_agent: FETCH_HEADERS["User-Agent"],
          languages: ["ro-RO", "en-US"],
          timezone: "UTC",
          extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] }
        };
        var body = {
          viewer_id: viewerId,
          device_id: deviceId,
          challenge_id: challenge.challenge_id,
          nonce: challenge.nonce,
          signature: base64UrlEncode(new Uint8Array(values[1])),
          public_key: values[0],
          client: client,
          storage: {},
          attributes: { entropy: "low" }
        };

        return apiJson(apiOrigin + "/api/videos/access/attest", {
          method: "POST",
          credentials: "include",
          headers: byseAccessHeaders(apiOrigin),
          body: JSON.stringify(body)
        }).then(function(attestation) {
          if (!attestation.token) throw new Error("Byse fingerprint rejected");
          return {
            token: attestation.token,
            viewer_id: attestation.viewer_id || viewerId,
            device_id: attestation.device_id || deviceId,
            confidence: attestation.confidence || 0
          };
        });
      }, function() {
        return createByseFallbackFingerprint(apiOrigin);
      });
    });
  }, function() {
    return createByseFallbackFingerprint(apiOrigin);
  });
}

function byseMix(state) {
  var a = state[0];
  var b = state[1];
  var c = state[2];
  var d = state[3];

  a = (a + b) >>> 0;
  d = (d ^ a) >>> 0;
  d = (d << 16 | d >>> 16) >>> 0;
  c = (c + d) >>> 0;
  b = (b ^ c) >>> 0;
  b = (b << 12 | b >>> 20) >>> 0;
  a = (a + b) >>> 0;
  d = (d ^ a) >>> 0;
  d = (d << 8 | d >>> 24) >>> 0;
  c = (c + d) >>> 0;
  b = (b ^ c) >>> 0;
  b = (b << 7 | b >>> 25) >>> 0;

  state[0] = a;
  state[1] = b;
  state[2] = c;
  state[3] = d;
}

function bysePowHash(bytes, workspace, byteLength) {
  workspace = workspace || {};
  var state = workspace.state || new Uint32Array(4);
  state[0] = 1779033703;
  state[1] = 3144134277;
  state[2] = 1013904242;
  state[3] = 2773480762;

  var inputLength = typeof byteLength === "number" ? byteLength : bytes.length;
  var index;
  for (index = 0; index < inputLength; index += 1) {
    state[0] = state[0] + bytes[index] >>> 0;
    state[0] = (state[0] << 7 | state[0] >>> 25) >>> 0;
    byseMix(state);
  }
  for (index = 0; index < 8; index += 1) byseMix(state);

  var table = workspace.table || new Uint32Array(512);
  for (index = 0; index < 512; index += 1) {
    byseMix(state);
    table[index] = (state[0] ^ state[2]) >>> 0;
  }

  var round;
  for (round = 0; round < 2; round += 1) {
    for (index = 0; index < 512; index += 1) {
      var target = table[index] & 511;
      var value = table[index] + table[target] >>> 0;
      value = (value << 13 | value >>> 19) >>> 0;
      value = (value ^ Math.imul(table[(index + 1) & 511], 2654435761)) >>> 0;
      table[index] = value;
      state[0] = (state[0] ^ value) >>> 0;
      byseMix(state);
    }
  }

  var result = workspace.result || new Uint32Array(8);
  for (index = 0; index < 8; index += 1) {
    byseMix(state);
    var sum = state[0];
    var start = index * 64;
    for (var offset = 0; offset < 64; offset += 1) {
      var item = table[start + offset];
      sum = sum + item >>> 0;
      sum = (sum << 5 | sum >>> 27) >>> 0;
      sum = (sum ^ Math.imul(item, 2246822519)) >>> 0;
    }
    result[index] = (sum ^ state[2]) >>> 0;
  }
  return result;
}

function byseLeadingZeroBits(words) {
  var bits = 0;
  for (var index = 0; index < words.length; index += 1) {
    if (words[index] === 0) {
      bits += 32;
      continue;
    }
    return bits + Math.clz32(words[index]);
  }
  return bits;
}

function solveBysePow(nonce, difficulty, timeoutMs) {
  if (!difficulty || difficulty <= 0) return Promise.resolve("0");
  var prefix = String(nonce) + ":";
  var prefixBytes = textBytes(prefix);
  var powInput = new Uint8Array(prefixBytes.length + 20);
  powInput.set(prefixBytes, 0);
  var workspace = {
    state: new Uint32Array(4),
    table: new Uint32Array(512),
    result: new Uint32Array(8)
  };
  var solution = 0;
  var started = Date.now();
  var timeout = parseInt(timeoutMs, 10) || 20000;

  if (typeof setTimeout !== "function") {
    while (Date.now() - started <= timeout) {
      for (var syncCount = 0; syncCount < 1024; syncCount += 1) {
        var syncCounter = String(solution);
        for (var syncDigit = 0; syncDigit < syncCounter.length; syncDigit += 1) {
          powInput[prefixBytes.length + syncDigit] = syncCounter.charCodeAt(syncDigit);
        }
        if (byseLeadingZeroBits(bysePowHash(powInput, workspace, prefixBytes.length + syncCounter.length)) >= difficulty) {
          return Promise.resolve(String(solution));
        }
        solution += 1;
      }
    }
    return Promise.resolve(null);
  }

  function step() {
    for (var count = 0; count < 1024; count += 1) {
      var counter = String(solution);
      for (var digit = 0; digit < counter.length; digit += 1) {
        powInput[prefixBytes.length + digit] = counter.charCodeAt(digit);
      }
      if (byseLeadingZeroBits(bysePowHash(powInput, workspace, prefixBytes.length + counter.length)) >= difficulty) {
        return Promise.resolve(String(solution));
      }
      solution += 1;
    }
    if (Date.now() - started > timeout) return Promise.resolve(null);
    return new Promise(function(resolve) {
      setTimeout(function() { resolve(step()); }, 0);
    });
  }

  return step();
}

function bysePlaybackKeyBytes(playback) {
  var version = parseInt(playback.version, 10);
  var first = version;
  var second = 31 - version;
  var keyParts = playback.key_parts || [];
  if (!first || !second || !keyParts[first - 1] || !keyParts[second - 1]) {
    throw new Error("Unsupported Byse key version");
  }

  var firstBytes = binaryBytes(decodeBase64(keyParts[first - 1]));
  var secondBytes = binaryBytes(decodeBase64(keyParts[second - 1]));
  var keyBytes = new Uint8Array(firstBytes.length + secondBytes.length);
  keyBytes.set(firstBytes, 0);
  keyBytes.set(secondBytes, firstBytes.length);
  return keyBytes;
}

function byseAesEncryptBlock(encryptor, bytes) {
  var words = [0, 0, 0, 0];
  for (var index = 0; index < 16; index += 1) {
    words[index >> 2] |= bytes[index] << (24 - (index & 3) * 8);
  }
  encryptor.encryptBlock(words, 0);
  var output = new Uint8Array(16);
  for (var outputIndex = 0; outputIndex < 16; outputIndex += 1) {
    output[outputIndex] = (words[outputIndex >> 2] >>> (24 - (outputIndex & 3) * 8)) & 255;
  }
  return output;
}

function byseGhashMultiply(value, hashSubkey) {
  var product = new Uint8Array(16);
  var factor = new Uint8Array(hashSubkey);
  for (var bit = 0; bit < 128; bit += 1) {
    if ((value[bit >> 3] & (1 << (7 - (bit & 7)))) !== 0) {
      for (var byteIndex = 0; byteIndex < 16; byteIndex += 1) {
        product[byteIndex] ^= factor[byteIndex];
      }
    }
    var lowBit = factor[15] & 1;
    var carry = 0;
    for (var shiftIndex = 0; shiftIndex < 16; shiftIndex += 1) {
      var current = factor[shiftIndex];
      factor[shiftIndex] = (current >>> 1) | carry;
      carry = (current & 1) ? 128 : 0;
    }
    if (lowBit) factor[0] ^= 225;
  }
  return product;
}

function byseGhashBlock(state, block, hashSubkey) {
  var value = new Uint8Array(16);
  for (var index = 0; index < 16; index += 1) {
    value[index] = state[index] ^ block[index];
  }
  return byseGhashMultiply(value, hashSubkey);
}

function byseDecryptPlaybackCryptoJs(playback, keyBytes) {
  if (!CryptoJS || !CryptoJS.algo || !CryptoJS.algo.AES) {
    throw new Error("AES-GCM unavailable in QuickJS");
  }
  var iv = binaryBytes(decodeBase64(playback.iv));
  var payload = binaryBytes(decodeBase64(playback.payload));
  if (iv.length !== 12 || payload.length < 16) {
    throw new Error("Unsupported Byse AES-GCM payload");
  }

  var keyHex = byseHex(keyBytes);
  var key = CryptoJS.enc.Hex.parse(keyHex);
  var encryptor = CryptoJS.algo.AES.createEncryptor(key);
  var hashSubkey = byseAesEncryptBlock(encryptor, new Uint8Array(16));
  var j0 = new Uint8Array(16);
  j0.set(iv, 0);
  j0[15] = 1;

  var ciphertextLength = payload.length - 16;
  var ciphertext = payload.subarray(0, ciphertextLength);
  var authTag = payload.subarray(ciphertextLength);
  var hash = new Uint8Array(16);
  for (var offset = 0; offset < ciphertext.length; offset += 16) {
    var block = new Uint8Array(16);
    block.set(ciphertext.subarray(offset, offset + 16));
    hash = byseGhashBlock(hash, block, hashSubkey);
  }

  var lengthBlock = new Uint8Array(16);
  var bitLength = ciphertext.length * 8;
  for (var lengthIndex = 15; lengthIndex >= 8; lengthIndex -= 1) {
    lengthBlock[lengthIndex] = bitLength & 255;
    bitLength = Math.floor(bitLength / 256);
  }
  hash = byseGhashBlock(hash, lengthBlock, hashSubkey);
  var expectedTag = byseAesEncryptBlock(encryptor, j0);
  var tagDifference = 0;
  for (var tagIndex = 0; tagIndex < 16; tagIndex += 1) {
    tagDifference |= authTag[tagIndex] ^ hash[tagIndex] ^ expectedTag[tagIndex];
  }
  if (tagDifference !== 0) throw new Error("Byse AES-GCM authentication failed");

  var counter = new Uint8Array(j0);
  var plaintext = new Uint8Array(ciphertext.length);
  for (var counterOffset = 0; counterOffset < ciphertext.length; counterOffset += 16) {
    for (var counterIndex = 15; counterIndex >= 12; counterIndex -= 1) {
      counter[counterIndex] = (counter[counterIndex] + 1) & 255;
      if (counter[counterIndex] !== 0) break;
    }
    var stream = byseAesEncryptBlock(encryptor, counter);
    var count = Math.min(16, ciphertext.length - counterOffset);
    for (var streamIndex = 0; streamIndex < count; streamIndex += 1) {
      plaintext[counterOffset + streamIndex] = ciphertext[counterOffset + streamIndex] ^ stream[streamIndex];
    }
  }

  var text = typeof TextDecoder === "function"
    ? new TextDecoder().decode(plaintext)
    : CryptoJS.enc.Utf8.stringify(CryptoJS.lib.WordArray.create(
      (function() {
        var words = [];
        for (var index = 0; index < plaintext.length; index += 1) {
          words[index >> 2] |= plaintext[index] << (24 - (index & 3) * 8);
        }
        return words;
      })(),
      plaintext.length
    ));
  return JSON.parse(text);
}

function decryptBysePlaybackFallback(playback, keyBytes) {
  if (CryptoJS && CryptoJS.algo && CryptoJS.algo.AES) {
    return Promise.resolve().then(function() {
      return byseDecryptPlaybackCryptoJs(playback, keyBytes);
    });
  }
  try {
    var nodeCrypto = require("crypto");
    if (nodeCrypto.createDecipheriv && typeof Buffer !== "undefined") {
      var payload = binaryBytes(decodeBase64(playback.payload));
      var iv = binaryBytes(decodeBase64(playback.iv));
      var decipher = nodeCrypto.createDecipheriv("aes-256-gcm", Buffer.from(keyBytes), Buffer.from(iv));
      decipher.setAuthTag(Buffer.from(payload.subarray(payload.length - 16)));
      var plaintext = Buffer.concat([
        decipher.update(Buffer.from(payload.subarray(0, payload.length - 16))),
        decipher.final()
      ]);
      return Promise.resolve(JSON.parse(plaintext.toString("utf8")));
    }
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.reject(new Error("AES-GCM unavailable"));
}

function decryptBysePlayback(playback) {
  var webCrypto = byseCrypto();
  var keyBytes;
  try {
    keyBytes = bysePlaybackKeyBytes(playback);
  } catch (error) {
    return Promise.reject(error);
  }
  if (!webCrypto || !webCrypto.subtle) return decryptBysePlaybackFallback(playback, keyBytes);

  return webCrypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  ).then(function(key) {
    return webCrypto.subtle.decrypt(
      { name: "AES-GCM", iv: binaryBytes(decodeBase64(playback.iv)) },
      key,
      binaryBytes(decodeBase64(playback.payload))
    );
  }).then(function(bytes) {
    var text = typeof TextDecoder === "function"
      ? new TextDecoder().decode(bytes)
      : String.fromCharCode.apply(null, new Uint8Array(bytes));
    return JSON.parse(text);
  }).catch(function() {
    return decryptBysePlaybackFallback(playback, keyBytes);
  });
}

function hexBytes(value) {
  var hex = String(value || "").trim();
  if (hex.length % 2) hex = hex.slice(0, -1);
  var bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (var index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function player4meKey() {
  var webCrypto = byseCrypto();
  if (!webCrypto || !webCrypto.subtle) return Promise.reject(new Error("AES-CBC unavailable"));
  return webCrypto.subtle.importKey(
    "raw",
    binaryBytes("kiemtienmua911ca"),
    { name: "AES-CBC" },
    false,
    ["decrypt", "encrypt"]
  );
}

function decryptPlayer4meResponse(body) {
  if (byseCrypto()) {
    return player4meKey().then(function(key) {
      return crypto.subtle.decrypt(
        { name: "AES-CBC", iv: binaryBytes("1234567890oiuytr") },
        key,
        hexBytes(body)
      );
    }).then(function(bytes) {
      var text = typeof TextDecoder === "function"
        ? new TextDecoder().decode(bytes)
        : String.fromCharCode.apply(null, new Uint8Array(bytes));
      return JSON.parse(text);
    });
  }

  if (!CryptoJS || !CryptoJS.AES) return Promise.reject(new Error("AES-CBC unavailable"));
  try {
    var key = CryptoJS.enc.Utf8.parse("kiemtienmua911ca");
    var iv = CryptoJS.enc.Utf8.parse("1234567890oiuytr");
    var cipherText = String(body || "").trim();
    if (cipherText.length % 2) cipherText = cipherText.slice(0, -1);
    var cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.enc.Hex.parse(cipherText)
    });
    var decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return Promise.resolve(JSON.parse(decrypted.toString(CryptoJS.enc.Utf8)));
  } catch (error) {
    return Promise.reject(error);
  }
}

function encryptPlayer4meValue(value) {
  if (byseCrypto()) {
    return player4meKey().then(function(key) {
      return crypto.subtle.encrypt(
        { name: "AES-CBC", iv: binaryBytes("1234567890oiuytr") },
        key,
        binaryBytes(value)
      );
    }).then(function(bytes) {
      var result = "";
      var view = new Uint8Array(bytes);
      for (var index = 0; index < view.length; index += 1) {
        result += ("0" + view[index].toString(16)).slice(-2);
      }
      return result;
    });
  }

  if (!CryptoJS || !CryptoJS.AES) return Promise.reject(new Error("AES-CBC unavailable"));
  try {
    var key = CryptoJS.enc.Utf8.parse("kiemtienmua911ca");
    var iv = CryptoJS.enc.Utf8.parse("1234567890oiuytr");
    var encrypted = CryptoJS.AES.encrypt(String(value), key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return Promise.resolve(encrypted.ciphertext.toString(CryptoJS.enc.Hex));
  } catch (error) {
    return Promise.reject(error);
  }
}

function urlHost(url) {
  var match = String(url || "").match(/^https?:\/\/([^/]+)/i);
  return match ? match[1].replace(/^www\./i, "") : "";
}

function addPlayerKey(url, keyData) {
  if (!keyData || !keyData.k || /[?&]k=/i.test(url)) return url;
  var separator = url.indexOf("?") >= 0 ? "&" : "?";
  return url + separator + "k=" + encodeURIComponent(keyData.k) + "&kx=" + encodeURIComponent(keyData.kx || "");
}

function player4meSource(video, providerUrl, pageUrl) {
  var config = {};
  try {
    config = JSON.parse(video.streamingConfig || "{}");
  } catch (error) {
    config = {};
  }

  var sources = {
    Tiktok: video.hlsVideoTiktok,
    Google: video.hlsVideoGoogle,
    // The native playlist carries the access key into child playlists and
    // segments. The .txt playlist needs Player4me's custom HLS loader.
    Cloudflare: video.cfNative || video.cf,
    "In-House": video.source
  };
  var order = Array.isArray(config.order)
    ? config.order
    : ["Tiktok", "Google", "Cloudflare", "In-House"];
  var adjust = config.adjust || {};

  // Nuvio handles the direct in-house playlist more reliably than the
  // browser-oriented Cloudflare playlist, whose segment host can be blocked.
  if (sources["In-House"] && !(adjust["In-House"] || {}).disabled) {
    order = ["In-House"].concat(order.filter(function(provider) {
      return provider !== "In-House";
    }));
  }

  var selected = null;
  var selectedKey = video.pk || null;

  order.some(function(provider) {
    var value = sources[provider];
    var settings = adjust[provider] || {};
    if (!value || settings.disabled) return false;
    var url = absoluteUrl(value, providerUrl);
    if (!url) return false;

    if (settings.domain && url.indexOf("/hls/") >= 0) {
      url = url.replace("/hls/", "/hlsmod/" + settings.domain + "/");
    }
    var params = settings.params || {};
    Object.keys(params).forEach(function(name) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + encodeURIComponent(name) + "=" + encodeURIComponent(params[name]);
    });
    selected = addPlayerKey(url, selectedKey);
    return true;
  });

  return selected;
}

function resolvePlayer4meProvider(providerUrl, pageUrl) {
  var originMatch = String(providerUrl).match(/^https?:\/\/[^/]+/i);
  var idMatch = String(providerUrl).match(/#([^&#]+)/);
  if (!originMatch || !idMatch) return Promise.reject(new Error("Player4me video id missing"));

  var origin = originMatch[0];
  var id = idMatch[1];
  var referrerHost = urlHost(pageUrl);
  var infoUrl = origin + "/api/v1/info?id=" + encodeURIComponent(id);
  var videoUrl = origin + "/api/v1/video?id=" + encodeURIComponent(id) + "&w=1920&h=1080&r=" + encodeURIComponent(referrerHost);

  return Promise.all([
    fetchText(infoUrl).then(decryptPlayer4meResponse),
    fetchText(videoUrl).then(decryptPlayer4meResponse)
  ]).then(function(values) {
    var info = values[0];
    var video = values[1];
    var keyData = video.pk;

    if (!keyData && video.metric) {
      var payload = {
        website: referrerHost || null,
        playing: true,
        sessionId: randomId(),
        userId: video.metric.userId,
        playerId: video.metric.playerId,
        videoId: video.metric.videoId || id,
        country: video.metric.country,
        platform: video.metric.platform,
        browser: video.metric.browser,
        os: video.metric.os
      };
      return encryptPlayer4meValue(JSON.stringify(payload)).then(function(encrypted) {
        return fetchJson(origin + "/api/v1/player?t=" + encrypted).then(function(token) {
          return { info: info, video: video, keyData: token };
        });
      });
    }

    return { info: info, video: video, keyData: keyData };
  }).then(function(result) {
    var video = result.video;
    if (!video.pk && result.keyData) video.pk = result.keyData;
    var streamUrl = player4meSource(video, providerUrl, pageUrl);
    if (!streamUrl || !/^https?:\/\//i.test(streamUrl) || !/\.(?:m3u8|txt)(?:[?#]|$)/i.test(streamUrl)) {
      throw new Error("Player4me returned no HLS source");
    }
    var stream = directHlsStream(
      streamUrl,
      video.title || "Player4me HLS",
      providerUrl,
      providerUrl
    );
    stream.audioLanguage = (video.player && video.player.defaultAudio) || video.defaultAudio || video.audioLanguage || video.audio_language || (video.metric && video.metric.language);
    stream.resolution = video.resolution || video.quality || "1080p";
    return [stream];
  });
}

function randomDoodToken(length) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var result = "";
  for (var index = 0; index < length; index += 1) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

function directVideoStream(url, label, providerUrl, referrer) {
  var requestHeaders = {
    Referer: referrer || providerUrl,
    Origin: providerUrl ? String(providerUrl).match(/^https?:\/\/[^/]+/i)[0] : MAIN_URL,
    "User-Agent": FETCH_HEADERS["User-Agent"]
  };

  return {
    name: PROVIDER_NAME + " | " + label,
    title: "Direct video stream",
    url: url,
    quality: "1080p",
    type: "mp4",
    isM3U8: false,
    headers: requestHeaders,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: "desenefaine-video",
      proxyHeaders: { request: requestHeaders }
    },
    provider: "desenefaine"
  };
}

function resolveDoodProvider(providerUrl, pageUrl) {
  var pageHeaders = Object.assign({}, FETCH_HEADERS, { Referer: pageUrl });

  return fetch(providerUrl, { headers: pageHeaders }).then(function(res) {
    return res.text().then(function(html) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { html: html, url: res.url || providerUrl };
    });
  }).then(function(page) {
    var passMatch = String(page.html).match(/\/pass_md5\/[^"'<>\s]+/i);
    if (!passMatch) {
      var videoMatch = String(page.html).match(/<video\b[^>]*src=["'](https?:\/\/[^"']+)["']/i);
      if (!videoMatch) throw new Error("Dood media path missing");
      return [directVideoStream(cleanUrl(videoMatch[1]), "Doodstream", providerUrl, pageUrl)];
    }

    var passPath = cleanUrl(passMatch[0]);
    var token = passPath.split("/").pop().split("?")[0];
    var passUrl = absoluteUrl(passPath, page.url);
    if (!token || !passUrl) throw new Error("Dood token missing");

    return fetch(passUrl, { headers: pageHeaders }).then(function(res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.text();
    }).then(function(mediaBase) {
      mediaBase = cleanUrl(mediaBase);
      if (!mediaBase || mediaBase === "RELOAD") throw new Error("Dood media path missing");
      if (!/^https?:\/\//i.test(mediaBase)) mediaBase = absoluteUrl(mediaBase, page.url);
      var mediaUrl = mediaBase + randomDoodToken(10) +
        "?token=" + encodeURIComponent(token) + "&expiry=" + Date.now();
      return [directVideoStream(mediaUrl, "Doodstream", providerUrl, pageUrl)];
    });
  });
}

function decodeVsembedStreamUrls(payload) {
  if (payload && payload.data && Array.isArray(payload.data.stream_urls)) {
    return Promise.resolve(payload.data.stream_urls);
  }
  if (!payload || !payload.data || typeof payload.data.stream_urls !== "string" || !payload.vs || !payload.vs.wasm_url) {
    return Promise.reject(new Error("Vsembed stream data missing"));
  }
  if (typeof WebAssembly === "undefined") return Promise.reject(new Error("WebAssembly unavailable"));

  var encrypted = binaryBytes(decodeBase64(payload.data.stream_urls));
  return fetch(payload.vs.wasm_url, { headers: FETCH_HEADERS }).then(function(res) {
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.arrayBuffer();
  }).then(function(bytes) {
    return WebAssembly.instantiate(bytes, {});
  }).then(function(instance) {
    var exports = instance.instance ? instance.instance.exports : instance.exports;
    if (!exports || !exports.alloc || !exports.decrypt || !exports.memory) {
      throw new Error("Vsembed decryptor exports missing");
    }
    var pointer = exports.alloc(encrypted.length);
    new Uint8Array(exports.memory.buffer, pointer, encrypted.length).set(encrypted);
    var outputLength = exports.decrypt(pointer, encrypted.length);
    var output = new Uint8Array(exports.memory.buffer, pointer + 12, outputLength);
    var text = typeof TextDecoder === "function"
      ? new TextDecoder().decode(output)
      : String.fromCharCode.apply(null, output);
    return text.split("\n").filter(function(url) { return url; });
  });
}

function vsembedQueryValue(url, name) {
  var match = String(url || "").match(new RegExp("[?&]" + name + "=([^&#]*)", "i"));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

function resolveVsembedProvider(providerUrl, pageUrl) {
  var typeMatch = String(providerUrl).match(/\/embed\/([^/?#]+)/i);
  var id = vsembedQueryValue(providerUrl, "tmdb");
  if (!typeMatch || !id) return Promise.reject(new Error("Vsembed parameters missing"));

  var params = [
    "type=" + encodeURIComponent(typeMatch[1]),
    "tmdb=" + encodeURIComponent(id)
  ];
  ["season", "episode", "autonext", "autoplay", "ds_lang"].forEach(function(name) {
    var value = vsembedQueryValue(providerUrl, name);
    if (value) params.push(name + "=" + encodeURIComponent(value));
  });

  var apiUrl = "https://data.vidsrcme.ru/api.php?" + params.join("&") + "&stream_urls";
  var playerPath = "/embed/player/" + typeMatch[1] + "/" + id;
  var season = vsembedQueryValue(providerUrl, "season");
  var episode = vsembedQueryValue(providerUrl, "episode");
  if (season) playerPath += "/" + encodeURIComponent(season);
  if (episode) playerPath += "/" + encodeURIComponent(episode);
  var playerUrl = "https://cloudorchestranova.com" + playerPath;

  return apiJson(apiUrl).then(function(payload) {
    return decodeVsembedStreamUrls(payload).then(function(urls) {
      return urls.map(function(url) {
        return directHlsStream(url, "Vsembed HLS", playerUrl, playerUrl);
      });
    });
  });
}

function videasySourceUrl(providerUrl) {
  var match = String(providerUrl).match(/\/(tv|movie)\/(\d+)(?:\/(\d+)\/(\d+))?/i);
  if (!match) return null;

  var url = "https://vsembed.su/embed/" + match[1].toLowerCase() + "?tmdb=" + match[2];
  if (match[3]) url += "&season=" + encodeURIComponent(match[3]);
  if (match[4]) url += "&episode=" + encodeURIComponent(match[4]);
  return url;
}

function directHlsStream(url, label, providerUrl, referrer) {
  var httpReferrer = String(referrer || providerUrl || "").split("#")[0];
  var requestHeaders = {
    Referer: httpReferrer,
    Origin: providerUrl ? String(providerUrl).match(/^https?:\/\/[^/]+/i)[0] : MAIN_URL,
    "User-Agent": FETCH_HEADERS["User-Agent"]
  };

  return {
    name: PROVIDER_NAME + " | " + label,
    title: "Direct HLS stream",
    url: url,
    quality: "1080p",
    type: "hls",
    isM3U8: true,
    headers: requestHeaders,
    behaviorHints: {
      notWebReady: true,
      bingeGroup: "desenefaine-hls",
      proxyHeaders: { request: requestHeaders }
    },
    provider: "desenefaine"
  };
}

function signedHlsStream(url, label) {
  return {
    name: PROVIDER_NAME + " | " + label,
    title: "Direct HLS stream",
    url: url,
    quality: "1080p",
    type: "hls",
    isM3U8: true,
    behaviorHints: { bingeGroup: "desenefaine-signed-hls" },
    provider: "desenefaine"
  };
}

function streamSourceName(providerUrl) {
  var host = urlHost(providerUrl).toLowerCase();
  if (/player\.desenefaine\.net|netu/i.test(host)) return "Netu";
  if (/voe\./i.test(host)) return "Voe";
  if (/videasy\./i.test(host)) return "Netu";
  if (/vsembed|vidsrc|cloudorchestranova/.test(host)) return "Vsrc";
  if (/byse/.test(host)) return "Bysewihe";
  if (/streamp2p|p2pplay/.test(host)) return "StreamP2P";
  if (/seekstream|embedseek/.test(host)) return "SeekStreaming";
  if (/4meplayer/.test(host)) return "4MePlayer";
  if (/player4me/.test(host)) return "Player4me";
  if (/dfbk/.test(host)) return "Dfbk";
  if (/desenefaine/.test(host)) return "DeseneFaine";
  return host || "DeseneFaine";
}

function audioLanguageCode(value) {
  var audio = normalizeTitle(value).replace(/[_-]+/g, " ");
  if (!audio) return "";
  if (/\b(ro|ron|romana|romanian)\b/.test(audio) || audio.indexOf("roman") >= 0) return "RO";
  if (/\b(en|eng|english|engleza)\b/.test(audio)) return "EN";
  if (/\b(fr|fra|french|franceza)\b/.test(audio)) return "FR";
  if (/\b(de|deu|german|germana)\b/.test(audio)) return "DE";
  if (/\b(es|spa|spanish|spaniola)\b/.test(audio)) return "ES";
  if (/\b(it|ita|italian|italiana)\b/.test(audio)) return "IT";
  if (/\b(ru|rus|russian|rusa)\b/.test(audio)) return "RU";
  if (/\b(uk|ukr|ukrainian|ucraineana)\b/.test(audio)) return "UK";
  if (/\b(he|heb|hebrew|ebraica)\b/.test(audio)) return "HE";
  return "";
}

function streamAudioLanguages(stream) {
  var languages = [];
  var values = [
    stream && stream.audioLanguages,
    stream && stream.audioLanguage,
    stream && stream.audio,
    stream && stream.language,
    stream && stream.audio_language,
    stream && stream.languages
  ];

  function collect(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === "object") {
      collect(value.language || value.lang || value.name || value.label);
      return;
    }
    String(value).split(/[,|/+;&]+/).forEach(function(part) {
      var code = audioLanguageCode(part);
      if (code && languages.indexOf(code) < 0) languages.push(code);
    });
  }

  values.forEach(collect);
  return languages;
}

function streamAudioDisplay(languages) {
  if (languages.length === 1 && languages[0] === "RO") return "🇷🇴 RO Dub";
  if (languages.length) return "🌐 " + languages.length + " audio tracks • " + languages.join(" • ");
  return "🎧 Audio language unavailable";
}

function streamResolutionName(value) {
  var resolution = String(value || "").trim().toLowerCase();
  var dimensions = resolution.match(/(\d{3,4})\s*[x/]\s*(\d{3,4})/);
  if (dimensions) return dimensions[2] + "p";
  var height = resolution.match(/(\d{3,4})\s*p?/);
  if (height) return height[1] + "p";
  return "1080p";
}

function decorateStream(stream, displayTitle, providerUrl) {
  var source = stream.sourceName || streamSourceName(providerUrl);
  var languages = streamAudioLanguages(stream);
  var resolution = streamResolutionName(stream.resolution || stream.quality);
  var audioDetails = languages.length ? "⭐ " + streamAudioDisplay(languages) : "";

  stream.name = "✦ " + source + (audioDetails ? "\n" + audioDetails : "");
  stream.title = audioDetails;
  stream.description = audioDetails;
  stream.quality = resolution;
  return stream;
}

function streamDeduplicationKey(value) {
  var url = String(value || "").trim().split("#")[0];
  var queryIndex = url.indexOf("?");
  if (queryIndex < 0) return url;

  var path = url.slice(0, queryIndex);
  var params = url.slice(queryIndex + 1).split("&").filter(function(param) {
    var equalsIndex = param.indexOf("=");
    var name = equalsIndex < 0 ? param : param.slice(0, equalsIndex);
    try {
      name = decodeURIComponent(name.replace(/\+/g, " "));
    } catch (error) {
      // Keep malformed parameter names as-is.
    }
    return !/^(?:sig|signature|expires|expiry|exp|policy|key-pair-id|awsaccesskeyid|hdnea|hdnts|x-amz-[\w-]+|x-goog-[\w-]+|x-amzn-[\w-]+|x-ms-[\w-]+|utm_[\w-]+|fbclid|gclid|mc_cid|mc_eid|_)$/i.test(name);
  });

  return path + (params.length ? "?" + params.join("&") : "");
}

function uniqueStreams(streams) {
  var seen = {};
  return (streams || []).filter(function(stream) {
    var key = streamDeduplicationKey(stream && stream.url);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function labelStreams(streams, serverLabel) {
  if (!serverLabel) return streams || [];
  return (streams || []).map(function(stream) {
    var nameParts = String(stream && stream.name || "").split("\n");
    var sourceName = nameParts.shift().replace(/^✦\s*/, "").trim();
    var label = "✦ " + serverLabel;
    var normalizedLabel = normalizeTitle(serverLabel);
    var normalizedSource = normalizeTitle(sourceName);
    var audioLanguages = streamAudioLanguages(stream);
    if (!audioLanguages.length && /\b(?:romana|romanian|ro dub)\b/.test(normalizedLabel)) {
      stream.audioLanguage = "ro";
      audioLanguages = ["RO"];
    }
    var audioDetails = audioLanguages.length ? "⭐ " + streamAudioDisplay(audioLanguages) : "";
    var isByseAlias = normalizedSource === "bysewihe" && normalizedLabel.indexOf("byse") >= 0;
    if (sourceName && normalizedLabel.indexOf(normalizedSource) < 0 && !isByseAlias) {
      label += " | " + sourceName;
    }
    var hasAudioDetails = nameParts.slice(1).some(function(part) {
      return /^\s*(?:⭐|🌐|🎧)/.test(part);
    });
    if (audioDetails && !hasAudioDetails) nameParts.push(audioDetails);
    if (audioDetails) {
      stream.title = audioDetails;
      stream.description = audioDetails;
    }
    stream.name = label + (nameParts.length ? "\n" + nameParts.join("\n") : "");
    return stream;
  });
}

function findHlsUrls(html) {
  var candidates = [];
  var seen = {};
  M3U8_RE.lastIndex = 0;
  var match;
  while ((match = M3U8_RE.exec(String(html || ""))) !== null) {
    var url = cleanUrl(match[0]);
    var key = url.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      candidates.push(url);
    }
  }
  return candidates;
}

function titleScore(text, words) {
  var normalized = normalizeTitle(text);
  var score = 0;
  words.forEach(function(word) {
    if (normalized.indexOf(word) >= 0) score += 1;
  });
  return score;
}

function titleWords(value) {
  var ignored = {
    film: true,
    filmul: true,
    movie: true,
    movies: true,
    serial: true,
    seriale: true,
    series: true
  };
  return normalizeTitle(value).split(" ").filter(function(word) {
    return word.length > 2 && !ignored[word];
  });
}

function addUniqueValue(values, value) {
  var normalized = normalizeTitle(value);
  if (normalized && values.indexOf(normalized) < 0) values.push(normalized);
}

function pageMetadata(html, url) {
  var $ = cheerio.load(String(html || ""));
  var titles = [];
  var secondaryTitle = "";
  var categories = [];
  var titleSources = [
    $("h1.entry-title").first().text(),
    $(".breadcrumb span").last().text(),
    $("meta[property='og:title']").attr("content"),
    $("title").first().text()
  ];

  titleSources.forEach(function(value) {
    addUniqueValue(titles, value);
  });

  $(".details-lst li").each(function(_, element) {
    var label = normalizeTitle($(element).find("span").first().text());
    var value = $(element).find("span").eq(1).text();
    if (label === "titlu secundar" || label === "titlu original") {
      secondaryTitle = value;
      addUniqueValue(titles, value);
    }
  });

  $(".details-lst a[href]").each(function(_, element) {
    var href = String($(element).attr("href") || "");
    if (/\/filme-(?:dublate|animatie-dublate)|\/seriale-(?:dublate|animatie-dublate)/i.test(href)) {
      addUniqueValue(categories, $(element).text());
    }
  });

  var pageYearSources = [
    $("meta[property='og:title']").attr("content"),
    $("title").first().text(),
    $("script[type='application/ld+json']").text()
  ].join(" ");
  var yearMatch = pageYearSources.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) {
    yearMatch = $(".year").first().text().match(/\b(19|20)\d{2}\b/);
  }
  var ogType = normalizeTitle($("meta[property='og:type']").attr("content"));
  var pagePath = String(url || "").toLowerCase();
  var categoryType = categories.some(function(category) {
    return category.indexOf("serial") >= 0;
  }) ? "series" : (categories.some(function(category) {
    return category.indexOf("film") >= 0;
  }) ? "movie" : null);
  var type = /video movie|\/film\//i.test(ogType + " " + pagePath)
    ? "movie"
    : (/video tv|\/serial|\/sez\//i.test(ogType + " " + pagePath) ? "series" : categoryType);
  var slugMatch = String(url || "").match(/\/(?:film|serial)\/([^/?#]+)/i);

  if (slugMatch) addUniqueValue(titles, slugMatch[1].replace(/-/g, " "));

  return {
    titles: titles,
    secondaryTitle: normalizeTitle(secondaryTitle),
    categories: categories,
    year: yearMatch ? parseInt(yearMatch[0], 10) : null,
    type: type,
    slug: slugMatch ? normalizeTitle(slugMatch[1].replace(/-/g, " ")) : ""
  };
}

function pageMatch(metadata, expectedWords, expectedYear, titleVariants, expectedType) {
  var queries = (titleVariants || []).slice();
  if (expectedWords && expectedWords.length) queries.push(expectedWords.join(" "));

  var bestMatched = 0;
  var bestRequired = 0;
  var fullMatch = false;
  queries.forEach(function(query) {
    var words = titleWords(query);
    if (!words.length) return;
    metadata.titles.forEach(function(candidate) {
      var candidateWords = titleWords(candidate);
      var matched = words.filter(function(word) {
        return candidateWords.indexOf(word) >= 0;
      }).length;
      if (matched > bestMatched || (matched === bestMatched && words.length < bestRequired)) {
        bestMatched = matched;
        bestRequired = words.length;
      }
      if (matched === words.length) fullMatch = true;
    });
  });

  var hasTitle = fullMatch || (bestMatched >= 2 && bestMatched / Math.max(bestRequired, 1) >= 0.75);
  if (expectedType === "series" && metadata.secondaryTitle && bestMatched >= 1 && bestRequired <= 2) {
    hasTitle = true;
  }
  var yearConflict = Boolean(expectedYear && metadata.year && metadata.year !== expectedYear);
  var typeConflict = Boolean(expectedType && metadata.type && metadata.type !== expectedType);
  return {
    hasTitle: hasTitle,
    yearConflict: yearConflict,
    typeConflict: typeConflict
  };
}

function siteSlug(value) {
  return normalizeTitle(value).replace(/\s+/g, "-");
}

function readFilmPage(url, expectedWords, expectedYear, strictTitle, titleVariants, expectedType) {
  return fetchText(url).then(function(html) {
    var normalized = normalizeTitle(html);
    var metadata = pageMetadata(html, url);
    var match = pageMatch(metadata, expectedWords, expectedYear, titleVariants, expectedType);
    var hasPlayer = /data-src=["'][^"']+["']/i.test(html) || /(?:trembed=|trhide=1&tid=)/i.test(html);
    var hasEpisodes = /s\s*\d+\s+e\s*\d+/i.test(normalized);
    if (match.typeConflict) return null;
    if (expectedYear && match.yearConflict) return null;
    if (strictTitle && (!match.hasTitle || match.yearConflict)) return null;
    if (!hasPlayer && !match.hasTitle && !hasEpisodes) return null;
    return { url: url, html: html };
  }).catch(function() {
    return null;
  });
}

function filmPageSlugs(query) {
  var slug = siteSlug(query);
  var baseSlug = slug.replace(/-(?:filmul|film|movie|movies)$/i, "");
  var slugs = [
    slug,
    baseSlug,
    baseSlug + "-filmul",
    baseSlug + "-film",
    baseSlug + "-dublat-in-romana"
  ];
  if (slug === "moana") slugs.unshift("vaiana-filmul");
  if (slug === "vaiana") slugs.unshift("vaiana-filmul");
  return slugs.filter(function(value, index) {
    return slugs.indexOf(value) === index;
  });
}

function findDirectFilmPage(query, words, expectedYear, titleVariants) {
  var slugs = [];
  [query].concat(titleVariants || []).forEach(function(variant) {
    filmPageSlugs(variant).forEach(function(slug) {
      if (slugs.indexOf(slug) < 0) slugs.push(slug);
    });
  });
  var result = Promise.resolve(null);
  slugs.forEach(function(slug) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(MAIN_URL + "/film/" + slug + "/", words, expectedYear, true, titleVariants, "movie");
    });
  });
  return result;
}

function episodePageSlugs(query, season, episode) {
  var slug = siteSlug(query);
  var s = parseInt(season, 10) || 1;
  var e = parseInt(episode, 10) || 1;
  var paddedSeason = s < 10 ? "0" + s : String(s);
  var paddedEpisode = e < 10 ? "0" + e : String(e);
  return [
    slug + "-s" + s + "-ep" + e,
    slug + "-s" + paddedSeason + "-e" + paddedEpisode,
    slug + "-sezonul-" + s + "-episodul-" + e,
    slug + "-sezon-" + s + "-episodul-" + e
  ];
}

function findDirectEpisodePage(query, words, season, episode) {
  var slugs = episodePageSlugs(query, season, episode);
  var result = Promise.resolve(null);
  slugs.forEach(function(slug) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(MAIN_URL + "/epi/" + slug + "/", words, null, false);
    });
  });
  return result;
}

function seriesPageSlugs(query) {
  var slug = siteSlug(query);
  return [slug, slug + "-serial", slug + "-sezonul-1"];
}

function seriesTitleVariants(query) {
  var variants = [query];
  var localized = String(query)
    .replace(/the first/ig, "intai")
    .replace(/royal magic/ig, "magia regala")
    .replace(/magical friends/ig, "prieteni magici");
  if (normalizeTitle(localized) !== normalizeTitle(query)) variants.push(localized);
  return variants;
}

function seriesSearchQueries(query) {
  var queries = seriesTitleVariants(query);
  var additions = [];
  queries.forEach(function(variant) {
    titleWords(variant).forEach(function(word) {
      if (word.length < 4 || queries.indexOf(word) >= 0 || additions.indexOf(word) >= 0) return;
      additions.push(word);
    });
  });
  return queries.concat(additions);
}

function episodePartMatches(tokens, prefixes, number) {
  var expected = String(number);
  return tokens.some(function(token, index) {
    if (token === expected && index > 0 && prefixes.indexOf(tokens[index - 1]) >= 0) return true;
    return prefixes.some(function(prefix) {
      return token === prefix + expected;
    });
  });
}

function readEpisodeFromSeriesPage(seriesResult, words, season, episode, expectedYear) {
  if (!seriesResult) return Promise.resolve(null);
  var $ = cheerio.load(seriesResult.html);
  var seasonNumber = parseInt(season, 10) || 1;
  var episodeNumber = parseInt(episode, 10) || 1;
  var candidate = null;

  $("a[href]").each(function(_, element) {
    if (candidate) return;
    var href = absoluteUrl($(element).attr("href"), seriesResult.url);
    var tokens = normalizeTitle(($(element).text() || "") + " " + (href || "")).split(" ");
    if (!href || !/\/(?:epi|episode)\//i.test(href)) return;
    if (!episodePartMatches(tokens, ["s", "season", "sezon", "sezonul"], seasonNumber)) return;
    if (!episodePartMatches(tokens, ["e", "ep", "episode", "episod", "episodul"], episodeNumber)) return;
    candidate = href;
  });

  return candidate ? readFilmPage(candidate, words, expectedYear, false) : Promise.resolve(null);
}

function findDirectSeriesEpisodePage(query, words, season, episode, expectedYear) {
  var slugs = seriesPageSlugs(query);
  var urls = [];
  slugs.forEach(function(slug) {
    urls.push(MAIN_URL + "/serial/" + slug + "/");
    urls.push(MAIN_URL + "/sez/" + slug + "/");
    urls.push(MAIN_URL + "/sez/" + slug + "-sezonul-1/");
  });
  var result = Promise.resolve(null);
  urls.forEach(function(url) {
    result = result.then(function(found) {
      if (found) return found;
      return readFilmPage(url, words, expectedYear, false).then(function(seriesResult) {
        return readEpisodeFromSeriesPage(seriesResult, words, season, episode, expectedYear);
      });
    });
  });
  return result;
}

function searchSeries(query, season, episode, expectedYear) {
  var words = normalizeTitle(query).split(" ").filter(function(word) {
    return word.length > 2;
  });
  if (!words.length) return Promise.resolve(null);

  var variants = seriesTitleVariants(query);
  var directResult = Promise.resolve(null);
  variants.forEach(function(variant) {
    directResult = directResult.then(function(result) {
      if (result) return result;
      var variantWords = normalizeTitle(variant).split(" ").filter(function(word) {
        return word.length > 2;
      });
      return findDirectEpisodePage(variant, variantWords, season, episode).then(function(episodeResult) {
        if (episodeResult) return episodeResult;
        return findDirectSeriesEpisodePage(variant, variantWords, season, episode, expectedYear);
      });
    });
  });

  return directResult.then(function(result) {
    if (result) return result;

    var variantsForSearch = seriesSearchQueries(query);
    var searchResult = Promise.resolve(null);
    variantsForSearch.forEach(function(variant) {
      searchResult = searchResult.then(function(found) {
        if (found) return found;

        var searchUrl = MAIN_URL + "/?s=" + encodeURIComponent(variant);
        return fetchText(searchUrl).then(function(html) {
          var $ = cheerio.load(html);
          var candidates = [];
          var seen = {};
          $("a[href]").each(function(_, element) {
            var href = absoluteUrl($(element).attr("href"), searchUrl);
            if (!href || !/\/(?:serial|epi|sez)\//i.test(href) || seen[href]) return;
            seen[href] = true;
            var text = normalizeTitle($(element).text() || $(element).attr("title") || href);
            candidates.push({
              href: href,
              score: titleScore(text + " " + href, titleWords(variant))
            });
          });

          candidates.sort(function(left, right) {
            return right.score - left.score;
          });

          function inspectCandidate(index) {
            if (index >= candidates.length) return Promise.resolve(null);
            var candidate = candidates[index];
            return fetchText(candidate.href).then(function(pageHtml) {
              var page = { url: candidate.href, html: pageHtml };
              var metadata = pageMetadata(pageHtml, candidate.href);
              var match = pageMatch(metadata, words, expectedYear, variants, "series");
              var hasEpisodes = /s\s*\d+\s*[- ]\s*e\s*\d+/i.test(normalizeTitle(pageHtml));
              if (match.typeConflict || match.yearConflict || (!match.hasTitle && !hasEpisodes)) {
                return inspectCandidate(index + 1);
              }
              if (/\/epi\//i.test(candidate.href)) return readFilmPage(candidate.href, words, null, false);
              return readEpisodeFromSeriesPage(page, words, season, episode, expectedYear);
            }).catch(function() {
              return inspectCandidate(index + 1);
            });
          }

          return inspectCandidate(0);
        }).catch(function() {
          return null;
        });
      });
    });
    return searchResult;
  }).catch(function() {
    return null;
  });
}

function searchFilmIndex(query, expectedYear, titleVariants, words, path) {
  var searchUrl = MAIN_URL + path + encodeURIComponent(query);
  return fetchText(searchUrl).then(function(html) {
    var $ = cheerio.load(html);
    var candidates = [];
    var seen = {};

    $("a[href]").each(function(_, element) {
      var href = absoluteUrl($(element).attr("href"), searchUrl);
      if (!href || !/desenefaine\.com\/film\//i.test(href)) return;
      if (/\/film\/$/i.test(href)) return;

      var text = normalizeTitle($(element).text() || $(element).attr("title") || href);
      var context = String($(element).closest("article").text() || $(element).parent().text() || text);
      var yearMatch = context.match(/\b(19|20)\d{2}\b/);
      var score = 0;
      titleVariants.forEach(function(variant) {
        score = Math.max(score, titleScore(text, titleWords(variant)));
      });
      if (score < Math.ceil(words.length / 2)) return;

      var candidate = {
        href: href,
        text: text,
        score: score,
        year: yearMatch ? parseInt(yearMatch[0], 10) : null
      };
      var existing = candidates.find(function(item) {
        return item.href === href;
      });
      if (!existing) {
        candidates.push(candidate);
      } else if (candidate.score > existing.score || (!existing.year && candidate.year)) {
        Object.assign(existing, candidate);
      }
    });

    candidates.sort(function(left, right) {
      var leftYearRank = expectedYear && left.year === expectedYear ? 2 : (left.year ? 0 : 1);
      var rightYearRank = expectedYear && right.year === expectedYear ? 2 : (right.year ? 0 : 1);
      if (leftYearRank !== rightYearRank) return rightYearRank - leftYearRank;
      if (left.score !== right.score) return right.score - left.score;
      return left.text.length - right.text.length;
    });

    function tryCandidate(index) {
      if (index >= candidates.length) return Promise.resolve(null);
      return readFilmPage(candidates[index].href, words, expectedYear, true, titleVariants, "movie").then(function(result) {
        return result || tryCandidate(index + 1);
      });
    }

    return tryCandidate(0);
  });
}

function searchSite(query, expectedYear, alternateTitle) {
  var titleVariants = [query];
  if (alternateTitle && normalizeTitle(alternateTitle) !== normalizeTitle(query)) {
    titleVariants.push(alternateTitle);
  }
  var words = titleWords(query);
  if (!words.length && alternateTitle) words = titleWords(alternateTitle);
  if (!words.length) return Promise.resolve(null);

  return findDirectFilmPage(query, words, expectedYear, titleVariants).then(function(directResult) {
    if (directResult) return directResult;
    return searchFilmIndex(query, expectedYear, titleVariants, words, "/?s=").then(function(result) {
      if (result) return result;
      return searchFilmIndex(query, expectedYear, titleVariants, words, "/feed/?s=");
    });
  }).catch(function() {
    return null;
  });
}

function findServerUrls(pageHtml, pageUrl) {
  var servers = [];
  var seen = {};
  var serverRe = /<a\b[^>]*\bdata-src=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = serverRe.exec(String(pageHtml))) !== null) {
    var url = absoluteUrl(decodeBase64(match[1]), pageUrl);
    if (!url || seen[url]) continue;
    seen[url] = true;

    var label = String(match[2] || "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();
    var numberedLabel = label.match(/^server\s*0*(\d+)\s*(.*)$/i);
    if (numberedLabel) {
      label = "Server " + numberedLabel[1] + (numberedLabel[2] ? " | " + numberedLabel[2].trim() : "");
    }
    if (!label) label = "Server " + (servers.length + 1);
    servers.push({ url: url, label: label });
  }
  return servers;
}

function byseDiagnosticHint(error) {
  var message = String(error && error.message || error || "").toLowerCase();
  var status = message.match(/\bhttp\s+\d{3}\b/i);
  if (/proof of work timed out/.test(message)) return "proof-of-work timeout";
  if (/fingerprint/.test(message)) return "device fingerprint error";
  if (status) return status[0].toUpperCase();
  if (/decrypt|aes|payload|key version|no hls source/.test(message)) return "playback decode/source error";
  if (/timeout|timed out/.test(message)) return "request timeout";
  if (/fetch|network|connection|socket/.test(message)) return "network error";
  return "provider resolution error";
}

function findByseProviderUrl(embedHtml, diagnostics) {
  diagnostics = diagnostics || {};
  var tidMatch = String(embedHtml).match(
    /<iframe\b[^>]*src=["']([^"']*\?trhide=1(?:&|&amp;)tid=[^"']+)["']/i
  );
  if (!tidMatch) return null;

  var nestedUrl = cleanUrl(tidMatch[1]);
  var tokenMatch = nestedUrl.match(/[?&]tid=([0-9a-f]+)(?:&|$)/i);
  if (tokenMatch) {
    var directDecoded = decodeHex(tokenMatch[1].split("").reverse().join(""));
    if (/^https?:\/\//i.test(directDecoded)) return Promise.resolve(directDecoded);
  }

  return fetchText(nestedUrl).then(function(nestedHtml) {
    var hexMatch = String(nestedHtml).match(/trde\s*\(\s*["']([0-9a-f]+)["']\s*\)/i);
    if (!hexMatch) {
      diagnostics.byseError = "embed code not found";
      return null;
    }

    var reversed = hexMatch[1].split("").reverse().join("");
    var providerUrl = decodeHex(reversed);
    if (!/^https?:\/\//i.test(providerUrl)) diagnostics.byseError = "embed link decode failed";
    return providerUrl;
  }).catch(function() {
    diagnostics.byseError = "embed request failed";
    return null;
  });
}

function resolveByseProviderOnce(providerUrl, pageUrl) {
  var codeMatch = String(providerUrl).match(/\/e\/([^/?#]+)/i);
  if (!codeMatch) return Promise.reject(new Error("Byse video code missing"));
  var code = codeMatch[1];

  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(html) {
    var frameMatch = String(html).match(
      /<iframe\b[^>]*src=["'](https?:\/\/[^"']+\/[^"']*\/[^"']+)["']/i
    );
    var frameUrl = frameMatch ? cleanUrl(frameMatch[1]) : null;
    var apiOrigin = frameMatch
      ? frameUrl.match(/^https?:\/\/[^/]+/i)[0]
      : String(providerUrl).match(/^https?:\/\/[^/]+/i)[0];

    return createByseFingerprint(apiOrigin).then(function(fingerprint) {
      if (!fingerprint) throw new Error("Byse fingerprint unavailable in this runtime");
      var captchaUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/captcha";
      var embedHeaders = {
        "X-Embed-Parent": providerUrl,
        Referer: providerUrl,
        Origin: apiOrigin
      };

      return apiJson(captchaUrl, {
        method: "POST",
        credentials: "include",
        headers: embedHeaders,
        body: JSON.stringify({ fingerprint: fingerprint })
      }).then(function(captcha) {
        return solveBysePow(captcha.pow_nonce, captcha.pow_difficulty, 30000).then(function(solution) {
          if (solution === null) throw new Error("Byse proof of work timed out");

          var verifyBody = {
            pow_token: captcha.pow_token,
            solution: solution
          };
          verifyBody.fingerprint = fingerprint;

          return apiJson(captchaUrl + "/verify", {
            method: "POST",
            credentials: "include",
            headers: embedHeaders,
            body: JSON.stringify(verifyBody)
          });
        });
      }).then(function(verified) {
        if (!verified.token) throw new Error("Byse CAPTCHA token missing");

        var playbackRequest = {
          credentials: "include",
          headers: Object.assign({}, embedHeaders, { "X-Captcha-Token": verified.token })
        };
        playbackRequest.method = "POST";
        playbackRequest.body = JSON.stringify({ fingerprint: fingerprint });
        var playbackUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/playback";
        return apiJson(playbackUrl, playbackRequest);
      });
    });
  }).then(function(response) {
    if (!response.playback) throw new Error("Byse playback payload missing");
    return decryptBysePlayback(response.playback);
  }).then(function(playback) {
    var sources = playback.sources || [];
    var streams = [];
    sources.forEach(function(source) {
      if (!source || !source.url) return;
      var mime = String(source.mime_type || "").toLowerCase();
      if (mime.indexOf("mpegurl") < 0 && !/\.m3u8(?:\?|$)/i.test(source.url)) return;
      var stream = signedHlsStream(
        source.url,
        source.label || source.quality || "Bysewihe HLS"
      );
      stream.audioLanguage = source.audio_language || source.audioLanguage || source.language || playback.default_audio || playback.defaultAudio;
      stream.resolution = source.resolution || source.quality;
      streams.push(stream);
    });
    if (!streams.length) throw new Error("Byse returned no HLS source");
    return streams;
  });
}

function resolveByseProvider(providerUrl, pageUrl) {
  var cacheKey = String(providerUrl || "");
  var cached = byseStreamCache[cacheKey];
  function copyStreams(streams) {
    return (streams || []).map(function(stream) {
      return Object.assign({}, stream);
    });
  }

  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(copyStreams(cached.streams));
  }
  if (cached) delete byseStreamCache[cacheKey];

  var retried = false;
  function resolve() {
    return resolveByseProviderOnce(providerUrl, pageUrl).then(function(streams) {
      if (streams && streams.length) {
        byseStreamCache[cacheKey] = {
          expiresAt: Date.now() + BYSE_STREAM_CACHE_MS,
          streams: copyStreams(streams)
        };
      }
      return streams;
    }).catch(function(error) {
      var message = String(error && error.message || error || "");
      var retryable = /HTTP\s+(?:408|425|5\d\d)\b/i.test(message) ||
        /failed to fetch|load failed|network|connection|socket/i.test(message);
      if (retried || !retryable) throw error;
      retried = true;
      return resolve();
    });
  }

  return resolve();
}

function voeRot13(value) {
  return String(value || "").replace(/[A-Za-z]/g, function(character) {
    var code = character.charCodeAt(0);
    var base = code <= 90 ? 65 : 97;
    return String.fromCharCode((code - base + 13) % 26 + base);
  });
}

function voeDecrypt(value) {
  var encoded = voeRot13(value)
    .replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, "_")
    .replace(/_/g, "");
  var decoded = decodeBase64(encoded);
  var shifted = "";
  for (var index = 0; index < decoded.length; index += 1) {
    shifted += String.fromCharCode(decoded.charCodeAt(index) - 3);
  }
  return JSON.parse(decodeBase64(shifted.split("").reverse().join("")));
}

function voePayload(html) {
  var scriptMatch = String(html || "").match(
    /<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!scriptMatch) throw new Error("Voe payload missing");

  var script = scriptMatch[1].trim();
  var arrayMatch = script.match(/\[\s*["']([\s\S]*?)["']\s*\]/);
  var encoded = arrayMatch ? arrayMatch[1] : script;
  return voeDecrypt(encoded);
}

function fetchVoePage(providerUrl, pageUrl, depth) {
  depth = depth || 0;
  return fetch(providerUrl, {
    headers: Object.assign({}, FETCH_HEADERS, { Referer: pageUrl || MAIN_URL })
  }).then(function(res) {
    return res.text().then(function(html) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      var redirectMatch = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
      if (redirectMatch && depth < 2) {
        return fetchVoePage(absoluteUrl(redirectMatch[1], providerUrl), pageUrl, depth + 1);
      }
      return { html: html, url: res.url || providerUrl };
    });
  });
}

function resolveVoeProvider(providerUrl, pageUrl) {
  return fetchVoePage(providerUrl, pageUrl).then(function(page) {
    var directHls = findHlsUrls(page.html).map(function(url) {
      var stream = directHlsStream(url, "Voe HLS", providerUrl, providerUrl);
      stream.audioLanguage = "ro";
      return stream;
    });
    if (directHls.length) return directHls;

    var payload = voePayload(page.html);
    var streams = [];
    var hls = payload && payload.source;
    var mp4 = payload && (payload.direct_access_url || payload.directAccessUrl);
    if (/^https?:\/\//i.test(String(hls || ""))) {
      var hlsStream = directHlsStream(hls, "Voe HLS", providerUrl, providerUrl);
      hlsStream.audioLanguage = "ro";
      streams.push(hlsStream);
    }
    if (/^https?:\/\//i.test(String(mp4 || ""))) {
      var mp4Stream = directVideoStream(mp4, "Voe MP4", providerUrl, providerUrl);
      mp4Stream.audioLanguage = "ro";
      streams.push(mp4Stream);
    }
    if (!streams.length) throw new Error("Voe returned no media URL");
    return streams;
  });
}

function resolveProvider(providerUrl, pageUrl, displayTitle, diagnostics) {
  if (/player\.desenefaine\.net|netu/i.test(providerUrl)) {
    return Promise.resolve([]);
  }
  if (/voe\./i.test(providerUrl)) {
    return resolveVoeProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    });
  }
  if (/(?:dood(?:stream)?|playmogo)\./i.test(providerUrl)) {
    return resolveDoodProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }
  if (/vsembed\./i.test(providerUrl)) {
    return resolveVsembedProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }
  if (/videasy\.(?:net|to)\//i.test(providerUrl)) {
    var sourceUrl = videasySourceUrl(providerUrl);
    if (!sourceUrl) return Promise.resolve([]);
    return resolveVsembedProvider(sourceUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }
  if (/byse(?:wihe)?\./i.test(providerUrl)) {
    return resolveByseProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function(error) {
      if (diagnostics) diagnostics.byseError = byseDiagnosticHint(error);
      return [];
    });
  }
  if (/(?:player4me|4meplayer|embed4me|streamp2p|p2pplay|seekstream|embedseek)\./i.test(providerUrl)) {
    return resolvePlayer4meProvider(providerUrl, pageUrl).then(function(streams) {
      return streams.map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function() {
      return [];
    });
  }

  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(html) {
    var hls = findHlsUrls(html);
    if (hls.length) {
      return hls.map(function(url) {
        return decorateStream(
          directHlsStream(url, "HLS", providerUrl, pageUrl),
          displayTitle,
          providerUrl
        );
      });
    }

    return [];
  }).catch(function() {
    return [];
  });
}

function resolveServerUrls(serverUrls, pageUrl, index, displayTitle) {
  if (index >= serverUrls.length) return Promise.resolve([]);

  var server = serverUrls[index];
  var serverUrl = typeof server === "string" ? server : server && server.url;
  var serverLabel = typeof server === "string" ? "" : server && server.label;
  if (!serverUrl) return resolveServerUrls(serverUrls, pageUrl, index + 1, displayTitle);
  var diagnostics = {};

  return fetchText(serverUrl, { headers: { Referer: pageUrl } }).then(function(embedHtml) {
    return Promise.resolve(findByseProviderUrl(embedHtml, diagnostics)).then(function(providerUrl) {
      if (providerUrl) return resolveProvider(providerUrl, serverUrl, displayTitle, diagnostics);

      return findHlsUrls(embedHtml).map(function(url) {
        return decorateStream(
          directHlsStream(url, "HLS", serverUrl, pageUrl),
          displayTitle,
          serverUrl
        );
      });
    });
  }).catch(function(error) {
    if (/byse/i.test(serverLabel)) diagnostics.byseError = byseDiagnosticHint(error);
    return [];
  }).then(function(streams) {
    var labeledStreams = labelStreams(streams, serverLabel);
    if (diagnostics.byseError && typeof console !== "undefined" && console.warn) {
      console.warn("[DeseneFaine] Byse check failed for " + (serverLabel || serverUrl) + ": " + diagnostics.byseError);
    }
    return resolveServerUrls(serverUrls, pageUrl, index + 1, displayTitle).then(function(nextStreams) {
      return uniqueStreams(labeledStreams.concat(nextStreams || []));
    });
  });
}

function resolveFilmPageResult(result, displayTitle) {
  if (!result || !result.html) return Promise.resolve([]);
  var serverUrls = findServerUrls(result.html, result.url);
  if (!serverUrls.length) return Promise.resolve([]);
  return resolveServerUrls(serverUrls, result.url, 0, displayTitle);
}

function normalizeCatalogId(id) {
  var value = String(id || "").trim();
  try {
    value = decodeURIComponent(value);
  } catch (error) {
    // Keep the original ID when Nuvio passes malformed escaping.
  }
  var tmdbUrl = value.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
  if (tmdbUrl) return tmdbUrl[1];

  var imdbId = value.match(/(?:^|[^a-z])tt\d{7,}/i);
  if (imdbId) return imdbId[0].replace(/^[^t]+/i, "");

  value = value.split(/[?#]/)[0];
  value = value.replace(/^(?:movie|tv|series):/i, "");
  value = value.replace(/^(?:tmdb|imdb):\/*/i, "");
  value = value.replace(/^(?:movie|tv|series):/i, "");

  var numericId = value.match(/^\d+/);
  if (numericId) return numericId[0];
  return value;
}

function tmdbUrl(id, type) {
  var cleanId = normalizeCatalogId(id);
  var isTv = type === "tv" || type === "series";
  var isImdb = cleanId.startsWith("tt");
  var endpoint = isImdb
    ? "find/" + encodeURIComponent(cleanId)
    : (isTv ? "tv/" : "movie/") + encodeURIComponent(cleanId);
  var query = "?api_key=" + encodeURIComponent(TMDB_API_KEY) + "&language=ro-RO";
  if (isImdb) query += "&external_source=imdb_id";
  return "https://api.themoviedb.org/3/" + endpoint + query;
}

function getStreams(id, type, season, episode) {
  var isTv = type === "tv" || type === "series";
  var cleanId = normalizeCatalogId(id);
  if (typeof console !== "undefined" && console.log) {
    console.log("[DeseneFaine " + DESENEFAINE_PLUGIN_VERSION + "] lookup", String(id || ""), "=>", cleanId, String(type || ""));
  }

  return fetchJson(tmdbUrl(cleanId, type)).then(function(data) {
    var isImdb = cleanId.startsWith("tt");
    var romanianTitle;
    var originalTitle;
    var releaseYear;

    if (isImdb) {
      var results = isTv ? data.tv_results : data.movie_results;
      var result = results && results[0];
      romanianTitle = result && (isTv ? result.name : result.title);
      originalTitle = result && (isTv ? result.original_name : result.original_title);
      releaseYear = result && parseInt(String(isTv ? result.first_air_date : result.release_date).slice(0, 4), 10);
    } else {
      romanianTitle = isTv ? data.name : data.title;
      originalTitle = isTv ? data.original_name : data.original_title;
      releaseYear = parseInt(String(isTv ? data.first_air_date : data.release_date).slice(0, 4), 10);
    }

    var findPage = isTv ? searchSeries : searchSite;
    var displayTitle = originalTitle || romanianTitle;
    var pageResult = isTv
       ? findPage(romanianTitle || originalTitle, season, episode, releaseYear)
       : findPage(romanianTitle || originalTitle, releaseYear, originalTitle);

    return pageResult.then(function(result) {
      if (!result && originalTitle && originalTitle !== romanianTitle) {
        return isTv
           ? searchSeries(originalTitle, season, episode, releaseYear)
           : searchSite(originalTitle, releaseYear, romanianTitle);
      }
      return result;
  }).then(function(result) {
      return resolveFilmPageResult(result, displayTitle);
    });
  }).catch(function(error) {
    if (typeof console !== "undefined" && console.error) {
      console.error(
        "[DeseneFaine] stream lookup failed",
        String(id || ""),
        String(type || ""),
        String(error && error.message || error || "unknown error")
      );
    }
    return [];
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
