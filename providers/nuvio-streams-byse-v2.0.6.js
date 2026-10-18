var cheerio=require("cheerio-without-node-native"),CryptoJS=null;try{CryptoJS=require("crypto-js")}catch(e){CryptoJS=null}var PROVIDER_NAME="Romanian Streams",PLUGIN_VERSION="2.0.6",MAIN_URL=decodeURIComponent("https%3A%2F%2F%64%65%73%65%6e%65%66%61%69%6e%65%2e%63%6f%6d"),SITE_KEY=decodeURIComponent("%64%65%73%65%6e%65%66%61%69%6e%65"),TMDB_API_KEY="439c478a771f35c05022f9feabcca01c",FETCH_HEADERS={"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"},M3U8_RE=/(?:https?:)?\/\/[^\s"'<>\\]+?(?:\.m3u8|\/master\.txt)(?:\?[^\s"'<>\\]*)?/gi;function fetchWithTimeout(url,options,timeoutMs){var target=String(url||"");if(!/^https?:\/\//i.test(target))return Promise.reject(new Error("Unsupported request URL"));var request=Object.assign({},options||{});if(typeof setTimeout!=="function"||typeof Promise.race!=="function")return fetch(target,request);var timer=null,timeout=parseInt(timeoutMs,10)||15000,timeoutPromise=new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error("Request timed out"));},timeout);}),clear=function(){if(timer!==null)clearTimeout(timer);timer=null;},result;try{result=fetch(target,request);}catch(error){clear();return Promise.reject(error);}return Promise.race([result,timeoutPromise]).then(function(response){clear();return response;},function(error){clear();throw error;});}function fetchText(e,r){var t={method:(r=r||{}).method||"GET",headers:Object.assign({},FETCH_HEADERS,r.headers||{})};return void 0!==r.body&&(t.body=r.body),fetchWithTimeout(e,t,r.timeoutMs).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.text()}))}function fetchJson(e,r){var t={method:(r=r||{}).method||"GET",headers:Object.assign({},FETCH_HEADERS,r.headers||{})};return void 0!==r.body&&(t.body=r.body),fetchWithTimeout(e,t,r.timeoutMs).then((function(e){if(!e.ok)throw new Error("HTTP "+e.status);return e.json()}))}function normalizeTitle(e){return String(e||"").toLowerCase().replace(/ă/g,"a").replace(/â/g,"a").replace(/î/g,"i").replace(/ș/g,"s").replace(/ț/g,"t").replace(/[^a-z0-9]+/g," ").trim()}function cleanUrl(e){return String(e||"").replace(/\\\//g,"/").replace(/\\u002F/g,"/").replace(/\\u0026/g,"&").replace(/&amp;/g,"&").replace(/[),;]+$/,"").trim()}function absoluteUrl(e,r){var t=cleanUrl(e);if(!t)return null;if(/^https?:\/\//i.test(t))return t;if(0===t.indexOf("//"))return"https:"+t;var n=String(r).match(/^(https?:\/\/[^/]+)/i);return n?"/"===t.charAt(0)?n[1]+t:String(r).split("?")[0].replace(/\/[^/]*$/,"/")+t:null}function decodeBase64(e){var r=String(e||"").replace(/-/g,"+").replace(/_/g,"/");if(r+="===".slice((r.length+3)%4),"function"==typeof atob)return atob(r);for(var t="",n=0,i=0,a=0;a<r.length;a+=1){var o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".indexOf(r.charAt(a));o<0||(n=n<<6|o,(i+=6)>=8&&(i-=8,t+=String.fromCharCode(n>>i&255)))}return t}function decodeHex(e){for(var r="",t=0;t+1<e.length;t+=2)r+=String.fromCharCode(parseInt(e.slice(t,t+2),16));return r}function binaryBytes(e){for(var r=new Uint8Array(e.length),t=0;t<e.length;t+=1)r[t]=255&e.charCodeAt(t);return r}function base64UrlEncode(e){for(var r="",t=0;t<e.length;t+=1)r+=String.fromCharCode(e[t]);return"function"==typeof btoa?btoa(r).replace(/=+$/g,"").replace(/\+/g,"-").replace(/\//g,"_"):"undefined"!=typeof Buffer?Buffer.from(e).toString("base64").replace(/=+$/g,"").replace(/\+/g,"-").replace(/\//g,"_"):r}function textBytes(e){return binaryBytes(String(e))}function apiJson(e,r){r=r||{};var t=Object.assign({Accept:"application/json","Content-Type":"application/json"},r.headers||{}),n={method:r.method||"GET",headers:t};return r.credentials&&(n.credentials=r.credentials),void 0!==r.body&&(n.body=r.body),fetch(e,n).then((function(e){return e.text().then((function(r){var t;try{t=r?JSON.parse(r):{}}catch(e){t={error:r}}if(!e.ok)throw new Error("HTTP "+e.status+": "+(t.error||r));return t}))}))}function byseCrypto(){if("undefined"!=typeof crypto&&crypto.subtle)return crypto;try{var e=require("crypto");if(e.webcrypto&&e.webcrypto.subtle)return e.webcrypto}catch(e){}return null}function createByseNodeFingerprint(e){var r;try{r=require("crypto")}catch(e){return Promise.resolve(null)}return r&&r.generateKeyPairSync&&r.createSign?apiJson(e+"/api/videos/access/challenge",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:"{}"}).then((function(t){var n=r.generateKeyPairSync("ec",{namedCurve:"prime256v1"}),i=n.publicKey.export({format:"jwk"}),a=r.createSign("SHA256").update(String(t.nonce)).sign({key:n.privateKey,dsaEncoding:"ieee-p1363"}),o=randomId(),s=randomId(),u={user_agent:FETCH_HEADERS["User-Agent"],languages:["ro-RO","en-US"],timezone:"UTC",extra:{vendor:"",appVersion:FETCH_HEADERS["User-Agent"]}};return apiJson(e+"/api/videos/access/attest",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:JSON.stringify({viewer_id:o,device_id:s,challenge_id:t.challenge_id,nonce:t.nonce,signature:base64UrlEncode(a),public_key:i,client:u,storage:{},attributes:{entropy:"low"}})}).then((function(e){if(!e.token)throw new Error("Byse fingerprint rejected");return{token:e.token,viewer_id:e.viewer_id||o,device_id:e.device_id||s,confidence:e.confidence||0}}))})):Promise.resolve(null)}function randomId(){var e=new Uint8Array(16),r=byseCrypto();if(r&&r.getRandomValues)r.getRandomValues(e);else for(var t=0;t<e.length;t+=1)e[t]=Math.floor(256*Math.random());return base64UrlEncode(e)}function createByseFingerprint(e){var r=byseCrypto();if(!(r&&r.subtle&&r.subtle.generateKey))return createByseNodeFingerprint(e);return apiJson(e+"/api/videos/access/challenge",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:"{}"}).then(function(t){return r.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},!0,["sign","verify"]).then(function(n){return Promise.all([r.subtle.exportKey("jwk",n.publicKey),r.subtle.sign({name:"ECDSA",hash:"SHA-256"},n.privateKey,textBytes(t.nonce))]).then(function(v){var i=randomId(),a=randomId(),o={user_agent:FETCH_HEADERS["User-Agent"],languages:["ro-RO","en-US"],timezone:"UTC",extra:{vendor:"",appVersion:FETCH_HEADERS["User-Agent"]}},s={viewer_id:i,device_id:a,challenge_id:t.challenge_id,nonce:t.nonce,signature:base64UrlEncode(new Uint8Array(v[1])),public_key:v[0],client:o,storage:{},attributes:{entropy:"low"}};return apiJson(e+"/api/videos/access/attest",{method:"POST",credentials:"include",headers:{Referer:e,Origin:e},body:JSON.stringify(s)}).then(function(q){if(!q.token)throw new Error("Byse fingerprint rejected");return{token:q.token,viewer_id:q.viewer_id||i,device_id:q.device_id||a,confidence:q.confidence||0}})})})}).catch(function(){return createByseNodeFingerprint(e)})}function bysePowHash(bytes, byteLength, scratch, firstOnly) {
  var imul = typeof Math.imul === "function" ? Math.imul : function(a, b) {
    var aLow = a & 65535;
    var bLow = b & 65535;
    var aHigh = a >>> 16;
    var bHigh = b >>> 16;
    return (aLow * bLow + ((aHigh * bLow + aLow * bHigh) << 16)) | 0;
  };
  var s0 = 1779033703;
  var s1 = -1150833019;
  var s2 = 1013904242;
  var s3 = -1521486534;
  var mixed;
  var index;

  for (index = 0; index < byteLength; index += 1) {
    s0 = s0 + bytes[index] | 0;
    s0 = (s0 << 7 | s0 >>> 25) | 0;
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) | 0;
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) | 0;
  }

  for (index = 0; index < 8; index += 1) {
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) | 0;
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) | 0;
  }

  var table = scratch.table;
  for (index = 0; index < 512; index += 1) {
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) | 0;
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) | 0;
    table[index] = (s0 ^ s2) | 0;
  }

  var round;
  for (round = 0; round < 2; round += 1) {
    for (index = 0; index < 512; index += 1) {
      var target = table[index] & 511;
      var value = table[index] + table[target] | 0;
      value = (value << 13 | value >>> 19) | 0;
      value = (value ^ imul(table[(index + 1) & 511], 2654435761)) | 0;
      table[index] = value;
      s0 = (s0 ^ value) | 0;
      s0 = s0 + s1 | 0;
      mixed = s3 ^ s0;
      s3 = (mixed << 16 | mixed >>> 16) | 0;
      s2 = s2 + s3 | 0;
      mixed = s1 ^ s2;
      s1 = (mixed << 12 | mixed >>> 20) | 0;
      s0 = s0 + s1 | 0;
      mixed = s3 ^ s0;
      s3 = (mixed << 8 | mixed >>> 24) | 0;
      s2 = s2 + s3 | 0;
      mixed = s1 ^ s2;
      s1 = (mixed << 7 | mixed >>> 25) | 0;
    }
  }

  var result = scratch.result;
  for (index = 0; index < (firstOnly ? 1 : 8); index += 1) {
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 16 | mixed >>> 16) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 12 | mixed >>> 20) | 0;
    s0 = s0 + s1 | 0;
    mixed = s3 ^ s0;
    s3 = (mixed << 8 | mixed >>> 24) | 0;
    s2 = s2 + s3 | 0;
    mixed = s1 ^ s2;
    s1 = (mixed << 7 | mixed >>> 25) | 0;

    var sum = s0;
    var start = index * 64;
    for (var offset = 0; offset < 64; offset += 1) {
      var item = table[start + offset];
      sum = sum + item | 0;
      sum = (sum << 5 | sum >>> 27) | 0;
      sum = (sum ^ imul(item, 2246822519)) | 0;
    }
    result[index] = (sum ^ s2) | 0;
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
    table: new Int32Array(512),
    result: new Uint32Array(8)
  };
  var solution = 0;
  var started = Date.now();

  function step() {
    var batchStarted = Date.now();
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
      if ((count & 31) === 31 && Date.now() - batchStarted >= 12) break;
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
  PLUGIN_VERSION="2.0.6";

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
  PLUGIN_VERSION="2.0.6";
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

    var aesKey = CryptoJS.enc.Hex.parse(byseCompatHex(keyBytes));
    var encryptor;
    if (typeof CryptoJS.algo.AES.createEncryptor === "function") {
      encryptor = CryptoJS.algo.AES.createEncryptor(aesKey);
    } else if (CryptoJS.AES && CryptoJS.mode.ECB && CryptoJS.pad.NoPadding) {
      encryptor = { encryptBlock: function(words, offset) {
        var block = CryptoJS.lib.WordArray.create(words.slice(offset, offset + 4), 16);
        var encrypted = CryptoJS.AES.encrypt(block, aesKey, {
          mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding
        });
        for (var index = 0; index < 4; index += 1) words[offset + index] = encrypted.ciphertext.words[index];
      } };
    } else {
      throw new Error("Byse AES block encryption unavailable");
    }
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

    var text = byseDecodeUtf8(plaintext);
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
        var text = byseDecodeUtf8(bytes);
        return JSON.parse(text);
      }).catch(function() {
        return byseCompatDecryptFallback(playback, keyBytes);
      });
  };
})();


