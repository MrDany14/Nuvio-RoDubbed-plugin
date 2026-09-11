async function getStreams(tmdbId, mediaType, season, episode) {
    const TMDB_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
    
    // Advanced: Spoofing an Android TV browser to bypass basic anti-bot checks
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
    };

    try {
        // 1. Fetch exact metadata for strict matching
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ro-RO`);
        const tmdbData = await tmdbRes.json();
        
        const title = tmdbData.title || tmdbData.name || tmdbData.original_title;
        if (!title) return [];

        // 2. Execute search with disguised headers
        const searchUrl = `https://desenefaine.com/?s=${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        const searchHtml = await searchRes.text();

        // 3. Strict parsing: Capture both the URL and the Post Title
        const postRegex = /<h2 class="entry-title">\s*<a href="([^"]+)">([^<]+)<\/a>/gi;
        let match;
        let exactPostUrl = null;

        while ((match = postRegex.exec(searchHtml)) !== null) {
            const link = match[1];
            const postTitle = match[2].toLowerCase();
            
            if (mediaType === "tv") {
                // TV verification: Ensure the URL contains the exact season and episode
                if (link.includes(`sezonul-${season}-episodul-${episode}`)) {
                    exactPostUrl = link;
                    break;
                }
            } else {
                // Movie verification: Ensure the title matches exactly to avoid pulling sequels
                if (postTitle.includes(title.toLowerCase())) {
                    exactPostUrl = link;
                    break;
                }
            }
        }

        // Fast fail if the exact movie/episode isn't found
        if (!exactPostUrl) return [];

        // 4. Fetch the specific movie/episode page
        const postRes = await fetch(exactPostUrl, { headers: HEADERS });
        const postHtml = await postRes.text();

        // 5. Extract video players and filter out ads
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let iframeMatch;
        const streams = [];
        let serverCount = 1;

        while ((iframeMatch = iframeRegex.exec(postHtml)) !== null) {
            const src = iframeMatch[1];
            
            // Advanced: Ignore ad-tracking iframes and trailer embeds
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
    } catch (error) {
        // Advanced: Silent error handling prevents Nuvio from crashing
        console.log("[DeseneFaine Pro] Scrape failed silently:", error.message);
        return [];
    }
}

module.exports = { getStreams };
