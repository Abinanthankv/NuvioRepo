// TamilMV Scraper for Nuvio Local Scrapers
// React Native compatible version with full original functionality

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// TamilMV Configuration
let MAIN_URL = "https://www.1tamilmv.lc";

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
 * Finds the best title match from watch links
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} watchLinks Watch links array
 * @returns {Object|null} Best matching result
 */
function findBestTitleMatch(mediaInfo, watchLinks) {
  if (!watchLinks || watchLinks.length === 0) return null;

  const targetTitle = mediaInfo.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;

  let bestMatch = null;
  let bestScore = 0;

  for (const result of watchLinks) {
    const normalizedResultTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, "");

    let score = calculateTitleSimilarity(mediaInfo.title, result.title);

    // Specific match logic from original tamilmv.js
    const titleMatch = normalizedResultTitle.includes(targetTitle) || targetTitle.includes(normalizedResultTitle);

    // Year matching logic from original tamilmv.js
    const yearMatch = !targetYear ||
      result.title.includes(targetYear.toString()) ||
      result.title.includes((targetYear + 1).toString()) ||
      result.title.includes((targetYear - 1).toString());

    if (titleMatch && yearMatch) {
      score += 0.5; // High priority for original match logic
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
    }
  }

  if (bestMatch && bestScore > 0.4) {
    console.log(`[TamilMV] Best title match: "${bestMatch.title}" (score: ${bestScore.toFixed(2)})`);
    return bestMatch;
  }

  return null;
}

// =================================================================================
// HOST EXTRACTORS
// =================================================================================

/**
 * Attempts to extract direct stream URL from various embed hosts
 * @param {string} embedUrl The embed URL
 * @returns {Promise<string|null>} Direct stream URL or null
 */
async function extractDirectStream(embedUrl) {
  try {
    console.log(`[TamilMV] Embed URL: ${embedUrl}`);
    const url = new URL(embedUrl);
    const hostname = url.hostname.toLowerCase();

    console.log(`[TamilMV] Attempting to extract from: ${hostname}`);

    // Try different extractors based on hostname
    if (hostname.includes('hglink') || hostname.includes('hubglink')) {
      return await extractFromGenericEmbed(embedUrl, 'hglink');
    } else if (hostname.includes('luluvid')) {
      return await extractFromGenericEmbed(embedUrl, 'luluvid');
    } else if (hostname.includes('wishonly')) {
      return await extractFromGenericEmbed(embedUrl, 'wishonly');
    } else if (hostname.includes('dhcplay')) {
      return await extractFromGenericEmbed(embedUrl, 'dhcplay');
    } else if (hostname.includes('vidnest')) {
      return await extractFromGenericEmbed(embedUrl, 'vidnest');
    } else if (hostname.includes('strmup')) {
      return await extractFromStrmup(embedUrl);
    }

    // If no specific extractor, return null (don't show embed URL)
    console.log(`[TamilMV] No extractor for ${hostname}, skipping`);
    return null;

  } catch (error) {
    console.error(`[TamilMV] Extraction error: ${error.message}`);
    return null; // Return null instead of embed URL
  }
}

/**
 * Specialized extractor for strmup.cc
 */
