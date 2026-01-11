// Tamilian.io Scraper for Nuvio Local Scrapers
// React Native compatible version

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Tamilian Configuration
let MAIN_URL = "https://tamilian.io/";
const EMBEDOJO_HOST = "https://embedojo.net";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Referer": `${MAIN_URL}/`,
};

// =================================================================================
// UTILITY FUNCTIONS
// =================================================================================

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * De-obfuscates Packer-encoded string
 */
function unpack(p, a, c, k) {
    // Custom base converter for radices > 36 (e.g., 62)
    const intToBase = (num, radix) => {
        if (radix <= 36) return num.toString(radix);

        // Base 62 mapping: 0-9, a-z, A-Z
        const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let str = "";
        do {
            str = chars[num % radix] + str;
            num = Math.floor(num / radix);
        } while (num > 0);
        return str;
    };

    while (c--) {
        if (k[c]) {
            const placeholder = intToBase(c, a);
            p = p.replace(new RegExp('\\b' + placeholder + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

/**
 * Converts string to Title Case
 */
function toTitleCase(str) {
    if (!str) return '';
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

/**
 * Formats the stream title according to the premium standard
 */
function formatStreamTitle(mediaInfo, stream) {
    const { title, year } = mediaInfo;
    const { quality, label } = stream;

    const yearStr = year ? ` (${year})` : "";

    const tapeLine = `📼: ${title}${yearStr}`;
    const providerLine = `🚜: tamilian`;

    return `Tamilian (Direct) (${quality})
${tapeLine}
${providerLine} | 🌐: MULTI`;
}

// =================================================================================
// EMBEDOJO EXTRACTOR (Reference Implementation Port)
// =================================================================================

async function extractFromEmbedojoDirect(tmdbId) {
    const categories = ['tamil', 'english', 'hindi', 'telugu', 'malayalam', 'kannada', 'dubbed'];

    console.log(`[Tamilian] Attempting direct Embedojo extraction for TMDB ID: ${tmdbId} (Categories: ${categories.join(', ')})`);

    // Try all categories in parallel to find the first one that works
    const pool = categories.map(async (cat) => {
        try {
            const url = `${EMBEDOJO_HOST}/${cat}/tmdb/${tmdbId}`;
            const response = await fetchWithTimeout(url, { headers: HEADERS }, 6000);
            if (!response.ok) return null;

            const html = await response.text();
            const $ = cheerio.load(html);

            let packedScript = null;
            $('script').each((i, el) => {
                const content = $(el).html();
                if (content && content.includes('function(p,a,c,k,e,d)')) {
                    packedScript = content;
                    return false; // Break loop
                }
            });

            if (!packedScript) return null;

            const packerMatch = packedScript.match(/return p\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\(/s) ||
                packedScript.match(/return p\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\(/);

            if (!packerMatch) return null;

            const unpacked = unpack(packerMatch[1], parseInt(packerMatch[2]), parseInt(packerMatch[3]), packerMatch[4].split('|'));
            const tokenMatch = unpacked.match(/FirePlayer\s*\(\s*["']([^"']+)["']/);
            if (!tokenMatch) return null;

            const token = tokenMatch[1];
            const postUrl = `${EMBEDOJO_HOST}/player/index.php?data=${token}&do=getVideo`;
            const postResponse = await fetchWithTimeout(postUrl, {
                method: 'POST',
                headers: {
                    ...HEADERS,
                    "Origin": EMBEDOJO_HOST,
                    "X-Requested-With": "XMLHttpRequest"
                }
            }, 6000);

            const videoData = await postResponse.json();

            const finalUrl = videoData.securedLink || videoData.videoSource;
            if (videoData && finalUrl) {
                console.log(`[Tamilian] Found video source in category "${cat}": ${finalUrl}`);
                return {
                    url: finalUrl,
                    quality: "1080p",
                    isM3U8: true,
                    category: cat
                };
            }
        } catch (e) {
            // Ignore individual failures
        }
        return null;
    });

    try {
        const results = await Promise.all(pool);
        const validResult = results.find(r => r !== null);
        if (validResult) return validResult;
    } catch (error) {
        console.error(`[Tamilian] Embedojo Parallel Direct Error: ${error.message}`);
    }
    return null;
}

// =================================================================================
// CORE FUNCTIONS
// =================================================================================

async function getTMDBDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (!data.id) throw new Error('Invalid TMDB ID');

        const title = data.title || data.name;
        const info = {
            title: title,
            year: (data.release_date || data.first_air_date || "").split("-")[0],
            tmdbId: data.id,
            originalLanguage: data.original_language
        };
        console.log(`[Tamilian] TMDB Info: "${info.title}" (${info.year || 'N/A'}) [${info.originalLanguage}]`);
        return info;
    } catch (error) {
        console.error("[Tamilian] Error fetching TMDB metadata:", error.message);
        throw error;
    }
}

async function searchTMDB(query, mediaType, year = null) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    let url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;

    if (year) {
        url += `&${type === 'movie' ? 'primary_release_year' : 'first_air_date_year'}=${year}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            const firstMatch = data.results[0];
            console.log(`[Tamilian] Resolved "${query}" to TMDB ID: ${firstMatch.id} (${firstMatch.title || firstMatch.name})`);
            return {
                title: firstMatch.title || firstMatch.name,
                year: (firstMatch.release_date || firstMatch.first_air_date || "").split("-")[0],
                tmdbId: firstMatch.id,
                originalLanguage: firstMatch.original_language
            };
        }
        return null;
    } catch (error) {
        console.error(`[Tamilian] TMDB Search failed: ${error.message}`);
        return null;
    }
}


/**
 * Main function for Nuvio integration (Movies only)
 */
async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
    if (mediaType !== 'movie') {
        console.log(`[Tamilian] Media type is "${mediaType}", but Tamilian only supports Movies.`);
        return [];
    }

    console.log(`[Tamilian] Processing ${mediaType} ${tmdbId}`);

    try {
        let mediaInfo;
        const isNumeric = /^\d+$/.test(tmdbId);

        let yearFromQuery = null;
        let cleanName = tmdbId;

        if (!isNumeric) {
            const yearMatch = tmdbId.match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                yearFromQuery = yearMatch[0];
                cleanName = tmdbId.replace(/\b(19|20)\d{2}\b/g, '').trim();
            }
        }

        // Handle numeric ID vs String query
        if (isNumeric) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (e) {
                // If numeric ID fetch fails, we don't have a name, so we can't search by name easily
                mediaInfo = { tmdbId: tmdbId, title: "Unknown", year: "" };
            }
        } else {
            console.log(`[Tamilian] Searching TMDB for: "${cleanName}" ${yearFromQuery ? `(${yearFromQuery})` : ""}`);
            mediaInfo = await searchTMDB(cleanName, mediaType, yearFromQuery);
            if (!mediaInfo || !mediaInfo.tmdbId) {
                console.log("[Tamilian] TMDB resolution failed or no TMDB ID found. Cannot proceed with direct extraction.");
                return [];
            }
        }

        const validStreams = [];

        // Direct Embedojo Extraction (Best for Movies)
        if (mediaInfo.tmdbId) {
            const directStream = await extractFromEmbedojoDirect(mediaInfo.tmdbId);
            if (directStream) {
                validStreams.push({
                    title: `${mediaInfo.title} (${mediaInfo.year}) - 1080p`,
                    url: directStream.url,
                    quality: directStream.quality,
                    label: "Embedojo Direct"
                });
            }
        }

        return validStreams.map((s) => ({
            name: "Tamilian",
            title: formatStreamTitle(mediaInfo, s),
            url: s.url,
            quality: s.quality || "Unknown",
            headers: {
                "Referer": MAIN_URL,
                "Origin": "https://embedojo.net",
                "User-Agent": HEADERS["User-Agent"]
            },
            provider: 'Tamilian'
        }));

    } catch (error) {
        console.error("[Tamilian] getStreams failed:", error.message);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
