// Tamilblasters Scraper for Nuvio Local Scrapers - Revamped Version 2.1
// Focus: Extreme Speed, High Reliability, and Universal Extraction for 1tamilblasters.bz

const cheerio = require('cheerio-without-node-native');

// Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
let MAIN_URL = "https://1tamilblasters.bz";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0",
  "Referer": `${MAIN_URL}/`,
  "Accept": "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site"
};

// =================================================================================
// UTILITIES
// =================================================================================

async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function checkLink(url, headers = {}) {
  try {
    const response = await fetchWithTimeout(url, { method: 'GET', headers }, 5000);
    return response.ok || response.status === 206;
  } catch (error) {
    return false;
  }
}

function safeB64Decode(str) {
  try {
    if (typeof atob !== 'undefined') return atob(str.trim());
    return Buffer.from(str.trim(), 'base64').toString('binary');
  } catch (e) { return null; }
}

function unpack(p, a, c, k) {
  while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
  return p;
}

function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function calculateTitleSimilarity(title1, title2) {
  const n1 = normalizeTitle(title1);
  const n2 = normalizeTitle(title2);
  if (n1 === n2) return 1.0;
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;
  const w1 = new Set(n1.split(/\s+/).filter(w => w.length > 2));
  const w2 = new Set(n2.split(/\s+/).filter(w => w.length > 2));
  if (w1.size === 0 || w2.size === 0) return 0;
  const intersection = new Set([...w1].filter(w => w2.has(w)));
  const union = new Set([...w1, ...w2]);
  return intersection.size / union.size;
}

/**
 * Formats the stream title according to the premium standard
 */
function formatStreamTitle(mediaInfo, stream) {
  const { title, year } = mediaInfo;
  const { quality, type, size, language, seasonCode, episodeCode, label, audioInfo } = stream;

  const displayYear = year || stream.matchYear;
  const yearStr = displayYear ? ` (${displayYear})` : "";
  const isTV = !!(seasonCode || episodeCode);

  let tapeLine = `📼: ${title}${yearStr}`;
  if (isTV) {
    tapeLine += ` - ${seasonCode || 'S01'} ${episodeCode || ''}`;
    // If there's an episode label subtitle
    if (label && !label.toLowerCase().includes('stream') && !label.includes(episodeCode)) {
      tapeLine += ` (${label})`;
    }
  } else if (label && !label.toLowerCase().includes('stream')) {
    tapeLine += ` (${label})`;
  }
  tapeLine += ` - ${quality !== 'Unknown' ? quality : ''}`;

  const typeLine = (type && type !== "UNKNOWN") ? `📺: ${type}\n` : "";
  const sizeLine = (size && size !== "UNKNOWN") ? `💾: ${size} | 🚜: tamilblasters\n` : "";

  let lang = language || "TAMIL";
  if (audioInfo) lang = audioInfo;

  return `Tamilblasters (Instant) (${quality})
${typeLine}${tapeLine}
${sizeLine}🌐: ${lang.toUpperCase()}`;
}

// =================================================================================
// UNIVERSAL EXTRACTION ENGINE
// =================================================================================

