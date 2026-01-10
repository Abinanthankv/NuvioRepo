// Movies4u Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Movies4u Configuration
const MAIN_URL = "https://movies4u.fans";
const M4UPLAY_BASE = "https://m4uplay.com";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": `${MAIN_URL}/`,
};

/**
 * Fetch with timeout to prevent hanging requests
 */
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
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
 * @param {string} title 
 * @returns {string}
 */
function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calculates similarity score between two titles
 * @param {string} title1 First title
 * @param {string} title2 Second title
 * @returns {number} Similarity score (0-1)
 */
function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    // Exact match after normalization
    if (norm1 === norm2) return 1.0;

    // Substring matches
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 0.9;

    // Word-based similarity
    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

/**
 * Finds the best title match from search results
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} searchResults Search results array
 * @returns {Object|null} Best matching result
 */
function findBestTitleMatch(mediaInfo, searchResults) {
    if (!searchResults || searchResults.length === 0) return null;

    const targetTitle = mediaInfo.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;

    let bestMatch = null;
    let bestScore = 0;

    for (const result of searchResults) {
        const normalizedResultTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, "");

        let score = calculateTitleSimilarity(mediaInfo.title, result.title);

        // Title match logic
        const titleMatch = normalizedResultTitle.includes(targetTitle) || targetTitle.includes(normalizedResultTitle);

        // Year matching logic
        const yearMatch = !targetYear ||
            result.title.includes(targetYear.toString()) ||
            result.title.includes((targetYear + 1).toString()) ||
            result.title.includes((targetYear - 1).toString());

        if (titleMatch && yearMatch) {
            score += 0.5; // High priority for match logic
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    if (bestMatch && bestScore > 0.4) {
        console.log(`[Movies4u] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    return null;
}

// =================================================================================
// DEOBFUSCATION
// =================================================================================

/**
 * De-obfuscates Packer-encoded string
 */
function unpack(p, a, c, k) {
    while (c--) {
        if (k[c]) {
            const placeholder = c.toString(a);
            p = p.replace(new RegExp('\\b' + placeholder + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

/**
 * Resolves a master HLS playlist to get the first variant stream
 * @param {string} masterUrl The master playlist URL
 * @returns {Promise<string>} The variant stream URL
 */
async function resolveHlsPlaylist(masterUrl) {
    try {
        const response = await fetchWithTimeout(masterUrl, {
            headers: {
                ...HEADERS,
                'Referer': M4UPLAY_BASE
            }
        }, 5000);

        if (!response.ok) return masterUrl;

        const content = await response.text();
        if (!content.includes('#EXTM3U')) return masterUrl;

        // Look for variant playlists (#EXT-X-STREAM-INF)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
                let variantPath = lines[i + 1].trim();
                if (variantPath && !variantPath.startsWith('#')) {
                    // Resolve relative path
                    if (!variantPath.startsWith('http')) {
                        const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
                        return baseUrl + variantPath;
                    }
                    return variantPath;
                }
            }
        }

        return masterUrl;
    } catch (error) {
        console.error(`[Movies4u] HLS resolution error: ${error.message}`);
        return masterUrl;
    }
}

// =================================================================================
// STREAM EXTRACTION
// =================================================================================

/**
 * Extracts stream URL from m4uplay.com embed page
 * The page uses packed JavaScript that needs to be unpacked
 * @param {string} embedUrl The m4uplay.com embed URL
 * @returns {Promise<string|null>} Direct stream URL or null
 */
async function extractFromM4UPlay(embedUrl) {
    try {
        console.log(`[Movies4u] Extracting from m4uplay: ${embedUrl}`);

        const response = await fetchWithTimeout(embedUrl, {
            headers: {
                ...HEADERS,
                'Referer': MAIN_URL
            }
        }, 8000);

        const html = await response.text();

        // Check for Packer obfuscation
        // Pattern: eval(function(p,a,c,k,e,d){...}('...',36,545,'...'.split('|')))
        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
        let unpackedHtml = html;

        if (packerMatch) {
            console.log(`[Movies4u] Detected Packer obfuscation on m4uplay`);
            try {
                const rawArgs = packerMatch[1].trim();
                // Extract arguments: p, a, c, k
                // p is the string, a is base, c is count, k is token array
                const argsMatch = rawArgs.match(/^['"](.*)['"]\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*['"](.*?)['"]\.split\(['"]\|['"]\)/s);

                if (argsMatch) {
                    const p = argsMatch[1];
                    const a = parseInt(argsMatch[2]);
                    const c = parseInt(argsMatch[3]);
                    const k = argsMatch[4].split('|');

                    const unpacked = unpack(p, a, c, k);
                    unpackedHtml += "\n" + unpacked;
                    console.log(`[Movies4u] Successfully unpacked script`);
                }
            } catch (unpackError) {
                console.error(`[Movies4u] Packer unpacking failed: ${unpackError.message}`);
            }
        }

        // Now search in both original and unpacked HTML

        let finalStreamUrl = null;

        // 1. Look for absolute HLS URLs (m3u8 or txt)
        const absoluteHlsMatch = unpackedHtml.match(/https?:\/\/[^\s"']+\.(?:m3u8|txt)(?:\?[^\s"']*)?/);
        if (absoluteHlsMatch) {
            console.log(`[Movies4u] Found absolute HLS URL: ${absoluteHlsMatch[0]}`);
            finalStreamUrl = absoluteHlsMatch[0];
        }

        // 2. Look for relative stream paths (common patterns: /stream/... or /3o/...)
        if (!finalStreamUrl) {
            const relativeStreamMatch = unpackedHtml.match(/["']?(\/(?:stream|3o)\/[^"'\s]+\.(?:m3u8|txt))[^\s"']*/);
            if (relativeStreamMatch) {
                let streamUrl = relativeStreamMatch[1];
                if (streamUrl.startsWith('/')) {
                    streamUrl = M4UPLAY_BASE + streamUrl;
                }
                console.log(`[Movies4u] Found relative stream URL: ${streamUrl}`);
                finalStreamUrl = streamUrl;
            }
        }

        // 3. Look for JWPlayer setup with file property (supporting m3u8 and txt)
        if (!finalStreamUrl) {
            const jwplayerFileMatch = unpackedHtml.match(/["']file["']\s*:\s*["']([^"']+\.(?:m3u8|txt)[^"']*)["']/);
            if (jwplayerFileMatch) {
                let streamUrl = jwplayerFileMatch[1];
                if (streamUrl.startsWith('/')) {
                    streamUrl = M4UPLAY_BASE + streamUrl;
                }
                console.log(`[Movies4u] Found stream URL from JWPlayer file property: ${streamUrl}`);
                finalStreamUrl = streamUrl;
            }
        }

        // 4. Look for master.txt specifically
        if (!finalStreamUrl) {
            const masterTxtMatch = unpackedHtml.match(/https?:\/\/[^\s"']*master\.txt[^\s"']*/);
            if (masterTxtMatch) {
                console.log(`[Movies4u] Found master.txt HLS URL: ${masterTxtMatch[0]}`);
                finalStreamUrl = masterTxtMatch[0];
            }
        }

        // 5. Look for playlist or sources array
        if (!finalStreamUrl) {
            const playlistMatch = unpackedHtml.match(/["'](?:playlist|sources)["']\s*:\s*\[\s*\{[^}]*["']file["']\s*:\s*["']([^"']+)["']/s);
            if (playlistMatch) {
                let streamUrl = playlistMatch[1];
                if (streamUrl.startsWith('/')) {
                    streamUrl = M4UPLAY_BASE + streamUrl;
                }
                console.log(`[Movies4u] Found stream URL from playlist/sources: ${streamUrl}`);
                finalStreamUrl = streamUrl;
            }
        }

        // 6. Look for any master.m3u8 or master.txt file references (permissive)
        if (!finalStreamUrl) {
            const anyMasterMatch = unpackedHtml.match(/([\/a-zA-Z0-9_\-\.]+\/master\.(?:m3u8|txt))/);
            if (anyMasterMatch) {
                let streamUrl = anyMasterMatch[1];
                if (streamUrl.startsWith('/')) {
                    streamUrl = M4UPLAY_BASE + streamUrl;
                }
                console.log(`[Movies4u] Found master reference: ${streamUrl}`);
                finalStreamUrl = streamUrl;
            }
        }

        if (finalStreamUrl) {
            // Check if it's a master playlist and resolve to a variant if so
            if (finalStreamUrl.includes('master.')) {
                console.log(`[Movies4u] Resolving master playlist...`);
                const resolvedUrl = await resolveHlsPlaylist(finalStreamUrl);
                if (resolvedUrl !== finalStreamUrl) {
                    console.log(`[Movies4u] Resolved to variant: ${resolvedUrl}`);
                    return resolvedUrl;
                }
            }
            return finalStreamUrl;
        }

        console.log(`[Movies4u] Could not extract stream URL from m4uplay embed`);
        return null;

    } catch (error) {
        console.error(`[Movies4u] M4UPlay extraction error: ${error.message}`);
        return null;
    }
}

/**
 * Extracts watch links from movie page
 * @param {string} movieUrl The movie page URL
 * @returns {Promise<Array>} Array of watch link objects
 */
async function extractWatchLinks(movieUrl) {
    try {
        console.log(`[Movies4u] Extracting watch links from: ${movieUrl}`);

        const response = await fetchWithTimeout(movieUrl, {
            headers: HEADERS
        }, 8000);

        const html = await response.text();
        const $ = cheerio.load(html);

        const watchLinks = [];

        // Find all watch links with class btn btn-zip
        $('a.btn.btn-zip').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            // Only include m4uplay.com links
            if (href && href.includes('m4uplay.com')) {
                watchLinks.push({
                    url: href,
                    quality: text.includes('1080p') ? '1080p' :
                        text.includes('720p') ? '720p' :
                            text.includes('480p') ? '480p' :
                                text.includes('4K') || text.includes('2160p') ? '4K' :
                                    text.includes('iMAX') ? 'iMAX' : 'Unknown',
                    label: text
                });
            }
        });

        console.log(`[Movies4u] Found ${watchLinks.length} watch links`);
        return watchLinks;

    } catch (error) {
        console.error(`[Movies4u] Error extracting watch links: ${error.message}`);
        return [];
    }
}

// =================================================================================
// CORE FUNCTIONS
// =================================================================================

/**
 * Fetches metadata from TMDB
 */
async function getTMDBDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    try {
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) {
            throw new Error(`TMDB error: ${response.status}`);
        }
        const data = await response.json();

        if (!data.title && !data.name) {
            throw new Error('TMDB returned no title');
        }

        const info = {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").split("-")[0]
        };
        console.log(`[Movies4u] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
        return info;
    } catch (error) {
        console.error("[Movies4u] Error fetching TMDB metadata:", error.message);
        throw error;
    }
}

/**
 * Searches movies4u.fans for a movie
 * @param {string} query Search query
 * @returns {Promise<Array>} Array of search results
 */
async function searchMovies(query) {
    try {
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
        console.log(`[Movies4u] Searching: ${searchUrl}`);

        const response = await fetchWithTimeout(searchUrl, {
            headers: HEADERS
        }, 8000);

        const html = await response.text();
        const $ = cheerio.load(html);

        const results = [];

        // Extract search results using h3.entry-title a selector
        $('h3.entry-title a').each((i, el) => {
            const title = $(el).text().trim();
            const url = $(el).attr('href');

            if (title && url) {
                results.push({
                    title,
                    url
                });
            }
        });

        console.log(`[Movies4u] Found ${results.length} search results`);
        return results;

    } catch (error) {
        console.error(`[Movies4u] Search error: ${error.message}`);
        return [];
    }
}

/**
 * Main function for Nuvio integration
 * @param {string} tmdbId TMDB ID or movie title
 * @param {string} mediaType "movie" or "tv"
 * @param {number} season Season number (TV only)
 * @param {number} episode Episode number (TV only)
 * @returns {Promise<Array>} Array of stream objects
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[Movies4u] Processing ${mediaType} ${tmdbId}`);

    try {
        let mediaInfo;

        // Try to get TMDB details first if ID is numeric
        const isNumericId = /^\d+$/.test(tmdbId);
        if (isNumericId) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (error) {
                console.log(`[Movies4u] TMDB fetch failed for ${tmdbId}, using as search query`);
                mediaInfo = { title: tmdbId, year: null };
            }
        } else {
            console.log(`[Movies4u] Using "${tmdbId}" as search query directly`);
            mediaInfo = { title: tmdbId, year: null };
        }

        // Search for the movie
        const searchResults = await searchMovies(mediaInfo.title);

        if (searchResults.length === 0) {
            console.warn("[Movies4u] No search results found");
            return [];
        }

        // Find best match
        const bestMatch = findBestTitleMatch(mediaInfo, searchResults);

        if (!bestMatch) {
            console.warn("[Movies4u] No matching title found in search results");
            return [];
        }

        console.log(`[Movies4u] Found match: ${bestMatch.title}`);

        // Extract watch links from movie page
        const watchLinks = await extractWatchLinks(bestMatch.url);

        if (watchLinks.length === 0) {
            console.warn("[Movies4u] No watch links found on movie page");
            return [];
        }

        // Extract streams from each watch link
        const streams = [];

        for (const watchLink of watchLinks) {
            const streamUrl = await extractFromM4UPlay(watchLink.url);

            if (streamUrl) {
                streams.push({
                    name: "Movies4u",
                    title: bestMatch.title.split("(")[0].trim(), // Clean title
                    url: streamUrl,
                    quality: watchLink.quality,
                    headers: {
                        "Referer": M4UPLAY_BASE,
                        "User-Agent": HEADERS["User-Agent"]
                    },
                    provider: 'Movies4u'
                });
            }
        }

        console.log(`[Movies4u] Extracted ${streams.length} streams`);
        return streams;

    } catch (error) {
        console.error("[Movies4u] getStreams failed:", error.message);
        return [];
    }
}

// Export the main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    // For React Native environment
    global.getStreams = { getStreams };
}
