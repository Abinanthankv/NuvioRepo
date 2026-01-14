// Isaidub Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Isaidub Configuration
let MAIN_URL = "https://isaidub.love";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": `${MAIN_URL}/`,
};

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
 * Generates a URL-friendly slug from a title
 */
function toSlug(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
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
 */
function findBestTitleMatch(mediaInfo, searchResults) {
    if (!searchResults || searchResults.length === 0) return null;

    const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;
    let bestMatch = null;
    let bestScore = 0;

    for (const result of searchResults) {
        let score = calculateTitleSimilarity(mediaInfo.title, result.title);

        // Boost score if year matches
        if (targetYear) {
            if (result.title.includes(targetYear.toString())) {
                score += 0.2;
            } else if (result.title.match(/\(\d{4}\)/)) {
                const yearMatch = result.title.match(/\((\d{4})\)/);
                if (yearMatch && parseInt(yearMatch[1]) !== targetYear) {
                    score -= 0.1;
                }
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    if (bestMatch && bestScore > 0.45) {
        console.log(`[Isaidub] Best match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
        return bestMatch;
    }

    return null;
}

/**
 * Formats a rich multi-line title for a stream
 */
function formatStreamTitle(mediaInfo, stream) {
    const quality = stream.quality || "Unknown";
    const title = toTitleCase(mediaInfo.title || "Unknown");
    const year = mediaInfo.year || "";

    // Use extracted size if available
    let size = stream.size || "";
    if (!size) {
        const sizeMatch = stream.text ? stream.text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i) : null;
        if (sizeMatch) size = sizeMatch[1];
    }

    let type = "";
    const searchString = ((stream.text || "") + " " + (stream.url || "")).toLowerCase();

    if (searchString.includes('bluray') || searchString.includes('brrip')) type = "BluRay";
    else if (searchString.includes('web-dl')) type = "WEB-DL";
    else if (searchString.includes('webrip')) type = "WEBRip";
    else if (searchString.includes('hdrip')) type = "HDRip";
    else if (searchString.includes('dvdrip')) type = "DVDRip";
    else if (searchString.includes('bdrip')) type = "BDRip";
    else if (searchString.includes('hdtv')) type = "HDTV";

    // Extract Season/Episode info
    let seInfo = "";
    const sMatch = searchString.match(/season\s*(\d+)/i);
    const eMatch = searchString.match(/epi\s*(\d+)|episode\s*(\d+)/i);

    if (sMatch) seInfo += ` S${sMatch[1].padStart(2, '0')}`;
    if (eMatch) seInfo += ` E${(eMatch[1] || eMatch[2]).padStart(2, '0')}`;

    if (!seInfo) {
        const slugParts = searchString.match(/s(\d+)e(\d+)|s(\d+)\s*e(\d+)/i);
        if (slugParts) {
            seInfo = ` S${(slugParts[1] || slugParts[3]).padStart(2, '0')} E${(slugParts[2] || slugParts[4]).padStart(2, '0')}`;
        }
    }

    const typeLine = type ? `📹: ${type}\n` : "";
    const sizeLine = size ? `💾: ${size}\n` : "";
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

    let language = "TAMIL";
    for (const [name, regex] of Object.entries(langMarkers)) {
        if (regex.test(searchString)) {
            language = name;
            break;
        }
    }

    return `Isaidub (Instant) (${quality})
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
        console.log(`[Isaidub] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
        return info;
    } catch (error) {
        console.error("[Isaidub] Error fetching TMDB metadata:", error.message);
        throw error;
    }
}

async function searchTMDBByTitle(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;

    try {
        console.log(`[Isaidub] Searching TMDB for: "${title}"`);
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const firstResult = data.results[0];
            const info = {
                title: firstResult.title || firstResult.name,
                year: (firstResult.release_date || firstResult.first_air_date || "").split("-")[0]
            };
            console.log(`[Isaidub] TMDB Search Result: "${info.title}" (${info.year || 'N/A'})`);
            return info;
        }

        console.log(`[Isaidub] No TMDB results found for "${title}"`);
        return null;
    } catch (error) {
        console.error("[Isaidub] Error searching TMDB:", error.message);
        return null;
    }
}

/**
 * Searches Isaidub by guessing direct URLs and browsing categories
 */
async function search(query, year = null, mediaType) {
    if (!year) {
        const yearMatch = query.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
            year = yearMatch[0];
            query = query.replace(year, '').trim();
        }
    }

    console.log(`[Isaidub] Searching for: "${query}" (year: ${year || 'any'}, type: ${mediaType})`);

    try {
        const results = [];
        const slug = toSlug(query);

        if (slug) {
            const baseSuffixes = mediaType === 'tv' ? ['-tamil-dubbed-web-series'] : ['-tamil-dubbed-movie'];
            const guesses = [];

            for (const suffix of baseSuffixes) {
                if (year) {
                    guesses.push(`${slug}-${year}${suffix}`);
                    guesses.push(`${slug}-720p-hd${suffix}`);
                }
                guesses.push(`${slug}${suffix}`);
                guesses.push(`${slug}-720p-hd${suffix}`);
            }

            console.log(`[Isaidub] Trying ${guesses.length} guessed slugs...`);
            const guessPromises = guesses.map(async (guess) => {
                const guessUrl = `${MAIN_URL}/movie/${guess}/`;
                try {
                    const response = await fetchWithTimeout(guessUrl, { method: 'HEAD', headers: HEADERS }, 4000);
                    if (response.ok) {
                        return { title: query + (year ? ` (${year})` : ""), href: guessUrl, isGuessed: true };
                    }
                } catch (e) { /* ignore */ }
                return null;
            });

            const guessedResults = (await Promise.all(guessPromises)).filter(r => r !== null);
            results.push(...guessedResults);
        }

        const categoriesToCheck = [];
        categoriesToCheck.push(`${MAIN_URL}/`);

        if (mediaType === 'tv') {
            categoriesToCheck.push(`${MAIN_URL}/tamil-dubbed-web-series/`);
            categoriesToCheck.push(`${MAIN_URL}/tamil-dubbed-web-series/2/`);
        } else {
            if (year) categoriesToCheck.push(`${MAIN_URL}/tamil-${year}-dubbed-movies/`);
            const currentYear = new Date().getFullYear();
            for (let y = currentYear; y >= currentYear - 1; y--) {
                const yearUrl = `${MAIN_URL}/tamil-${y}-dubbed-movies/`;
                if (!categoriesToCheck.includes(yearUrl)) {
                    categoriesToCheck.push(yearUrl);
                    categoriesToCheck.push(`${yearUrl}2/`);
                }
            }

            const firstChar = query.trim().charAt(0).toLowerCase();
            if (/[a-z]/.test(firstChar)) {
                categoriesToCheck.push(`${MAIN_URL}/tamil-atoz-dubbed-movies/${firstChar}/`);
                categoriesToCheck.push(`${MAIN_URL}/tamil-atoz-dubbed-movies/${firstChar}/2/`);
            }
        }

        console.log(`[Isaidub] Checking ${categoriesToCheck.length} potential category pages in parallel...`);

        const catPromises = categoriesToCheck.map(async (categoryUrl) => {
            try {
                const response = await fetchWithTimeout(categoryUrl, { headers: HEADERS }, 6000);
                if (!response.ok) return [];

                const html = await response.text();
                const $ = cheerio.load(html);
                const pageResults = [];

                $('a').each((i, el) => {
                    const href = $(el).attr('href');
                    let text = $(el).text().trim();

                    if (!href || href === '/' || href === '#' || (text.length < 3 && !$(el).find('img').length)) return;

                    if (text.length < 3) {
                        text = $(el).find('img').attr('alt') || "";
                        text = text.replace(/isaiDub\.me\s*-\s*/i, '').trim();
                    }

                    text = text.replace(/Download Now/i, '').replace(/\s+/g, ' ').trim();

                    if (href.includes('/movie/') || href.includes('-dubbed-movie') || href.includes('-dubbed-web-series')) {
                        if (href.includes('/genre/') || href.match(/\/\d+\/$/) || href.endsWith('-movies/')) return;

                        const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;
                        pageResults.push({ title: text, href: fullUrl });
                    }
                });
                return pageResults;
            } catch (error) { return []; }
        });

        const allCatResults = await Promise.all(catPromises);
        for (const catResults of allCatResults) {
            for (const res of catResults) {
                if (!results.some(r => r.href === res.href)) {
                    results.push(res);
                }
            }
        }

        console.log(`[Isaidub] Found ${results.length} total unique links`);
        return results;

    } catch (error) {
        console.error("[Isaidub] Search error:", error.message);
        return [];
    }
}

/**
 * Generic extractor that looks for common video source patterns
 */
async function extractFromGenericEmbed(embedUrl, hostName) {
    try {
        const embedBase = new URL(embedUrl).origin;
        const response = await fetchWithTimeout(embedUrl, {
            headers: { ...HEADERS, 'Referer': MAIN_URL }
        }, 8000);

        const contentType = response.headers.get('content-type') || "";
        if (contentType.includes('video/')) {
            console.log(`[Isaidub] Direct video response from generic embed: ${response.url}`);
            return response.url;
        }

        let html = await response.text();
        const $ = cheerio.load(html);

        const videoSources = [];
        $('video source, video').each((i, el) => {
            const src = $(el).attr('src');
            if (src) videoSources.push(src);
        });
        if (videoSources.length > 0) return videoSources[0];

        const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) return m3u8Match[0];

        const watchOnlineLink = $('a:contains("Watch Online"), a:contains("Stream"), a:contains("Server")').attr('href');
        if (watchOnlineLink) {
            const fullWatchUrl = watchOnlineLink.startsWith('http') ? watchOnlineLink : (watchOnlineLink.startsWith('//') ? 'https:' + watchOnlineLink : embedBase + watchOnlineLink);
            if (fullWatchUrl !== embedUrl && !fullWatchUrl.includes('ads')) {
                return await extractDirectStream(fullWatchUrl);
            }
        }

        const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
        if (packerMatch) {
            const rawArgs = packerMatch[1].trim();
            const pMatch = rawArgs.match(/^'(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\(/s);
            if (pMatch) {
                const unpacked = unpack(pMatch[1], parseInt(pMatch[2]), parseInt(pMatch[3]), pMatch[4].split('|'));
                html += "\n" + unpacked;
            }
        }

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
            if (matches) {
                for (let match of matches) {
                    let videoUrl = match;
                    const kvMatch = match.match(/["']:[ ]*["']([^"']+)["']/);
                    if (kvMatch) videoUrl = kvMatch[1];
                    else {
                        const quoteMatch = match.match(/["']([^"']+)["']/);
                        if (quoteMatch) videoUrl = quoteMatch[1];
                    }
                    const absUrlMatch = videoUrl.match(/https?:\/\/[^\s"']+/);
                    if (absUrlMatch) videoUrl = absUrlMatch[0];
                    videoUrl = videoUrl.replace(/[\\"'\)\]]+$/, '');
                    if (!videoUrl || videoUrl.length < 5 || videoUrl.includes('google.com') || videoUrl.includes('youtube.com')) continue;
                    if (videoUrl.startsWith('/') && !videoUrl.startsWith('//')) videoUrl = embedBase + videoUrl;
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
            return allFoundUrls[0];
        }
        return null;
    } catch (error) { return null; }
}

/**
 * Attempts to extract direct stream URL from various embed hosts
 */
async function extractDirectStream(embedUrl, seenUrls = new Set()) {
    if (seenUrls.has(embedUrl)) return null;
    seenUrls.add(embedUrl);
    if (seenUrls.size > 5) return null;

    try {
        console.log(`[Isaidub] Extracting from embed: ${embedUrl}`);
        const url = new URL(embedUrl);
        const hostname = url.hostname.toLowerCase();

        if (hostname.includes('onestream.watch') || hostname.includes('dubmv.top') || hostname.includes('dubshare.one') || hostname.includes('uptodub.ch')) {
            return await extractFromStreamPage(embedUrl, seenUrls);
        }

        return await extractFromGenericEmbed(embedUrl, hostname);
    } catch (error) { return null; }
}

/**
 * Extracts direct stream URL from onestream.watch or dubmv.top embed pages
 */
async function extractFromStreamPage(embedUrl, seenUrls = new Set()) {
    console.log(`[Isaidub] Extracting from stream page: ${embedUrl}`);

    try {
        const response = await fetchWithTimeout(embedUrl, {
            headers: { ...HEADERS, 'Referer': MAIN_URL }
        }, 12000);

        const contentType = response.headers.get('content-type') || "";
        if (contentType.includes('video/')) {
            console.log(`[Isaidub] Found direct video source via redirect: ${response.url}`);
            return response.url;
        }

        let html = await response.text();
        const $ = cheerio.load(html);

        const videoSources = [];
        $('video source, video').each((i, el) => {
            const src = $(el).attr('src');
            if (src) videoSources.push(src);
        });

        if (videoSources.length > 0) return videoSources[0];

        const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
        if (m3u8Match) return m3u8Match[0];

        const mp4Match = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i);
        if (mp4Match) return mp4Match[0];

        const watchLink = $('a:contains("Watch Online"), a:contains("Stream"), a:contains("Server")').attr('href');
        if (watchLink) {
            const nextUrl = watchLink.startsWith('http') ? watchLink : (new URL(embedUrl).origin + watchLink);
            if (nextUrl !== embedUrl && !nextUrl.includes('ads')) {
                return await extractDirectStream(nextUrl, seenUrls);
            }
        }

        return null;
    } catch (error) { return null; }
}

/**
 * Parses movie/series detail page for download/stream links
 */
async function parseMoviePage(url, depth = 0, contextText = "", season = null, episode = null) {
    if (depth > 5) return [];

    console.log(`[Isaidub] Parsing page (depth ${depth}, S: ${season || 'any'}, E: ${episode || 'any'}): ${url}`);

    try {
        const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);
        const html = await response.text();
        const $ = cheerio.load(html);

        const pageTitle = $('title').text().trim() || "";
        const combinedContext = (contextText + " " + pageTitle).trim();

        const downloadLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();

            if (href && href.includes('/download/page/')) {
                if (season) {
                    const otherSeasonMatch = (combinedContext + " " + text).match(/(?:season|s)\s*0*(\d+)\b/i);
                    if (otherSeasonMatch && parseInt(otherSeasonMatch[1]) !== parseInt(season)) return;
                }
                if (episode) {
                    const ePattern = new RegExp(`(?:epi|episode|e)\\s*0*${episode}\\b`, 'i');
                    if (!ePattern.test(text) && !ePattern.test(combinedContext)) return;
                }

                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;
                const qualityMatch = text.match(/\b(360p|480p|720p|1080p|4K)\b/i);
                const quality = qualityMatch ? qualityMatch[0] : "HD";

                downloadLinks.push({
                    url: fullUrl,
                    quality: quality,
                    type: "download",
                    text: (combinedContext + " " + text).trim()
                });
            }
        });

        if (downloadLinks.length > 0) {
            console.log(`[Isaidub] Found ${downloadLinks.length} download links`);
            return downloadLinks;
        }

        const subLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().toLowerCase();

            if (!href || href === '/' || href === '#' || (!href.includes('/movie/') && !href.match(/\/\d+\/$/))) return;

            const keywords = ['360p', '480p', '720p', '1080p', '4K', 'hd', 'dvd', 'scr', 'rip', 'bluray', 'brrip', 'web', 'webrip', 'original', 'season', 'episode', 'epi'];
            let isMatch = false;
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    isMatch = true;
                    break;
                }
            }

            if (!isMatch && text.match(/\d+x\d+/)) isMatch = true;

            if (isMatch) {
                if (season) {
                    const sMatch = text.match(/season\s*(\d+)/i);
                    if (sMatch && parseInt(sMatch[1]) !== parseInt(season)) return;
                }
                const fullUrl = href.startsWith('http') ? href : `${MAIN_URL}${href}`;
                subLinks.push({ url: fullUrl, text: $(el).text().trim() });
            }
        });

        if (subLinks.length > 0) {
            console.log(`[Isaidub] Found ${subLinks.length} sub-links, following...`);
            const streams = [];
            for (const subLink of subLinks) {
                const subStreams = await parseMoviePage(subLink.url, depth + 1, (combinedContext + " " + subLink.text).trim(), season, episode);
                streams.push(...subStreams);
                if (streams.length >= 10) break;
            }
            return streams;
        }

        return [];
    } catch (error) { return []; }
}

/**
 * Extracts the final stream URL from an Isaidub download page
 */
async function extractFinalDownloadUrl(downloadPageUrl) {
    console.log(`[Isaidub] Extracting final URL from: ${downloadPageUrl}`);

    try {
        const response = await fetchWithTimeout(downloadPageUrl, { headers: HEADERS }, 10000);
        const html = await response.text();
        const $ = cheerio.load(html);

        let size = null;
        const sizeMatch = html.match(/File Size:<\/strong>\s*([^<]+)/i);
        if (sizeMatch) size = sizeMatch[1].trim();

        const downloadLinks = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim().toLowerCase();

            if (href && !href.includes('isaidub.love') && !href.startsWith('#')) {
                if (text.includes('download') || text.includes('server') || href.includes('dubmv.top') || href.includes('onestream.watch')) {
                    const fullUrl = href.startsWith('http') ? href : `https:${href}`;
                    downloadLinks.push(fullUrl);
                }
            }
        });

        if (downloadLinks.length > 0) {
            const downloadUrl = downloadLinks[0];
            const needsExtraction = downloadUrl.includes('dubmv.top/') || downloadUrl.includes('onestream.watch/') || downloadUrl.includes('uptodub.ch/');
            return { url: downloadUrl, needsExtraction, size };
        }
        return null;
    } catch (error) { return null; }
}

/**
 * Main function for Nuvio integration
 */
async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType === 'movie') {
        season = null;
        episode = null;
    }
    console.log(`[Isaidub] Processing ${mediaType} ${tmdbId} (S:${season}, E:${episode})`);

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

        let searchResults = await search(mediaInfo.title, mediaInfo.year, mediaType);
        const bestMatch = findBestTitleMatch(mediaInfo, searchResults);

        if (!bestMatch) {
            console.warn("[Isaidub] No matching title found");
            return [];
        }

        const rawStreams = await parseMoviePage(bestMatch.href, 0, "", season, episode);
        if (rawStreams.length === 0) return [];

        const limitedStreams = rawStreams.slice(0, 10);
        console.log(`[Isaidub] Extracting streams from ${limitedStreams.length} links in batches...`);

        const finalStreams = [];
        for (let i = 0; i < limitedStreams.length; i += 3) {
            const batch = limitedStreams.slice(i, i + 3);
            const batchResults = await Promise.all(batch.map(async (stream) => {
                let timeoutId;
                try {
                    return await Promise.race([
                        (async () => {
                            let finalUrl = stream.url;
                            let extractedSize = null;

                            if (stream.type === "download") {
                                const result = await extractFinalDownloadUrl(stream.url);
                                if (!result) return null;
                                extractedSize = result.size;

                                if (result.needsExtraction) {
                                    const directUrl = await extractDirectStream(result.url);
                                    if (!directUrl) return null;
                                    finalUrl = directUrl;
                                } else {
                                    finalUrl = result.url;
                                }
                            }

                            return {
                                name: "Isaidub",
                                title: formatStreamTitle(mediaInfo, { ...stream, size: extractedSize }),
                                url: finalUrl,
                                quality: stream.quality,
                                headers: { "Referer": MAIN_URL, "User-Agent": HEADERS["User-Agent"] },
                                provider: 'Isaidub'
                            };
                        })(),
                        new Promise((_, reject) => {
                            timeoutId = setTimeout(() => reject(new Error('Timeout')), 30000);
                        })
                    ]).finally(() => {
                        if (timeoutId) clearTimeout(timeoutId);
                    });
                } catch (error) {
                    console.warn(`[Isaidub] Extraction failed for ${stream.url}: ${error.message}`);
                    return null;
                }
            }));
            finalStreams.push(...batchResults.filter(r => r !== null));
            if (finalStreams.length >= 5) break;
        }

        console.log(`[Isaidub] Found ${finalStreams.length} final streamable links`);
        return finalStreams;
    } catch (error) {
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
