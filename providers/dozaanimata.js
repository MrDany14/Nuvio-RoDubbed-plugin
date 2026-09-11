// providers/dozaanimata.js

async function getStreams(tmdbId, mediaType, season, episode) {
    const TMDB_KEY = "ccd8c6e162505e91ef8dc65b323ff4be";
    
    // Advanced: Spoofing a Sony Bravia Android TV browser
    const HEADERS = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 11; BRAVIA 4K UR3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7"
    };

    try {
        // 1. Fetch exact metadata for strict matching & release year
        const tmdbRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_KEY}&language=ro-RO`);
        const tmdbData = await tmdbRes.json();
        
        const title = tmdbData.title || tmdbData.name || tmdbData.original_title;
        if (!title) return [];
        
        // Extract the 4-digit release year (if available) for precision movie matching
        const releaseYear = (tmdbData.release_date || tmdbData.first_air_date || "").substring(0, 4);

        // 2. Execute search with disguised TV headers
        const searchUrl = `https://dozaanimata.net/?s=${encodeURIComponent(title)}`;
        const searchRes = await fetch(searchUrl, { headers: HEADERS });
        const searchHtml = await searchRes.text();

        // 3. Strict Parsing: Capture URL and Link Text
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
        let match;
        let exactPostUrl = null;
        
        // Create a URL-safe slug from the Romanian title (e.g., "regele-leu")
        const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        while ((match = linkRegex.exec(searchHtml)) !== null) {
            const link = match[1].toLowerCase();
            const postText = match[2].toLowerCase();
            
            // Skip utility links, categories, pagination, and tags
            if (link.includes('/category/') || link.includes('/genre/') || link.includes('/page/') || link.includes('/tag/')) {
                continue;
            }

            if (mediaType === "tv") {
                // TV Verification: Ensure URL is an episode and matches the exact season/episode pattern
                const epSlug = `sezonul-${season}-episodul-${episode}`;
                if (link.includes('/episode/') && link.includes(epSlug)) {
                    exactPostUrl = match[1]; // Maintain original capitalization for the fetch
                    break;
                }
            } else {
                // Movie Verification: Match title slug, ensure it is NOT a TV episode post
                if (link.includes(titleSlug) && !link.includes('/episode/')) {
                    // Strict check: Prioritize links/text that actually include the TMDB release year
                    if (releaseYear && (link.includes(releaseYear) || postText.includes(releaseYear))) {
                        exactPostUrl = match[1];
                        break;
                    } else if (!exactPostUrl) {
                        // Fallback to the first matching slug if the site didn't list the year
                        exactPostUrl = match[1];
                    }
                }
            }
        }

        // Fast fail if the exact movie/episode isn't found
        if (!exactPostUrl) return [];

        // 4. Fetch the specific movie/episode page
        const postRes = await fetch(exactPostUrl, { headers: HEADERS });
        const postHtml = await postRes.text();

        // 5. Extract video players and filter out ads/junk
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let iframeMatch;
        const streams = [];
        let serverCount = 1;

        while ((iframeMatch = iframeRegex.exec(postHtml)) !== null) {
            const src = iframeMatch[1];
            
            // Advanced: Ignore ad-tracking iframes, YouTube trailers, and social plugins
            if (!src.includes("facebook.com") && 
                !src.includes("youtube.com") && 
                !src.includes("doubleclick") && 
                !src.includes("googletagmanager") &&
                !src.includes("twitter.com")) {
                
                streams.push({
                    name: "DozaAnimata",
                    title: `Server ${serverCount++} - RO Dub`,
                    url: src,
                    quality: "1080p",
                    headers: { 
                        "Referer": "https://dozaanimata.net/",
                        "User-Agent": HEADERS["User-Agent"]
                    }
                });
            }
        }

        return streams;
    } catch (error) {
        // Advanced: Silent error handling prevents the whole Nuvio app from crashing
        console.log("[DozaAnimata Pro] Scrape failed silently:", error.message);
        return [];
    }
}

module.exports = { getStreams };