async function extractFromStrmup(embedUrl) {
  try {
    const url = new URL(embedUrl);
    const host = url.origin;
    const filecode = url.pathname.split('/').filter(p => p).pop();

    if (!filecode) return null;

    console.log(`[TamilMV] Strmup filecode: ${filecode}`);
    const ajaxUrl = `${host}/ajax/stream?filecode=${filecode}`;

    const response = await fetchWithTimeout(ajaxUrl, {
      headers: {
        ...HEADERS,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': embedUrl
      }
    }, 5000);

    const data = await response.json();
    if (data && data.streaming_url) {
      console.log(`[TamilMV] Found direct URL from strmup: ${data.streaming_url}`);
      return data.streaming_url;
    }
    return null;
  } catch (error) {
    console.error(`[TamilMV] Strmup extraction failed: ${error.message}`);
    return null;
  }
}

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

    // Check if it's a landing page
    if (html.includes('<title>Loading...</title>') || html.includes('Page is loading')) {
      console.log(`[TamilMV] Detected landing page on ${hostName}, trying mirrors...`);
      const mirrors = ['yuguaab.com', 'cavanhabg.com'];
      for (const mirror of mirrors) {
        if (hostName.includes(mirror)) continue;
        const mirrorUrl = embedUrl.replace(hostName, mirror);
        try {
          const mirrorRes = await fetchWithTimeout(mirrorUrl, { headers: { ...HEADERS, 'Referer': MAIN_URL } }, 3000);
          const mirrorHtml = await mirrorRes.text();
          if (mirrorHtml.includes('jwplayer') || mirrorHtml.includes('sources') || mirrorHtml.includes('eval(function(p,a,c,k,e,d)')) {
            html = mirrorHtml;
            break;
          }
        } catch (e) { }
      }
    }

    // Check for Packer obfuscation
    const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
    if (packerMatch) {
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
      console.log(`[TamilMV] Found direct URL from ${hostName}: ${bestUrl}`);
      return bestUrl;
    }

    console.log(`[TamilMV] No direct URL found in ${hostName}, skipping`);
    return null;

  } catch (error) {
    console.error(`[TamilMV] Error extracting from ${hostName}: ${error.message}`);
    return null;
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
    console.log(`[TamilMV] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
    return info;
  } catch (error) {
    console.error("[TamilMV] Error fetching TMDB metadata:", error.message);
    throw error;
  }
}

/**
 * Extracts [WATCH] links from homepage
 */
function extractHomepageWatchLinks(html) {
  const $ = cheerio.load(html);
  const results = [];

  $('a:contains("[WATCH]")').each((i, el) => {
    const watchUrl = $(el).attr("href");
    if (!watchUrl) return;

    let titleNodes = [];
    let curr = el.previousSibling;
    if (!curr && el.parentNode) {
      curr = el.parentNode.previousSibling;
    }

    while (curr) {
      const $curr = $(curr);
      const tag = curr.tagName ? curr.tagName.toLowerCase() : null;
      if (tag === "br" || tag === "p" || tag === "hr" || tag === "div") break;
      if ($curr.text().includes("[WATCH]")) break;
      titleNodes.unshift(curr);
      curr = curr.previousSibling;
    }

    let title = $(titleNodes).text().trim();
    title = title.replace(/^[- \t\n\r|\[\], \u00A0]+/, "").replace(/[- \t\n\r|\[\], \u00A0]+$/, "").trim();

    if (title) {
      results.push({
        title,
        watchUrl
      });
    }
  });

  return results;
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
  console.log(`[TamilMV] Processing ${mediaType} ${tmdbId}`);

  try {
    let mediaInfo;

    // Try to get TMDB details first if ID is numeric
    const isNumericId = /^\d+$/.test(tmdbId);
    if (isNumericId) {
      try {
        mediaInfo = await getTMDBDetails(tmdbId, mediaType);
      } catch (error) {
        console.log(`[TamilMV] TMDB fetch failed for ${tmdbId}, using as search query`);
        mediaInfo = { title: tmdbId, year: null };
      }
    } else {
      console.log(`[TamilMV] Using "${tmdbId}" as search query directly`);
      mediaInfo = { title: tmdbId, year: null };
    }
    console.log(`[TamilMV] Looking for ${mediaInfo.title} (${mediaInfo.year}) on homepage`);

    const homeResponse = await fetch(MAIN_URL, { headers: HEADERS });
    const homeHtml = await homeResponse.text();
    const watchLinks = extractHomepageWatchLinks(homeHtml);

    const bestMatch = findBestTitleMatch(mediaInfo, watchLinks);

    if (!bestMatch) {
      console.warn("[TamilMV] No matching title with [WATCH] link found on homepage");
      return [];
    }

    console.log(`[TamilMV] Found watch link for: ${bestMatch.title}`);

    // Try to extract direct stream from the watch URL
    console.log(`[TamilMV] Extracting direct stream from watch URL...`);
    const directUrl = await extractDirectStream(bestMatch.watchUrl);

    if (!directUrl) {
      console.log(`[TamilMV] Could not extract direct stream, skipping`);
      return [];
    }

    return [{
      name: "TamilMV",
      title: bestMatch.title.split(" - ")[0].trim(), // Clean title
      url: directUrl,
      quality: bestMatch.title.includes("720p") ? "720p" : bestMatch.title.includes("1080p") ? "1080p" : "Unknown",
      headers: {
        "Referer": MAIN_URL,
        "User-Agent": HEADERS["User-Agent"]
      },
      provider: 'TamilMV'
    }];

  } catch (error) {
    console.error("[TamilMV] getStreams failed:", error.message);
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
