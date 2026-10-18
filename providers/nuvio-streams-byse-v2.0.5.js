var cheerio=require("cheerio-without-node-native"),CryptoJS=null;try{CryptoJS=require("crypto-js")}catch(e){CryptoJS=null}var PROVIDER_NAME="Romanian Streams",PLUGIN_VERSION="2.0.5",MAIN_URL=decodeURIComponent("https%3A%2F%2F%64%65%73%65%6e%65%66%61%69%6e%65%2e%63%6f%6d"),SITE_KEY=decodeURIComponent("%64%65%73%65%6e%65%66%61%69%6e%65"),TMDB_API_KEY="439c478a771f35c05022f9feabcca01c",FETCH_HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},M3U8_RE=/(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\/master\.txt)(?:\?[^\s"'<>\\]*)?/gi;function fetchWithTimeout(url,options,timeoutMs){var target=String(url||"");if(!/^https?:\/\//i.test(target))return Promise.reject(new Error("Unsupported request URL"));var request=Object.assign({},options||{});if(typeof setTimeout!=="function"||typeof Promise.race!=="function")return fetch(target,request);var timer=null,timeout=parseInt(timeoutMs,10)||15000,timeoutPromise=new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error("Request timed out"));},timeout);}),clear=function(){if(timer!==null)clearTimeout(timer);timer=null;},result;try{result=fetch(target,request);}catch(error){clear();return Promise.reject(error);}return Promise.race([result,timeoutPromise]).then(function(response){clear();return response;},function(error){clear();throw error;});}function fetchText(e,r){var t={method:(r=r||{}).method||"GET",headers:Object.assign({},FETCH_HEADERS,r.headers||{})};return void 0!==r.body&&(t.body=r.body),fetchWithTimeout(e,t,r.timeoutMs).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.text()}))}function fetchJson(e,r){var t={method:(r=r||{}).method||"GET",headers:Object.assign({},FETCH_HEADERS,r.headers||{})};return void 0!==r.body&&(t.body=r.body),fetchWithTimeout(e,t,r.timeoutMs).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.json()}))}function normalizeTitle(e){return String(e||"").toLowerCase().replace(/ă/g,"a").replace(/â/g,"a").replace(/î/g,"i").replace(/ș/g,"s").replace(/ț/g,"t").replace(/[^a-z0-9]+/g," ").trim()}function cleanUrl(e){return String(e||"").replace(/\\\//g,"/").replace(/\\u002F/g,"/").replace(/\\u0026/g,"&").replace(/&amp;/g,"&").replace(/[),;]+$/,"").trim()}function absoluteUrl(e,r){var t=cleanUrl(e);if(!t)return null;if(/^https?:\/\//i.test(t))return t;if(0===t.indexOf("//"))return"https:"+t;var n=String(r).match(/^(https?:\/\/[^/]+)/i);return n?"/"===t.charAt(0)?n[1]+t:String(r).split("?")[0].replace(/\/[^/]*$/,"/")+t:null}function decodeBase64(e){var r=String(e||"").replace(/-/g,"+").replace(/_/g,"/");if(r+="===".slice((r.length+3)%4),"function"==typeof atob)return atob(r);for(var t="",n=0,i=0,a=0;a<r.length;a+=1){var o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(r.charAt(a));o<0||(n=n<<6|o,(i+=6)>=8&&(i-=8,t+=String.fromCharCode(n>>i&255)))}return t}function decodeHex(e){for(var r="",t=0;t+1<e.length;t+=2)r+=String.fromCharCode(parseInt(e.slice(t,t+2),16));return r}function binaryBytes(e){for(var r=new Uint8Array(e.length),t=0;t<e.length;t+=1)r[t]=255&e.charCodeAt(t);return r}function base64UrlEncode(e){for(var r="",t=0;t<e.length;t+=1)r+=String.fromCharCode(e[t]);return"function"==typeof btoa?btoa(r).replace(/=+$/g,"").replace(/\+/g,"-").replace(/\//g,"_"):"undefined"!=typeof Buffer?Buffer.from(e).toString("base64").replace(/=+$/g,"").replace(/\+/g,"-").replace(/\//g,"_"):r}function textBytes(e){return binaryBytes(String(e))}function apiJson(e,r){r=r||{};var t=Object.assign({Accept:"application/json","Content-Type":"application/json"},r.headers||{}),n={method:r.method||"GET",headers:t};return r.credentials&&(n.credentials=r.credentials),void 0!==r.body&&(n.body=r.body),fetch(e,n).then((function(e){return e.text().then((function(r){var t;try{t=r?JSON.parse(r):{}}catch(e){t={error:r}}if(!e.ok)throw new Error("HTTP "+e.status+": "+(t.error||r));return t}))}))}function byseCrypto(){if("undefined"!=typeof crypto&&crypto.subtle)return crypto;try{var e=require("crypto");if(e.webcrypto&&e.webcrypto.subtle)return e.webcrypto}catch(e){}return null}function createByseNodeFingerprint(e){var r;try{r=require("crypto")}catch(e){return Promise.resolve(null)}return r&&r.generateKeyPairSync&&r.createSign?apiJson(e+"/api/videos/access/challenge",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:"{}"}).then((function(t){var n=r.generateKeyPairSync("ec",{namedCurve:"prime256v1"}),i=n.publicKey.export({format:"jwk"}),a=r.createSign("SHA256").update(String(t.nonce)).sign({key:n.privateKey,dsaEncoding:"ieee-p1363"}),o=randomId(),s=randomId(),u={user_agent:FETCH_HEADERS["User-Agent"],languages:["ro-RO","en-US"],timezone:"UTC",extra:{vendor:"",appVersion:FETCH_HEADERS["User-Agent"]}};return apiJson(e+"/api/videos/access/attest",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:JSON.stringify({viewer_id:o,device_id:s,challenge_id:t.challenge_id,nonce:t.nonce,signature:base64UrlEncode(a),public_key:i,client:u,storage:{},attributes:{entropy:"low"}})}).then((function(e){if(!e.token)throw new Error("Byse fingerprint rejected");return{token:e.token,viewer_id:e.viewer_id||o,device_id:e.device_id||s,confidence:e.confidence||0}}))})):Promise.resolve(null)}function randomId(){var e=new Uint8Array(16),r=byseCrypto();if(r&&r.getRandomValues)r.getRandomValues(e);else for(var t=0;t<e.length;t+=1)e[t]=Math.floor(256*Math.random());return base64UrlEncode(e)}function createByseFingerprint(e){var r=byseCrypto();if(!(r&&r.subtle&&r.subtle.generateKey))return createByseNodeFingerprint(e);return apiJson(e+"/api/videos/access/challenge",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:"{}"}).then(function(t){return r.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},!0,["sign","verify"]).then(function(n){return Promise.all([r.subtle.exportKey("jwk",n.publicKey),r.subtle.sign({name:"ECDSA",hash:"SHA-256"},n.privateKey,textBytes(t.nonce))]).then(function(v){var i=randomId(),a=randomId(),o={user_agent:FETCH_HEADERS["User-Agent"],languages:["ro-RO","en-US"],timezone:"UTC",extra:{vendor:"",appVersion:FETCH_HEADERS["User-Agent"]}},s={viewer_id:i,device_id:a,challenge_id:t.challenge_id,nonce:t.nonce,signature:base64UrlEncode(new Uint8Array(v[1])),public_key:v[0],client:o,storage:{},attributes:{entropy:"low"}};return apiJson(e+"/api/videos/access/attest",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:JSON.stringify(s)}).then(function(q){if(!q.token)throw new Error("Byse fingerprint rejected");return{token:q.token,viewer_id:q.viewer_id||i,device_id:q.device_id||a,confidence:q.confidence||0}})})})}).catch(function(){return createByseNodeFingerprint(e)})}function bysePowHash(bytes, byteLength, scratch, firstOnly) {
  var imul = typeof Math.imul === "function" ? Math.imul : function(a, b) {
    var aLow = a & 65535;
    var bLow = b & 65535;
    var aHigh = a >>> 16;
    var bHigh = b >>> 16;
    return (aLow * bLow + ((aHigh * bLow + aLow * bHigh) << 16)) | 0;
  };
  var s0 = 1779033703;
  var s1 = 3144134277;
  var s2 = 1013904242;
  var s3 = 2773480762;
  var mixed;
  var index;

  for (index = 0; index < byteLength; index += 1) {
    s0 = s0 + bytes[index] >>> 0;
    s0 = (s0 << 7 | s0 >>> 25) >>> 0;
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) >>> 0;
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) >>> 0;
  }

  for (index = 0; index < 8; index += 1) {
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) >>> 0;
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) >>> 0;
  }

  var table = scratch.table;
  for (index = 0; index < 512; index += 1) {
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) >>> 0;
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) >>> 0;
    table[index] = (s0 ^ s2) >>> 0;
  }

  var round;
  for (round = 0; round < 2; round += 1) {
    for (index = 0; index < 512; index += 1) {
      var target = table[index] & 511;
      var value = table[index] + table[target] >>> 0;
      value = (value << 13 | value >>> 19) >>> 0;
      value = (value ^ imul(table[(index + 1) & 511], 2654435761)) >>> 0;
      table[index] = value;
      s0 = (s0 ^ value) >>> 0;
      s0 = s0 + s1 >>> 0;
      mixed = s3 ^ s0;
      s3 = (mixed << 16 | mixed >>> 16) >>> 0;
      s2 = s2 + s3 >>> 0;
      mixed = s1 ^ s2;
      s1 = (mixed << 12 | mixed >>> 20) >>> 0;
      s0 = s0 + s1 >>> 0;
      mixed = s3 ^ s0;
      s3 = (mixed << 8 | mixed >>> 24) >>> 0;
      s2 = s2 + s3 >>> 0;
      mixed = s1 ^ s2;
      s1 = (mixed << 7 | mixed >>> 25) >>> 0;
    }
  }

  var result = scratch.result;
  for (index = 0; index < (firstOnly ? 1 : 8); index += 1) {
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) >>> 0;
    s0 = s0 + s1 >>> 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) >>> 0;
    s2 = s2 + s3 >>> 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) >>> 0;

    var sum = s0;
    var start = index * 64;
    for (var offset = 0; offset < 64; offset += 1) {
      var item = table[start + offset];
      sum = sum + item >>> 0;
      sum = (sum << 5 | sum >>> 27) >>> 0;
      sum = (sum ^ imul(item, 2246822519)) >>> 0;
    }
    result[index] = (sum ^ s2) >>> 0;
  }
  return result;
}

