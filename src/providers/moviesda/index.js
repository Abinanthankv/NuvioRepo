// Moviesda Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Moviesda Configuration
let MAIN_URL = "https://moviesda15.com";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": `${MAIN_URL}/`,
};

// =================================================================================
// UTILITY FUNCTIONS
// =================================================================================

/**
 * Fetch with timeout to prevent hanging requests
 * @param {string} url URL to fetch
 * @param {Object} options Fetch options
 * @param {number} timeout Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>}
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
 * Finds the best title match from search results
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} searchResults Search results array
 * @returns {Object|null} Best matching result
 */
function findBestTitleMatch(mediaInfo, searchResults) {
    if (!searchResults || searchResults.length === 0) return null;

    const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;
    let bestMatch = null;
    let bestScore = 0;

    for (const result of searchResults) {
        let score = calculateTitleSimilarity(mediaInfo.title, result.title);

        // Year matching bonus
        if (targetYear) {
            if (result.title.includes(targetYear.toString())) {
                score += 0.3;
            } else if (result.title.includes((targetYear + 1).toString()) ||
                result.title.includes((targetYear - 1).toString())) {
                score += 0.1;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    if (bestMatch && bestScore > 0.4) {
        console.log(`[Moviesda] Best match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    return null;
}

/**
 * Formats a rich multi-line title for a stream
 * @param {Object} mediaInfo 
 * @param {Object} stream 
 * @returns {string}
 */
function formatStreamTitle(mediaInfo, stream) {
    const quality = stream.quality || "Unknown";
    const title = mediaInfo.title || "Unknown";
    const year = mediaInfo.year || "";

    // Extract size from text if available (e.g., "(1.2 GB)")
    let size = "";
    const sizeMatch = stream.text ? stream.text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i) : null;
    if (sizeMatch) size = sizeMatch[1];

    // Determine type from text or URL
    let type = "";
    const searchString = ((stream.text || "") + " " + (stream.url || "")).toLowerCase();

    if (searchString.includes('bluray') || searchString.includes('brrip')) type = "BluRay";
    else if (searchString.includes('web-dl')) type = "WEB-DL";
    else if (searchString.includes('webrip')) type = "WEBRip";
    else if (searchString.includes('hdrip')) type = "HDRip";
    else if (searchString.includes('dvdrip')) type = "DVDRip";
    else if (searchString.includes('bdrip')) type = "BDRip";
    else if (searchString.includes('hdtv')) type = "HDTV";

    const typeLine = type ? `📹: ${type}\n` : "";
    const sizeLine = size ? `💾: ${size} | 🚜: moviesda\n` : "";
    const yearStr = year && year !== "N/A" ? ` ${year}` : "";

    const langMarkers = {
        'TAMIL': /tamil/i,
        'HINDI': /hindi/i,
        'TELUGU': /telugu/i,
        'MALAYALAM': /malayalam/i,
        'KANNADA': /kannada/i,
        'ENGLISH': /english|eng/i,
        'MULTI AUDIO': /multi/i
    };

    let language = "TAMIL"; // Default for Moviesda
    for (const [name, regex] of Object.entries(langMarkers)) {
        if (regex.test(searchString)) {
            language = name;
            break;
        }
    }

    return `Moviesda (Instant) (${quality})
${typeLine}📼: ${title}${yearStr} ${quality}
${sizeLine}🌐: ${language}`;
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
        const data = await response.json();

        const info = {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").split("-")[0]
        };
        console.log(`[Moviesda] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
        return info;
    } catch (error) {
        console.error("[Moviesda] Error fetching TMDB metadata:", error.message);
        throw error;
    }
}

/**
 * Searches TMDB by movie title to get year
 */
async function searchTMDBByTitle(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;

    try {
        console.log(`[Moviesda] Searching TMDB for: "${title}"`);
        const response = await fetchWithTimeout(url, {}, 8000);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // Get the first (most popular) result
            const firstResult = data.results[0];
            const info = {
                title: firstResult.title || firstResult.name,
                year: (firstResult.release_date || firstResult.first_air_date || "").split("-")[0]
            };
            console.log(`[Moviesda] TMDB Search Result: "${info.title}" (${info.year || 'N/A'})`);
            return info;
        }

        console.log(`[Moviesda] No TMDB results found for "${title}"`);
        return null;
    } catch (error) {
        console.error("[Moviesda] Error searching TMDB:", error.message);
        return null;
    }
}

/**
 * Searches Moviesda by browsing category pages
 * Moviesda doesn't have real search - it uses category pages with movie listings
 */
async function search(query, year = null) {
    console.log(`[Moviesda] Searching for: "${query}" (year: ${year || 'any'})`);

    try {
        const results = [];

        // Determine which category pages to check
        const categoriesToCheck = [];

        if (year) {
            // If we have a year, check that specific year category
            categoriesToCheck.push(`${MAIN_URL}/tamil-${year}-movies/`);
        } else {
            // Check recent years (2024, 2025, 2026)
            const currentYear = new Date().getFullYear();
            for (let y = currentYear; y >= currentYear - 2; y--) {
                categoriesToCheck.push(`${MAIN_URL}/tamil-${y}-movies/`);
            }
        }

        console.log(`[Moviesda] Checking ${categoriesToCheck.length} category pages`);

        // Browse each category page
        for (const categoryUrl of categoriesToCheck) {
            try {
                const response = await fetchWithTimeout(categoryUrl, { headers: HEADERS }, 8000);
                const html = await response.text();
                const $ = cheerio.load(html);

                // Find all movie links
                // Pattern: [Movie Title (Year)] with href to movie page
                $('a[href*="-tamil-movie"], a[href*="-movie/"]').each((i, el) => {
                    const href = $(el).attr('href');
                    const text = $(el).text().trim();

                    // Skip navigation links
                    if (!href || href.includes('/tamil-movies/') || href === '#' || text.length < 3) {
                        return;
                    }

                    // Extract title and year from text
                    // Format: "Mowgli (2025)" or just "Mowgli"
                    const match = text.match(/^(.+?)\s*(?:\((\d{4})\))?$/);
                    if (match) {
                        const title = match[1].trim();
                        const movieYear = match[2] || null;
                        const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;

                        results.push({
                            title: text, // Keep full text with year
                            cleanTitle: title,
                            year: movieYear,
                            href: fullUrl
                        });
                    }
                });

            } catch (error) {
                console.error(`[Moviesda] Error browsing ${categoryUrl}: ${error.message}`);
            }
        }

        console.log(`[Moviesda] Found ${results.length} total movies in categories`);
        return results;

    } catch (error) {
        console.error("[Moviesda] Search error:", error.message);
        return [];
    }
}

/**
 * Browses a specific year category
 */
async function browseCategory(year) {
    const url = `${MAIN_URL}/tamil-${year}-movies/`;
    console.log(`[Moviesda] Browsing category: ${url}`);

    try {
        const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $("article.post, .post-item, .movie-item").each((i, el) => {
            const titleEl = $(el).find("h2.entry-title a, h2 a, .entry-title a");
            const title = titleEl.text().trim();
            const href = titleEl.attr("href");

            if (title && href) {
                const qualityMatch = title.match(/\b(360p|480p|720p|1080p|4K)\b/i);
                const quality = qualityMatch ? qualityMatch[0] : "Unknown";
                results.push({ title, href, quality });
            }
        });

        console.log(`[Moviesda] Found ${results.length} movies in category`);
        return results;
    } catch (error) {
        console.error("[Moviesda] Category browse error:", error.message);
        return [];
    }
}

// =================================================================================
// HOST EXTRACTORS
// =================================================================================

/**
 * Generic extractor that looks for common video source patterns
 */
async function extractFromGenericEmbed(embedUrl, hostName) {
    try {
        const embedBase = new URL(embedUrl).origin;
        const response = await fetchWithTimeout(embedUrl, {
            headers: {
                ...HEADERS,
                'Referer': MAIN_URL
            }
        }, 5000);
        let html = await response.text();

        // Check for Packer obfuscation
        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
        if (packerMatch) {
            console.log(`[Moviesda] Detected Packer obfuscation on ${hostName}, unpacking...`);
            const rawArgs = packerMatch[1].trim();
            const pMatch = rawArgs.match(/^'(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\(/s);

            if (pMatch) {
                const unpacked = unpack(pMatch[1], parseInt(pMatch[2]), parseInt(pMatch[3]), pMatch[4].split('|'));
                html += "\n" + unpacked;
            }
        }

        // Common patterns for video sources
        const patterns = [
            /["']hls[2-4]["']\s*:\s*["']([^"']+)["']/gi,
            /sources\s*:\s*\[\s*{\s*file\s*:\s*["']([^"']+)["']/gi,
            /https?:\/\/[^\s"']+\.m3u8[^\s"']*/gi,
            /["'](\/[^\s"']+\.m3u8[^\s"']*)["']/gi,
            /https?:\/\/[^\s"']+\.mp4[^\s"']*/gi,
            /(?:source|file|src)\s*[:=]\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi,
        ];

        const allFoundUrls = [];
        for (const pattern of patterns) {
            const matches = html.match(pattern);
            if (matches && matches.length > 0) {
                for (let match of matches) {
                    let videoUrl = match;

                    const kvMatch = match.match(/["']:[ ]*["']([^"']+)["']/);
                    if (kvMatch) {
                        videoUrl = kvMatch[1];
                    } else {
                        const quoteMatch = match.match(/["']([^"']+)["']/);
                        if (quoteMatch) videoUrl = quoteMatch[1];
                    }

                    const absUrlMatch = videoUrl.match(/https?:\/\/[^\s"']+/);
                    if (absUrlMatch) videoUrl = absUrlMatch[0];

                    videoUrl = videoUrl.replace(/[\\"'\)\]]+$/, '');

                    if (!videoUrl || videoUrl.length < 5 || videoUrl.includes('google.com') || videoUrl.includes('youtube.com')) {
                        continue;
                    }

                    if (videoUrl.startsWith('/') && !videoUrl.startsWith('//')) {
                        videoUrl = embedBase + videoUrl;
                    }

                    allFoundUrls.push(videoUrl);
                }
            }
        }

        if (allFoundUrls.length > 0) {
            allFoundUrls.sort((a, b) => {
                const isM3U8A = a.toLowerCase().includes('.m3u8');
                const isM3U8B = b.toLowerCase().includes('.m3u8');
                if (isM3U8A !== isM3U8B) return isM3U8B ? 1 : -1;
                return a.length - b.length;
            });

            const bestUrl = allFoundUrls[0];
            console.log(`[Moviesda] Found direct URL from ${hostName}: ${bestUrl}`);
            return bestUrl;
        }

        console.log(`[Moviesda] No direct URL found in ${hostName}, skipping`);
        return null;

    } catch (error) {
        console.error(`[Moviesda] Error extracting from ${hostName}: ${error.message}`);
        return null;
    }
}

/**
 * Attempts to extract direct stream URL from various embed hosts
 */
async function extractDirectStream(embedUrl) {
    try {
        console.log(`[Moviesda] Extracting from embed: ${embedUrl}`);
        const url = new URL(embedUrl);
        const hostname = url.hostname.toLowerCase();

        // Check if it's onestream.watch
        if (hostname.includes('onestream.watch')) {
            return await extractFromOnestream(embedUrl);
        }

        return await extractFromGenericEmbed(embedUrl, hostname);

    } catch (error) {
        console.error(`[Moviesda] Extraction error: ${error.message}`);
        return null;
    }
}

/**
 * Extracts direct stream URL from onestream.watch embed pages
 * These pages contain video elements with source tags pointing to direct MP4/M3U8 URLs
 */
async function extractFromOnestream(embedUrl) {
    console.log(`[Moviesda] Extracting from onestream.watch: ${embedUrl}`);

    try {
        const response = await fetchWithTimeout(embedUrl, {
            headers: {
                ...HEADERS,
                'Referer': MAIN_URL
            }
        }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Look for video source tags
        const videoSources = [];
        $('video source').each((i, el) => {
            const src = $(el).attr('src');
            const type = $(el).attr('type');
            if (src) {
                videoSources.push({ src, type });
            }
        });

        if (videoSources.length > 0) {
            const directUrl = videoSources[0].src;
            console.log(`[Moviesda] Found direct URL from onestream: ${directUrl}`);
            return directUrl;
        }

        // Fallback: search for video URLs in HTML
        const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) {
            console.log(`[Moviesda] Found m3u8 URL: ${m3u8Match[0]}`);
            return m3u8Match[0];
        }

        const mp4Match = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i);
        if (mp4Match) {
            console.log(`[Moviesda] Found mp4 URL: ${mp4Match[0]}`);
            return mp4Match[0];
        }

        console.log(`[Moviesda] No direct URL found in onestream page`);
        return null;

    } catch (error) {
        console.error(`[Moviesda] Onestream extraction error: ${error.message}`);
        return null;
    }
}

/**
 * Parses movie detail page for download/stream links
 * Moviesda uses multi-level structure: Movie Page → Original Page → Quality Pages → Download Links
 */
async function parseMoviePage(url) {
    console.log(`[Moviesda] Parsing movie page: ${url}`);

    try {
        const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const streams = [];

        // Step 1: Check if this is a main movie page that links to "original" page
        const originalLink = $('a[href*="-original-movie"]');
        if (originalLink.length > 0) {
            const originalUrl = originalLink.attr('href');
            const fullOriginalUrl = originalUrl.startsWith('http') ? originalUrl : `${MAIN_URL}${originalUrl}`;
            console.log(`[Moviesda] Found original page link: ${fullOriginalUrl}`);

            // Follow to original page
            return await parseOriginalPage(fullOriginalUrl);
        }

        // Step 2: Check if this is an "original" page with quality links
        const qualityLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            // Look for quality-specific links (360p, 720p, 1080p)
            if (href && text.match(/\b(360p|480p|720p|1080p|4K)\s*HD\b/i)) {
                const qualityMatch = text.match(/\b(360p|480p|720p|1080p|4K)\b/i);
                const quality = qualityMatch ? qualityMatch[0] : "Unknown";
                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;
                qualityLinks.push({ url: fullUrl, quality });
            }
        });

        if (qualityLinks.length > 0) {
            console.log(`[Moviesda] Found ${qualityLinks.length} quality pages`);

            // Parse each quality page
            for (const qualityLink of qualityLinks) {
                const qualityStreams = await parseQualityPage(qualityLink.url, qualityLink.quality);
                // Attach parent text for context if possible
                qualityStreams.forEach(s => {
                    if (!s.text) s.text = qualityLink.text || "";
                });
                streams.push(...qualityStreams);
            }
            return streams;
        }

        // Step 3: Check if this is a quality page with download links
        const downloadLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            // Look for download links
            if (href && href.includes('/download/')) {
                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;
                downloadLinks.push({ url: fullUrl, text });
            }
        });

        if (downloadLinks.length > 0) {
            console.log(`[Moviesda] Found ${downloadLinks.length} download links on quality page`);
            downloadLinks.forEach(link => {
                streams.push({
                    url: link.url,
                    quality: "Unknown",
                    type: "download"
                });
            });
        }

        console.log(`[Moviesda] Found ${streams.length} streams on page`);
        return streams;

    } catch (error) {
        console.error("[Moviesda] Movie page parse error:", error.message);
        return [];
    }
}

/**
 * Parses the "original" page that contains links to quality-specific pages
 */
async function parseOriginalPage(url) {
    console.log(`[Moviesda] Parsing original page: ${url}`);

    try {
        const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const streams = [];

        // Find quality-specific links
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            // Look for quality links like "Mowgli (1080p HD)"
            if (href && text.match(/\b(360p|480p|720p|1080p|4K)\s*HD\b/i)) {
                const qualityMatch = text.match(/\b(360p|480p|720p|1080p|4K)\b/i);
                const quality = qualityMatch ? qualityMatch[0] : "Unknown";
                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;

                streams.push({
                    url: fullUrl,
                    quality: quality,
                    type: "quality_page"
                });
            }
        });

        console.log(`[Moviesda] Found ${streams.length} quality pages on original page`);

        // Parse each quality page to get actual download links
        const finalStreams = [];
        for (const stream of streams) {
            const qualityStreams = await parseQualityPage(stream.url, stream.quality);
            finalStreams.push(...qualityStreams);
        }

        return finalStreams;

    } catch (error) {
        console.error("[Moviesda] Original page parse error:", error.message);
        return [];
    }
}

/**
 * Parses a quality-specific page (e.g., 1080p page) to extract download links
 */
async function parseQualityPage(url, quality) {
    console.log(`[Moviesda] Parsing quality page (${quality}): ${url}`);

    try {
        const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);
        const streams = [];

        // Find download links
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            // Look for /download/ links
            if (href && href.includes('/download/')) {
                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;

                streams.push({
                    url: fullUrl,
                    quality: quality,
                    type: "download",
                    text: text // Keep text for size extraction
                });
            }
        });

        console.log(`[Moviesda] Found ${streams.length} download links for ${quality}`);
        return streams;

    } catch (error) {
        console.error(`[Moviesda] Quality page parse error (${quality}): ${error.message}`);
        return [];
    }
}

/**
 * Extracts the final stream URL from a moviesda download page
 * Download pages contain links to external servers (e.g., moviespage.xyz)
 * These are then converted to streaming URLs (play.onestream.watch)
 */
async function extractFinalDownloadUrl(downloadPageUrl) {
    console.log(`[Moviesda] Extracting final URL from: ${downloadPageUrl}`);

    try {
        const response = await fetchWithTimeout(downloadPageUrl, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);

        // Look for download server links
        const downloadLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().toLowerCase();

            // Look for external download links (not moviesda15.com)
            if (href &&
                !href.includes('moviesda15.com') &&
                !href.includes('/tamil-movies/') &&
                !href.startsWith('#') &&
                (text.includes('download') || text.includes('server'))) {

                const fullUrl = href.startsWith('http') ? href : `https:${href}`;
                downloadLinks.push(fullUrl);
            }
        });

        if (downloadLinks.length > 0) {
            const downloadUrl = downloadLinks[0];
            console.log(`[Moviesda] Found download URL: ${downloadUrl}`);

            // Convert download.moviespage.xyz/download/file/ID to play.onestream.watch/stream/page/ID
            if (downloadUrl.includes('download.moviespage.xyz/download/file/')) {
                const fileIdMatch = downloadUrl.match(/\/file\/(\d+)/);
                if (fileIdMatch) {
                    const fileId = fileIdMatch[1];
                    const streamUrl = `https://play.onestream.watch/stream/page/${fileId}`;
                    console.log(`[Moviesda] Converted to onestream URL: ${streamUrl}`);
                    // Return as object to indicate it needs extraction
                    return { url: streamUrl, needsExtraction: true };
                }
            }

            // Return original URL if conversion not needed
            return { url: downloadUrl, needsExtraction: false };
        }

        console.log(`[Moviesda] No final download URL found on page`);
        return null;

    } catch (error) {
        console.error(`[Moviesda] Error extracting final URL: ${error.message}`);
        return null;
    }
}

// =================================================================================
// MAIN FUNCTION
// =================================================================================

/**
 * Main function for Nuvio integration
 * @param {string} tmdbId TMDB ID or movie title
 * @param {string} mediaType "movie" or "tv"
 * @param {number} season Season number (TV only)
 * @param {number} episode Episode number (TV only)
 * @returns {Promise<Array>} Array of stream objects
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    console.log(`[Moviesda] Processing ${mediaType} ${tmdbId}`);

    try {
        let mediaInfo;

        // Get TMDB details or use as search query
        const isNumericId = /^\d+$/.test(tmdbId);
        if (isNumericId) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (error) {
                console.log(`[Moviesda] TMDB fetch failed, using "${tmdbId}" as search query`);
                mediaInfo = { title: tmdbId, year: null };
            }
        } else {
            // It's a title string - try to search TMDB to get the year
            console.log(`[Moviesda] Using "${tmdbId}" as search query`);
            try {
                const tmdbResult = await searchTMDBByTitle(tmdbId, mediaType);
                if (tmdbResult && tmdbResult.year) {
                    mediaInfo = tmdbResult;
                } else {
                    mediaInfo = { title: tmdbId, year: null };
                }
            } catch (error) {
                console.log(`[Moviesda] TMDB search failed: ${error.message}`);
                mediaInfo = { title: tmdbId, year: null };
            }
        }

        console.log(`[Moviesda] Looking for: "${mediaInfo.title}" (${mediaInfo.year || 'N/A'})`);

        // Try search (which browses category pages)
        let searchResults = await search(mediaInfo.title, mediaInfo.year);

        const bestMatch = findBestTitleMatch(mediaInfo, searchResults);

        if (!bestMatch) {
            console.warn("[Moviesda] No matching title found in category pages");

            // Fallback: Try direct URL construction
            // Moviesda URL pattern: https://moviesda15.com/[title]-[year]-tamil-movie/
            const currentYear = new Date().getFullYear();
            const yearsToTry = mediaInfo.year ?
                [mediaInfo.year, currentYear, currentYear - 1] :
                // Try recent years first (most likely), then expand backwards to 2010
                [currentYear, currentYear - 1, currentYear + 1,
                    currentYear - 2, currentYear - 3, currentYear - 4];

            for (const year of yearsToTry) {
                const slug = mediaInfo.title.toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '')
                    .replace(/\s+/g, '-');
                const directUrl = `${MAIN_URL}/${slug}-${year}-tamil-movie/`;

                console.log(`[Moviesda] Trying direct URL: ${directUrl}`);

                try {
                    const response = await fetchWithTimeout(directUrl, { headers: HEADERS }, 5000);
                    if (response.ok) {
                        const html = await response.text();
                        // Check if it's a valid movie page (not 404)
                        if (html.includes('entry-title') || html.includes('movie')) {
                            console.log(`[Moviesda] ✓ Direct URL found: ${directUrl}`);
                            // Parse this page directly
                            const rawStreams = await parseMoviePage(directUrl);
                            if (rawStreams.length > 0) {
                                // Process streams (same logic as below)
                                const limitedStreams = rawStreams.slice(0, 5);
                                const finalStreams = [];

                                for (const stream of limitedStreams) {
                                    let finalUrl = stream.url;

                                    if (stream.type === "download") {
                                        try {
                                            const result = await Promise.race([
                                                extractFinalDownloadUrl(stream.url),
                                                new Promise((_, reject) =>
                                                    setTimeout(() => reject(new Error('Extraction timeout')), 5000)
                                                )
                                            ]);

                                            if (!result) continue;

                                            if (result.needsExtraction) {
                                                try {
                                                    const directUrl = await Promise.race([
                                                        extractFromOnestream(result.url),
                                                        new Promise((_, reject) =>
                                                            setTimeout(() => reject(new Error('Onestream extraction timeout')), 5000)
                                                        )
                                                    ]);
                                                    if (!directUrl) continue;
                                                    finalUrl = directUrl;
                                                } catch (error) {
                                                    console.error(`[Moviesda] Onestream extraction failed: ${error.message}`);
                                                    continue;
                                                }
                                            } else {
                                                finalUrl = result.url;
                                            }
                                        } catch (error) {
                                            console.error(`[Moviesda] Download URL extraction failed: ${error.message}`);
                                            continue;
                                        }
                                    }

                                    finalStreams.push({
                                        name: "Moviesda",
                                        title: formatStreamTitle(mediaInfo, stream),
                                        url: finalUrl,
                                        quality: stream.quality || "Unknown",
                                        headers: {
                                            "Referer": MAIN_URL,
                                            "User-Agent": HEADERS["User-Agent"]
                                        },
                                        provider: 'Moviesda'
                                    });
                                }

                                console.log(`[Moviesda] Successfully extracted ${finalStreams.length} streams`);
                                return finalStreams;
                            }
                        }
                    }
                } catch (error) {
                    console.log(`[Moviesda] Direct URL failed for ${year}: ${error.message}`);
                }
            }

            console.warn("[Moviesda] No results found via category search or direct URL");
            return [];
        }

        console.log(`[Moviesda] Processing match: ${bestMatch.title}`);

        // Parse movie page for streams
        const rawStreams = await parseMoviePage(bestMatch.href);

        if (rawStreams.length === 0) {
            console.warn("[Moviesda] No streams found on movie page");
            return [];
        }

        // Limit to first 5 streams for performance
        const limitedStreams = rawStreams.slice(0, 5);
        if (rawStreams.length > 5) {
            console.log(`[Moviesda] Limiting to first 5 streams out of ${rawStreams.length}`);
        }

        const finalStreams = [];

        for (const stream of limitedStreams) {
            let finalUrl = stream.url;

            // Handle different stream types
            if (stream.type === "download") {
                // Extract final download URL from moviesda download page
                try {
                    const result = await Promise.race([
                        extractFinalDownloadUrl(stream.url),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Extraction timeout')), 5000)
                        )
                    ]);

                    if (!result) {
                        console.log(`[Moviesda] Failed to extract final URL from download page, skipping`);
                        continue;
                    }

                    // Check if the URL needs further extraction (onestream.watch)
                    if (result.needsExtraction) {
                        console.log(`[Moviesda] URL needs extraction from onestream`);
                        try {
                            const directUrl = await Promise.race([
                                extractFromOnestream(result.url),
                                new Promise((_, reject) =>
                                    setTimeout(() => reject(new Error('Onestream extraction timeout')), 5000)
                                )
                            ]);

                            if (!directUrl) {
                                console.log(`[Moviesda] Failed to extract from onestream, skipping`);
                                continue;
                            }
                            finalUrl = directUrl;
                        } catch (error) {
                            console.error(`[Moviesda] Onestream extraction failed: ${error.message}`);
                            continue;
                        }
                    } else {
                        finalUrl = result.url;
                    }
                } catch (error) {
                    console.error(`[Moviesda] Download URL extraction failed: ${error.message}`);
                    continue;
                }
            } else if (stream.type === "embed") {
                // Extract from embed if needed
                try {
                    const extractedUrl = await Promise.race([
                        extractDirectStream(stream.url),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Extraction timeout')), 5000)
                        )
                    ]);

                    if (!extractedUrl) {
                        console.log(`[Moviesda] Failed to extract from embed, skipping`);
                        continue;
                    }
                    finalUrl = extractedUrl;
                } catch (error) {
                    console.error(`[Moviesda] Embed extraction failed: ${error.message}`);
                    continue;
                }
            }

            finalStreams.push({
                name: "Moviesda",
                title: formatStreamTitle(mediaInfo, stream),
                url: finalUrl,
                quality: stream.quality,
                headers: {
                    "Referer": MAIN_URL,
                    "User-Agent": HEADERS["User-Agent"]
                },
                provider: 'Moviesda'
            });
        }

        console.log(`[Moviesda] Successfully extracted ${finalStreams.length} streams`);
        return finalStreams;

    } catch (error) {
        console.error("[Moviesda] getStreams failed:", error.message);
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