class UniversalExtractor {
  static async extract(embedUrl, depth = 0) {
    if (depth > 2) return null; // Avoid infinite loops
    try {
      const response = await fetchWithTimeout(embedUrl, { headers: { ...HEADERS, 'Referer': MAIN_URL } }, 5000);
      let html = await response.text();
      const origin = new URL(embedUrl).origin;

      // Unpack obfuscated JS
      const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{.*?\}\s*\((.*)\)\s*\)/s);
      if (packerMatch) {
        const pMatch = packerMatch[1].trim().match(/^'(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\(/s);
        if (pMatch) html += "\n" + unpack(pMatch[1], parseInt(pMatch[2]), parseInt(pMatch[3]), pMatch[4].split('|'));
      }

      // 1. Look for direct manifest links
      const patterns = [
        /["']hls[2-4]["']\s*:\s*["']([^"']+)["']/gi,
        /sources\s*:\s*\[\s*{\s*file\s*:\s*["']([^"']+)["']/gi,
        /https?:\/\/[^\s"']+\.m3u8[^\s"']*/gi,
        /["'](\/[^\s"']+\.m3u8[^\s"']*)["']/gi,
        /["']?file["']?\s*:\s*["']([^"']+)["']/gi
      ];

      let links = [];
      for (const p of patterns) {
        const matches = html.match(p);
        if (matches) matches.forEach(m => {
          let u = m.replace(/^.*?["']/, '').replace(/["'].*$/, '');
          if (u.startsWith('/') && !u.startsWith('//')) u = origin + u;
          if (u.includes('.m3u8') || u.includes('.mp4')) links.push(u);
        });
      }

      // 2. Look for Base64 encoded links
      const b64Parts = html.match(/[A-Za-z0-9+/]{24,}=*/g);
      if (b64Parts) b64Parts.forEach(b => {
        const decoded = safeB64Decode(b);
        if (decoded && (decoded.includes('.m3u8') || decoded.startsWith('http'))) links.push(decoded);
      });

      if (links.length > 0) {
        // Precise sorting to find the Master manifest
        links.sort((a, b) => (b.includes('?') ? 1 : 0) - (a.includes('?') ? 1 : 0) || b.length - a.length);
        const bestUrl = links[0];
        console.log(`[Tamilblasters] Winner Discovered: ${bestUrl}`);
        return await this.resolveManifest(bestUrl, embedUrl);
      }

      // 3. Recursive Discovery for landing pages
      const jumps = html.matchAll(/href\s*=\s*["'](https?:\/\/[^"']*\/(?:stream|file|d|v|e)\/[^"']+)["']/gi);
      for (const j of jumps) {
        console.log(`[Tamilblasters] Following Discovery Jump: ${j[1]}`);
        const result = await this.extract(j[1], depth + 1);
        if (result) return result;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  static async resolveManifest(m3u8Url, embedUrl) {
    try {
      const referer = new URL(embedUrl).origin + "/";
      const response = await fetchWithTimeout(m3u8Url, { headers: { ...HEADERS, 'Referer': referer } }, 5000);
      const content = await response.text();

      const variants = [];
      const audios = [];
      const tokens = new URL(m3u8Url).search;

      // Extract Audio
      const audioMatches = content.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO.*?NAME="([^"]+)"/g);
      for (const m of audioMatches) if (!audios.includes(m[1])) audios.push(m[1]);

      // Extract Qualities
      const variantMatches = content.matchAll(/#EXT-X-STREAM-INF:.*?RESOLUTION=\d+x(\d+).*?\n(.*)/gi);
      for (const m of variantMatches) {
        let vUrl = m[2].trim();
        if (!vUrl.startsWith('http')) vUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1) + vUrl;
        if (tokens && !vUrl.includes('?')) vUrl += tokens;
        variants.push({ url: vUrl, quality: this.heightToQuality(m[1]) });
      }

      return {
        url: variants.length > 0 ? m3u8Url : m3u8Url, // Use master if variants found
        quality: variants.length > 0 ? variants[0].quality : (content.match(/\b(2160|1080|720|480)p?\b/i)?.[0] || "Unknown"),
        audios,
        referer,
        origin: new URL(referer).origin
      };
    } catch (e) { return null; }
  }

  static heightToQuality(h) {
    h = parseInt(h);
    if (h >= 2160) return "4K";
    if (h >= 1080) return "1080p";
    if (h >= 720) return "720p";
    if (h >= 480) return "480p";
    return h + "p";
  }
}

// =================================================================================
// MAIN ENTRY
// =================================================================================

async function search(query) {
  console.log(`[Tamilblasters] Searching for: ${query}`);
  try {
    const searchUrl = `${MAIN_URL}/index.php?/search/&q=${encodeURIComponent(query)}&quick=1`;
    const res = await fetchWithTimeout(searchUrl, { headers: HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $(".ipsStreamItem_title a").each((i, el) => {
      const a = $(el);
      const href = a.attr("href");
      if (href && href.includes('/forums/topic/')) {
        results.push({
          title: a.text().trim(),
          href: href
        });
      }
    });
    return results;
  } catch (error) {
    console.error(`[Tamilblasters] Search error: ${error.message}`);
    return [];
  }
}

async function getStreams(tmdbId, type = 'movie', season = null, episode = null) {
  const mediaType = (type === 'tv' || type === 'tvshow') ? 'tv' : 'movie';
  const isNumeric = /^\d+$/.test(String(tmdbId));

  console.log(`[Tamilblasters] 🚀 Starting High-Speed Fetch for ${mediaType}: ${tmdbId}`);

  try {
    // 1. Resolve Media Info
    let mediaInfo = { title: String(tmdbId), year: null };

    if (isNumeric) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const res = await fetchWithTimeout(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          mediaInfo = {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || "").split("-")[0]
          };
          console.log(`[Tamilblasters] TMDB Resolved: ${mediaInfo.title} (${mediaInfo.year})`);
          break;
        } catch (error) {
          attempts++;
          console.log(`[Tamilblasters] TMDB Attempt ${attempts} failed: ${error.message}`);
          if (attempts < 3) await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    // 2. Site Search
    let searchResults = await search(mediaInfo.title);

    // Fallback search
    if (searchResults.length === 0 && isNumeric) {
      searchResults = await search(tmdbId);
    }

    // 3. High-Precision Matching
    const matches = searchResults
      .filter(r => {
        const score = calculateTitleSimilarity(mediaInfo.title, r.title);
        const yearMatch = !mediaInfo.year || mediaType === 'tv' || r.title.includes(mediaInfo.year);
        return score > 0.4 && yearMatch;
      })
      .sort((a, b) => {
        const aWatch = a.title.toLowerCase().includes('watch online') ? 1 : 0;
        const bWatch = b.title.toLowerCase().includes('watch online') ? 1 : 0;
        if (aWatch !== bWatch) return bWatch - aWatch;
        return calculateTitleSimilarity(mediaInfo.title, b.title) - calculateTitleSimilarity(mediaInfo.title, a.title);
      })
      .slice(0, 5); // Process top 5 matches

    if (matches.length === 0) return [];

    const allFinalStreams = [];
    const targetResults = 10;

    for (const match of matches) {
      if (allFinalStreams.length >= targetResults) break;

      try {
        const pageRes = await fetchWithTimeout(match.href, { headers: HEADERS });
        const pageHtml = await pageRes.text();
        const $ = cheerio.load(pageHtml);
        const fullPageTitle = $("h1.ipsType_pageTitle").text().trim() || $("h1.entry-title").text().trim() || match.title;

        const yrMatch = fullPageTitle.match(/\(?(\d{4})\)?/);
        const matchYear = yrMatch ? yrMatch[1] : (mediaInfo.year || 'N/A');

        const streamsInPage = [];
        $("iframe").each((i, el) => {
          const src = $(el).attr("src");
          if (!src || src.includes('google') || src.includes('youtube')) return;

          let label = `Stream ${i + 1}`;
          let current = $(el);
          for (let j = 0; j < 5; j++) {
            let prev = current.prev();
            if (prev.length === 0) { current = current.parent(); if (!current.length || current.is('body')) break; continue; }
            const text = prev.text().trim();
            if (text.toLowerCase().includes('episode') || text.match(/EP\d+/i) || text.match(/\(\d+-\d+\)/)) { label = text; break; }
            current = prev;
          }
          streamsInPage.push({ url: src, label });
        });

        // Use Promise.all for extraction in single page
        await Promise.all(streamsInPage.map(async (s) => {
          if (allFinalStreams.length >= targetResults) return;

          // Season/Episode Logic
          const sLabelMatch = s.label.match(/S(\d+)/i) || s.label.match(/Season\s*(\d+)/i);
          const eLabelMatch = s.label.match(/E(\d+)/i) || s.label.match(/Episode\s*(\d+)/i) || s.label.match(/EP\s*(\d+)/i) || s.label.match(/–\s*(\d+)/);

          let detectedS = sLabelMatch ? parseInt(sLabelMatch[1]) : null;
          let detectedE = eLabelMatch ? parseInt(eLabelMatch[1]) : null;

          if (detectedS === null) {
            const sTitleMatch = fullPageTitle.match(/S(\d+)/i) || fullPageTitle.match(/Season\s*(\d+)/i);
            if (sTitleMatch) detectedS = parseInt(sTitleMatch[1]);
          }
          if (detectedE === null) {
            const eTitleMatch = fullPageTitle.match(/E(\d+)/i) || fullPageTitle.match(/Episode\s*(\d+)/i) || fullPageTitle.match(/EP\s*(\d+)/i);
            if (eTitleMatch) detectedE = parseInt(eTitleMatch[1]);
          }

          // Strict Filtering for TV
          if (mediaType === 'tv') {
            if (season !== null && detectedS !== null && detectedS !== season) return;
            if (episode !== null) {
              if (detectedE !== null && detectedE !== episode) {
                // Check for range match
                const rangeMatch = s.label.match(/(\d+)-(\d+)/) || fullPageTitle.match(/(\d+)-(\d+)/);
                if (rangeMatch) {
                  const start = parseInt(rangeMatch[1]);
                  const end = parseInt(rangeMatch[2]);
                  if (episode < start || episode > end) return;
                } else {
                  return;
                }
              }
            }
          }

          const result = await UniversalExtractor.extract(s.url);
          if (!result) return;

          const checkHeaders = { ...HEADERS, 'Referer': result.referer, 'Origin': result.origin };
          const isPlayable = await checkLink(result.url, checkHeaders);

          if (isPlayable) {
            const streamData = {
              title: mediaInfo.title,
              quality: result.quality,
              type: fullPageTitle.toUpperCase().includes('BLURAY') ? 'BluRay' :
                fullPageTitle.toUpperCase().includes('WEB-DL') ? 'WEB-DL' :
                  fullPageTitle.toUpperCase().includes('WEBRIP') ? 'WEBRip' : 'HDRip',
              size: (fullPageTitle.match(/(\d+\.?\d*\s*[mMgG][bB])/)?.[1] || 'UNKNOWN').toUpperCase(),
              language: result.audios.join(' / ') || 'TAMIL',
              seasonCode: detectedS ? `S${detectedS.toString().padStart(2, '0')}` : (season ? `S${season.toString().padStart(2, '0')}` : null),
              episodeCode: detectedE ? `E${detectedE.toString().padStart(2, '0')}` : (episode ? `E${episode.toString().padStart(2, '0')}` : null),
              label: s.label,
              audioInfo: result.audios.length > 0 ? result.audios.join(', ') : "",
              matchYear: matchYear
            };

            allFinalStreams.push({
              name: "Tamilblasters",
              title: formatStreamTitle(mediaInfo, streamData),
              url: result.url,
              quality: result.quality,
              headers: checkHeaders,
              provider: 'tamilblasters'
            });
          }
        }));
      } catch (e) {
        console.error(`[Tamilblasters] Error processing match: ${e.message}`);
      }
    }

    console.log(`[Tamilblasters] Returning ${allFinalStreams.length} streams`);
    return allFinalStreams;

  } catch (error) {
    console.error(`[Tamilblasters] Fatal Error: ${error.message}`);
    return [];
  }
}

// Export the main functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { search, getStreams };
} else {
  // For React Native environment
  global.getStreams = { search, getStreams };
}