function byseClz32(value) {
  if (typeof Math.clz32 === "function") return Math.clz32(value);
  value = value >>> 0;
  if (value === 0) return 32;
  var bits = 0;
  if ((value & 4294901760) === 0) { bits += 16; value <<= 16; }
  if ((value & 4278190080) === 0) { bits += 8; value <<= 8; }
  if ((value & 4026531840) === 0) { bits += 4; value <<= 4; }
  if ((value & 3221225472) === 0) { bits += 2; value <<= 2; }
  if ((value & 2147483648) === 0) bits += 1;
  return bits;
}

function byseLeadingZeroBits(words) {
  var bits = 0;
  for (var index = 0; index < words.length; index += 1) {
    if (words[index] === 0) {
      bits += 32;
      continue;
    }
    return bits + byseClz32(words[index]);
  }
  return bits;
}

function solveBysePow(nonce, difficulty, timeoutMs) {
  if (!difficulty || difficulty <= 0) return Promise.resolve("0");

  var prefixBytes = textBytes(String(nonce) + ":");
  var bytes = new Uint8Array(prefixBytes.length + 16);
  bytes.set(prefixBytes);
  var scratch = {
    table: new Uint32Array(512),
    result: new Uint32Array(8)
  };
  var solution = 0;
  var started = Date.now();

  function step() {
    for (var count = 0; count < 1024; count += 1) {
      var counter = String(solution);
      var byteLength = prefixBytes.length + counter.length;
      if (byteLength > bytes.length) {
        bytes = new Uint8Array(byteLength * 2);
        bytes.set(prefixBytes);
      }
      for (var index = 0; index < counter.length; index += 1) {
        bytes[prefixBytes.length + index] = counter.charCodeAt(index);
      }

      if (byseLeadingZeroBits(bysePowHash(bytes, byteLength, scratch, difficulty <= 32)) >= difficulty) {
        return Promise.resolve(String(solution));
      }
      solution += 1;
    }
    if (Date.now() - started > (timeoutMs || 20000)) return Promise.resolve(null);
    return new Promise(function(resolve) {
      setTimeout(function() { resolve(step()); }, 0);
    });
  }

  return step();
}

