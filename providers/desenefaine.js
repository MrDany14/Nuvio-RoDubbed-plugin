function getStreams(tmdbId, mediaType, season, episode) {
    const TMDB_KEY = "5201b54eb0a60ac2778dc965256f3f01";
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
    };

    return fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ro-RO`)
        .then(res => res.json())
        .then(tmdbData => {
            const title = tmdbData.title || tmdbData.name || tmdbData.original_title;
            if (!title) return [];

            const searchUrl = `https://desenefaine.com/?s=${encodeURIComponent(title)}`;
            return fetch(searchUrl, { headers: HEADERS })
                .then(searchRes => searchRes.text())
                .then(searchHtml => {
                    const postRegex = /<h2 class="entry-title">\s*<a href="([^"]+)">([^<]+)<\/a>/gi;
                    let match;
                    let exactPostUrl = null;

                    while ((match = postRegex.exec(searchHtml)) !== null) {
                        const link = match[1];
                        const postTitle = match[2].toLowerCase();
                        
                        if (mediaType === "tv") {
                            if (link.includes(`sezonul-${season}-episodul-${episode}`)) {
                                exactPostUrl = link;
                                break;
                            }
                        } else {
                            if (postTitle.includes(title.toLowerCase())) {
                                exactPostUrl = link;
                                break;
                            }
                        }
                    }

                    if (!exactPostUrl) return [];

                    return fetch(exactPostUrl, { headers: HEADERS })
                        .then(postRes => postRes.text())
                        .then(postHtml => {
                            const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
                            let iframeMatch;
                            const streams = [];
                            let serverCount = 1;

                            while ((iframeMatch = iframeRegex.exec(postHtml)) !== null) {
                                const src = iframeMatch[1];
                                if (!src.includes("facebook.com") && !src.includes("youtube.com") && !src.includes("doubleclick")) {
                                    streams.push({
                                        name: "DeseneFaine",
                                        title: `Server ${serverCount++} - RO Dub`,
                                        url: src,
                                        quality: "1080p",
                                        headers: { 
                                            "Referer": "https://desenefaine.com/",
                                            "User-Agent": HEADERS["User-Agent"]
                                        }
                                    });
                                }
                            }
                            return streams;
                        });
                });
        })
        .catch(error => {
            console.log("[DeseneFaine Pro] Scrape failed:", error.message);
            return [];
        });
}

module.exports = { getStreams };
