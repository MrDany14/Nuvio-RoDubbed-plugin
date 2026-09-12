var PROVIDER_NAME = "Playback Test";

function getStreams(id, type, season, episode) {
  // Your known working m3u8 link
  var testUrl = "https://edge1-waw-sprintcdn.r66nv9ed.com/hls2/09/11890/or1lcx08t6vd_x/master.m3u8?t=_6IdG6CIqk177gxAmMeRgb_wJ4kgASmq5SEsRZB-AEU&s=1789245151&e=10800&f=59454277&srv=1050&asn=8708&sp=5500&p=0";
  
  var userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  
  var streams = [
    {
      name: "Test 1 | Standard Headers",
      title: "Uses Nuvio's object headers",
      url: testUrl,
      quality: "1080p",
      isM3U8: true,
      behaviorHints: { bingeGroup: "test-1" },
      headers: {
        "Referer": "https://player4me.com/",
        "Origin": "https://player4me.com",
        "User-Agent": userAgent
      },
      provider: "desenefaine"
    },
    {
      name: "Test 2 | No Headers",
      title: "Tests if the CDN ignores headers",
      url: testUrl,
      quality: "1080p",
      isM3U8: true,
      behaviorHints: { bingeGroup: "test-2" },
      provider: "desenefaine"
    },
    {
      name: "Test 3 | Appended Headers",
      title: "VLC/ExoPlayer style appended URL headers",
      // Some Android players require headers built into the URL string
      url: testUrl + "|Referer=https://player4me.com/&User-Agent=" + encodeURIComponent(userAgent),
      quality: "1080p",
      isM3U8: true,
      behaviorHints: { bingeGroup: "test-3" },
      provider: "desenefaine"
    }
  ];

  return Promise.resolve(streams);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
