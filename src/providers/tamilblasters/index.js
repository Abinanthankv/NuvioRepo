// Tamilblasters Scraper for Nuvio Local Scrapers
// React Native compatible version with full original functionality

const cheerio = require('cheerio-without-node-native');

// TMDB API Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Tamilblasters Configuration
let MAIN_URL = "https://www.1tamilblasters.business";

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
 * Finds all matching titles from search results
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} searchResults Search results array
 * @returns {Object|null} Best matching result
 */
/**
 * Finds all matching titles from search results
 * @param {Object} mediaInfo TMDB media info
 * @param {Array} searchResults Search results array
 * @returns {Array} Array of matching results
 */
function findAllTitleMatches(mediaInfo, searchResults) {
  if (!searchResults || searchResults.length === 0) return [];

  const targetTitle = mediaInfo.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const targetYear = mediaInfo.year ? parseInt(mediaInfo.year) : null;

  const matches = [];

  for (const result of searchResults) {
    const normalizedResultTitle = result.title.toLowerCase().replace(/[^a-z0-9]/g, "");

    let score = calculateTitleSimilarity(mediaInfo.title, result.title);

    // Specific match logic from original tamilblasters.js
    const titleMatch = normalizedResultTitle.includes(targetTitle);

    // Year matching logic from original tamilblasters.js
    const yearMatch = !targetYear ||
      result.title.includes(targetYear.toString()) ||
      result.title.includes((targetYear + 1).toString()) ||
      result.title.includes((targetYear - 1).toString());

    if (titleMatch && yearMatch) {
      score += 0.5; // High priority for original match logic
    }

    if (score > 0.4) {
      console.log(`[Tamilblasters] Match found: "${result.title}" (score: ${score.toFixed(2)})`);
      matches.push(result);
    }
  }

  return matches;
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
    console.log(`[Tamilblasters] TMDB Info: "${info.title}" (${info.year || 'N/A'})`);
    return info;
  } catch (error) {
    console.error("[Tamilblasters] Error fetching TMDB metadata:", error.message);
    throw error;
  }
}

/**
 * Searches Tamilblasters for the given query
 */
async function search(query) {
  const url = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
  console.log(`[Tamilblasters] Searching: ${url}`);

  try {
    const response = await fetchWithTimeout(url, { headers: HEADERS }, 8000);

    // Detect if valid redirect happened (e.g. domain switch)
    if (response.url && !response.url.includes(new URL(MAIN_URL).hostname)) {
      try {
        const finalUrl = new URL(response.url);
        if (finalUrl.protocol.startsWith('http')) {
          console.log(`[Tamilblasters] Domain redirect detected: ${MAIN_URL} -> ${finalUrl.origin}`);
          MAIN_URL = finalUrl.origin;
          HEADERS.Referer = `${MAIN_URL}/`;
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    $(".posts-wrapper article, .nv-index-posts article").each((i, el) => {
      const titleEl = $(el).find("h2.entry-title a");
      const title = titleEl.text().trim();
      const href = titleEl.attr("href");
      if (title && href) {
        results.push({ title, href });
      }
    });

    return results;
  } catch (error) {
    console.error("[Tamilblasters] Search error:", error.message);
    return [];
  }
}

// =================================================================================
// HOST EXTRACTORS
// =================================================================================

/**
 * Detects quality variants from m3u8 stream manifest
 * If it's a master playlist, it returns all variants.
 * @param {string} m3u8Url The m3u8 URL
 * @returns {Promise<Array<{url: string, quality: string}>>} Array of video variants
 */
async function detectQualityFromM3U8(m3u8Url) {
  try {
    const response = await fetchWithTimeout(m3u8Url, {
      headers: {
        ...HEADERS,
        'Referer': MAIN_URL
      }
    }, 5000);
    const content = await response.text();

    if (!content.includes('#EXTM3U')) {
      return [{ url: m3u8Url, quality: "Unknown" }];
    }

    const variants = [];

    // Check if it's a master playlist with multiple streams
    if (content.includes('#EXT-X-STREAM-INF')) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXT-X-STREAM-INF')) {
          // Extract resolution
          let quality = "Unknown";
          const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
          if (resMatch) {
            const height = parseInt(resMatch[2]);
            if (height >= 2160) quality = "4K";
            else if (height >= 1080) quality = "1080p";
            else if (height >= 720) quality = "720p";
            else if (height >= 480) quality = "480p";
            else quality = `${height}p`;
          }

          // Next line should be the URL
          if (i + 1 < lines.length) {
            let variantUrl = lines[i + 1].trim();
            if (variantUrl && !variantUrl.startsWith('#')) {
              // Resolve relative URL
              if (!variantUrl.startsWith('http')) {
                const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
                variantUrl = baseUrl + variantUrl;
              }
              variants.push({ url: variantUrl, quality });
            }
          }
        }
      }
    }

    if (variants.length > 0) {
      // Sort variants by quality (best first)
      const qualityWeights = { "4K": 2160, "1080p": 1080, "720p": 720, "480p": 480, "Unknown": 0 };
      variants.sort((a, b) => {
        const weightA = qualityWeights[a.quality] || parseInt(a.quality) || 0;
        const weightB = qualityWeights[b.quality] || parseInt(b.quality) || 0;
        return weightB - weightA;
      });
      return variants;
    }

    // Fallback for single variant m3u8
    const qualityMatch = content.match(/\b(2160p|1080p|720p|480p|4K|UHD|HD)\b/i);
    const quality = qualityMatch ? qualityMatch[0] : "Unknown";

    return [{ url: m3u8Url, quality }];
  } catch (error) {
    console.error(`[Tamilblasters] Error detecting quality from m3u8: ${error.message}`);
    return [{ url: m3u8Url, quality: "Unknown" }];
  }
}