function decryptBysePlayback(e){var r=byseCrypto();if(!r||!r.subtle)return Promise.reject(new Error("AES-GCM unavailable"));var t=parseInt(e.version,10),n=t,i=31-t,a=e.key_parts||[];if(!(n&&i&&a[n-1]&&a[i-1]))return Promise.reject(new Error("Unsupported Byse key version"));var o=binaryBytes(decodeBase64(a[n-1])),s=binaryBytes(decodeBase64(a[i-1])),u=new Uint8Array(o.length+s.length);return u.set(o,0),u.set(s,o.length),r.subtle.importKey("raw",u,{name:"AES-GCM"},!1,["decrypt"]).then((function(t){return r.subtle.decrypt({name:"AES-GCM",iv:binaryBytes(decodeBase64(e.iv))},t,binaryBytes(decodeBase64(e.payload)))})).then((function(e){var r="function"==typeof TextDecoder?(new TextDecoder).decode(e):String.fromCharCode.apply(null,new Uint8Array(e));return JSON.parse(r)}))}function hexBytes(e){var r=String(e||"").trim();r.length%2&&(r=r.slice(0,-1));for(var t=new Uint8Array(Math.floor(r.length/2)),n=0;n<t.length;n+=1)t[n]=parseInt(r.slice(2*n,2*n+2),16);return t}function player4meKey(){var e=byseCrypto();return e&&e.subtle?e.subtle.importKey("raw",binaryBytes("kiemtienmua911ca"),{name:"AES-CBC"},!1,["decrypt","encrypt"]):Promise.reject(new Error("AES-CBC unavailable"))}function decryptPlayer4meResponse(e){if(byseCrypto())return player4meKey().then((function(r){return crypto.subtle.decrypt({name:"AES-CBC",iv:binaryBytes("1234567890oiuytr")},r,hexBytes(e))})).then((function(e){var r="function"==typeof TextDecoder?(new TextDecoder).decode(e):String.fromCharCode.apply(null,new Uint8Array(e));return JSON.parse(r)}));if(!CryptoJS||!CryptoJS.AES)return Promise.reject(new Error("AES-CBC unavailable"));try{var r=CryptoJS.enc.Utf8.parse("kiemtienmua911ca"),t=CryptoJS.enc.Utf8.parse("1234567890oiuytr"),n=String(e||"").trim();n.length%2&&(n=n.slice(0,-1));var i=CryptoJS.lib.CipherParams.create({ciphertext:CryptoJS.enc.Hex.parse(n)}),a=CryptoJS.AES.decrypt(i,r,{iv:t,mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.Pkcs7});return Promise.resolve(JSON.parse(a.toString(CryptoJS.enc.Utf8)))}catch(e){return Promise.reject(e)}}function encryptPlayer4meValue(e){if(byseCrypto())return player4meKey().then((function(r){return crypto.subtle.encrypt({name:"AES-CBC",iv:binaryBytes("1234567890oiuytr")},r,binaryBytes(e))})).then((function(e){for(var r="",t=new Uint8Array(e),n=0;n<t.length;n+=1)r+=("0"+t[n].toString(16)).slice(-2);return r}));if(!CryptoJS||!CryptoJS.AES)return Promise.reject(new Error("AES-CBC unavailable"));try{var r=CryptoJS.enc.Utf8.parse("kiemtienmua911ca"),t=CryptoJS.enc.Utf8.parse("1234567890oiuytr"),n=CryptoJS.AES.encrypt(String(e),r,{iv:t,mode:CryptoJS.mode.CBC,padding:CryptoJS.pad.Pkcs7});return Promise.resolve(n.ciphertext.toString(CryptoJS.enc.Hex))}catch(e){return Promise.reject(e)}}function urlHost(e){var r=String(e||"").match(/^https?:\/\/([^/]+)/i);return r?r[1].replace(/^www\./i,""):""}function addPlayerKey(e,r){if(!r||!r.k||/[?&]k=/i.test(e))return e;var t=e.indexOf("?")>=0?"&":"?";return e+t+"k="+encodeURIComponent(r.k)+"&kx="+encodeURIComponent(r.kx||"")}function player4meSource(e,r,t){var n={};try{n=JSON.parse(e.streamingConfig||"{}")}catch(e){n={}}var i={Tiktok:e.hlsVideoTiktok,Google:e.hlsVideoGoogle,Cloudflare:e.cfNative||e.cf,"In-House":e.source},a=Array.isArray(n.order)?n.order:["Tiktok","Google","Cloudflare","In-House"],o=n.adjust||{};i["In-House"]&&!(o["In-House"]||{}).disabled&&(a=["In-House"].concat(a.filter((function(e){return"In-House"!==e}))));var s=null,u=e.pk||null;return a.some((function(e){var t=i[e],n=o[e]||{};if(!t||n.disabled)return!1;var a=absoluteUrl(t,r);if(!a)return!1;n.domain&&a.indexOf("/hls/")>=0&&(a=a.replace("/hls/","/hlsmod/"+n.domain+"/"));var l=n.params||{};return Object.keys(l).forEach((function(e){a+=(a.indexOf("?")>=0?"&":"?")+encodeURIComponent(e)+"="+encodeURIComponent(l[e])})),s=addPlayerKey(a,u),!0})),s}function resolvePlayer4meProvider(e,r){var t=String(e).match(/^https?:\/\/[^/]+/i),n=String(e).match(/#([^&#]+)/);if(!t||!n)return Promise.reject(new Error("Player4me video id missing"));var i=t[0],a=n[1],o=urlHost(r),s=i+"/api/v1/info?id="+encodeURIComponent(a),u=i+"/api/v1/video?id="+encodeURIComponent(a)+"&w=1920&h=1080&r="+encodeURIComponent(o);return Promise.all([fetchText(s).then(decryptPlayer4meResponse),fetchText(u).then(decryptPlayer4meResponse)]).then((function(e){var r=e[0],t=e[1],n=t.pk;if(!n&&t.metric){var s={website:o||null,playing:!0,sessionId:randomId(),userId:t.metric.userId,playerId:t.metric.playerId,videoId:t.metric.videoId||a,country:t.metric.country,platform:t.metric.platform,browser:t.metric.browser,os:t.metric.os};return encryptPlayer4meValue(JSON.stringify(s)).then((function(e){return fetchJson(i+"/api/v1/player?t="+e).then((function(e){return{info:r,video:t,keyData:e}}))}))}return{info:r,video:t,keyData:n}})).then((function(t){var n=t.video;!n.pk&&t.keyData&&(n.pk=t.keyData);var i=player4meSource(n,e,r);if(!i||!/^https?:\/\//i.test(i)||!/\.(?:m3u8|txt)(?:[?#]|$)/i.test(i))throw new Error("Player4me returned no HLS source");var a=directHlsStream(i,n.title||"Player4me HLS",e,e);return a.audioLanguage=n.player&&n.player.defaultAudio||n.defaultAudio||n.audioLanguage||n.audio_language||n.metric&&n.metric.language,a.resolution=n.resolution||n.quality||"1080p",[a]}))}function randomDoodToken(e){for(var r="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",t="",n=0;n<e;n+=1)t+=r.charAt(Math.floor(62*Math.random()));return t}function directVideoStream(e,r,t,n){var i={Referer:n||t,Origin:t?String(t).match(/^https?:\/\/[^/]+/i)[0]:MAIN_URL,"User-Agent":FETCH_HEADERS["User-Agent"]};return{name:PROVIDER_NAME+" | "+r,title:"Direct video stream",url:e,quality:"1080p",type:"mp4",isM3U8:!1,headers:i,behaviorHints:{notWebReady:!0,bingeGroup:"generic-video",proxyHeaders:{request:i}},provider:"generic"}}function resolveDoodProvider(e,r){var t=Object.assign({},FETCH_HEADERS,{Referer:r});return fetch(e,{headers:t}).then((function(r){return r.text().then((function(t){if(!r.ok)throw new Error("HTTP "+r.status);return{html:t,url:r.url||e}}))})).then((function(n){var i=String(n.html).match(/\/pass_md5\/[^"'<>\s]+/i);if(!i){var a=String(n.html).match(/<video\b[^>]*src=["'](https?:\/\/[^"']+)["']/i);if(!a)throw new Error("Dood media path missing");return[directVideoStream(cleanUrl(a[1]),"Doodstream",e,r)]}var o=cleanUrl(i[0]),s=o.split("/").pop().split("?")[0],u=absoluteUrl(o,n.url);if(!s||!u)throw new Error("Dood token missing");return fetch(u,{headers:t}).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.text()})).then((function(t){if(!(t=cleanUrl(t))||"RELOAD"===t)throw new Error("Dood media path missing");return/^https?:\/\//i.test(t)||(t=absoluteUrl(t,n.url)),[directVideoStream(t+randomDoodToken(10)+"?token="+encodeURIComponent(s)+"&expiry="+Date.now(),"Doodstream",e,r)]}))}))}function decodeVsembedStreamUrls(e){if(e&&e.data&&Array.isArray(e.data.stream_urls))return Promise.resolve(e.data.stream_urls);if(!(e&&e.data&&"string"==typeof e.data.stream_urls&&e.vs&&e.vs.wasm_url))return Promise.reject(new Error("Vsembed stream data missing"));if("undefined"==typeof WebAssembly)return Promise.reject(new Error("WebAssembly unavailable"));var r=binaryBytes(decodeBase64(e.data.stream_urls));return fetch(e.vs.wasm_url,{headers:FETCH_HEADERS}).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.arrayBuffer()})).then((function(e){return WebAssembly.instantiate(e,{})})).then((function(e){var t=e.instance?e.instance.exports:e.exports;if(!(t&&t.alloc&&t.decrypt&&t.memory))throw new Error("Vsembed decryptor exports missing");var n=t.alloc(r.length);new Uint8Array(t.memory.buffer,n,r.length).set(r);var i=t.decrypt(n,r.length),a=new Uint8Array(t.memory.buffer,n+12,i);return("function"==typeof TextDecoder?(new TextDecoder).decode(a):String.fromCharCode.apply(null,a)).split("\n").filter((function(e){return e}))}))}function vsembedQueryValue(e,r){var t=String(e||"").match(new RegExp("[?&]"+r+"=([^&#]*)","i"));if(!t)return"";try{return decodeURIComponent(t[1])}catch(e){return t[1]}}function resolveVsembedProvider(e,r){var t=String(e).match(/\/embed\/([^/?#]+)/i),n=vsembedQueryValue(e,"tmdb");if(!t||!n)return Promise.reject(new Error("Vsembed parameters missing"));var i=["type="+encodeURIComponent(t[1]),"tmdb="+encodeURIComponent(n)];["season","episode","autonext","autoplay","ds_lang"].forEach((function(r){var t=vsembedQueryValue(e,r);t&&i.push(r+"="+encodeURIComponent(t))}));var a="https://data.vidsrcme.ru/api.php?"+i.join("&")+"&stream_urls",o="/embed/player/"+t[1]+"/"+n,s=vsembedQueryValue(e,"season"),u=vsembedQueryValue(e,"episode");s&&(o+="/"+encodeURIComponent(s)),u&&(o+="/"+encodeURIComponent(u));var l="https://cloudorchestranova.com"+o;return apiJson(a).then((function(e){return decodeVsembedStreamUrls(e).then((function(e){return e.map((function(e){return directHlsStream(e,"Vsembed HLS",l,l)}))}))}))}function videasySourceUrl(e){var r=String(e).match(/\/(tv|movie)\/(\d+)(?:\/(\d+)\/(\d+))?/i);if(!r)return null;var t="https://vsembed.su/embed/"+r[1].toLowerCase()+"?tmdb="+r[2];return r[3]&&(t+="&season="+encodeURIComponent(r[3])),r[4]&&(t+="&episode="+encodeURIComponent(r[4])),t}function directHlsStream(e,r,t,n){var i={Referer:String(n||t||"").split("#")[0],Origin:t?String(t).match(/^https?:\/\/[^/]+/i)[0]:MAIN_URL,"User-Agent":FETCH_HEADERS["User-Agent"]};return{name:PROVIDER_NAME+" | "+r,title:"Direct HLS stream",url:e,quality:"1080p",type:"hls",isM3U8:!0,headers:i,behaviorHints:{notWebReady:!0,bingeGroup:"generic-hls",proxyHeaders:{request:i}},provider:"generic"}}function signedHlsStream(e,r,t,n){return directHlsStream(e,r,t,n)}function streamSourceName(e){var r=urlHost(e).toLowerCase();return new RegExp("player\\."+SITE_KEY+"|netu","i").test(r)?"Netu":/voe\./i.test(r)?"Voe":/videasy\./i.test(r)?"Netu":/vsembed|vidsrc|cloudorchestranova/.test(r)?"Vsrc":/byse/.test(r)?"Bysewihe":/streamp2p|p2pplay/.test(r)?"StreamP2P":/seekstream|embedseek/.test(r)?"SeekStreaming":/4meplayer/.test(r)?"4MePlayer":/player4me/.test(r)?"Player4me":/dfbk/.test(r)?"Dfbk":new RegExp(SITE_KEY,"i").test(r)?"Romanian Streams":r||"Romanian Streams"}function audioLanguageCode(e){var r=normalizeTitle(e).replace(/[_-]+/g," ");return r?/\b(ro|ron|romana|romanian)\b/.test(r)||r.indexOf("roman")>=0?"RO":/\b(en|eng|english|engleza)\b/.test(r)?"EN":/\b(fr|fra|french|franceza)\b/.test(r)?"FR":/\b(de|deu|german|germana)\b/.test(r)?"DE":/\b(es|spa|spanish|spaniola)\b/.test(r)?"ES":/\b(it|ita|italian|italiana)\b/.test(r)?"IT":/\b(ru|rus|russian|rusa)\b/.test(r)?"RU":/\b(uk|ukr|ukrainian|ucraineana)\b/.test(r)?"UK":/\b(he|heb|hebrew|ebraica)\b/.test(r)?"HE":"":""}function streamAudioLanguages(e){var r=[];return[e&&e.audioLanguages,e&&e.audioLanguage,e&&e.audio,e&&e.language,e&&e.audio_language,e&&e.languages].forEach((function e(t){t&&(Array.isArray(t)?t.forEach(e):"object"!=typeof t?String(t).split(/[,|/+;&]+/).forEach((function(e){var t=audioLanguageCode(e);t&&r.indexOf(t)<0&&r.push(t)})):e(t.language||t.lang||t.name||t.label))})),r}function streamAudioDisplay(e){return 1===e.length&&"RO"===e[0]?"🇷🇴 RO Dub":e.length?"🌐 "+e.length+" audio tracks • "+e.join(" • "):"🎧 Audio language unavailable"}function streamResolutionName(e){var r=String(e||"").trim().toLowerCase(),t=r.match(/(\d{3,4})\s*[x/]\s*(\d{3,4})/);if(t)return t[2]+"p";var n=r.match(/(\d{3,4})\s*p?/);return n?n[1]+"p":"1080p"}function decorateStream(e,r,t){var n=e.sourceName||streamSourceName(t),i=streamAudioLanguages(e),a=streamResolutionName(e.resolution||e.quality),o=i.length?"⭐ "+streamAudioDisplay(i):"";return e.name="✦ "+n+(o?"\n"+o:""),e.title=o,e.description=o,e.quality=a,e}function uniqueStreams(e){var r={};return(e||[]).filter((function(e){var t=String(e&&e.url||"");return!(!t||r[t])&&(r[t]=!0,!0)}))}function labelStreams(e){return(e||[]).map((function(e,r){var t=streamAudioLanguages(e),n=t.length?"⭐ "+streamAudioDisplay(t):"";return e.name="Server "+(r+1)+(n?"\n"+n:""),e}))}function findHlsUrls(e){var r,t=[],n={};for(M3U8_RE.lastIndex=0;null!==(r=M3U8_RE.exec(String(e||"")));){var i=cleanUrl(r[0]),a=i.toLowerCase();n[a]||(n[a]=!0,t.push(i))}return t}function titleScore(e,r){var t=normalizeTitle(e),n=0;return r.forEach((function(e){t.indexOf(e)>=0&&(n+=1)})),n}function titleWords(e){var r={film:!0,filmul:!0,movie:!0,movies:!0,serial:!0,seriale:!0,series:!0};return normalizeTitle(e).split(" ").filter((function(e){return e.length>2&&!r[e]}))}function addUniqueValue(e,r){var t=normalizeTitle(r);t&&e.indexOf(t)<0&&e.push(t)}function pageMetadata(e,r){var t=cheerio.load(String(e||"")),n=[],i="",a=[];[t("h1.entry-title").first().text(),t(".breadcrumb span").last().text(),t("meta[property='og:title']").attr("content"),t("title").first().text()].forEach((function(e){addUniqueValue(n,e)})),t(".details-lst li").each((function(e,r){var a=normalizeTitle(t(r).find("span").first().text()),o=t(r).find("span").eq(1).text();"titlu secundar"!==a&&"titlu original"!==a||(i=o,addUniqueValue(n,o))})),t(".details-lst a[href]").each((function(e,r){var n=String(t(r).attr("href")||"");/\/filme-(?:dublate|animatie-dublate)|\/seriale-(?:dublate|animatie-dublate)/i.test(n)&&addUniqueValue(a,t(r).text())}));var o=[t("meta[property='og:title']").attr("content"),t("title").first().text(),t("script[type='application/ld+json']").text()].join(" ").match(/\b(19|20)\d{2}\b/);o||(o=t(".year").first().text().match(/\b(19|20)\d{2}\b/));var s=normalizeTitle(t("meta[property='og:type']").attr("content")),u=String(r||"").toLowerCase(),l=a.some((function(e){return e.indexOf("serial")>=0}))?"series":a.some((function(e){return e.indexOf("film")>=0}))?"movie":null,c=/video movie|\/film\//i.test(s+" "+u)?"movie":/video tv|\/serial|\/sez\//i.test(s+" "+u)?"series":l,d=String(r||"").match(/\/(?:film|serial)\/([^/?#]+)/i);return d&&addUniqueValue(n,d[1].replace(/-/g," ")),{titles:n,secondaryTitle:normalizeTitle(i),categories:a,year:o?parseInt(o[0],10):null,type:c,slug:d?normalizeTitle(d[1].replace(/-/g," ")):""}}function pageMatch(e,r,t,n,i){var a=(n||[]).slice();r&&r.length&&a.push(r.join(" "));var o=0,s=0,u=!1;a.forEach((function(r){var t=titleWords(r);t.length&&e.titles.forEach((function(e){var r=titleWords(e),n=t.filter((function(e){return r.indexOf(e)>=0})).length;(n>o||n===o&&t.length<s)&&(o=n,s=t.length),n===t.length&&(u=!0)}))}));var l=u||o>=2&&o/Math.max(s,1)>=.75;return"series"===i&&e.secondaryTitle&&o>=1&&s<=2&&(l=!0),{hasTitle:l,yearConflict:Boolean(t&&e.year&&e.year!==t),typeConflict:Boolean(i&&e.type&&e.type!==i)}}function siteSlug(e){return normalizeTitle(e).replace(/\s+/g,"-")}function readFilmPage(e,r,t,n,i,a){return fetchText(e).then((function(o){var s=normalizeTitle(o),u=pageMatch(pageMetadata(o,e),r,t,i,a),l=/data-src=["'][^"']+["']/i.test(o)||/(?:trembed=|trhide=1&tid=)/i.test(o),c=/s\s*\d+\s+e\s*\d+/i.test(s);return u.typeConflict||t&&u.yearConflict?null:(!n||u.hasTitle&&!u.yearConflict)&&(l||u.hasTitle||c)?{url:e,html:o}:null})).catch((function(){return null}))}function filmPageSlugs(e){var r=siteSlug(e),t=r.replace(/-(?:filmul|film|movie|movies)$/i,""),n=[r,t,t+"-filmul",t+"-film",t+"-dublat-in-romana"];return"moana"===r&&n.unshift("vaiana-filmul"),"vaiana"===r&&n.unshift("vaiana-filmul"),n.filter((function(e,r){return n.indexOf(e)===r}))}function findDirectFilmPage(e,r,t,n){var i=[];[e].concat(n||[]).forEach((function(e){filmPageSlugs(e).forEach((function(e){i.indexOf(e)<0&&i.push(e)}))}));var a=Promise.resolve(null);return i.forEach((function(e){a=a.then((function(i){return i||readFilmPage(MAIN_URL+"/film/"+e+"/",r,t,!0,n,"movie")}))})),a}function episodePageSlugs(e,r,t){var n=siteSlug(e),i=parseInt(r,10)||1,a=parseInt(t,10)||1;return[n+"-s"+i+"-ep"+a,n+"-s"+(i<10?"0"+i:String(i))+"-e"+(a<10?"0"+a:String(a)),n+"-sezonul-"+i+"-episodul-"+a,n+"-sezon-"+i+"-episodul-"+a]}function findDirectEpisodePage(e,r,t,n){var i=episodePageSlugs(e,t,n),a=Promise.resolve(null);return i.forEach((function(e){a=a.then((function(t){return t||readFilmPage(MAIN_URL+"/epi/"+e+"/",r,null,!1)}))})),a}function seriesPageSlugs(e){var r=siteSlug(e);return[r,r+"-serial",r+"-sezonul-1"]}function seriesTitleVariants(e){var r=[e],t=String(e).replace(/the first/gi,"intai").replace(/royal magic/gi,"magia regala").replace(/magical friends/gi,"prieteni magici");return normalizeTitle(t)!==normalizeTitle(e)&&r.push(t),r}function seriesSearchQueries(e){var r=seriesTitleVariants(e),t=[];return r.forEach((function(e){titleWords(e).forEach((function(e){e.length<4||r.indexOf(e)>=0||t.indexOf(e)>=0||t.push(e)}))})),r.concat(t)}function episodePartMatches(e,r,t){var n=String(t);return e.some((function(t,i){return t===n&&i>0&&r.indexOf(e[i-1])>=0||r.some((function(e){return t===e+n}))}))}function readEpisodeFromSeriesPage(e,r,t,n,i){if(!e)return Promise.resolve(null);var a=cheerio.load(e.html),o=parseInt(t,10)||1,s=parseInt(n,10)||1,u=null;return a("a[href]").each((function(r,t){if(!u){var n=absoluteUrl(a(t).attr("href"),e.url),i=normalizeTitle((a(t).text()||"")+" "+(n||"")).split(" ");n&&/\/(?:epi|episode)\//i.test(n)&&episodePartMatches(i,["s","season","sezon","sezonul"],o)&&episodePartMatches(i,["e","ep","episode","episod","episodul"],s)&&(u=n)}})),u?readFilmPage(u,r,i,!1):Promise.resolve(null)}function findDirectSeriesEpisodePage(e,r,t,n,i){var a=seriesPageSlugs(e),o=[];a.forEach((function(e){o.push(MAIN_URL+"/serial/"+e+"/"),o.push(MAIN_URL+"/sez/"+e+"/"),o.push(MAIN_URL+"/sez/"+e+"-sezonul-1/")}));var s=Promise.resolve(null);return o.forEach((function(e){s=s.then((function(a){return a||readFilmPage(e,r,i,!1).then((function(e){return readEpisodeFromSeriesPage(e,r,t,n,i)}))}))})),s}function searchSeries(e,r,t,n){var i=normalizeTitle(e).split(" ").filter((function(e){return e.length>2}));if(!i.length)return Promise.resolve(null);var a=seriesTitleVariants(e),o=Promise.resolve(null);return a.forEach((function(e){o=o.then((function(i){if(i)return i;var a=normalizeTitle(e).split(" ").filter((function(e){return e.length>2}));return findDirectEpisodePage(e,a,r,t).then((function(i){return i||findDirectSeriesEpisodePage(e,a,r,t,n)}))}))})),o.then((function(o){if(o)return o;var s=seriesSearchQueries(e),u=Promise.resolve(null);return s.forEach((function(e){u=u.then((function(o){if(o)return o;var s=MAIN_URL+"/?s="+encodeURIComponent(e);return fetchText(s).then((function(o){var u=cheerio.load(o),l=[],c={};return u("a[href]").each((function(r,t){var n=absoluteUrl(u(t).attr("href"),s);if(n&&/\/(?:serial|epi|sez)\//i.test(n)&&!c[n]){c[n]=!0;var i=normalizeTitle(u(t).text()||u(t).attr("title")||n);l.push({href:n,score:titleScore(i+" "+n,titleWords(e))})}})),l.sort((function(e,r){return r.score-e.score})),function e(o){if(o>=l.length)return Promise.resolve(null);var s=l[o];return fetchText(s.href).then((function(u){var l={url:s.href,html:u},c=pageMatch(pageMetadata(u,s.href),i,n,a,"series"),d=/s\s*\d+\s*[- ]\s*e\s*\d+/i.test(normalizeTitle(u));return c.typeConflict||c.yearConflict||!c.hasTitle&&!d?e(o+1):/\/epi\//i.test(s.href)?readFilmPage(s.href,i,null,!1):readEpisodeFromSeriesPage(l,i,r,t,n)})).catch((function(){return e(o+1)}))}(0)})).catch((function(){return null}))}))})),u})).catch((function(){return null}))}function searchFilmIndex(e,r,t,n,i){var a=MAIN_URL+i+encodeURIComponent(e);return fetchText(a).then((function(e){var i=cheerio.load(e),o=[];return i("a[href]").each((function(e,r){var s=absoluteUrl(i(r).attr("href"),a);if(s&&new RegExp(SITE_KEY+"\\.com/film/","i").test(s)&&!/\/film\/$/i.test(s)){var u=normalizeTitle(i(r).text()||i(r).attr("title")||s),l=String(i(r).closest("article").text()||i(r).parent().text()||u).match(/\b(19|20)\d{2}\b/),c=0;if(t.forEach((function(e){c=Math.max(c,titleScore(u,titleWords(e)))})),!(c<Math.ceil(n.length/2))){var d={href:s,text:u,score:c,year:l?parseInt(l[0],10):null},f=o.find((function(e){return e.href===s}));f?(d.score>f.score||!f.year&&d.year)&&Object.assign(f,d):o.push(d)}}})),o.sort((function(e,t){var n=r&&e.year===r?2:e.year?0:1,i=r&&t.year===r?2:t.year?0:1;return n!==i?i-n:e.score!==t.score?t.score-e.score:e.text.length-t.text.length})),function e(i){return i>=o.length?Promise.resolve(null):readFilmPage(o[i].href,n,r,!0,t,"movie").then((function(r){return r||e(i+1)}))}(0)}))}function searchSite(e,r,t){var n=[e];t&&normalizeTitle(t)!==normalizeTitle(e)&&n.push(t);var i=titleWords(e);return!i.length&&t&&(i=titleWords(t)),i.length?findDirectFilmPage(e,i,r,n).then((function(t){return t||searchFilmIndex(e,r,n,i,"/?s=").then((function(t){return t||searchFilmIndex(e,r,n,i,"/feed/?s=")}))})).catch((function(){return null})):Promise.resolve(null)}function findServerUrls(e,r){for(var t,n=[],i={},a=/<a\b[^>]*data-src=["']([^"']+)["'][^>]*>/gi;null!==(t=a.exec(String(e)));){var o=absoluteUrl(decodeBase64(t[1]),r);o&&!i[o]&&(i[o]=!0,n.push(o))}return n}function findByseProviderUrl(e){var r=String(e).match(/<iframe\b[^>]*src=["']([^"']*\?trhide=1(?:&|&amp;)tid=[^"']+)["']/i);if(!r)return null;var t=cleanUrl(r[1]),n=t.match(/[?&]tid=([0-9a-f]+)(?:&|$)/i);if(n){var i=decodeHex(n[1].split("").reverse().join(""));if(/^https?:\/\//i.test(i))return Promise.resolve(i)}return fetchText(t).then((function(e){var r=String(e).match(/trde\s*\(\s*["']([0-9a-f]+)["']\s*\)/i);return r?decodeHex(r[1].split("").reverse().join("")):null})).catch((function(){return null}))}function resolveByseProvider(providerUrl, pageUrl) {
  var codeMatch = String(providerUrl).match(/\/e\/([^/?#]+)/i);
  if (!codeMatch) return Promise.reject(new Error("Byse video code missing"));

  var code = codeMatch[1];
  return fetchText(providerUrl, { headers: { Referer: pageUrl } }).then(function(providerHtml) {
    var iframeMatch = String(providerHtml).match(/<iframe\b[^>]*src=["'](https?:\/\/[^"']+)["']/i);
    var frameUrl = iframeMatch ? cleanUrl(iframeMatch[1]) : null;
    var apiOrigin = frameUrl
      ? frameUrl.match(/^https?:\/\/[^/]+/i)[0]
      : String(providerUrl).match(/^https?:\/\/[^/]+/i)[0];
    var parentHost = String(providerUrl).match(/^https?:\/\/([^/]+)/i);
    var headers = {};

    if (frameUrl && parentHost) {
      headers["X-Embed-Origin"] = parentHost[1].replace(/^www\./i, "").toLowerCase();
      headers["X-Embed-Referer"] = providerUrl;
      headers["X-Embed-Parent"] = frameUrl;
    }

    return createByseFingerprint(apiOrigin).catch(function() {
      return null;
    }).then(function(fingerprint) {
      var captchaUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/captcha";
      var captchaBody = fingerprint ? { fingerprint: fingerprint } : {};

      return apiJson(captchaUrl, {
        method: "POST",
        credentials: "include",
        headers: headers,
        body: JSON.stringify(captchaBody)
      }).then(function(challenge) {
        return solveBysePow(challenge.pow_nonce, challenge.pow_difficulty, 30000).then(function(solution) {
          if (solution === null) throw new Error("Byse proof of work timed out");
          var verifyBody = { pow_token: challenge.pow_token, solution: solution };
          if (fingerprint) verifyBody.fingerprint = fingerprint;

          return apiJson(captchaUrl + "/verify", {
            method: "POST",
            credentials: "include",
            headers: headers,
            body: JSON.stringify(verifyBody)
          });
        });
      }).then(function(verification) {
        if (!verification.token) throw new Error("Byse CAPTCHA token missing");

        var playbackOptions = {
          credentials: "include",
          headers: Object.assign({}, headers, { "X-Captcha-Token": verification.token })
        };
        var playbackUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/playback";

        if (fingerprint) {
          playbackOptions.method = "POST";
          playbackOptions.body = JSON.stringify({ fingerprint: fingerprint });
        } else {
          playbackOptions.method = "GET";
        }

        return apiJson(playbackUrl, playbackOptions);
      });
    });
  }).then(function(playbackResponse) {
    if (!playbackResponse.playback) throw new Error("Byse playback payload missing");
    return decryptBysePlayback(playbackResponse.playback);
  }).then(function(playback) {
    var sources = playback.sources || [];
    var streams = [];

    sources.forEach(function(source) {
      if (source && source.url && (
        String(source.mime_type || "").toLowerCase().indexOf("mpegurl") >= 0 ||
        /\.m3u8(?:\?|$)/i.test(source.url)
      )) {
        var stream = signedHlsStream(source.url, source.label || source.quality || "Bysewihe HLS");
        stream.audioLanguage = source.audio_language || source.audioLanguage || source.language || playback.default_audio || playback.defaultAudio;
        stream.resolution = source.resolution || source.quality;
        streams.push(stream);
      }
    });

    if (!streams.length) throw new Error("Byse returned no HLS source");
    return streams;
  });
}

function voeRot13(e){return String(e||"").replace(/[A-Za-z]/g,(function(e){var r=e.charCodeAt(0),t=r<=90?65:97;return String.fromCharCode((r-t+13)%26+t)}))}function voeDecrypt(e){for(var r=decodeBase64(voeRot13(e).replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g,"_").replace(/_/g,"")),t="",n=0;n<r.length;n+=1)t+=String.fromCharCode(r.charCodeAt(n)-3);return JSON.parse(decodeBase64(t.split("").reverse().join("")))}function voePayload(e){var r=String(e||"").match(/<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i);if(!r)throw new Error("Voe payload missing");var t=r[1].trim(),n=t.match(/\[\s*["']([\s\S]*?)["']\s*\]/);return voeDecrypt(n?n[1]:t)}function fetchVoePage(e,r,t){return t=t||0,fetch(e,{headers:Object.assign({},FETCH_HEADERS,{Referer:r||MAIN_URL})}).then((function(n){return n.text().then((function(i){if(!n.ok)throw new Error("HTTP "+n.status);var a=i.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);return a&&t<2?fetchVoePage(absoluteUrl(a[1],e),r,t+1):{html:i,url:n.url||e}}))}))}function resolveVoeProvider(e,r){return fetchVoePage(e,r).then((function(r){var t=findHlsUrls(r.html).map((function(r){var t=directHlsStream(r,"Voe HLS",e,e);return t.audioLanguage="ro",t}));if(t.length)return t;var n=voePayload(r.html),i=[],a=n&&n.source,o=n&&(n.direct_access_url||n.directAccessUrl);if(/^https?:\/\//i.test(String(a||""))){var s=directHlsStream(a,"Voe HLS",e,e);s.audioLanguage="ro",i.push(s)}if(/^https?:\/\//i.test(String(o||""))){var u=directVideoStream(o,"Voe MP4",e,e);u.audioLanguage="ro",i.push(u)}if(!i.length)throw new Error("Voe returned no media URL");return i}))}function resolveProvider(e,r,t){if(new RegExp("player\\."+SITE_KEY+"|netu","i").test(e))return Promise.resolve([]);if(/voe\./i.test(e))return resolveVoeProvider(e,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))}));if(/(?:dood(?:stream)?|playmogo)\./i.test(e))return resolveDoodProvider(e,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))})).catch((function(){return[]}));if(/vsembed\./i.test(e))return resolveVsembedProvider(e,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))})).catch((function(){return[]}));if(/videasy\.(?:net|to)\//i.test(e)){var n=videasySourceUrl(e);return n?resolveVsembedProvider(n,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))})).catch((function(){return[]})):Promise.resolve([])}return/byse(?:wihe)?\./i.test(e)?resolveByseProvider(e,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))})).catch((function(){return[]})):/player4me\./i.test(e)?Promise.resolve([]):/(?:4meplayer|embed4me|streamp2p|p2pplay|seekstream|embedseek)\./i.test(e)?resolvePlayer4meProvider(e,r).then((function(r){return r.map((function(r){return decorateStream(r,t,e)}))})).catch((function(){return[]})):fetchText(e,{headers:{Referer:r}}).then((function(n){var i=findHlsUrls(n);return i.length?i.map((function(n){return decorateStream(directHlsStream(n,"HLS",e,r),t,e)})):[]})).catch((function(){return[]}))}function resolveServerUrls(serverUrls, pageUrl, index, displayTitle) {
  var pending = (serverUrls || []).slice(parseInt(index, 10) || 0);
  if (!pending.length) return Promise.resolve([]);

  function priority(serverUrl) {
    var value = String(serverUrl || "").toLowerCase();
    if (/seekstream|embedseek/.test(value)) return 0;
    if (/streamp2p|p2pplay/.test(value)) return 1;
    if (/bysewihe|byse/.test(value)) return 2;
    if (/dsvplay/.test(value)) return 3;
    return 4;
  }

  var ordered = pending.map(function(url, position) {
    return { url: url, position: position, priority: priority(url) };
  });
  ordered.sort(function(left, right) {
    return left.priority - right.priority || left.position - right.position;
  });

  function resolveNext(position) {
    if (position >= ordered.length) return Promise.resolve([]);
    var serverUrl = ordered[position].url;
    return Promise.resolve().then(function() {
      return fetchText(serverUrl, { headers: { Referer: pageUrl } });
    }).then(function(embedHtml) {
      return Promise.resolve(findByseProviderUrl(embedHtml)).then(function(providerUrl) {
        if (providerUrl) return resolveProvider(providerUrl, serverUrl, displayTitle);
        return findHlsUrls(embedHtml).map(function(url) {
          return decorateStream(
            directHlsStream(url, "HLS", serverUrl, pageUrl),
            displayTitle,
            serverUrl
          );
        });
      });
    }).catch(function() {
      return [];
    }).then(function(streams) {
      var unique = uniqueStreams(streams || []);
      if (unique.length) return [unique[0]];
      return resolveNext(position + 1);
    });
  }

  return resolveNext(0);
}

function resolveFilmPageResult(e,r){if(!e||!e.html)return Promise.resolve([]);var t=findServerUrls(e.html,e.url);return t.length?resolveServerUrls(t,e.url,0,r).then(labelStreams):Promise.resolve([])}function normalizeCatalogId(e){var r=String(e||"").trim();try{r=decodeURIComponent(r)}catch(e){}var t=r.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);if(t)return t[1];var n=r.match(/(?:^|[^a-z])tt\d{7,}/i);if(n)return n[0].replace(/^[^t]+/i,"");var i=(r=(r=(r=(r=r.split(/[?#]/)[0]).replace(/^(?:movie|tv|series):/i,"")).replace(/^(?:tmdb|imdb):\/*/i,"")).replace(/^(?:movie|tv|series):/i,"")).match(/^\d+/);return i?i[0]:r}function tmdbUrl(e,r){var t=normalizeCatalogId(e),n="tv"===r||"series"===r,i=t.startsWith("tt"),a=i?"find/"+encodeURIComponent(t):(n?"tv/":"movie/")+encodeURIComponent(t),o="?api_key="+encodeURIComponent(TMDB_API_KEY)+"&language=ro-RO";return i&&(o+="&external_source=imdb_id"),"https://api.themoviedb.org/3/"+a+o}function getStreams(e,r,t,n){var i="tv"===r||"series"===r,a=normalizeCatalogId(e);return"undefined"!=typeof console&&console.log&&console.log("[Romanian Streams "+PLUGIN_VERSION+"] lookup",String(e||""),"=>",a,String(r||"")),fetchJson(tmdbUrl(a,r)).then((function(e){var r,o,s;if(a.startsWith("tt")){var u=i?e.tv_results:e.movie_results,l=u&&u[0];r=l&&(i?l.name:l.title),o=l&&(i?l.original_name:l.original_title),s=l&&parseInt(String(i?l.first_air_date:l.release_date).slice(0,4),10)}else r=i?e.name:e.title,o=i?e.original_name:e.original_title,s=parseInt(String(i?e.first_air_date:e.release_date).slice(0,4),10);var c=i?searchSeries:searchSite,d=o||r;return(i?c(r||o,t,n,s):c(r||o,s,o)).then((function(e){return!e&&o&&o!==r?i?searchSeries(o,t,n,s):searchSite(o,s,r):e})).then((function(e){return resolveFilmPageResult(e,d)}))})).catch((function(t){return"undefined"!=typeof console&&console.error&&console.error("[Romanian Streams] stream lookup failed",String(e||""),String(r||""),String(t&&t.message||t||"unknown error")),[]}))}"undefined"!=typeof module&&module.exports?module.exports={getStreams:getStreams}:global.getStreams=getStreams;function findUnescapedMixdrop(t,m,s){var i=t.indexOf(m,s);while(i>=0){var n=0,r=i-1;while(r>=0&&t.charAt(r)==="\\"){n+=1;r-=1}if(n%2===0)return i;i=t.indexOf(m,i+1)}return-1}function decodeJsStringMixdrop(t){return String(t||"").replace(/\\x([0-9a-fA-F]{2})/g,function(_,h){return String.fromCharCode(parseInt(h,16))}).replace(/\\u([0-9a-fA-F]{4})/g,function(_,h){return String.fromCharCode(parseInt(h,16))}).replace(/\\r/g,"\r").replace(/\\n/g,"\n").replace(/\\t/g,"\t").replace(/\\([\\'"])/g,"$1")}function unpackMixdropScript(t){var s=t.indexOf("}('")+3;if(s<3)return null;var m=findUnescapedMixdrop(t,"',",s);if(m<0)return null;var p=decodeJsStringMixdrop(t.slice(s,m)),a=t.slice(m+2),c=a.indexOf(","),d=a.indexOf(",",c+1);if(c<0||d<0)return null;var r=parseInt(a.slice(0,c),10),n=parseInt(a.slice(c+1,d),10);if(!r||!n)return null;var w=findUnescapedMixdrop(a,",'",d)+2,e=a.lastIndexOf("'.split");if(w<2||e<w)return null;var l=decodeJsStringMixdrop(a.slice(w,e)).split("|");for(var i=n-1;i>=0;i-=1)l[i]&&(p=p.replace(new RegExp("\\b"+i.toString(r)+"\\b","g"),l[i]));return p}function findMixdropMedia(t,p){var d=[],r=/<script\b[^>]*>([\s\S]*?)<\/script>/gi,m;while((m=r.exec(String(t)))!==null){var s=m[1]||"";if(s.indexOf("eval(function(p,a,c,k,e,d)")>=0){var u=unpackMixdropScript(s);u&&d.push(u)}}var x=String(t)+"\n"+d.join("\n"),q=x.match(/(?:MDCore\.)?wurl\s*=\s*["']([^"']+)["']/i);return q?absoluteUrl(q[1],p):null}function resolveMixdropProvider(t,p){return fetchText(t,{headers:{Referer:p}}).then(function(h){var u=findMixdropMedia(h,t);if(!u||!/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(u))throw new Error("MixDrop media URL missing");var s=/\.m3u8(?:[?#]|$)/i.test(u)?directHlsStream(u,"MixDrop HLS",t,t):directVideoStream(u,"MixDrop MP4",t,t);return s.audioLanguage="ro",[s]})}var originalResolveProviderForMixdrop=resolveProvider;resolveProvider=function(t,p,d){return/mixdrop\./i.test(t)?resolveMixdropProvider(t,p).then(function(s){return s.map(function(x){return decorateStream(x,d,t)})}).catch(function(){return[]}):originalResolveProviderForMixdrop(t,p,d)};var originalResolveByseForRomanianLabel=resolveByseProvider;resolveByseProvider=function(t,p){return originalResolveByseForRomanianLabel(t,p).then(function(s){return s.map(function(x){if(!x.audioLanguage&&/(?:^|[/_,])(?:ro|ron|rum)(?:[/_,]|$)/i.test(x.url))x.audioLanguage="ro";return x})})};var originalResolveByseWithHeaders=resolveByseProvider;resolveByseProvider=function(t,p){return originalResolveByseWithHeaders(t,p).then(function(s){var u=String(t).match(/^https?:\/\/[^/]+/i),h={Referer:String(t).split("#")[0],Origin:u?u[0]:MAIN_URL,"User-Agent":FETCH_HEADERS["User-Agent"]};return s.map(function(x){x.headers=h;x.behaviorHints=Object.assign({},x.behaviorHints||{},{proxyHeaders:{request:h}});return x})})};function qjsBytesHex(bytes) { var out = ""; for (var i = 0; i < bytes.length; i += 1) out += ("0" + bytes[i].toString(16)).slice(-2); return out; } function qjsHexBytes(hex) { var bytes = new Uint8Array(Math.floor(hex.length / 2)); for (var i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return bytes; } function qjsWord(bytes) { return CryptoJS.enc.Hex.parse(qjsBytesHex(bytes)); } function qjsWordBytes(word) { return qjsHexBytes(word.toString(CryptoJS.enc.Hex)); } function qjsConcat(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; } function qjsB64(bytes) { var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; var out = ""; for (var i = 0; i < bytes.length; i += 3) { var n = bytes[i] << 16; if (i + 1 < bytes.length) n |= bytes[i + 1] << 8; if (i + 2 < bytes.length) n |= bytes[i + 2]; out += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63]; out += i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "="; out += i + 2 < bytes.length ? alphabet[n & 63] : "="; } return out.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_"); } function qjsBig(bytes) { return BigInt("0x" + (qjsBytesHex(bytes) || "0")); } function qjsFixed(value, length) { var hex = value.toString(16); while (hex.length < length * 2) hex = "0" + hex; return qjsHexBytes(hex.slice(-length * 2)); } var QJS_P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"); var QJS_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"); var QJS_A = QJS_P - BigInt(3); var QJS_G = { x: BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"), y: BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5") }; function qjsMod(value, modulus) { var result = value % modulus; return result < 0 ? result + modulus : result; } function qjsInv(value, modulus) { var a = qjsMod(value, modulus), b = modulus, x = BigInt(1), y = BigInt(0); while (a) { var q = b / a; var next = b - q * a; b = a; a = next; next = y - q * x; y = x; x = next; } return qjsMod(y, modulus); } function qjsPointDouble(point) { if (!point || point.y === BigInt(0)) return null; var slope = qjsMod((BigInt(3) * point.x * point.x + QJS_A) * qjsInv(BigInt(2) * point.y, QJS_P), QJS_P); var x = qjsMod(slope * slope - BigInt(2) * point.x, QJS_P); return { x: x, y: qjsMod(slope * (point.x - x) - point.y, QJS_P) }; } function qjsPointAdd(left, right) { if (!left) return right; if (!right) return left; if (left.x === right.x) { if (qjsMod(left.y + right.y, QJS_P) === BigInt(0)) return null; return qjsPointDouble(left); } var slope = qjsMod((right.y - left.y) * qjsInv(right.x - left.x, QJS_P), QJS_P); var x = qjsMod(slope * slope - left.x - right.x, QJS_P); return { x: x, y: qjsMod(slope * (left.x - x) - left.y, QJS_P) }; } function qjsPointMul(point, scalar) { var result = null; var current = point; var value = scalar; while (value > BigInt(0)) { if (value & BigInt(1)) result = qjsPointAdd(result, current); current = qjsPointDouble(current); value >>= BigInt(1); } return result; } function qjsRandomScalar() { var bytes = new Uint8Array(32); for (var i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256); return qjsBig(bytes) % (QJS_N - BigInt(1)) + BigInt(1); } function qjsFingerprint(nonce) { if (typeof BigInt !== "function" || !CryptoJS || !CryptoJS.SHA256) return null; var digest = qjsHexBytes(CryptoJS.SHA256(String(nonce)).toString(CryptoJS.enc.Hex)); var privateKey = qjsRandomScalar(); var publicKey = qjsPointMul(QJS_G, privateKey); var hash = qjsBig(digest); var r; var s; do { var k = qjsRandomScalar(); r = qjsMod(qjsPointMul(QJS_G, k).x, QJS_N); s = qjsMod(qjsInv(k, QJS_N) * (hash + r * privateKey), QJS_N); } while (r === BigInt(0) || s === BigInt(0)); return { signature: qjsB64(qjsConcat(qjsFixed(r, 32), qjsFixed(s, 32))), public_key: { crv: "P-256", ext: true, key_ops: ["verify"], kty: "EC", x: qjsB64(qjsFixed(publicKey.x, 32)), y: qjsB64(qjsFixed(publicKey.y, 32)) } }; } function createByseQuickJsFingerprint(apiOrigin) { if (typeof BigInt !== "function" || !CryptoJS || !CryptoJS.AES) return Promise.resolve(null); return apiJson(apiOrigin + "/api/videos/access/challenge", { method: "POST", credentials: "include", headers: { Referer: apiOrigin, Origin: apiOrigin }, body: "{}" }).then(function(challenge) { var signed = qjsFingerprint(challenge.nonce); if (!signed) return null; var viewerId = randomId(); var deviceId = randomId(); return apiJson(apiOrigin + "/api/videos/access/attest", { method: "POST", credentials: "include", headers: { Referer: apiOrigin, Origin: apiOrigin }, body: JSON.stringify({ viewer_id: viewerId, device_id: deviceId, challenge_id: challenge.challenge_id, nonce: challenge.nonce, signature: signed.signature, public_key: signed.public_key, client: { user_agent: FETCH_HEADERS["User-Agent"], languages: ["ro-RO", "en-US"], timezone: "UTC", extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] } }, storage: {}, attributes: { entropy: "low" } }) }).then(function(attestation) { if (!attestation.token) throw new Error("Byse fingerprint rejected"); return { token: attestation.token, viewer_id: attestation.viewer_id || viewerId, device_id: attestation.device_id || deviceId, confidence: attestation.confidence || 0 }; }); }); } function qjsAesBlock(key, block) { return qjsWordBytes(CryptoJS.AES.encrypt(qjsWord(block), key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding }).ciphertext); } function qjsGfMul(left, right) { var result = BigInt(0); var value = right; var reduction = BigInt("0xe1000000000000000000000000000000"); for (var i = 0; i < 128; i += 1) { if (left & (BigInt(1) << BigInt(127 - i))) result ^= value; value = value & BigInt(1) ? (value >> BigInt(1)) ^ reduction : value >> BigInt(1); } return result; } function qjsGhash(hashSubkey, bytes) { var state = BigInt(0); for (var offset = 0; offset < bytes.length; offset += 16) { var block = new Uint8Array(16); block.set(bytes.slice(offset, Math.min(offset + 16, bytes.length))); state = qjsGfMul(state ^ qjsBig(block), hashSubkey); } return state; } function qjsInc32(block) { var result = new Uint8Array(block); for (var i = 15; i >= 12; i -= 1) { result[i] = (result[i] + 1) & 255; if (result[i]) break; } return result; } function qjsGcmDecrypt(keyBytes, iv, payload) { var key = qjsWord(keyBytes); var zero = new Uint8Array(16); var hashSubkey = qjsBig(qjsAesBlock(key, zero)); var j0; if (iv.length === 12) { j0 = qjsConcat(iv, new Uint8Array([0, 0, 0, 1])); } else { var ivPad = new Uint8Array(Math.ceil(iv.length / 16) * 16 + 16); ivPad.set(iv); var view = new DataView(ivPad.buffer); view.setBigUint64(ivPad.length - 8, BigInt(iv.length * 8)); j0 = qjsHexBytes(qjsGhash(hashSubkey, ivPad).toString(16).padStart(32, "0")); } var ciphertext = payload.slice(0, payload.length - 16); var tag = payload.slice(payload.length - 16); var auth = new Uint8Array(Math.ceil(ciphertext.length / 16) * 16 + 16); auth.set(ciphertext); new DataView(auth.buffer).setBigUint64(auth.length - 8, BigInt(ciphertext.length * 8)); var expected = qjsGfMul ? qjsGhash(hashSubkey, auth) ^ qjsBig(qjsAesBlock(key, j0)) : BigInt(0); var expectedBytes = qjsFixed(expected, 16); for (var i = 0; i < 16; i += 1) if (expectedBytes[i] !== tag[i]) throw new Error("Byse AES-GCM authentication failed"); var plaintext = new Uint8Array(ciphertext.length); var counter = j0; for (var offset = 0; offset < ciphertext.length; offset += 16) { counter = qjsInc32(counter); var stream = qjsAesBlock(key, counter); for (var j = 0; j < 16 && offset + j < ciphertext.length; j += 1) plaintext[offset + j] = ciphertext[offset + j] ^ stream[j]; } return plaintext; } function decryptByseQuickJsPlayback(playback) { var version = parseInt(playback.version, 10); var first = version; var second = 31 - version; var parts = playback.key_parts || []; if (!(version && parts[first - 1] && parts[second - 1])) return Promise.reject(new Error("Unsupported Byse key version")); try { var key = qjsConcat(binaryBytes(decodeBase64(parts[first - 1])), binaryBytes(decodeBase64(parts[second - 1]))); var plain = qjsGcmDecrypt(key, binaryBytes(decodeBase64(playback.iv)), binaryBytes(decodeBase64(playback.payload))); var text = typeof TextDecoder === "function" ? new TextDecoder().decode(plain) : String.fromCharCode.apply(null, plain); return Promise.resolve(JSON.parse(text)); } catch (error) { return Promise.reject(error); } } var originalCreateByseFingerprintForQuickJs=createByseFingerprint; createByseFingerprint=function(apiOrigin){var webCrypto=byseCrypto();if(webCrypto&&webCrypto.subtle&&webCrypto.subtle.generateKey)return originalCreateByseFingerprintForQuickJs(apiOrigin);return createByseQuickJsFingerprint(apiOrigin).catch(function(){return createByseNodeFingerprint(apiOrigin)})}; var originalDecryptBysePlaybackForQuickJs=decryptBysePlayback; decryptBysePlayback=function(playback){var webCrypto=byseCrypto();return webCrypto&&webCrypto.subtle?originalDecryptBysePlaybackForQuickJs(playback):decryptByseQuickJsPlayback(playback)}; function keylessTmdbMetadata(url){ var match=String(url).match(/\/3\/(movie|tv)\/(\d+)(?:[?]|$)/i); if(!match)return Promise.reject(new Error("Unsupported keyless TMDB URL")); var kind=match[1].toLowerCase(),id=match[2]; var readerUrl="https://r.jina.ai/http://www.themoviedb.org/"+kind+"/"+id; return fetchText(readerUrl).then(function(markdown){ var titleMatch=String(markdown).match(/^Title:\s*(.+?)\s*$/im); if(!titleMatch)throw new Error("TMDB reader title missing"); var title=String(titleMatch[1]).replace(/&amp;/g,"&").trim(); return kind==="tv"?{name:title,original_name:title}:{title:title,original_title:title}; }); } var originalFetchJsonForKeylessTmdb=fetchJson; fetchJson=function(url,options){ var apiUrl=String(url); if(/\/3\/(?:movie|tv)\/\d+(?:[?]|$)/i.test(apiUrl)){ return originalFetchJsonForKeylessTmdb(url,options).catch(function(error){if(error&&error.message==="Request timed out")throw error;return keylessTmdbMetadata(url)}); } return originalFetchJsonForKeylessTmdb(url,options); };



(function() {
  PLUGIN_VERSION = "2.0.5";

  function providerKind(url) {
    var host = urlHost(url).toLowerCase();
    if (/(?:^|\.)byse(?:wihe)?\./i.test(host)) return "byse";
    if (/(?:^|\.)player4me(?:\.|$)/i.test(host)) return "player4me";
    if (/(?:^|\.)(?:streamp2p|p2pplay)(?:\.|$)/i.test(host)) return "streamp2p";
    if (/(?:^|\.)(?:seekstream(?:ing)?|seeksreaming|embedseek)(?:\.|$)/i.test(host)) return "seekstreaming";
    return "";
  }

  function providerPriority(url) {
    var kind = providerKind(url);
    if (kind === "streamp2p") return 0;
    if (kind === "byse") return 1;
    if (kind === "player4me") return 2;
    if (kind === "seekstreaming") return 3;
    return 10;
  }

  function findApprovedProviderUrls(html, baseUrl) {
    var urls = [];
    var seen = {};

    function add(value) {
      var candidate = cleanUrl(value);
      if (!candidate) return;
      var url = absoluteUrl(candidate, baseUrl);
      if (!providerKind(url)) {
        try {
          var decoded = decodeURIComponent(candidate);
          if (decoded !== candidate) url = absoluteUrl(decoded, baseUrl);
        } catch (error) {}
      }
      if (!providerKind(url)) {
        try {
          url = absoluteUrl(cleanUrl(decodeBase64(candidate)), baseUrl);
        } catch (error) {}
      }
      if (!providerKind(url) || seen[url]) return;
      seen[url] = true;
      urls.push(url);
    }

    var source = String(html || "");
    var attributePattern = /\b(?:src|data-src|data-url|href)\s*=\s*(["'])([\s\S]*?)\1/gi;
    var match;
    while ((match = attributePattern.exec(source)) !== null) add(match[2]);
    var urlPattern = /https?:\/\/[^\s"'<>\\]+/gi;
    while ((match = urlPattern.exec(source)) !== null) add(match[0]);

    urls.sort(function(left, right) {
      return providerPriority(left) - providerPriority(right);
    });
    return urls;
  }

  resolveProvider = function(providerUrl, pageUrl, displayTitle) {
    var kind = providerKind(providerUrl);
    if (!kind) return Promise.resolve([]);
    return Promise.resolve().then(function() {
      return kind === "byse"
        ? resolveByseProvider(providerUrl, pageUrl)
        : resolvePlayer4meProvider(providerUrl, pageUrl);
    }).then(function(streams) {
      return (streams || []).map(function(stream) {
        return decorateStream(stream, displayTitle, providerUrl);
      });
    }).catch(function(error) {
      if (typeof console !== "undefined" && console.warn) {
        console.warn("[Romanian Streams] " + kind + " failed", String(error && error.message || error));
      }
      return [];
    });
  };

  resolveServerUrls = function(serverUrls, pageUrl, index, displayTitle) {
    var start = parseInt(index, 10) || 0;
    var pending = (serverUrls || []).slice(start).map(function(url, position) {
      return { url: url, position: position, priority: providerPriority(url) };
    });
    pending.sort(function(left, right) {
      return left.priority - right.priority || left.position - right.position;
    });

    function resolveCandidates(urls, serverUrl, position) {
      if (position >= urls.length) return Promise.resolve([]);
      return resolveProvider(urls[position], serverUrl, displayTitle).then(function(streams) {
        var unique = uniqueStreams(streams || []);
        return unique.length ? [unique[0]] : resolveCandidates(urls, serverUrl, position + 1);
      });
    }

    function resolveServer(position) {
      if (position >= pending.length) return Promise.resolve([]);
      var serverUrl = pending[position].url;
      var directKind = providerKind(serverUrl);
      var result = directKind
        ? resolveCandidates([serverUrl], pageUrl, 0)
        : fetchText(serverUrl, { headers: { Referer: pageUrl } }).then(function(html) {
            return Promise.resolve().then(function() {
              return findByseProviderUrl(html);
            }).then(function(byseUrl) {
              var providers = findApprovedProviderUrls(html, serverUrl);
              if (byseUrl && providerKind(byseUrl) && providers.indexOf(byseUrl) < 0) {
                providers.push(byseUrl);
                providers.sort(function(left, right) {
                  return providerPriority(left) - providerPriority(right);
                });
              }
              return resolveCandidates(providers, serverUrl, 0);
            });
          });

      return Promise.resolve(result).catch(function() {
        return [];
      }).then(function(streams) {
        var unique = uniqueStreams(streams || []);
        return unique.length ? [unique[0]] : resolveServer(position + 1);
      });
    }

    return resolveServer(0);
  };

  resolveFilmPageResult = function(result, displayTitle) {
    if (!result || !result.html) return Promise.resolve([]);
    var servers = findServerUrls(result.html, result.url);
    return servers.length
      ? resolveServerUrls(servers, result.url, 0, displayTitle)
      : Promise.resolve([]);
  };
})();


(function() {
  var resolveAllProviders = resolveProvider;
  resolveProvider = function(providerUrl, pageUrl, displayTitle) {
    var host = urlHost(providerUrl).toLowerCase();
    if (!/(?:^|\.)byse(?:wihe)?\./i.test(host)) return Promise.resolve([]);
    return resolveAllProviders(providerUrl, pageUrl, displayTitle);
  };
})();


(function() {
  function resolveAtPlayerOrigin(providerUrl, frameUrl, code, useEmbedHeaders) {
    var apiOriginMatch = String(frameUrl || "").match(/^https?:\/\/[^/]+/i);
    if (!apiOriginMatch) return Promise.reject(new Error("Byse player origin missing"));
    var apiOrigin = apiOriginMatch[0];
    var providerHost = String(providerUrl || "").match(/^https?:\/\/([^/]+)/i);
    var headers = {};

    if (useEmbedHeaders && providerHost) {
      headers["X-Embed-Parent"] = providerUrl;
      headers.Referer = frameUrl;
    } else if (frameUrl) {
      headers.Referer = frameUrl;
    }

    return createByseFingerprint(apiOrigin).then(function(fingerprint) {
      if (!fingerprint || !fingerprint.token) throw new Error("Byse fingerprint missing");
      var captchaUrl = apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/captcha";
      var captchaBody = fingerprint ? { fingerprint: fingerprint } : {};

      return apiJson(captchaUrl, {
        method: "POST",
        credentials: "include",
        headers: headers,
        body: JSON.stringify(captchaBody)
      }).then(function(challenge) {
        return solveBysePow(challenge.pow_nonce, challenge.pow_difficulty, 30000).then(function(solution) {
          if (solution === null) throw new Error("Byse proof of work timed out");
          var verifyBody = { pow_token: challenge.pow_token, solution: solution };
          if (fingerprint) verifyBody.fingerprint = fingerprint;
          return apiJson(captchaUrl + "/verify", {
            method: "POST",
            credentials: "include",
            headers: headers,
            body: JSON.stringify(verifyBody)
          });
        });
      }).then(function(verification) {
        if (!verification.token) throw new Error("Byse CAPTCHA token missing");
        var playbackOptions = {
          method: "POST",
          credentials: "include",
          headers: Object.assign({}, headers, { "X-Captcha-Token": verification.token })
        };
        if (fingerprint) playbackOptions.body = JSON.stringify({ fingerprint: fingerprint });
        return apiJson(apiOrigin + "/api/videos/" + encodeURIComponent(code) + "/embed/playback", playbackOptions);
      });
    }).then(function(response) {
      if (!response.playback) throw new Error("Byse playback payload missing");
      return decryptBysePlayback(response.playback);
    }).then(function(playback) {
      var streams = [];
      (playback.sources || []).forEach(function(source) {
        if (!source || !source.url || (
          String(source.mime_type || "").toLowerCase().indexOf("mpegurl") < 0 &&
          !/\.m3u8(?:\?|$)/i.test(source.url)
        )) return;
        var stream = signedHlsStream(source.url, source.label || source.quality || "Byse HLS");
        stream.audioLanguage = source.audio_language || source.audioLanguage || source.language || playback.default_audio || playback.defaultAudio;
        stream.resolution = source.resolution || source.quality;
        streams.push(stream);
      });
      if (!streams.length) throw new Error("Byse returned no HLS source");
      return streams;
    });
  }

  resolveByseProvider = function(providerUrl, pageUrl) {
    var codeMatch = String(providerUrl || "").match(/\/e\/([^/?#]+)/i);
    var originMatch = String(providerUrl || "").match(/^https?:\/\/[^/]+/i);
    if (!codeMatch || !originMatch) return Promise.reject(new Error("Byse video URL invalid"));
    var code = codeMatch[1];
    var detailsUrl = originMatch[0] + "/api/videos/" + encodeURIComponent(code) + "/embed/details";

    return apiJson(detailsUrl, {
      method: "GET",
      credentials: "include",
      headers: { Referer: pageUrl || providerUrl }
    }).then(function(details) {
      var frameUrl = String(details && details.embed_frame_url || "");
      if (!/^https?:\/\//i.test(frameUrl)) throw new Error("Byse embed frame missing from details");
      return resolveAtPlayerOrigin(providerUrl, frameUrl, code, true);
    });
  };
})();


(function() {
  PLUGIN_VERSION = "2.0.5";
  var resolveByseNumbered = resolveProvider;
  resolveProvider = function(providerUrl, pageUrl, displayTitle) {
    return resolveByseNumbered(providerUrl, pageUrl, displayTitle).then(function(streams) {
      return (streams || []).map(function(stream) {
        var nameParts = String(stream.name || "").split("\n");
        nameParts[0] = "✦ Byse";
        stream.name = nameParts.join("\n");
        return stream;
      });
    });
  };
})();


(function() {
  function byseCompatRawBytes(value) {
    var text = String(value || "");
    var bytes = new Uint8Array(text.length);
    for (var index = 0; index < text.length; index += 1) {
      bytes[index] = text.charCodeAt(index) & 255;
    }
    return bytes;
  }

  function byseCompatKeyBytes(playback) {
    var version = parseInt(playback.version, 10);
    var first = version;
    var second = 31 - version;
    var parts = playback.key_parts || [];
    if (!first || !second || !parts[first - 1] || !parts[second - 1]) {
      throw new Error("Unsupported Byse key version");
    }
    var left = byseCompatRawBytes(decodeBase64(parts[first - 1]));
    var right = byseCompatRawBytes(decodeBase64(parts[second - 1]));
    var key = new Uint8Array(left.length + right.length);
    key.set(left, 0);
    key.set(right, left.length);
    return key;
  }

  function byseCompatHex(bytes) {
    var text = "";
    for (var index = 0; index < bytes.length; index += 1) {
      text += ("0" + bytes[index].toString(16)).slice(-2);
    }
    return text;
  }

  function byseCompatEncryptBlock(encryptor, bytes) {
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

  function byseCompatGhashMultiply(value, hashSubkey) {
    var product = new Uint8Array(16);
    var factor = new Uint8Array(hashSubkey);
    for (var bit = 0; bit < 128; bit += 1) {
      if ((value[bit >> 3] & (1 << (7 - (bit & 7)))) !== 0) {
        for (var byteIndex = 0; byteIndex < 16; byteIndex += 1) product[byteIndex] ^= factor[byteIndex];
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

  function byseCompatGhashBlock(state, block, hashSubkey) {
    var value = new Uint8Array(16);
    for (var index = 0; index < 16; index += 1) value[index] = state[index] ^ block[index];
    return byseCompatGhashMultiply(value, hashSubkey);
  }

  function byseCompatDecryptCryptoJs(playback, keyBytes) {
    if (!CryptoJS || !CryptoJS.algo || !CryptoJS.algo.AES) {
      throw new Error("AES-GCM unavailable in QuickJS");
    }
    var iv = byseCompatRawBytes(decodeBase64(playback.iv));
    var payload = byseCompatRawBytes(decodeBase64(playback.payload));
    if (iv.length !== 12 || payload.length < 16) throw new Error("Unsupported Byse AES-GCM payload");

    var encryptor = CryptoJS.algo.AES.createEncryptor(CryptoJS.enc.Hex.parse(byseCompatHex(keyBytes)));
    var hashSubkey = byseCompatEncryptBlock(encryptor, new Uint8Array(16));
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
      hash = byseCompatGhashBlock(hash, block, hashSubkey);
    }

    var lengthBlock = new Uint8Array(16);
    var bitLength = ciphertext.length * 8;
    for (var lengthIndex = 15; lengthIndex >= 8; lengthIndex -= 1) {
      lengthBlock[lengthIndex] = bitLength & 255;
      bitLength = Math.floor(bitLength / 256);
    }
    hash = byseCompatGhashBlock(hash, lengthBlock, hashSubkey);
    var expectedTag = byseCompatEncryptBlock(encryptor, j0);
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
      var stream = byseCompatEncryptBlock(encryptor, counter);
      var count = Math.min(16, ciphertext.length - counterOffset);
      for (var streamIndex = 0; streamIndex < count; streamIndex += 1) {
        plaintext[counterOffset + streamIndex] = ciphertext[counterOffset + streamIndex] ^ stream[streamIndex];
      }
    }

    var text;
    if (typeof TextDecoder === "function") {
      text = new TextDecoder().decode(plaintext);
    } else {
      var words = [];
      for (var wordIndex = 0; wordIndex < plaintext.length; wordIndex += 1) {
        words[wordIndex >> 2] |= plaintext[wordIndex] << (24 - (wordIndex & 3) * 8);
      }
      text = CryptoJS.enc.Utf8.stringify(CryptoJS.lib.WordArray.create(words, plaintext.length));
    }
    return JSON.parse(text);
  }

  function byseCompatDecryptFallback(playback, keyBytes) {
    if (CryptoJS && CryptoJS.algo && CryptoJS.algo.AES) {
      return Promise.resolve().then(function() {
        return byseCompatDecryptCryptoJs(playback, keyBytes);
      });
    }
    try {
      var nodeCrypto = require("crypto");
      if (nodeCrypto.createDecipheriv && typeof Buffer !== "undefined") {
        var payload = byseCompatRawBytes(decodeBase64(playback.payload));
        var iv = byseCompatRawBytes(decodeBase64(playback.iv));
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

  fetchText = function(url, options) {
    options = options || {};
    var request = {
      method: options.method || "GET",
      headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
    };
    if (options.body !== undefined) request.body = options.body;
    if (options.credentials) request.credentials = options.credentials;
    return fetchWithTimeout(url, request, options.timeoutMs).then(function(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.text();
    });
  };

  fetchJson = function(url, options) {
    options = options || {};
    var request = {
      method: options.method || "GET",
      headers: Object.assign({}, FETCH_HEADERS, options.headers || {})
    };
    if (options.body !== undefined) request.body = options.body;
    if (options.credentials) request.credentials = options.credentials;
    return fetchWithTimeout(url, request, options.timeoutMs).then(function(response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    });
  };

  decryptBysePlayback = function(playback) {
    var webCrypto = byseCrypto();
    var keyBytes;
    try {
      keyBytes = byseCompatKeyBytes(playback);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!webCrypto || !webCrypto.subtle) return byseCompatDecryptFallback(playback, keyBytes);

    var iv = byseCompatRawBytes(decodeBase64(playback.iv));
    var payload = byseCompatRawBytes(decodeBase64(playback.payload));
    return webCrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"])
      .then(function(key) {
        return webCrypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, payload);
      }).then(function(bytes) {
        var text = typeof TextDecoder === "function"
          ? new TextDecoder().decode(bytes)
          : String.fromCharCode.apply(null, new Uint8Array(bytes));
        return JSON.parse(text);
      }).catch(function() {
        return byseCompatDecryptFallback(playback, keyBytes);
      });
  };
})();
