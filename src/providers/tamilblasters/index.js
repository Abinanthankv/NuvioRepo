// Tamilblasters Scraper for Nuvio Local Scrapers - Revamped Version 2.0
// Focus: Extreme Speed, High Reliability, and Universal Extraction

const cheerio = require('cheerio-without-node-native');

// Configuration
const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
let MAIN_URL = "https://www.1tamilblasters.business";

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

// =================================================================================
// CORE MODULES
// =================================================================================

/**
 * Universal Extraction Engine
 */
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
        quality: variants.length > 0 ? variants[0].quality : "Unknown",
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

async function getStreams(tmdbId, mediaType = 'movie', season = null, episode = null) {
  const isNumeric = /^\d+$/.test(tmdbId);
  const targetTitle = isNumeric ? null : tmdbId;

  console.log(`[Tamilblasters] 🚀 Starting High-Speed Fetch for ${mediaType}: ${tmdbId}`);

  try {
    // 1. Resolve Media Info (TMDB Lookup with Retry)
    let mediaInfo;
    if (isNumeric) {
      let attempts = 0;
      while (attempts < 3) {
        try {
          const res = await fetchWithTimeout(`${TMDB_BASE_URL}/${mediaType === 'movie' ? 'movie' : 'tv'}/${tmdbId}?api_key=${TMDB_API_KEY}`);
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
      if (!mediaInfo) {
        console.log(`[Tamilblasters] TMDB Failed after 3 attempts, falling back.`);
        mediaInfo = { title: tmdbId, year: null };
      }
    } else {
      mediaInfo = { title: tmdbId, year: null };
    }

    // 2. Site Search using Resolved Title
    const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(mediaInfo.title)}`;
    const res = await fetchWithTimeout(searchUrl, { headers: HEADERS });
    const html = await res.text();
    const $ = cheerio.load(html);
    const searchResults = [];
    $(".posts-wrapper article, .nv-index-posts article").each((i, el) => {
      const a = $(el).find("h2.entry-title a");
      if (a.length) searchResults.push({ title: a.text().trim(), href: a.attr("href") });
    });

    // Fallback: If 0 results for TMDB title, try the numeric ID just in case
    if (searchResults.length === 0 && isNumeric) {
      console.log(`[Tamilblasters] 0 results for title, trying numeric search...`);
      const resId = await fetchWithTimeout(`${MAIN_URL}/?s=${tmdbId}`, { headers: HEADERS });
      const htmlId = await resId.text();
      const $Id = cheerio.load(htmlId);
      $(".posts-wrapper article, .nv-index-posts article").each((i, el) => {
        const a = $Id(el).find("h2.entry-title a");
        if (a.length) searchResults.push({ title: a.text().trim(), href: a.attr("href") });
      });
    }
    console.log(`[Tamilblasters] Found ${searchResults.length} search results`);

    // 2. High-Precision Matching
    const matches = searchResults.filter(r => {
      const score = calculateTitleSimilarity(mediaInfo.title, r.title);
      const yearMatch = !mediaInfo.year || r.title.includes(mediaInfo.year);
      console.log(`[Tamilblasters] Candidate Match: "${r.title}" (Score: ${score.toFixed(2)}, YearMatch: ${yearMatch})`);
      return score > 0.4 && yearMatch;
    }).slice(0, 3); // Top 3 pages

    if (matches.length === 0) return [];

    // 3. Atomic Parallel Processor
    const allFinalStreams = [];
    const targetResults = 30;

    await Promise.all(matches.map(async (match) => {
      try {
        const pageRes = await fetchWithTimeout(match.href, { headers: HEADERS });
        const pageHtml = await pageRes.text();
        const $ = cheerio.load(pageHtml);
        const fullPageTitle = $("h1.entry-title").text().trim() || match.title;

        const yrMatch = fullPageTitle.match(/\(?(\d{4})\)?/);
        const matchYear = yrMatch ? yrMatch[1] : (mediaInfo.year || 'N/A');

        const streams = [];
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
          console.log(`[Tamilblasters] Found Embed: ${src.substring(0, 30)}... (Label: ${label})`);
          streams.push({ url: src, label });
        });

        await Promise.all(streams.map(async (s) => {
          if (allFinalStreams.length >= targetResults) return;

          // 1. Detect S/E from Label ONLY for strict matching
          const sMatchLabel = s.label.match(/S(\d+)/i) || s.label.match(/Season\s*(\d+)/i);
          const eMatchLabel = s.label.match(/E(\d+)/i) || s.label.match(/Episode\s*(\d+)/i) || s.label.match(/EP\s*(\d+)/i) || s.label.match(/–\s*(\d+)/);

          let labelS = sMatchLabel ? parseInt(sMatchLabel[1]) : null;
          let labelE = eMatchLabel ? parseInt(eMatchLabel[1]) : null;

          // 2. Detect S/E from Page Title if Label is missing
          if (labelS === null) {
            const sMatchTitle = fullPageTitle.match(/S(\d+)/i) || fullPageTitle.match(/Season\s*(\d+)/i);
            if (sMatchTitle) labelS = parseInt(sMatchTitle[1]);
          }
          if (labelE === null) {
            const eMatchTitle = fullPageTitle.match(/E(\d+)/i) || fullPageTitle.match(/Episode\s*(\d+)/i) || fullPageTitle.match(/EP\s*(\d+)/i);
            if (eMatchTitle) labelE = parseInt(eMatchTitle[1]);
          }

          // 3. Strict Filtering
          if (season !== null && labelS !== null && labelS !== season) return;
          if (episode !== null) {
            // If label has a specific episode number, it MUST match
            if (labelE !== null && labelE !== episode) {
              // Check if it's a range in the label (some labels might have ranges too)
              const rangeMatch = s.label.match(/(\d+)-(\d+)/);
              if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                if (episode < start || episode > end) return;
              } else {
                return; // Mismatch
              }
            }
            // If label had no episode number, check if page title allows this episode
            if (labelE === null) {
              const rangeMatch = fullPageTitle.match(/EP\((\d+)-(\d+)\)/) || fullPageTitle.match(/\((\d+)-(\d+)\)/);
              if (rangeMatch) {
                const start = parseInt(rangeMatch[1]);
                const end = parseInt(rangeMatch[2]);
                if (episode < start || episode > end) return;
              }
            }
          }

          // Final detected values for Title - Fallback to requested if matched via range
          const finalS = labelS !== null ? labelS : season;
          const finalE = labelE !== null ? labelE : episode;

          const result = await UniversalExtractor.extract(s.url);
          if (!result) return;

          const checkHeaders = { ...HEADERS, 'Referer': result.referer, 'Origin': result.origin };
          const isPlayable = await checkLink(result.url, checkHeaders);

          if (isPlayable) {
            let infoLine = mediaInfo.title;
            if (mediaType === 'tv') {
              // Extract the clean title part (e.g., "The Clash of Paths" from "Episode 01 – The Clash of Paths")
              let epSubtitle = s.label.replace(/^(?:Episode|EP|S\d+E\d+)\s*\d*\s*[–-]?\s*/i, '').trim();

              if (finalS !== null && finalE !== null) {
                infoLine += ` - S${finalS} E${finalE}`;
                if (epSubtitle && epSubtitle !== s.label && epSubtitle.length > 0) infoLine += ` - ${epSubtitle}`;
              } else if (finalE !== null) {
                infoLine += ` - Episode ${finalE}`;
                if (epSubtitle && epSubtitle !== s.label && epSubtitle.length > 0) infoLine += ` - ${epSubtitle}`;
              } else {
                infoLine += ` - ${s.label}`;
              }
            }

            allFinalStreams.push({
              name: "Tamilblasters",
              title: `Tamilblasters (Instant) (${result.quality})\n📼: ${infoLine} (${matchYear})\n🌐: ${result.audios.join(' / ') || 'TAMIL'}`,
              url: result.url,
              quality: result.quality,
              headers: checkHeaders,
              provider: 'Tamilblasters'
            });
          }
        }));
      } catch (e) { }
    }));

    console.log(`[Tamilblasters] ✨ Completed. Found ${allFinalStreams.length} playable streams.`);
    return allFinalStreams;

  } catch (error) {
    console.error(`[Tamilblasters] Fatal Error: ${error.message}`);
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