var bysePortableP256=(()=>{var te=Object.defineProperty;var yn=Object.getOwnPropertyDescriptor;var Bn=Object.getOwnPropertyNames;var En=Object.prototype.hasOwnProperty;var vn=(t,e)=>{for(var r in e)te(t,r,{get:e[r],enumerable:!0})},Sn=(t,e,r,n)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of Bn(e))!En.call(t,o)&&o!==r&&te(t,o,{get:()=>e[o],enumerable:!(n=yn(e,o))||n.enumerable});return t};var An=t=>Sn(te({},"__esModule",{value:!0}),t);var tr={};vn(tr,{signChallenge:()=>Fn});var xt=typeof globalThis=="object"&&"crypto"in globalThis?globalThis.crypto:void 0;/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */function pt(t){return t instanceof Uint8Array||ArrayBuffer.isView(t)&&t.constructor.name==="Uint8Array"}function It(t){if(!Number.isSafeInteger(t)||t<0)throw new Error("positive integer expected, got "+t)}function X(t,...e){if(!pt(t))throw new Error("Uint8Array expected");if(e.length>0&&!e.includes(t.length))throw new Error("Uint8Array expected of length "+e+", got length="+t.length)}function Dt(t){if(typeof t!="function"||typeof t.create!="function")throw new Error("Hash should be wrapped by utils.createHasher");It(t.outputLen),It(t.blockLen)}function vt(t,e=!0){if(t.destroyed)throw new Error("Hash instance has been destroyed");if(e&&t.finished)throw new Error("Hash#digest() has already been called")}function Ae(t,e){X(t);let r=e.outputLen;if(t.length<r)throw new Error("digestInto() expects output buffer of length at least "+r)}function rt(...t){for(let e=0;e<t.length;e++)t[e].fill(0)}function Zt(t){return new DataView(t.buffer,t.byteOffset,t.byteLength)}function z(t,e){return t<<32-e|t>>>e}var _e=typeof Uint8Array.from([]).toHex=="function"&&typeof Uint8Array.fromHex=="function",_n=Array.from({length:256},(t,e)=>e.toString(16).padStart(2,"0"));function ot(t){if(X(t),_e)return t.toHex();let e="";for(let r=0;r<t.length;r++)e+=_n[t[r]];return e}var nt={_0:48,_9:57,A:65,F:70,a:97,f:102};function Se(t){if(t>=nt._0&&t<=nt._9)return t-nt._0;if(t>=nt.A&&t<=nt.F)return t-(nt.A-10);if(t>=nt.a&&t<=nt.f)return t-(nt.a-10)}function gt(t){if(typeof t!="string")throw new Error("hex string expected, got "+typeof t);if(_e)return Uint8Array.fromHex(t);let e=t.length,r=e/2;if(e%2)throw new Error("hex string expected, got unpadded hex of length "+e);let n=new Uint8Array(r);for(let o=0,s=0;o<r;o++,s+=2){let i=Se(t.charCodeAt(s)),f=Se(t.charCodeAt(s+1));if(i===void 0||f===void 0){let a=t[s]+t[s+1];throw new Error('hex string expected, got non-hex character "'+a+'" at index '+s)}n[o]=i*16+f}return n}function He(t){if(typeof t!="string")throw new Error("string expected");return new Uint8Array(new TextEncoder().encode(t))}function Ut(t){return typeof t=="string"&&(t=He(t)),X(t),t}function $(...t){let e=0;for(let n=0;n<t.length;n++){let o=t[n];X(o),e+=o.length}let r=new Uint8Array(e);for(let n=0,o=0;n<t.length;n++){let s=t[n];r.set(s,o),o+=s.length}return r}var Et=class{};function kt(t){let e=n=>t().update(Ut(n)).digest(),r=t();return e.outputLen=r.outputLen,e.blockLen=r.blockLen,e.create=()=>t(),e}function Mt(t=32){if(xt&&typeof xt.getRandomValues=="function")return xt.getRandomValues(new Uint8Array(t));if(xt&&typeof xt.randomBytes=="function")return Uint8Array.from(xt.randomBytes(t));throw new Error("crypto.getRandomValues must be defined")}function Hn(t,e,r,n){if(typeof t.setBigUint64=="function")return t.setBigUint64(e,r,n);let o=BigInt(32),s=BigInt(4294967295),i=Number(r>>o&s),f=Number(r&s),a=n?4:0,b=n?0:4;t.setUint32(e+a,i,n),t.setUint32(e+b,f,n)}function Ie(t,e,r){return t&e^~t&r}function Ue(t,e,r){return t&e^t&r^e&r}var Ot=class extends Et{constructor(e,r,n,o){super(),this.finished=!1,this.length=0,this.pos=0,this.destroyed=!1,this.blockLen=e,this.outputLen=r,this.padOffset=n,this.isLE=o,this.buffer=new Uint8Array(e),this.view=Zt(this.buffer)}update(e){vt(this),e=Ut(e),X(e);let{view:r,buffer:n,blockLen:o}=this,s=e.length;for(let i=0;i<s;){let f=Math.min(o-this.pos,s-i);if(f===o){let a=Zt(e);for(;o<=s-i;i+=o)this.process(a,i);continue}n.set(e.subarray(i,i+f),this.pos),this.pos+=f,i+=f,this.pos===o&&(this.process(r,0),this.pos=0)}return this.length+=e.length,this.roundClean(),this}digestInto(e){vt(this),Ae(e,this),this.finished=!0;let{buffer:r,view:n,blockLen:o,isLE:s}=this,{pos:i}=this;r[i++]=128,rt(this.buffer.subarray(i)),this.padOffset>o-i&&(this.process(n,0),i=0);for(let x=i;x<o;x++)r[x]=0;Hn(n,o-8,BigInt(this.length*8),s),this.process(n,0);let f=Zt(e),a=this.outputLen;if(a%4)throw new Error("_sha2: outputLen should be aligned to 32bit");let b=a/4,g=this.get();if(b>g.length)throw new Error("_sha2: outputLen bigger than state");for(let x=0;x<b;x++)f.setUint32(4*x,g[x],s)}digest(){let{buffer:e,outputLen:r}=this;this.digestInto(e);let n=e.slice(0,r);return this.destroy(),n}_cloneInto(e){e||(e=new this.constructor),e.set(...this.get());let{blockLen:r,buffer:n,length:o,finished:s,destroyed:i,pos:f}=this;return e.destroyed=i,e.finished=s,e.length=o,e.pos=f,o%r&&e.buffer.set(n),e}clone(){return this._cloneInto()}},st=Uint32Array.from([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]);var V=Uint32Array.from([3418070365,3238371032,1654270250,914150663,2438529370,812702999,355462360,4144912697,1731405415,4290775857,2394180231,1750603025,3675008525,1694076839,1203062813,3204075428]),D=Uint32Array.from([1779033703,4089235720,3144134277,2227873595,1013904242,4271175723,2773480762,1595750129,1359893119,2917565137,2600822924,725511199,528734635,4215389547,1541459225,327033209]);var jt=BigInt(4294967295),Oe=BigInt(32);function In(t,e=!1){return e?{h:Number(t&jt),l:Number(t>>Oe&jt)}:{h:Number(t>>Oe&jt)|0,l:Number(t&jt)|0}}function Le(t,e=!1){let r=t.length,n=new Uint32Array(r),o=new Uint32Array(r);for(let s=0;s<r;s++){let{h:i,l:f}=In(t[s],e);[n[s],o[s]]=[i,f]}return[n,o]}var ee=(t,e,r)=>t>>>r,ne=(t,e,r)=>t<<32-r|e>>>r,mt=(t,e,r)=>t>>>r|e<<32-r,wt=(t,e,r)=>t<<32-r|e>>>r,Lt=(t,e,r)=>t<<64-r|e>>>r-32,Rt=(t,e,r)=>t>>>r-32|e<<64-r;function J(t,e,r,n){let o=(e>>>0)+(n>>>0);return{h:t+r+(o/2**32|0)|0,l:o|0}}var Re=(t,e,r)=>(t>>>0)+(e>>>0)+(r>>>0),qe=(t,e,r,n)=>e+r+n+(t/2**32|0)|0,Te=(t,e,r,n)=>(t>>>0)+(e>>>0)+(r>>>0)+(n>>>0),Ne=(t,e,r,n,o)=>e+r+n+o+(t/2**32|0)|0,Ce=(t,e,r,n,o)=>(t>>>0)+(e>>>0)+(r>>>0)+(n>>>0)+(o>>>0),Ve=(t,e,r,n,o,s)=>e+r+n+o+s+(t/2**32|0)|0;var On=Uint32Array.from([1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298]),at=new Uint32Array(64),re=class extends Ot{constructor(e=32){super(64,e,8,!1),this.A=st[0]|0,this.B=st[1]|0,this.C=st[2]|0,this.D=st[3]|0,this.E=st[4]|0,this.F=st[5]|0,this.G=st[6]|0,this.H=st[7]|0}get(){let{A:e,B:r,C:n,D:o,E:s,F:i,G:f,H:a}=this;return[e,r,n,o,s,i,f,a]}set(e,r,n,o,s,i,f,a){this.A=e|0,this.B=r|0,this.C=n|0,this.D=o|0,this.E=s|0,this.F=i|0,this.G=f|0,this.H=a|0}process(e,r){for(let x=0;x<16;x++,r+=4)at[x]=e.getUint32(r,!1);for(let x=16;x<64;x++){let c=at[x-15],l=at[x-2],m=z(c,7)^z(c,18)^c>>>3,y=z(l,17)^z(l,19)^l>>>10;at[x]=y+at[x-7]+m+at[x-16]|0}let{A:n,B:o,C:s,D:i,E:f,F:a,G:b,H:g}=this;for(let x=0;x<64;x++){let c=z(f,6)^z(f,11)^z(f,25),l=g+c+Ie(f,a,b)+On[x]+at[x]|0,y=(z(n,2)^z(n,13)^z(n,22))+Ue(n,o,s)|0;g=b,b=a,a=f,f=i+l|0,i=s,s=o,o=n,n=l+y|0}n=n+this.A|0,o=o+this.B|0,s=s+this.C|0,i=i+this.D|0,f=f+this.E|0,a=a+this.F|0,b=b+this.G|0,g=g+this.H|0,this.set(n,o,s,i,f,a,b,g)}roundClean(){rt(at)}destroy(){this.set(0,0,0,0,0,0,0,0),rt(this.buffer)}};var De=Le(["0x428a2f98d728ae22","0x7137449123ef65cd","0xb5c0fbcfec4d3b2f","0xe9b5dba58189dbbc","0x3956c25bf348b538","0x59f111f1b605d019","0x923f82a4af194f9b","0xab1c5ed5da6d8118","0xd807aa98a3030242","0x12835b0145706fbe","0x243185be4ee4b28c","0x550c7dc3d5ffb4e2","0x72be5d74f27b896f","0x80deb1fe3b1696b1","0x9bdc06a725c71235","0xc19bf174cf692694","0xe49b69c19ef14ad2","0xefbe4786384f25e3","0x0fc19dc68b8cd5b5","0x240ca1cc77ac9c65","0x2de92c6f592b0275","0x4a7484aa6ea6e483","0x5cb0a9dcbd41fbd4","0x76f988da831153b5","0x983e5152ee66dfab","0xa831c66d2db43210","0xb00327c898fb213f","0xbf597fc7beef0ee4","0xc6e00bf33da88fc2","0xd5a79147930aa725","0x06ca6351e003826f","0x142929670a0e6e70","0x27b70a8546d22ffc","0x2e1b21385c26c926","0x4d2c6dfc5ac42aed","0x53380d139d95b3df","0x650a73548baf63de","0x766a0abb3c77b2a8","0x81c2c92e47edaee6","0x92722c851482353b","0xa2bfe8a14cf10364","0xa81a664bbc423001","0xc24b8b70d0f89791","0xc76c51a30654be30","0xd192e819d6ef5218","0xd69906245565a910","0xf40e35855771202a","0x106aa07032bbd1b8","0x19a4c116b8d2d0c8","0x1e376c085141ab53","0x2748774cdf8eeb99","0x34b0bcb5e19b48a8","0x391c0cb3c5c95a63","0x4ed8aa4ae3418acb","0x5b9cca4f7763e373","0x682e6ff3d6b2b8a3","0x748f82ee5defb2fc","0x78a5636f43172f60","0x84c87814a1f0ab72","0x8cc702081a6439ec","0x90befffa23631e28","0xa4506cebde82bde9","0xbef9a3f7b2c67915","0xc67178f2e372532b","0xca273eceea26619c","0xd186b8c721c0c207","0xeada7dd6cde0eb1e","0xf57d4f7fee6ed178","0x06f067aa72176fba","0x0a637dc5a2c898a6","0x113f9804bef90dae","0x1b710b35131c471b","0x28db77f523047d84","0x32caab7b40c72493","0x3c9ebe0a15c9bebc","0x431d67c49c100d4c","0x4cc5d4becb3e42b6","0x597f299cfc657e2a","0x5fcb6fab3ad6faec","0x6c44198c4a475817"].map(t=>BigInt(t))),Ln=De[0],Rn=De[1],ut=new Uint32Array(80),lt=new Uint32Array(80),Kt=class extends Ot{constructor(e=64){super(128,e,16,!1),this.Ah=D[0]|0,this.Al=D[1]|0,this.Bh=D[2]|0,this.Bl=D[3]|0,this.Ch=D[4]|0,this.Cl=D[5]|0,this.Dh=D[6]|0,this.Dl=D[7]|0,this.Eh=D[8]|0,this.El=D[9]|0,this.Fh=D[10]|0,this.Fl=D[11]|0,this.Gh=D[12]|0,this.Gl=D[13]|0,this.Hh=D[14]|0,this.Hl=D[15]|0}get(){let{Ah:e,Al:r,Bh:n,Bl:o,Ch:s,Cl:i,Dh:f,Dl:a,Eh:b,El:g,Fh:x,Fl:c,Gh:l,Gl:m,Hh:y,Hl:I}=this;return[e,r,n,o,s,i,f,a,b,g,x,c,l,m,y,I]}set(e,r,n,o,s,i,f,a,b,g,x,c,l,m,y,I){this.Ah=e|0,this.Al=r|0,this.Bh=n|0,this.Bl=o|0,this.Ch=s|0,this.Cl=i|0,this.Dh=f|0,this.Dl=a|0,this.Eh=b|0,this.El=g|0,this.Fh=x|0,this.Fl=c|0,this.Gh=l|0,this.Gl=m|0,this.Hh=y|0,this.Hl=I|0}process(e,r){for(let A=0;A<16;A++,r+=4)ut[A]=e.getUint32(r),lt[A]=e.getUint32(r+=4);for(let A=16;A<80;A++){let G=ut[A-15]|0,K=lt[A-15]|0,bt=mt(G,K,1)^mt(G,K,8)^ee(G,K,7),ct=wt(G,K,1)^wt(G,K,8)^ne(G,K,7),Z=ut[A-2]|0,_=lt[A-2]|0,et=mt(Z,_,19)^Lt(Z,_,61)^ee(Z,_,6),W=wt(Z,_,19)^Rt(Z,_,61)^ne(Z,_,6),U=Te(ct,W,lt[A-7],lt[A-16]),h=Ne(U,bt,et,ut[A-7],ut[A-16]);ut[A]=h|0,lt[A]=U|0}let{Ah:n,Al:o,Bh:s,Bl:i,Ch:f,Cl:a,Dh:b,Dl:g,Eh:x,El:c,Fh:l,Fl:m,Gh:y,Gl:I,Hh:R,Hl:tt}=this;for(let A=0;A<80;A++){let G=mt(x,c,14)^mt(x,c,18)^Lt(x,c,41),K=wt(x,c,14)^wt(x,c,18)^Rt(x,c,41),bt=x&l^~x&y,ct=c&m^~c&I,Z=Ce(tt,K,ct,Rn[A],lt[A]),_=Ve(Z,R,G,bt,Ln[A],ut[A]),et=Z|0,W=mt(n,o,28)^Lt(n,o,34)^Lt(n,o,39),U=wt(n,o,28)^Rt(n,o,34)^Rt(n,o,39),h=n&s^n&f^s&f,d=o&i^o&a^i&a;R=y|0,tt=I|0,y=l|0,I=m|0,l=x|0,m=c|0,{h:x,l:c}=J(b|0,g|0,_|0,et|0),b=f|0,g=a|0,f=s|0,a=i|0,s=n|0,i=o|0;let u=Re(et,U,d);n=qe(u,_,W,h),o=u|0}({h:n,l:o}=J(this.Ah|0,this.Al|0,n|0,o|0)),{h:s,l:i}=J(this.Bh|0,this.Bl|0,s|0,i|0),{h:f,l:a}=J(this.Ch|0,this.Cl|0,f|0,a|0),{h:b,l:g}=J(this.Dh|0,this.Dl|0,b|0,g|0),{h:x,l:c}=J(this.Eh|0,this.El|0,x|0,c|0),{h:l,l:m}=J(this.Fh|0,this.Fl|0,l|0,m|0),{h:y,l:I}=J(this.Gh|0,this.Gl|0,y|0,I|0),{h:R,l:tt}=J(this.Hh|0,this.Hl|0,R|0,tt|0),this.set(n,o,s,i,f,a,b,g,x,c,l,m,y,I,R,tt)}roundClean(){rt(ut,lt)}destroy(){rt(this.buffer),this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0)}},oe=class extends Kt{constructor(){super(48),this.Ah=V[0]|0,this.Al=V[1]|0,this.Bh=V[2]|0,this.Bl=V[3]|0,this.Ch=V[4]|0,this.Cl=V[5]|0,this.Dh=V[6]|0,this.Dl=V[7]|0,this.Eh=V[8]|0,this.El=V[9]|0,this.Fh=V[10]|0,this.Fl=V[11]|0,this.Gh=V[12]|0,this.Gl=V[13]|0,this.Hh=V[14]|0,this.Hl=V[15]|0}};var Ze=kt(()=>new re);var ke=kt(()=>new Kt),Me=kt(()=>new oe);var Gt=class extends Et{constructor(e,r){super(),this.finished=!1,this.destroyed=!1,Dt(e);let n=Ut(r);if(this.iHash=e.create(),typeof this.iHash.update!="function")throw new Error("Expected instance of class which extends utils.Hash");this.blockLen=this.iHash.blockLen,this.outputLen=this.iHash.outputLen;let o=this.blockLen,s=new Uint8Array(o);s.set(n.length>o?e.create().update(n).digest():n);for(let i=0;i<s.length;i++)s[i]^=54;this.iHash.update(s),this.oHash=e.create();for(let i=0;i<s.length;i++)s[i]^=106;this.oHash.update(s),rt(s)}update(e){return vt(this),this.iHash.update(e),this}digestInto(e){vt(this),X(e,this.outputLen),this.finished=!0,this.iHash.digestInto(e),this.oHash.update(e),this.oHash.digestInto(e),this.destroy()}digest(){let e=new Uint8Array(this.oHash.outputLen);return this.digestInto(e),e}_cloneInto(e){e||(e=Object.create(Object.getPrototypeOf(this),{}));let{oHash:r,iHash:n,finished:o,destroyed:s,blockLen:i,outputLen:f}=this;return e=e,e.finished=o,e.destroyed=s,e.blockLen=i,e.outputLen=f,e.oHash=r._cloneInto(e.oHash),e.iHash=n._cloneInto(e.iHash),e}clone(){return this._cloneInto()}destroy(){this.destroyed=!0,this.oHash.destroy(),this.iHash.destroy()}},se=(t,e,r)=>new Gt(t,e).update(r).digest();se.create=(t,e)=>new Gt(t,e);/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var ce=BigInt(0),fe=BigInt(1);function qt(t,e=""){if(typeof t!="boolean"){let r=e&&`"${e}"`;throw new Error(r+"expected boolean, got type="+typeof t)}return t}function dt(t,e,r=""){let n=pt(t),o=t?.length,s=e!==void 0;if(!n||s&&o!==e){let i=r&&`"${r}" `,f=s?` of length ${e}`:"",a=n?`length=${o}`:`type=${typeof t}`;throw new Error(i+"expected Uint8Array"+f+", got "+a)}return t}function Tt(t){let e=t.toString(16);return e.length&1?"0"+e:e}function je(t){if(typeof t!="string")throw new Error("hex string expected, got "+typeof t);return t===""?ce:BigInt("0x"+t)}function St(t){return je(ot(t))}function ae(t){return X(t),je(ot(Uint8Array.from(t).reverse()))}function Yt(t,e){return gt(t.toString(16).padStart(e*2,"0"))}function ue(t,e){return Yt(t,e).reverse()}function M(t,e,r){let n;if(typeof e=="string")try{n=gt(e)}catch(s){throw new Error(t+" must be hex string or Uint8Array, cause: "+s)}else if(pt(e))n=Uint8Array.from(e);else throw new Error(t+" must be hex string or Uint8Array");let o=n.length;if(typeof r=="number"&&o!==r)throw new Error(t+" of length "+r+" expected, got "+o);return n}var ie=t=>typeof t=="bigint"&&ce<=t;function Ke(t,e,r){return ie(t)&&ie(e)&&ie(r)&&e<=t&&t<r}function Ge(t,e,r,n){if(!Ke(e,r,n))throw new Error("expected valid "+t+": "+r+" <= n < "+n+", got "+e)}function Pt(t){let e;for(e=0;t>ce;t>>=fe,e+=1);return e}var ht=t=>(fe<<BigInt(t))-fe;function Ye(t,e,r){if(typeof t!="number"||t<2)throw new Error("hashLen must be a number");if(typeof e!="number"||e<2)throw new Error("qByteLen must be a number");if(typeof r!="function")throw new Error("hmacFn must be a function");let n=l=>new Uint8Array(l),o=l=>Uint8Array.of(l),s=n(t),i=n(t),f=0,a=()=>{s.fill(1),i.fill(0),f=0},b=(...l)=>r(i,s,...l),g=(l=n(0))=>{i=b(o(0),l),s=b(),l.length!==0&&(i=b(o(1),l),s=b())},x=()=>{if(f++>=1e3)throw new Error("drbg: tried 1000 values");let l=0,m=[];for(;l<e;){s=b();let y=s.slice();m.push(y),l+=s.length}return $(...m)};return(l,m)=>{a(),g(l);let y;for(;!(y=m(x()));)g();return a(),y}}function Nt(t,e,r={}){if(!t||typeof t!="object")throw new Error("expected valid options object");function n(o,s,i){let f=t[o];if(i&&f===void 0)return;let a=typeof f;if(a!==s||f===null)throw new Error(`param "${o}" is invalid: expected ${s}, got ${a}`)}Object.entries(e).forEach(([o,s])=>n(o,s,!1)),Object.entries(r).forEach(([o,s])=>n(o,s,!0))}function le(t){let e=new WeakMap;return(r,...n)=>{let o=e.get(r);if(o!==void 0)return o;let s=t(r,...n);return e.set(r,s),s}}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var P=BigInt(0),j=BigInt(1),yt=BigInt(2),Xe=BigInt(3),ze=BigInt(4),$e=BigInt(5),qn=BigInt(7),Qe=BigInt(8),Tn=BigInt(9),Je=BigInt(16);function Q(t,e){let r=t%e;return r>=P?r:e+r}function Pe(t,e){if(t===P)throw new Error("invert: expected non-zero number");if(e<=P)throw new Error("invert: expected positive modulus, got "+e);let r=Q(t,e),n=e,o=P,s=j,i=j,f=P;for(;r!==P;){let b=n/r,g=n%r,x=o-i*b,c=s-f*b;n=r,r=g,o=i,s=f,i=x,f=c}if(n!==j)throw new Error("invert: does not exist");return Q(o,e)}function de(t,e,r){if(!t.eql(t.sqr(e),r))throw new Error("Cannot find square root")}function Fe(t,e){let r=(t.ORDER+j)/ze,n=t.pow(e,r);return de(t,n,e),n}function Nn(t,e){let r=(t.ORDER-$e)/Qe,n=t.mul(e,yt),o=t.pow(n,r),s=t.mul(e,o),i=t.mul(t.mul(s,yt),o),f=t.mul(s,t.sub(i,t.ONE));return de(t,f,e),f}function Cn(t){let e=F(t),r=tn(t),n=r(e,e.neg(e.ONE)),o=r(e,n),s=r(e,e.neg(n)),i=(t+qn)/Je;return(f,a)=>{let b=f.pow(a,i),g=f.mul(b,n),x=f.mul(b,o),c=f.mul(b,s),l=f.eql(f.sqr(g),a),m=f.eql(f.sqr(x),a);b=f.cmov(b,g,l),g=f.cmov(c,x,m);let y=f.eql(f.sqr(g),a),I=f.cmov(b,g,y);return de(f,I,a),I}}function tn(t){if(t<Xe)throw new Error("sqrt is not defined for small field");let e=t-j,r=0;for(;e%yt===P;)e/=yt,r++;let n=yt,o=F(t);for(;We(o,n)===1;)if(n++>1e3)throw new Error("Cannot find square root: probably non-prime P");if(r===1)return Fe;let s=o.pow(n,e),i=(e+j)/yt;return function(a,b){if(a.is0(b))return b;if(We(a,b)!==1)throw new Error("Cannot find square root");let g=r,x=a.mul(a.ONE,s),c=a.pow(b,e),l=a.pow(b,i);for(;!a.eql(c,a.ONE);){if(a.is0(c))return a.ZERO;let m=1,y=a.sqr(c);for(;!a.eql(y,a.ONE);)if(m++,y=a.sqr(y),m===g)throw new Error("Cannot find square root");let I=j<<BigInt(g-m-1),R=a.pow(x,I);g=m,x=a.sqr(R),c=a.mul(c,x),l=a.mul(l,R)}return l}}function Vn(t){return t%ze===Xe?Fe:t%Qe===$e?Nn:t%Je===Tn?Cn(t):tn(t)}var Dn=["create","isValid","is0","neg","inv","sqrt","sqr","eql","add","sub","mul","pow","div","addN","subN","mulN","sqrN"];function he(t){let e={ORDER:"bigint",MASK:"bigint",BYTES:"number",BITS:"number"},r=Dn.reduce((n,o)=>(n[o]="function",n),e);return Nt(t,r),t}function Zn(t,e,r){if(r<P)throw new Error("invalid exponent, negatives unsupported");if(r===P)return t.ONE;if(r===j)return e;let n=t.ONE,o=e;for(;r>P;)r&j&&(n=t.mul(n,o)),o=t.sqr(o),r>>=j;return n}function Wt(t,e,r=!1){let n=new Array(e.length).fill(r?t.ZERO:void 0),o=e.reduce((i,f,a)=>t.is0(f)?i:(n[a]=i,t.mul(i,f)),t.ONE),s=t.inv(o);return e.reduceRight((i,f,a)=>t.is0(f)?i:(n[a]=t.mul(i,n[a]),t.mul(i,f)),s),n}function We(t,e){let r=(t.ORDER-j)/yt,n=t.pow(e,r),o=t.eql(n,t.ONE),s=t.eql(n,t.ZERO),i=t.eql(n,t.neg(t.ONE));if(!o&&!s&&!i)throw new Error("invalid Legendre symbol result");return o?1:s?0:-1}function Xt(t,e){e!==void 0&&It(e);let r=e!==void 0?e:t.toString(2).length,n=Math.ceil(r/8);return{nBitLength:r,nByteLength:n}}function F(t,e,r=!1,n={}){if(t<=P)throw new Error("invalid field: expected ORDER > 0, got "+t);let o,s,i=!1,f;if(typeof e=="object"&&e!=null){if(n.sqrt||r)throw new Error("cannot specify opts in two arguments");let c=e;c.BITS&&(o=c.BITS),c.sqrt&&(s=c.sqrt),typeof c.isLE=="boolean"&&(r=c.isLE),typeof c.modFromBytes=="boolean"&&(i=c.modFromBytes),f=c.allowedLengths}else typeof e=="number"&&(o=e),n.sqrt&&(s=n.sqrt);let{nBitLength:a,nByteLength:b}=Xt(t,o);if(b>2048)throw new Error("invalid field: expected ORDER of <= 2048 bytes");let g,x=Object.freeze({ORDER:t,isLE:r,BITS:a,BYTES:b,MASK:ht(a),ZERO:P,ONE:j,allowedLengths:f,create:c=>Q(c,t),isValid:c=>{if(typeof c!="bigint")throw new Error("invalid field element: expected bigint, got "+typeof c);return P<=c&&c<t},is0:c=>c===P,isValidNot0:c=>!x.is0(c)&&x.isValid(c),isOdd:c=>(c&j)===j,neg:c=>Q(-c,t),eql:(c,l)=>c===l,sqr:c=>Q(c*c,t),add:(c,l)=>Q(c+l,t),sub:(c,l)=>Q(c-l,t),mul:(c,l)=>Q(c*l,t),pow:(c,l)=>Zn(x,c,l),div:(c,l)=>Q(c*Pe(l,t),t),sqrN:c=>c*c,addN:(c,l)=>c+l,subN:(c,l)=>c-l,mulN:(c,l)=>c*l,inv:c=>Pe(c,t),sqrt:s||(c=>(g||(g=Vn(t)),g(x,c))),toBytes:c=>r?ue(c,b):Yt(c,b),fromBytes:(c,l=!0)=>{if(f){if(!f.includes(c.length)||c.length>b)throw new Error("Field.fromBytes: expected "+f+" bytes, got "+c.length);let y=new Uint8Array(b);y.set(c,r?0:y.length-c.length),c=y}if(c.length!==b)throw new Error("Field.fromBytes: expected "+b+" bytes, got "+c.length);let m=r?ae(c):St(c);if(i&&(m=Q(m,t)),!l&&!x.isValid(m))throw new Error("invalid field element: outside of range 0..ORDER");return m},invertBatch:c=>Wt(x,c),cmov:(c,l,m)=>m?l:c});return Object.freeze(x)}function en(t){if(typeof t!="bigint")throw new Error("field order must be bigint");let e=t.toString(2).length;return Math.ceil(e/8)}function be(t){let e=en(t);return e+Math.ceil(e/2)}function nn(t,e,r=!1){let n=t.length,o=en(e),s=be(e);if(n<16||n<s||n>1024)throw new Error("expected "+s+"-1024 bytes of input, got "+n);let i=r?ae(t):St(t),f=Q(i,e-j)+j;return r?ue(f,o):Yt(f,o)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var At=BigInt(0),Bt=BigInt(1);function Ct(t,e){let r=e.negate();return t?r:e}function $t(t,e){let r=Wt(t.Fp,e.map(n=>n.Z));return e.map((n,o)=>t.fromAffine(n.toAffine(r[o])))}function fn(t,e){if(!Number.isSafeInteger(t)||t<=0||t>e)throw new Error("invalid window size, expected [1.."+e+"], got W="+t)}function xe(t,e){fn(t,e);let r=Math.ceil(e/t)+1,n=2**(t-1),o=2**t,s=ht(t),i=BigInt(t);return{windows:r,windowSize:n,mask:s,maxNumber:o,shiftBy:i}}function rn(t,e,r){let{windowSize:n,mask:o,maxNumber:s,shiftBy:i}=r,f=Number(t&o),a=t>>i;f>n&&(f-=s,a+=Bt);let b=e*n,g=b+Math.abs(f)-1,x=f===0,c=f<0,l=e%2!==0;return{nextN:a,offset:g,isZero:x,isNeg:c,isNegF:l,offsetF:b}}function kn(t,e){if(!Array.isArray(t))throw new Error("array expected");t.forEach((r,n)=>{if(!(r instanceof e))throw new Error("invalid point at index "+n)})}function Mn(t,e){if(!Array.isArray(t))throw new Error("array of scalars expected");t.forEach((r,n)=>{if(!e.isValid(r))throw new Error("invalid scalar at index "+n)})}var pe=new WeakMap,cn=new WeakMap;function ge(t){return cn.get(t)||1}function on(t){if(t!==At)throw new Error("invalid wNAF")}var zt=class{constructor(e,r){this.BASE=e.BASE,this.ZERO=e.ZERO,this.Fn=e.Fn,this.bits=r}_unsafeLadder(e,r,n=this.ZERO){let o=e;for(;r>At;)r&Bt&&(n=n.add(o)),o=o.double(),r>>=Bt;return n}precomputeWindow(e,r){let{windows:n,windowSize:o}=xe(r,this.bits),s=[],i=e,f=i;for(let a=0;a<n;a++){f=i,s.push(f);for(let b=1;b<o;b++)f=f.add(i),s.push(f);i=f.double()}return s}wNAF(e,r,n){if(!this.Fn.isValid(n))throw new Error("invalid scalar");let o=this.ZERO,s=this.BASE,i=xe(e,this.bits);for(let f=0;f<i.windows;f++){let{nextN:a,offset:b,isZero:g,isNeg:x,isNegF:c,offsetF:l}=rn(n,f,i);n=a,g?s=s.add(Ct(c,r[l])):o=o.add(Ct(x,r[b]))}return on(n),{p:o,f:s}}wNAFUnsafe(e,r,n,o=this.ZERO){let s=xe(e,this.bits);for(let i=0;i<s.windows&&n!==At;i++){let{nextN:f,offset:a,isZero:b,isNeg:g}=rn(n,i,s);if(n=f,!b){let x=r[a];o=o.add(g?x.negate():x)}}return on(n),o}getPrecomputes(e,r,n){let o=pe.get(r);return o||(o=this.precomputeWindow(r,e),e!==1&&(typeof n=="function"&&(o=n(o)),pe.set(r,o))),o}cached(e,r,n){let o=ge(e);return this.wNAF(o,this.getPrecomputes(o,e,n),r)}unsafe(e,r,n,o){let s=ge(e);return s===1?this._unsafeLadder(e,r,o):this.wNAFUnsafe(s,this.getPrecomputes(s,e,n),r,o)}createCache(e,r){fn(r,this.bits),cn.set(e,r),pe.delete(e)}hasCache(e){return ge(e)!==1}};function an(t,e,r,n){let o=e,s=t.ZERO,i=t.ZERO;for(;r>At||n>At;)r&Bt&&(s=s.add(o)),n&Bt&&(i=i.add(o)),o=o.double(),r>>=Bt,n>>=Bt;return{p1:s,p2:i}}function un(t,e,r,n){kn(r,t),Mn(n,e);let o=r.length,s=n.length;if(o!==s)throw new Error("arrays of points and scalars must have equal length");let i=t.ZERO,f=Pt(BigInt(o)),a=1;f>12?a=f-3:f>4?a=f-2:f>0&&(a=2);let b=ht(a),g=new Array(Number(b)+1).fill(i),x=Math.floor((e.BITS-1)/a)*a,c=i;for(let l=x;l>=0;l-=a){g.fill(i);for(let y=0;y<s;y++){let I=n[y],R=Number(I>>BigInt(l)&b);g[R]=g[R].add(r[y])}let m=i;for(let y=g.length-1,I=i;y>0;y--)I=I.add(g[y]),m=m.add(I);if(c=c.add(m),l!==0)for(let y=0;y<a;y++)c=c.double()}return c}function sn(t,e,r){if(e){if(e.ORDER!==t)throw new Error("Field.ORDER must match order: Fp == p, Fn == n");return he(e),e}else return F(t,{isLE:r})}function ln(t,e,r={},n){if(n===void 0&&(n=t==="edwards"),!e||typeof e!="object")throw new Error(`expected valid ${t} CURVE object`);for(let a of["p","n","h"]){let b=e[a];if(!(typeof b=="bigint"&&b>At))throw new Error(`CURVE.${a} must be positive bigint`)}let o=sn(e.p,r.Fp,n),s=sn(e.n,r.Fn,n),f=["Gx","Gy","a",t==="weierstrass"?"b":"d"];for(let a of f)if(!o.isValid(e[a]))throw new Error(`CURVE.${a} must be valid field element of CURVE.Fp`);return e=Object.freeze(Object.assign({},e)),{CURVE:e,Fp:o,Fn:s}}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var dn=(t,e)=>(t+(t>=0?e:-e)/hn)/e;function jn(t,e,r){let[[n,o],[s,i]]=e,f=dn(i*t,r),a=dn(-o*t,r),b=t-f*n-a*s,g=-f*o-a*i,x=b<ft,c=g<ft;x&&(b=-b),c&&(g=-g);let l=ht(Math.ceil(Pt(r)/2))+Ht;if(b<ft||b>=l||g<ft||g>=l)throw new Error("splitScalar (endomorphism): failed, k="+t);return{k1neg:x,k1:b,k2neg:c,k2:g}}function we(t){if(!["compact","recovered","der"].includes(t))throw new Error('Signature format must be "compact", "recovered", or "der"');return t}function me(t,e){let r={};for(let n of Object.keys(e))r[n]=t[n]===void 0?e[n]:t[n];return qt(r.lowS,"lowS"),qt(r.prehash,"prehash"),r.format!==void 0&&we(r.format),r}var ye=class extends Error{constructor(e=""){super(e)}},it={Err:ye,_tlv:{encode:(t,e)=>{let{Err:r}=it;if(t<0||t>256)throw new r("tlv.encode: wrong tag");if(e.length&1)throw new r("tlv.encode: unpadded data");let n=e.length/2,o=Tt(n);if(o.length/2&128)throw new r("tlv.encode: long form length too big");let s=n>127?Tt(o.length/2|128):"";return Tt(t)+s+o+e},decode(t,e){let{Err:r}=it,n=0;if(t<0||t>256)throw new r("tlv.encode: wrong tag");if(e.length<2||e[n++]!==t)throw new r("tlv.decode: wrong tlv");let o=e[n++],s=!!(o&128),i=0;if(!s)i=o;else{let a=o&127;if(!a)throw new r("tlv.decode(long): indefinite length not supported");if(a>4)throw new r("tlv.decode(long): byte length is too big");let b=e.subarray(n,n+a);if(b.length!==a)throw new r("tlv.decode: length bytes not complete");if(b[0]===0)throw new r("tlv.decode(long): zero leftmost byte");for(let g of b)i=i<<8|g;if(n+=a,i<128)throw new r("tlv.decode(long): not minimal encoding")}let f=e.subarray(n,n+i);if(f.length!==i)throw new r("tlv.decode: wrong value length");return{v:f,l:e.subarray(n+i)}}},_int:{encode(t){let{Err:e}=it;if(t<ft)throw new e("integer: negative integers are not allowed");let r=Tt(t);if(Number.parseInt(r[0],16)&8&&(r="00"+r),r.length&1)throw new e("unexpected DER parsing assertion: unpadded hex");return r},decode(t){let{Err:e}=it;if(t[0]&128)throw new e("invalid signature integer: negative");if(t[0]===0&&!(t[1]&128))throw new e("invalid signature integer: unnecessary leading zero");return St(t)}},toSig(t){let{Err:e,_int:r,_tlv:n}=it,o=M("signature",t),{v:s,l:i}=n.decode(48,o);if(i.length)throw new e("invalid signature: left bytes after parsing");let{v:f,l:a}=n.decode(2,s),{v:b,l:g}=n.decode(2,a);if(g.length)throw new e("invalid signature: left bytes after parsing");return{r:r.decode(f),s:r.decode(b)}},hexFromSig(t){let{_tlv:e,_int:r}=it,n=e.encode(2,r.encode(t.r)),o=e.encode(2,r.encode(t.s)),s=n+o;return e.encode(48,s)}},ft=BigInt(0),Ht=BigInt(1),hn=BigInt(2),Qt=BigInt(3),Kn=BigInt(4);function _t(t,e){let{BYTES:r}=t,n;if(typeof e=="bigint")n=e;else{let o=M("private key",e);try{n=t.fromBytes(o)}catch{throw new Error(`invalid private key: expected ui8a of size ${r}, got ${typeof e}`)}}if(!t.isValidNot0(n))throw new Error("invalid private key: out of range [1..N-1]");return n}function Gn(t,e={}){let r=ln("weierstrass",t,e),{Fp:n,Fn:o}=r,s=r.CURVE,{h:i,n:f}=s;Nt(e,{},{allowInfinityPoint:"boolean",clearCofactor:"function",isTorsionFree:"function",fromBytes:"function",toBytes:"function",endo:"object",wrapPrivateKey:"boolean"});let{endo:a}=e;if(a&&(!n.is0(s.a)||typeof a.beta!="bigint"||!Array.isArray(a.basises)))throw new Error('invalid endo: expected "beta": bigint and "basises": array');let b=xn(n,o);function g(){if(!n.isOdd)throw new Error("compression is not supported: Field does not have .isOdd()")}function x(U,h,d){let{x:u,y:p}=h.toAffine(),w=n.toBytes(u);if(qt(d,"isCompressed"),d){g();let v=!n.isOdd(p);return $(bn(v),w)}else return $(Uint8Array.of(4),w,n.toBytes(p))}function c(U){dt(U,void 0,"Point");let{publicKey:h,publicKeyUncompressed:d}=b,u=U.length,p=U[0],w=U.subarray(1);if(u===h&&(p===2||p===3)){let v=n.fromBytes(w);if(!n.isValid(v))throw new Error("bad point: is not on curve, wrong x");let E=y(v),B;try{B=n.sqrt(E)}catch(N){let L=N instanceof Error?": "+N.message:"";throw new Error("bad point: is not on curve, sqrt error"+L)}g();let S=n.isOdd(B);return(p&1)===1!==S&&(B=n.neg(B)),{x:v,y:B}}else if(u===d&&p===4){let v=n.BYTES,E=n.fromBytes(w.subarray(0,v)),B=n.fromBytes(w.subarray(v,v*2));if(!I(E,B))throw new Error("bad point: is not on curve");return{x:E,y:B}}else throw new Error(`bad point: got length ${u}, expected compressed=${h} or uncompressed=${d}`)}let l=e.toBytes||x,m=e.fromBytes||c;function y(U){let h=n.sqr(U),d=n.mul(h,U);return n.add(n.add(d,n.mul(U,s.a)),s.b)}function I(U,h){let d=n.sqr(h),u=y(U);return n.eql(d,u)}if(!I(s.Gx,s.Gy))throw new Error("bad curve params: generator point");let R=n.mul(n.pow(s.a,Qt),Kn),tt=n.mul(n.sqr(s.b),BigInt(27));if(n.is0(n.add(R,tt)))throw new Error("bad curve params: a or b");function A(U,h,d=!1){if(!n.isValid(h)||d&&n.is0(h))throw new Error(`bad point coordinate ${U}`);return h}function G(U){if(!(U instanceof _))throw new Error("ProjectivePoint expected")}function K(U){if(!a||!a.basises)throw new Error("no endo");return jn(U,a.basises,o.ORDER)}let bt=le((U,h)=>{let{X:d,Y:u,Z:p}=U;if(n.eql(p,n.ONE))return{x:d,y:u};let w=U.is0();h==null&&(h=w?n.ONE:n.inv(p));let v=n.mul(d,h),E=n.mul(u,h),B=n.mul(p,h);if(w)return{x:n.ZERO,y:n.ZERO};if(!n.eql(B,n.ONE))throw new Error("invZ was invalid");return{x:v,y:E}}),ct=le(U=>{if(U.is0()){if(e.allowInfinityPoint&&!n.is0(U.Y))return;throw new Error("bad point: ZERO")}let{x:h,y:d}=U.toAffine();if(!n.isValid(h)||!n.isValid(d))throw new Error("bad point: x or y not field elements");if(!I(h,d))throw new Error("bad point: equation left != right");if(!U.isTorsionFree())throw new Error("bad point: not in prime-order subgroup");return!0});function Z(U,h,d,u,p){return d=new _(n.mul(d.X,U),d.Y,d.Z),h=Ct(u,h),d=Ct(p,d),h.add(d)}class _{constructor(h,d,u){this.X=A("x",h),this.Y=A("y",d,!0),this.Z=A("z",u),Object.freeze(this)}static CURVE(){return s}static fromAffine(h){let{x:d,y:u}=h||{};if(!h||!n.isValid(d)||!n.isValid(u))throw new Error("invalid affine point");if(h instanceof _)throw new Error("projective point not allowed");return n.is0(d)&&n.is0(u)?_.ZERO:new _(d,u,n.ONE)}static fromBytes(h){let d=_.fromAffine(m(dt(h,void 0,"point")));return d.assertValidity(),d}static fromHex(h){return _.fromBytes(M("pointHex",h))}get x(){return this.toAffine().x}get y(){return this.toAffine().y}precompute(h=8,d=!0){return W.createCache(this,h),d||this.multiply(Qt),this}assertValidity(){ct(this)}hasEvenY(){let{y:h}=this.toAffine();if(!n.isOdd)throw new Error("Field doesn't support isOdd");return!n.isOdd(h)}equals(h){G(h);let{X:d,Y:u,Z:p}=this,{X:w,Y:v,Z:E}=h,B=n.eql(n.mul(d,E),n.mul(w,p)),S=n.eql(n.mul(u,E),n.mul(v,p));return B&&S}negate(){return new _(this.X,n.neg(this.Y),this.Z)}double(){let{a:h,b:d}=s,u=n.mul(d,Qt),{X:p,Y:w,Z:v}=this,E=n.ZERO,B=n.ZERO,S=n.ZERO,H=n.mul(p,p),N=n.mul(w,w),L=n.mul(v,v),O=n.mul(p,w);return O=n.add(O,O),S=n.mul(p,v),S=n.add(S,S),E=n.mul(h,S),B=n.mul(u,L),B=n.add(E,B),E=n.sub(N,B),B=n.add(N,B),B=n.mul(E,B),E=n.mul(O,E),S=n.mul(u,S),L=n.mul(h,L),O=n.sub(H,L),O=n.mul(h,O),O=n.add(O,S),S=n.add(H,H),H=n.add(S,H),H=n.add(H,L),H=n.mul(H,O),B=n.add(B,H),L=n.mul(w,v),L=n.add(L,L),H=n.mul(L,O),E=n.sub(E,H),S=n.mul(L,N),S=n.add(S,S),S=n.add(S,S),new _(E,B,S)}add(h){G(h);let{X:d,Y:u,Z:p}=this,{X:w,Y:v,Z:E}=h,B=n.ZERO,S=n.ZERO,H=n.ZERO,N=s.a,L=n.mul(s.b,Qt),O=n.mul(d,w),q=n.mul(u,v),C=n.mul(p,E),Y=n.add(d,u),T=n.add(w,v);Y=n.mul(Y,T),T=n.add(O,q),Y=n.sub(Y,T),T=n.add(d,p);let k=n.add(w,E);return T=n.mul(T,k),k=n.add(O,C),T=n.sub(T,k),k=n.add(u,p),B=n.add(v,E),k=n.mul(k,B),B=n.add(q,C),k=n.sub(k,B),H=n.mul(N,T),B=n.mul(L,C),H=n.add(B,H),B=n.sub(q,H),H=n.add(q,H),S=n.mul(B,H),q=n.add(O,O),q=n.add(q,O),C=n.mul(N,C),T=n.mul(L,T),q=n.add(q,C),C=n.sub(O,C),C=n.mul(N,C),T=n.add(T,C),O=n.mul(q,T),S=n.add(S,O),O=n.mul(k,T),B=n.mul(Y,B),B=n.sub(B,O),O=n.mul(Y,q),H=n.mul(k,H),H=n.add(H,O),new _(B,S,H)}subtract(h){return this.add(h.negate())}is0(){return this.equals(_.ZERO)}multiply(h){let{endo:d}=e;if(!o.isValidNot0(h))throw new Error("invalid scalar: out of range");let u,p,w=v=>W.cached(this,v,E=>$t(_,E));if(d){let{k1neg:v,k1:E,k2neg:B,k2:S}=K(h),{p:H,f:N}=w(E),{p:L,f:O}=w(S);p=N.add(O),u=Z(d.beta,H,L,v,B)}else{let{p:v,f:E}=w(h);u=v,p=E}return $t(_,[u,p])[0]}multiplyUnsafe(h){let{endo:d}=e,u=this;if(!o.isValid(h))throw new Error("invalid scalar: out of range");if(h===ft||u.is0())return _.ZERO;if(h===Ht)return u;if(W.hasCache(this))return this.multiply(h);if(d){let{k1neg:p,k1:w,k2neg:v,k2:E}=K(h),{p1:B,p2:S}=an(_,u,w,E);return Z(d.beta,B,S,p,v)}else return W.unsafe(u,h)}multiplyAndAddUnsafe(h,d,u){let p=this.multiplyUnsafe(d).add(h.multiplyUnsafe(u));return p.is0()?void 0:p}toAffine(h){return bt(this,h)}isTorsionFree(){let{isTorsionFree:h}=e;return i===Ht?!0:h?h(_,this):W.unsafe(this,f).is0()}clearCofactor(){let{clearCofactor:h}=e;return i===Ht?this:h?h(_,this):this.multiplyUnsafe(i)}isSmallOrder(){return this.multiplyUnsafe(i).is0()}toBytes(h=!0){return qt(h,"isCompressed"),this.assertValidity(),l(_,this,h)}toHex(h=!0){return ot(this.toBytes(h))}toString(){return`<Point ${this.is0()?"ZERO":this.toHex()}>`}get px(){return this.X}get py(){return this.X}get pz(){return this.Z}toRawBytes(h=!0){return this.toBytes(h)}_setWindowSize(h){this.precompute(h)}static normalizeZ(h){return $t(_,h)}static msm(h,d){return un(_,o,h,d)}static fromPrivateKey(h){return _.BASE.multiply(_t(o,h))}}_.BASE=new _(s.Gx,s.Gy,n.ONE),_.ZERO=new _(n.ZERO,n.ONE,n.ZERO),_.Fp=n,_.Fn=o;let et=o.BITS,W=new zt(_,e.endo?Math.ceil(et/2):et);return _.BASE.precompute(8),_}function bn(t){return Uint8Array.of(t?2:3)}function xn(t,e){return{secretKey:e.BYTES,publicKey:1+t.BYTES,publicKeyUncompressed:1+2*t.BYTES,publicKeyHasPrefix:!0,signature:2*e.BYTES}}function Yn(t,e={}){let{Fn:r}=t,n=e.randomBytes||Mt,o=Object.assign(xn(t.Fp,r),{seed:be(r.ORDER)});function s(l){try{return!!_t(r,l)}catch{return!1}}function i(l,m){let{publicKey:y,publicKeyUncompressed:I}=o;try{let R=l.length;return m===!0&&R!==y||m===!1&&R!==I?!1:!!t.fromBytes(l)}catch{return!1}}function f(l=n(o.seed)){return nn(dt(l,o.seed,"seed"),r.ORDER)}function a(l,m=!0){return t.BASE.multiply(_t(r,l)).toBytes(m)}function b(l){let m=f(l);return{secretKey:m,publicKey:a(m)}}function g(l){if(typeof l=="bigint")return!1;if(l instanceof t)return!0;let{secretKey:m,publicKey:y,publicKeyUncompressed:I}=o;if(r.allowedLengths||m===y)return;let R=M("key",l).length;return R===y||R===I}function x(l,m,y=!0){if(g(l)===!0)throw new Error("first arg must be private key");if(g(m)===!1)throw new Error("second arg must be public key");let I=_t(r,l);return t.fromHex(m).multiply(I).toBytes(y)}return Object.freeze({getPublicKey:a,getSharedSecret:x,keygen:b,Point:t,utils:{isValidSecretKey:s,isValidPublicKey:i,randomSecretKey:f,isValidPrivateKey:s,randomPrivateKey:f,normPrivateKeyToScalar:l=>_t(r,l),precompute(l=8,m=t.BASE){return m.precompute(l,!1)}},lengths:o})}function Pn(t,e,r={}){Dt(e),Nt(r,{},{hmac:"function",lowS:"boolean",randomBytes:"function",bits2int:"function",bits2int_modN:"function"});let n=r.randomBytes||Mt,o=r.hmac||((d,...u)=>se(e,d,$(...u))),{Fp:s,Fn:i}=t,{ORDER:f,BITS:a}=i,{keygen:b,getPublicKey:g,getSharedSecret:x,utils:c,lengths:l}=Yn(t,r),m={prehash:!1,lowS:typeof r.lowS=="boolean"?r.lowS:!1,format:void 0,extraEntropy:!1},y="compact";function I(d){let u=f>>Ht;return d>u}function R(d,u){if(!i.isValidNot0(u))throw new Error(`invalid signature ${d}: out of range 1..Point.Fn.ORDER`);return u}function tt(d,u){we(u);let p=l.signature,w=u==="compact"?p:u==="recovered"?p+1:void 0;return dt(d,w,`${u} signature`)}class A{constructor(u,p,w){this.r=R("r",u),this.s=R("s",p),w!=null&&(this.recovery=w),Object.freeze(this)}static fromBytes(u,p=y){tt(u,p);let w;if(p==="der"){let{r:S,s:H}=it.toSig(dt(u));return new A(S,H)}p==="recovered"&&(w=u[0],p="compact",u=u.subarray(1));let v=i.BYTES,E=u.subarray(0,v),B=u.subarray(v,v*2);return new A(i.fromBytes(E),i.fromBytes(B),w)}static fromHex(u,p){return this.fromBytes(gt(u),p)}addRecoveryBit(u){return new A(this.r,this.s,u)}recoverPublicKey(u){let p=s.ORDER,{r:w,s:v,recovery:E}=this;if(E==null||![0,1,2,3].includes(E))throw new Error("recovery id invalid");if(f*hn<p&&E>1)throw new Error("recovery id is ambiguous for h>1 curve");let S=E===2||E===3?w+f:w;if(!s.isValid(S))throw new Error("recovery id 2 or 3 invalid");let H=s.toBytes(S),N=t.fromBytes($(bn((E&1)===0),H)),L=i.inv(S),O=K(M("msgHash",u)),q=i.create(-O*L),C=i.create(v*L),Y=t.BASE.multiplyUnsafe(q).add(N.multiplyUnsafe(C));if(Y.is0())throw new Error("point at infinify");return Y.assertValidity(),Y}hasHighS(){return I(this.s)}toBytes(u=y){if(we(u),u==="der")return gt(it.hexFromSig(this));let p=i.toBytes(this.r),w=i.toBytes(this.s);if(u==="recovered"){if(this.recovery==null)throw new Error("recovery bit must be present");return $(Uint8Array.of(this.recovery),p,w)}return $(p,w)}toHex(u){return ot(this.toBytes(u))}assertValidity(){}static fromCompact(u){return A.fromBytes(M("sig",u),"compact")}static fromDER(u){return A.fromBytes(M("sig",u),"der")}normalizeS(){return this.hasHighS()?new A(this.r,i.neg(this.s),this.recovery):this}toDERRawBytes(){return this.toBytes("der")}toDERHex(){return ot(this.toBytes("der"))}toCompactRawBytes(){return this.toBytes("compact")}toCompactHex(){return ot(this.toBytes("compact"))}}let G=r.bits2int||function(u){if(u.length>8192)throw new Error("input is too large");let p=St(u),w=u.length*8-a;return w>0?p>>BigInt(w):p},K=r.bits2int_modN||function(u){return i.create(G(u))},bt=ht(a);function ct(d){return Ge("num < 2^"+a,d,ft,bt),i.toBytes(d)}function Z(d,u){return dt(d,void 0,"message"),u?dt(e(d),void 0,"prehashed message"):d}function _(d,u,p){if(["recovered","canonical"].some(q=>q in p))throw new Error("sign() legacy options not supported");let{lowS:w,prehash:v,extraEntropy:E}=me(p,m);d=Z(d,v);let B=K(d),S=_t(i,u),H=[ct(S),ct(B)];if(E!=null&&E!==!1){let q=E===!0?n(l.secretKey):E;H.push(M("extraEntropy",q))}let N=$(...H),L=B;function O(q){let C=G(q);if(!i.isValidNot0(C))return;let Y=i.inv(C),T=t.BASE.multiply(C).toAffine(),k=i.create(T.x);if(k===ft)return;let Vt=i.create(Y*i.create(L+k*S));if(Vt===ft)return;let Ee=(T.x===k?0:2)|Number(T.y&Ht),ve=Vt;return w&&I(Vt)&&(ve=i.neg(Vt),Ee^=1),new A(k,ve,Ee)}return{seed:N,k2sig:O}}function et(d,u,p={}){d=M("message",d);let{seed:w,k2sig:v}=_(d,u,p);return Ye(e.outputLen,i.BYTES,o)(w,v)}function W(d){let u,p=typeof d=="string"||pt(d),w=!p&&d!==null&&typeof d=="object"&&typeof d.r=="bigint"&&typeof d.s=="bigint";if(!p&&!w)throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");if(w)u=new A(d.r,d.s);else if(p){try{u=A.fromBytes(M("sig",d),"der")}catch(v){if(!(v instanceof it.Err))throw v}if(!u)try{u=A.fromBytes(M("sig",d),"compact")}catch{return!1}}return u||!1}function U(d,u,p,w={}){let{lowS:v,prehash:E,format:B}=me(w,m);if(p=M("publicKey",p),u=Z(M("message",u),E),"strict"in w)throw new Error("options.strict was renamed to lowS");let S=B===void 0?W(d):A.fromBytes(M("sig",d),B);if(S===!1)return!1;try{let H=t.fromBytes(p);if(v&&S.hasHighS())return!1;let{r:N,s:L}=S,O=K(u),q=i.inv(L),C=i.create(O*q),Y=i.create(N*q),T=t.BASE.multiplyUnsafe(C).add(H.multiplyUnsafe(Y));return T.is0()?!1:i.create(T.x)===N}catch{return!1}}function h(d,u,p={}){let{prehash:w}=me(p,m);return u=Z(u,w),A.fromBytes(d,"recovered").recoverPublicKey(u).toBytes()}return Object.freeze({keygen:b,getPublicKey:g,getSharedSecret:x,utils:c,lengths:l,Point:t,sign:et,verify:U,recoverPublicKey:h,Signature:A,hash:e})}function Wn(t){let e={a:t.a,b:t.b,p:t.Fp.ORDER,n:t.n,h:t.h,Gx:t.Gx,Gy:t.Gy},r=t.Fp,n=t.allowedPrivateKeyLengths?Array.from(new Set(t.allowedPrivateKeyLengths.map(i=>Math.ceil(i/2)))):void 0,o=F(e.n,{BITS:t.nBitLength,allowedLengths:n,modFromBytes:t.wrapPrivateKey}),s={Fp:r,Fn:o,allowInfinityPoint:t.allowInfinityPoint,endo:t.endo,isTorsionFree:t.isTorsionFree,clearCofactor:t.clearCofactor,fromBytes:t.fromBytes,toBytes:t.toBytes};return{CURVE:e,curveOpts:s}}function Xn(t){let{CURVE:e,curveOpts:r}=Wn(t),n={hmac:t.hmac,randomBytes:t.randomBytes,lowS:t.lowS,bits2int:t.bits2int,bits2int_modN:t.bits2int_modN};return{CURVE:e,curveOpts:r,hash:t.hash,ecdsaOpts:n}}function zn(t,e){let r=e.Point;return Object.assign({},e,{ProjectivePoint:r,CURVE:Object.assign({},t,Xt(r.Fn.ORDER,r.Fn.BITS))})}function pn(t){let{CURVE:e,curveOpts:r,hash:n,ecdsaOpts:o}=Xn(t),s=Gn(e,r),i=Pn(s,n,o);return zn(t,i)}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */function Jt(t,e){let r=n=>pn({...t,hash:n});return{...r(e),create:r}}/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */var gn={p:BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff"),n:BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551"),h:BigInt(1),a:BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc"),b:BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b"),Gx:BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296"),Gy:BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5")},mn={p:BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000ffffffff"),n:BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf581a0db248b0a77aecec196accc52973"),h:BigInt(1),a:BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffeffffffff0000000000000000fffffffc"),b:BigInt("0xb3312fa7e23ee7e4988e056be3f82d19181d9c6efe8141120314088f5013875ac656398d8a2ed19d2a85c8edd3ec2aef"),Gx:BigInt("0xaa87ca22be8b05378eb1c71ef320ad746e1d3b628ba79b9859f741e082542a385502f25dbf55296c3a545e3872760ab7"),Gy:BigInt("0x3617de4a96262c6f5d9e98bf9292dc29f8f41dbd289a147ce9da3113b5f0b8c00a60b1ce1d7e819d7a431d7c90ea0e5f")},wn={p:BigInt("0x1ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),n:BigInt("0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409"),h:BigInt(1),a:BigInt("0x1fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc"),b:BigInt("0x0051953eb9618e1c9a1f929a21a0b68540eea2da725b99b315f3b8b489918ef109e156193951ec7e937b1652c0bd3bb1bf073573df883d2c34f1ef451fd46b503f00"),Gx:BigInt("0x00c6858e06b70404e9cd9e3ecb662395b4429c648139053fb521f828af606b4d3dbaa14b5e77efe75928fe1dc127a2ffa8de3348b3c1856a429bf97e7e31c2e5bd66"),Gy:BigInt("0x011839296a789a3bc0045c8a5fb42c7d1bd998f54449579b446817afbd17273e662c97ee72995ef42640c550b9013fad0761353c7086a272c24088be94769fd16650")},$n=F(gn.p),Qn=F(mn.p),Jn=F(wn.p);var Ft=Jt({...gn,Fp:$n,lowS:!1},Ze);var Tr=Jt({...mn,Fp:Qn,lowS:!1},Me);var Nr=Jt({...wn,Fp:Jn,lowS:!1,allowedPrivateKeyLengths:[130,131,132]},ke);function Be(t){let e="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_",r="";for(let n=0;n<t.length;n+=3){let o=t[n],s=t[n+1]||0,i=t[n+2]||0;r+=e[o>>>2]+e[(o&3)<<4|s>>>4],n+1<t.length&&(r+=e[(s&15)<<2|i>>>6]),n+2<t.length&&(r+=e[i&63])}return r}function Fn(t){if(typeof crypto>"u"||typeof crypto.getRandomValues!="function")throw new Error("Byse fingerprint requires secure random bytes");let e=new Uint8Array(32);for(let r=0;r<128&&(crypto.getRandomValues(e),!Ft.utils.isValidPrivateKey(e));r+=1)if(r===127)throw new Error("Byse P-256 key generation failed");try{let r=Ft.getPublicKey(e,!1),n=unescape(encodeURIComponent(String(t))),o=new Uint8Array(n.length);for(let i=0;i<n.length;i+=1)o[i]=n.charCodeAt(i);let s=Ft.sign(o,e,{prehash:!0}).toCompactRawBytes();return{signature:Be(s),public_key:{kty:"EC",crv:"P-256",x:Be(r.subarray(1,33)),y:Be(r.subarray(33,65)),ext:!0,key_ops:["verify"]}}}finally{e.fill(0)}}return An(tr);})();

function byseDecodeUtf8(value) {
  var bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (typeof TextDecoder === "function") return new TextDecoder().decode(bytes);
  var encoded = "";
  for (var index = 0; index < bytes.length; index += 1) {
    encoded += "%" + ("0" + bytes[index].toString(16)).slice(-2);
  }
  return decodeURIComponent(encoded);
}

(function() {
  PLUGIN_VERSION = "2.0.6";

  apiJson = function(url, options) {
    options = options || {};
    var headers = Object.assign({}, FETCH_HEADERS, {
      Accept: "application/json",
      "Content-Type": "application/json"
    }, options.headers || {});
    var request = { method: options.method || "GET", headers: headers };
    if (options.credentials) request.credentials = options.credentials;
    if (options.body !== undefined) request.body = options.body;
    return fetchWithTimeout(url, request, options.timeoutMs).then(function(response) {
      return response.text().then(function(text) {
        var data;
        try { data = text ? JSON.parse(text) : {}; }
        catch (error) { throw new Error("Byse API returned non-JSON (HTTP " + response.status + ")"); }
        if (!response.ok) {
          var reason = data && (data.error || data.message || data.reason);
          throw new Error("HTTP " + response.status + (reason ? ": " + String(reason).slice(0, 240) : ""));
        }
        if (!data || typeof data !== "object") throw new Error("Byse API returned an empty response");
        return data;
      });
    }).catch(function(error) {
      var endpoint = String(url).replace(/^https?:\/\/[^/]+/i, "").split("?")[0];
      throw new Error(endpoint + ": " + String(error && error.message || error));
    });
  };

  createByseFingerprint = function(apiOrigin) {
    var headers = { Referer: apiOrigin, Origin: apiOrigin };
    return apiJson(apiOrigin + "/api/videos/access/challenge", {
      method: "POST", credentials: "include", headers: headers, body: "{}"
    }).then(function(challenge) {
      if (!challenge.challenge_id || !challenge.nonce) throw new Error("Byse access challenge incomplete");
      // Nuvio provides secure randomness but cannot generate/export P-256 JWK key pairs.
      var proof = bysePortableP256.signChallenge(challenge.nonce);
      return apiJson(apiOrigin + "/api/videos/access/attest", {
        method: "POST", credentials: "include", headers: headers,
        body: JSON.stringify({
          viewer_id: "", device_id: "", challenge_id: challenge.challenge_id,
          nonce: challenge.nonce, signature: proof.signature, public_key: proof.public_key,
          client: {
            user_agent: FETCH_HEADERS["User-Agent"], languages: ["ro-RO", "en-US"], timezone: "UTC",
            extra: { vendor: "", appVersion: FETCH_HEADERS["User-Agent"] }
          },
          storage: {}, attributes: { entropy: "low" }
        })
      });
    }).then(function(attestation) {
      if (!attestation.token) throw new Error("Byse fingerprint rejected");
      return {
        token: attestation.token, viewer_id: attestation.viewer_id || "",
        device_id: attestation.device_id || "", confidence: attestation.confidence || 0
      };
    }).catch(function(error) {
      throw new Error("Byse fingerprint: " + String(error && error.message || error));
    });
  };

  var originalSolvePow = solveBysePow;
  solveBysePow = function(nonce, difficulty, timeoutMs) {
    var started = Date.now();
    if (typeof console !== "undefined" && console.log) console.log("[Byse 2.0.6] PoW difficulty", difficulty);
    return Promise.resolve().then(function() {
      return originalSolvePow(nonce, difficulty, timeoutMs);
    }).then(function(solution) {
      if (typeof console !== "undefined" && console.log) {
        console.log("[Byse 2.0.6] PoW", solution === null ? "timeout" : "solved", Date.now() - started, "ms");
      }
      return solution;
    });
  };
})();