/**
 * Attempts to extract direct stream URLs from various embed hosts
 * @param {string} embedUrl The embed URL
 * @returns {Promise<Array<{url: string, quality: string}>>} Array of stream variants
 */
async function extractDirectStream(embedUrl) {
  try {
    console.log(`[Tamilblasters] Embed URL: ${embedUrl}`);
    const url = new URL(embedUrl);
    const hostname = url.hostname.toLowerCase();

    console.log(`[Tamilblasters] Attempting universal extraction from: ${hostname}`);

    // Call generic extractor for any host
    return await extractFromGenericEmbed(embedUrl, hostname);

  } catch (error) {
    console.error(`[Tamilblasters] Extraction error: ${error.message}`);
    return [];
  }
}

/**
 * Generic extractor that looks for common video source patterns
 * @param {string} embedUrl The embed URL
 * @param {string} hostName Host identifier for logging
 * @returns {Promise<Array<{url: string, quality: string}>>} Array of stream variants
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
      console.log(`[Tamilblasters] Detected landing page on ${hostName}, trying mirrors...`);
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
      // Prioritize .m3u8 and URLs with params
      allFoundUrls.sort((a, b) => {
        const hasParamA = a.includes('?');
        const hasParamB = b.includes('?');
        if (hasParamA !== hasParamB) return hasParamB ? 1 : -1;
        const isM3U8A = a.toLowerCase().includes('.m3u8');
        const isM3U8B = b.toLowerCase().includes('.m3u8');
        if (isM3U8A !== isM3U8B) return isM3U8B ? 1 : -1;
        return a.length - b.length;
      });

      const bestUrl = allFoundUrls[0];
      console.log(`[Tamilblasters] Detected best URL: ${bestUrl}. Resolving quality...`);
      return await detectQualityFromM3U8(bestUrl);
    }

    return [];
  } catch (error) {
    console.error(`[Tamilblasters] Error extracting from ${hostName}: ${error.message}`);
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
  console.log(`[Tamilblasters] Processing ${mediaType} ${tmdbId}`);

  try {
    let mediaInfo;

    // Try to get TMDB details first
    const isNumericId = /^\d+$/.test(tmdbId);
    if (isNumericId) {
      try {
        mediaInfo = await getTMDBDetails(tmdbId, mediaType);
      } catch (error) {
        // If TMDB fetch fails, use tmdbId as the title directly
        console.log(`[Tamilblasters] TMDB fetch failed, using "${tmdbId}" as search query`);
        mediaInfo = {
          title: tmdbId,
          year: null
        };
      }
    } else {
      console.log(`[Tamilblasters] Using "${tmdbId}" as search query directly`);
      mediaInfo = {
        title: tmdbId,
        year: null
      };
    }
    const searchResults = await search(mediaInfo.title);

    const allMatches = findAllTitleMatches(mediaInfo, searchResults);

    if (allMatches.length === 0) {
      console.warn("[Tamilblasters] No matching titles found in search results");
      return [];
    }

    // Deduplicate by URL to avoid processing the same page twice
    const uniqueMatches = [];
    const seenUrls = new Set();
    for (const match of allMatches) {
      if (!seenUrls.has(match.href)) {
        seenUrls.add(match.href);
        uniqueMatches.push(match);
      }
    }

    // Limit to top 3 unique matches for performance
    const topMatches = uniqueMatches.slice(0, 3);
    console.log(`[Tamilblasters] Processing top ${topMatches.length} unique matches out of ${allMatches.length} total`);

    const allValidStreams = [];

    for (const match of topMatches) {
      console.log(`[Tamilblasters] Processing match: ${match.title} -> ${match.href}`);

      try {
        const pageResponse = await fetchWithTimeout(match.href, { headers: HEADERS }, 8000);
        const pageHtml = await pageResponse.text();
        const $ = cheerio.load(pageHtml);

        // Extract full title from page for better quality/language info
        const fullPageTitle = $("h1.entry-title").text().trim() || match.title;




        console.log(`[Tamilblasters] Full Page Title: ${fullPageTitle}`);

        const rawStreams = [];
        $("iframe").each((i, el) => {
          let streamurl = $(el).attr("src");
          if (!streamurl || streamurl.includes("google.com") || streamurl.includes("youtube.com"))
            return;

          // Try to find episode label in preceding text
          let episodeLabel = "";
          let current = $(el);

          // Search up to 5 preceding siblings or parent's siblings
          for (let j = 0; j < 5; j++) {
            let prev = current.prev();
            if (prev.length === 0) {
              // Try parent's previous if no more siblings
              current = current.parent();
              if (current.is("body") || current.length === 0) break;
              continue;
            }

            const text = prev.text().trim();
            if (text.toLowerCase().includes("episode")) {
              episodeLabel = text.replace(/[\r\n]+/g, " ").trim();
              break;
            }
            current = prev;
          }

          let label = episodeLabel || ($(el).closest("div").prev("p").text().trim()) || "Stream " + (i + 1);

          // Parse title: "The Raja Saab (2026) Telugu" -> "The Raja Saab(2026)-Telugu (Stream 2)"
          const matchTitle = match.title;
          const matchData = matchTitle.match(/^(.*?)\s*\((\d{4})\)\s*(.*)$/);
          let movieName = matchTitle;
          let year = "";
          let language = "";

          if (matchData) {
            movieName = matchData[1].trim();
            year = `(${matchData[2]})`;
            language = matchData[3].trim() || "Original";
          } else {
            // Fallback for titles without clear year in parentheses
            const fallbackMatch = matchTitle.match(/^(.*?)\s*\(([^)]+)\)$/);
            if (fallbackMatch) {
              movieName = fallbackMatch[1].trim();
              language = fallbackMatch[2].trim();
            }
          }

          // Clean up label if it contains "Episode" to make it more concise
          let displayLabel = label;
          if (label.toLowerCase().includes("episode")) {
            const epMatch = label.match(/Episode\s*[–-ー]\s*(\d+)/i) || label.match(/Episode\s*(\d+)/i);
            if (epMatch) {
              displayLabel = `EP${epMatch[1]}`;
            }
          }

          let finalTitle;

          // Auto-detect if this is a TV show based on the match title OR the component label
          const isTVShow = mediaType === 'tv' ||
            matchTitle.match(/S\d+.*EP/i) ||
            matchTitle.match(/Season.*Episode/i) ||
            displayLabel.match(/EP\s*\d+/i) ||
            displayLabel.match(/Episode\s*\d+/i);

          if (isTVShow) {
            // Extract Season from post title using regex, default to 1
            const sMatch = matchTitle.match(/S(\d+)/i);
            const seasonCode = sMatch ? `s${sMatch[1].padStart(2, '0')}` : 's01';

            // Extract Episode from displayLabel (preferred) or post title
            let episodeNum = null;
            const epLabelMatch = displayLabel.match(/EP\s*(\d+)/i) || displayLabel.match(/Episode\s*(\d+)/i);
            if (epLabelMatch) {
              episodeNum = epLabelMatch[1];
            } else {
              // Fallback to title
              const epTitleMatch = matchTitle.match(/EP\s*(\d+)/i);
              if (epTitleMatch) episodeNum = epTitleMatch[1];
            }

            const episodeCode = episodeNum ? `e${episodeNum.padStart(2, '0')}` : displayLabel;


            // Clean up language string (remove season/episode markers)
            let langClean = language.replace(/S\d+/gi, '')
              .replace(/EP\s*\(.*?\)/gi, '')
              .replace(/EP\d+/gi, '')
              .replace(/\s+/g, ' ')
              .trim();
            // Remove leading/trailing dashes, brackets, or commas that might be left over
            langClean = langClean.replace(/^[-\s,[\]]+|[-\s,[\]]+$/g, '').trim();

            finalTitle = `${movieName}${year}-${seasonCode} ${episodeCode}${langClean ? ' - ' + langClean : ''}`;
          } else {
            finalTitle = `${movieName}${year}${language ? '-' + language : ''} (${displayLabel})`;
          }

          // Quality will be detected from m3u8 stream later
          rawStreams.push({
            title: finalTitle,
            url: streamurl
          });
        });

        // Extract direct stream URLs from embed hosts
        // Limit to first 5 iframes for performance
        const limitedStreams = rawStreams.slice(0, 5);
        if (rawStreams.length > 5) {
          console.log(`[Tamilblasters] Limiting to first 5 iframes out of ${rawStreams.length} for performance`);
        }
        console.log(`[Tamilblasters] Extracting direct streams from ${limitedStreams.length} embed URLs for "${match.title}"...`);

        const directStreams = [];
        for (const stream of limitedStreams) {
          try {
            const variants = await Promise.race([
              extractDirectStream(stream.url),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Extraction timeout after 5 seconds')), 5000)
              )
            ]);

            if (variants && variants.length > 0) {
              for (const variant of variants) {
                directStreams.push({
                  ...stream,
                  url: variant.url,
                  quality: variant.quality
                });
              }
            }
          } catch (error) {
            console.error(`[Tamilblasters] Failed to extract stream: ${error.message}`);
          }
        }

        // Filter out null entries (already handled by loop)
        let validStreams = directStreams;

        // Filter by season and episode if provided OR if we detect TV show patterns

        // Use simpler logic: if the request specifically asks for S/E, we MUST filter.
        // We also check for mediaType='tv' or pattern matches as a secondary hint but the params are key.
        const shouldFilter = (season !== null || episode !== null);

        if (shouldFilter) {
          const reqEpUpper = episode !== null ? `EP${episode.toString().padStart(2, '0')}` : null;
          const reqEpLower = episode !== null ? `e${episode.toString().padStart(2, '0')}` : null;
          const reqEpSpaced = episode !== null ? `e ${episode.toString().padStart(2, '0')}` : null; // Handle "e 64" format
          const reqSeason = season !== null ? `S${season.toString().padStart(2, '0')}` : null;
          const reqSeasonLower = season !== null ? `s${season.toString().padStart(2, '0')}` : null;

          // Check if the current search match is for the right season
          const matchHasCorrectSeason = !reqSeason ||
            match.title.toUpperCase().includes(reqSeason) ||
            match.title.toLowerCase().includes(reqSeasonLower);

          if (matchHasCorrectSeason) {
            const filtered = validStreams.filter(s => {
              if (!reqEpUpper) return true;
              // Check if the stream title contains the requested episode (multiple formats)
              const titleUpper = s.title.toUpperCase();
              const titleLower = s.title.toLowerCase();
              return titleUpper.includes(reqEpUpper) ||
                titleLower.includes(reqEpLower) ||
                titleLower.includes(reqEpSpaced) ||
                titleUpper.includes(`EPISODE ${episode}`);
            });

            // If we are filtering, we should return the filtered results
            // even if empty (meaning the requested episode wasn't found)
            validStreams = filtered;

            if (filtered.length > 0) {
              console.log(`[Tamilblasters] Filtered to ${validStreams.length} streams for episode ${episode}`);
            } else {
              console.log(`[Tamilblasters] No streams found matching epsiode ${episode}`);
            }
          } else {
            // Match is for wrong season, skip these streams
            validStreams = [];
          }
        }

        console.log(`[Tamilblasters] Successfully extracted ${validStreams.length} direct streams for "${match.title}"`);
        allValidStreams.push(...validStreams);

        // Early termination if we have enough streams
        if (allValidStreams.length >= 10) {
          console.log(`[Tamilblasters] Found ${allValidStreams.length} streams, stopping early`);
          break;
        }
      } catch (innerError) {
        console.error(`[Tamilblasters] Failed to process match ${match.title}:`, innerError.message);
      }
    }

    return allValidStreams.map((s) => ({
      name: "Tamilblasters",
      title: s.title,
      url: s.url,
      quality: s.quality || "Unknown",
      headers: {
        "Referer": MAIN_URL,
        "User-Agent": HEADERS["User-Agent"]
      },
      provider: 'Tamilblasters'
    }));

  } catch (error) {
    console.error("[Tamilblasters] getStreams failed:", error.message);
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

