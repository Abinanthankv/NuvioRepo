// Scloudx Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');
const config = require('./config.js');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Scloudx Configuration
const MAIN_URL = config.MAIN_URL || "https://scloudx.lol";

// Build headers with Cloudflare cookie if available
function getHeaders() {
    const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const headers = {
        "User-Agent": config.USER_AGENT || defaultUA,
        "Referer": `${MAIN_URL}/`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "DNT": "1"
    };

    // Add Client Hints if available
    if (config.CLIENT_HINTS) {
        Object.assign(headers, config.CLIENT_HINTS);
    }

    // Prefer ALL_COOKIES if configured (full session string)
    if (config.ALL_COOKIES && config.ALL_COOKIES.length > 20) {
        headers["Cookie"] = config.ALL_COOKIES;
        console.log("[Scloudx] Using ALL_COOKIES from config");
    }
    // Fallback to just cf_clearance
    else if (config.CF_CLEARANCE && config.CF_CLEARANCE.length > 20 && config.CF_CLEARANCE !== "YOUR_CF_CLEARANCE_COOKIE_HERE") {
        headers["Cookie"] = `cf_clearance=${config.CF_CLEARANCE}`;
        console.log("[Scloudx] Using configured cf_clearance cookie");
    } else {
        console.warn("[Scloudx] No Cloudflare cookies configured - requests will likely be blocked");
    }

    return headers;
}

const HEADERS = getHeaders();

// =================================================================================
// UTILITY FUNCTIONS
// =================================================================================

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: 'follow'
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
    }
}

/**
 * Normalizes title for comparison
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Converts string to Title Case
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(function (word) {
        return (word.charAt(0).toUpperCase() + word.slice(1));
    }).join(' ');
}

/**
 * Calculates similarity score between two titles
 */
function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    if (norm1 === norm2) return 1.0;

    // Check if one is a substantial part of the other
    if (norm1.length > 5 && norm2.length > 5) {
        if (norm2.includes(norm1) || norm1.includes(norm2)) {
            return 0.9;
        }
    }

    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

/**
 * Finds the best title match from search results
 */
function findBestTitleMatch(mediaInfo, searchResults, season = null, episode = null) {
    if (!searchResults || searchResults.length === 0) return null;

    const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;
    let bestMatch = null;
    let bestScore = 0;

    for (const result of searchResults) {
        let score = calculateTitleSimilarity(mediaInfo.title, result.title);

        // Boost score if year matches
        if (targetYear && result.title.includes(targetYear.toString())) {
            score += 0.2;
        }

        // For TV shows, check season/episode match
        if (season !== null) {
            const seasonPattern = new RegExp(`s0*${season}`, 'i');
            if (seasonPattern.test(result.title)) {
                score += 0.3;
            } else {
                score -= 0.3; // Penalize if season doesn't match
            }
        }

        if (episode !== null) {
            const episodePattern = new RegExp(`e0*${episode}`, 'i');
            if (episodePattern.test(result.title)) {
                score += 0.3;
            } else {
                score -= 0.3; // Penalize if episode doesn't match
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    if (bestMatch && bestScore > 0.4) {
        console.log(`[Scloudx] Best match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    return null;
}

/**
 * Formats a rich multi-line title for a stream
 */
function formatStreamTitle(mediaInfo, stream) {
    const title = toTitleCase(mediaInfo.title || "Unknown");
    const year = mediaInfo.year || "";
    const size = stream.size || "";

    // Extract quality from filename
    let quality = "HD";
    const qualityMatch = stream.title.match(/\b(2160p|1080p|720p|480p|360p|4K)\b/i);
    if (qualityMatch) quality = qualityMatch[0];

    // Extract type
    let type = "";
    const searchString = stream.title.toLowerCase();
    if (searchString.includes('bluray') || searchString.includes('brrip')) type = "BluRay";
    else if (searchString.includes('web-dl')) type = "WEB-DL";
    else if (searchString.includes('webrip')) type = "WEBRip";
    else if (searchString.includes('hdrip')) type = "HDRip";
    else if (searchString.includes('dvdrip')) type = "DVDRip";
    else if (searchString.includes('hdtv')) type = "HDTV";

    // Extract Season/Episode info
    let seInfo = "";
    const sMatch = searchString.match(/s(\d+)/i);
    const eMatch = searchString.match(/e(\d+)/i);

    if (sMatch) seInfo += ` S${sMatch[1].padStart(2, '0')}`;
    if (eMatch) seInfo += ` E${eMatch[1].padStart(2, '0')}`;

    const typeLine = type ? `📹: ${type}\n` : "";
    const sizeLine = size ? `💾: ${size} | 🚜: scloudx\n` : "";
    const yearStr = year && year !== "N/A" ? ` ${year}` : "";

    // Detect language
    let language = "ENGLISH";
    if (/hindi/i.test(searchString)) language = "HINDI";
    else if (/tamil/i.test(searchString)) language = "TAMIL";
    else if (/telugu/i.test(searchString)) language = "TELUGU";
    else if (/malayalam/i.test(searchString)) language = "MALAYALAM";
    else if (/multi/i.test(searchString)) language = "MULTI AUDIO";

    return `Scloudx (Instant) (${quality})
${typeLine}📼: ${title}${yearStr}${seInfo} ${quality}
${sizeLine}🌐: ${language}`;
}

// =================================================================================
// CORE FUNCTIONS
// =================================================================================

async function getTMDBDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    try {
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const info = {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").split("-")[0]
        };
        console.log(`[Scloudx] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
        return info;
    } catch (error) {
        console.error("[Scloudx] Error fetching TMDB metadata:", error.message);
        throw error;
    }
}

async function searchTMDBByTitle(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;

    try {
        console.log(`[Scloudx] Searching TMDB for: "${title}"`);
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const firstResult = data.results[0];
            const info = {
                title: firstResult.title || firstResult.name,
                year: (firstResult.release_date || firstResult.first_air_date || "").split("-")[0]
            };
            console.log(`[Scloudx] TMDB Search Result: "${info.title}" (${info.year || 'N/A'})`);
            return info;
        }

        console.log(`[Scloudx] No TMDB results found for "${title}"`);
        return null;
    } catch (error) {
        console.error("[Scloudx] Error searching TMDB:", error.message);
        return null;
    }
}

/**
 * Searches Scloudx for content using the token system
 */
async function search(query, mediaType, season = null, episode = null) {
    console.log(`[Scloudx] Searching for: "${query}" (type: ${mediaType}, S:${season}, E:${episode})`);

    try {
        // Build search query
        let searchQuery = query;

        // For TV shows, add season/episode to search
        if (mediaType === 'tv' && season !== null) {
            searchQuery += ` s${String(season).padStart(2, '0')}`;
            if (episode !== null) {
                searchQuery += ` e${String(episode).padStart(2, '0')}`;
            }
        }

        const tokenEndpoint = `${MAIN_URL}/get-search-token`;
        console.log(`[Scloudx] Getting search token from: ${tokenEndpoint}`);

        const searchHeaders = {
            ...HEADERS,
            "Content-Type": "application/x-www-form-urlencoded",
        };

        const body = `search_query=${encodeURIComponent(searchQuery)}`;

        // Step 1: POST to get-search-token
        let response = await fetchWithTimeout(tokenEndpoint, {
            method: 'POST',
            headers: searchHeaders,
            body: body,
            redirect: 'follow'
        }, 15000);

        if (!response.ok && response.status !== 302) {
            console.error(`[Scloudx] Token retrieval failed with status: ${response.status}`);
            return [];
        }

        // If it was a redirect (some fetch implementations handle it, some don't with manual)
        // We use redirect: 'follow' by default in our fetchWithTimeout

        const html = await response.text();

        // Check if we got Cloudflare challenge page
        if (html.includes('Just a moment') || html.includes('challenge-platform')) {
            console.error("[Scloudx] Cloudflare challenge detected - cannot proceed with simple fetch");
            // If we have a direct search results URL from the response (e.g. if we were redirected)
            // but still got a challenge, it means the session/token isn't enough to bypass CF
            return [];
        }

        const $ = cheerio.load(html);
        const results = [];

        // Parse search results
        $('div.result-item').each((i, el) => {
            const $result = $(el);

            // Get title from h3
            const title = $result.find('h3.result-title').text().trim();

            // Get size from data attribute
            const size = $result.attr('data-size');

            // Get download URL from checkbox data-url attribute
            const downloadUrl = $result.find('input.copy-checkbox').attr('data-url');

            // Get detail page link (optional, for reference)
            const detailLink = $result.find('a[href^="/file/"]').attr('href');

            if (title && downloadUrl) {
                results.push({
                    title: title,
                    size: size,
                    url: downloadUrl,
                    detailLink: detailLink ? `${MAIN_URL}${detailLink}` : null
                });
            }
        });

        console.log(`[Scloudx] Found ${results.length} results`);
        return results;

    } catch (error) {
        console.error("[Scloudx] Search error:", error.message);
        return [];
    }
}

/**
 * Main function for Nuvio integration
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType === 'movie') {
        season = null;
        episode = null;
    }
    console.log(`[Scloudx] Processing ${mediaType} ${tmdbId} (S:${season}, E:${episode})`);

    try {
        let mediaInfo;
        const isNumericId = /^\d+$/.test(tmdbId);

        if (isNumericId) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (error) {
                mediaInfo = { title: tmdbId, year: null };
            }
        } else {
            try {
                const tmdbResult = await searchTMDBByTitle(tmdbId, mediaType);
                mediaInfo = tmdbResult || { title: tmdbId, year: null };
            } catch (error) {
                mediaInfo = { title: tmdbId, year: null };
            }
        }

        let searchResults = await search(mediaInfo.title, mediaType, season, episode);

        if (searchResults.length === 0) {
            console.warn("[Scloudx] No search results found");
            return [];
        }

        // For TV shows, filter by season/episode
        if (mediaType === 'tv' && season !== null) {
            const seasonPattern = new RegExp(`s0*${season}`, 'i');
            searchResults = searchResults.filter(r => seasonPattern.test(r.title));

            if (episode !== null) {
                const episodePattern = new RegExp(`e0*${episode}`, 'i');
                searchResults = searchResults.filter(r => episodePattern.test(r.title));
            }
        }

        console.log(`[Scloudx] After filtering: ${searchResults.length} results`);

        // Limit to top 10 results
        const limitedResults = searchResults.slice(0, 10);

        // Convert to stream objects
        const finalStreams = limitedResults.map(result => ({
            name: "Scloudx",
            title: formatStreamTitle(mediaInfo, result),
            url: result.url,
            quality: result.title.match(/\b(2160p|1080p|720p|480p|360p|4K)\b/i)?.[0] || "HD",
            headers: {
                "Referer": MAIN_URL,
                "User-Agent": HEADERS["User-Agent"]
            },
            provider: 'Scloudx'
        }));

        console.log(`[Scloudx] Found ${finalStreams.length} final streamable links`);
        return finalStreams;
    } catch (error) {
        console.error("[Scloudx] Error in getStreams:", error.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
