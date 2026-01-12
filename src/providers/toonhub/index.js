const cheerio = require('cheerio-without-node-native');

const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const MAIN_URL = 'https://toonhub4u.co';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Referer': `${MAIN_URL}/`
};

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

function normalizeTitle(title) {
    if (!title) return '';
    return title.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function calculateTitleSimilarity(title1, title2) {
    const norm1 = normalizeTitle(title1);
    const norm2 = normalizeTitle(title2);

    if (norm1 === norm2) return 1.0;
    if (norm1.length > 5 && norm2.length > 5 && (norm2.includes(norm1) || norm1.includes(norm2))) return 0.9;

    const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
}

function extractSeasonEpisodeFromFilename(filename) {
    if (!filename) return null;
    // Match patterns like S01E01, S02E12, etc.
    const match = filename.match(/S(\d+)E(\d+)/i);
    if (match) {
        return {
            season: parseInt(match[1]),
            episode: parseInt(match[2])
        };
    }
    return null;
}

function formatStreamTitle(mediaInfo, stream, seasonEpInfo) {
    const quality = stream.quality || 'Unknown';
    const title = toTitleCase(mediaInfo.title || 'Unknown');
    const year = mediaInfo.year ? ` (${mediaInfo.year})` : '';

    // Use extracted season/episode info if available
    let episodeLabel = '';
    if (seasonEpInfo && seasonEpInfo.season && seasonEpInfo.episode) {
        episodeLabel = ` - S${String(seasonEpInfo.season).padStart(2, '0')}E${String(seasonEpInfo.episode).padStart(2, '0')}`;
    } else if (stream.label) {
        episodeLabel = ` - ${stream.label}`;
    }

    return `ToonHub (${quality})
📹: ${title}${year}${episodeLabel}
🚜: toonhub | 🌐: HINDI/ENGLISH`;
}

async function getTMDBDetails(tmdbId, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}`;
    try {
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return {
            title: data.title || data.name,
            year: (data.release_date || data.first_air_date || '').split('-')[0]
        };
    } catch (e) {
        console.warn("[ToonHub] TMDB details fetch failed:", e.message);
        throw e;
    }
}

async function searchTMDBByTitle(title, mediaType) {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const url = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
    try {
        const response = await fetchWithTimeout(url, {}, 8000);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const first = data.results[0];
            return {
                title: first.title || first.name,
                year: (first.release_date || first.first_air_date || '').split('-')[0]
            };
        }
    } catch (e) {
        console.warn("[ToonHub] TMDB search failed:", e.message);
    }
    return null;
}

async function searchToonHub(query) {
    console.log(`[ToonHub] Searching for: "${query}"`);
    try {
        const searchUrl = `${MAIN_URL}/?s=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(searchUrl, { headers: HEADERS }, 8000);
        if (!response.ok) return [];

        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('li.post-item').each((i, el) => {
            const a = $(el).find('h2.post-title a');
            const title = a.text().trim().split('[')[0].trim();
            const href = a.attr('href');
            if (href) {
                results.push({ title, href });
            }
        });

        console.log(`[ToonHub] Found ${results.length} results`);
        return results;
    } catch (error) {
        console.error("[ToonHub] Search error:", error.message);
        return [];
    }
}

async function searchToonStream(query) {
    console.log(`[ToonHub] Searching ToonStream for: "${query}"`);
    try {
        const searchUrl = `https://toonstream.one/home/?s=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(searchUrl, { headers: HEADERS }, 10000);
        if (!response.ok) return [];

        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('article.post').each((i, el) => {
            const a = $(el).find('a.lnk-blk');
            const title = $(el).find('.entry-title').text().trim();
            const href = a.attr('href');
            if (href) {
                // Determine type based on URL or class
                let type = 'unknown';
                if (href.includes('/series/') || href.includes('/anime/')) type = 'series';
                else if (href.includes('/movies/') || href.includes('/movie/')) type = 'movie';
                else if (href.includes('/episode/')) type = 'episode';

                results.push({ title, href, type });
            }
        });

        console.log(`[ToonHub] Found ${results.length} results on ToonStream`);
        return results;
    } catch (error) {
        console.error("[ToonHub] ToonStream search error:", error.message);
        return [];
    }
}

async function getToonStreamEpisodes(seriesUrl, episodeNumber) {
    console.log(`[ToonHub] Getting episode ${episodeNumber} from ToonStream: ${seriesUrl}`);
    try {
        const response = await fetchWithTimeout(seriesUrl, { headers: HEADERS }, 10000);
        if (!response.ok) return null;

        const html = await response.text();
        const $ = cheerio.load(html);
        let epLink = null;

        const epPadded = episodeNumber.toString().padStart(2, '0');
        const epRegex = new RegExp(`(?:Episode|Ep)\\s*(${episodeNumber}|${epPadded})\\b`, 'i');

        $('article.post.episodes').each((i, el) => {
            const text = $(el).text();
            if (epRegex.test(text)) {
                epLink = $(el).find('a.lnk-blk').attr('href');
                return false; // break
            }
        });

        if (!epLink) {
            // Fallback: check all links for /episode/ and the number
            $('a[href*="/episode/"]').each((i, a) => {
                const href = $(a).attr('href');
                if (href.includes(`-${episodeNumber}/`) || href.includes(`-ep-${episodeNumber}/`) || href.endsWith(`-${episodeNumber}`) || href.endsWith(`-ep-${episodeNumber}`)) {
                    epLink = href;
                    return false;
                }
            });
        }

        return epLink;
    } catch (error) {
        console.error("[ToonHub] ToonStream episode fetch error:", error.message);
        return null;
    }
}

async function extractDirectStream(url) {
    console.log(`[ToonHub] Extracting direct stream from: ${url}`);
    try {
        let finalUrl = url.replace(/&#038;/g, '&');

        // Handle internal redirect links
        if (finalUrl.includes('redirect/main') && finalUrl.includes('.php?url=')) {
            const b64 = finalUrl.split('url=')[1].split('&')[0];
            try {
                // Buffer is available in Node.js and bundled environments
                finalUrl = Buffer.from(b64, 'base64').toString('utf8');
                console.log(`[ToonHub] Decoded redirect URL: ${finalUrl}`);
            } catch (e) {
                console.log("[ToonHub] Base64 decode failed for URL");
            }
        }

        // 1. Resolve ToonStream Episode Page to Embed Page
        if (finalUrl.includes('toonstream.') && finalUrl.includes('/episode/')) {
            console.log(`[ToonHub] Resolving ToonStream episode page: ${finalUrl}`);
            const response = await fetchWithTimeout(finalUrl, { headers: HEADERS }, 10000);
            const html = await response.text();

            // Search for embed iframe src (trembed=...)
            const trembedMatch = html.match(/https?:\/\/toonstream\.[^/]+\/home\/\?trembed=[^"']+/i);
            if (trembedMatch) {
                finalUrl = trembedMatch[0].replace(/&#038;/g, '&');
                console.log(`[ToonHub] Found Embed URL: ${finalUrl}`);
            }
        }

        // 2. Resolve ToonStream Embed Page to Host Page
        if (finalUrl.includes('toonstream.') && finalUrl.includes('/home/')) {
            console.log(`[ToonHub] Resolving ToonStream embed: ${finalUrl}`);
            const response = await fetchWithTimeout(finalUrl, { headers: HEADERS }, 10000);
            const html = await response.text();

            // Find internal host iframe (usually behind the fake-player-overlay)
            const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
            if (iframeMatch && iframeMatch[1]) {
                finalUrl = iframeMatch[1].replace(/&#038;/g, '&');
                console.log(`[ToonHub] Found internal host: ${finalUrl}`);
            }
        }

        // 3. Resolve Host API (as-cdn, abyss, etc.) to Final Stream
        if (finalUrl.includes('short.icu') || finalUrl.includes('as-cdn21.top') || finalUrl.includes('abyss.to')) {
            console.log(`[ToonHub] Extracting via Host API: ${finalUrl}`);

            // Extract Video ID
            const videoIdMatch = finalUrl.match(/\/(?:video|v)\/([a-zA-Z0-9]+)/) || finalUrl.match(/[\?&]v=([a-zA-Z0-9]+)/);
            if (videoIdMatch && videoIdMatch[1]) {
                const videoId = videoIdMatch[1];
                const hostBase = finalUrl.split('/video/')[0].split('/v/')[0];
                const apiUrl = `${hostBase}/player/index.php?data=${videoId}&do=getVideo`;

                console.log(`[ToonHub] Calling Host API for ID: ${videoId}`);
                try {
                    const apiResponse = await fetchWithTimeout(apiUrl, {
                        method: 'POST',
                        headers: {
                            ...HEADERS,
                            'Referer': 'https://toonstream.one/',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: `hash=${videoId}&r=https://toonstream.one/`
                    }, 10000);

                    if (apiResponse.ok) {
                        const data = await apiResponse.json();
                        if (data && data.videoSource) {
                            console.log(`[ToonHub] Successfully retrieved signed stream: ${data.videoSource}`);
                            return data.videoSource;
                        }
                    }
                } catch (e) {
                    console.warn(`[ToonHub] Host API call failed: ${e.message}`);
                }
            }

            // Fallback to HTML parsing if API fails
            const hostHeaders = { ...HEADERS, 'Referer': 'https://toonstream.one/' };
            const response = await fetchWithTimeout(finalUrl, { headers: hostHeaders }, 10000);
            const html = await response.text();

            const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
            if (m3u8Match) return m3u8Match[0].replace(/&#038;/g, '&');

            const mp4Match = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i);
            if (mp4Match) return mp4Match[0].replace(/&#038;/g, '&');
        }

        // Handle gdmirrorbot.nl
        if (finalUrl.includes('gdmirrorbot.nl')) {
            console.log(`[ToonHub] Extracting from gdmirrorbot.nl: ${finalUrl}`);
            try {
                const response = await fetchWithTimeout(finalUrl, {
                    headers: {
                        ...HEADERS,
                        'Referer': 'https://toonhub4u.co/'
                    }
                }, 10000);
                const html = await response.text();

                // Extract the fileurl JavaScript variable
                const fileurlMatch = html.match(/const\s+fileurl\s*=\s*"([^"]+)"/);
                if (fileurlMatch && fileurlMatch[1]) {
                    // Unescape the URL (remove backslashes)
                    const directUrl = fileurlMatch[1].replace(/\\/g, '');
                    console.log(`[ToonHub] Found direct URL from gdmirrorbot: ${directUrl}`);
                    return directUrl;
                }
            } catch (e) {
                console.warn(`[ToonHub] gdmirrorbot extraction failed: ${e.message}`);
            }
        }

        // Generic extraction for common hosts
        if (finalUrl.includes('/file/') || finalUrl.includes('/embed/')) {
            let embedUrl = finalUrl.replace('/file/', '/embed/');
            const response = await fetchWithTimeout(embedUrl, { headers: { ...HEADERS, Referer: MAIN_URL } }, 10000);
            const html = await response.text();

            const m3u8Match = html.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i);
            if (m3u8Match) return m3u8Match[0].replace(/&#038;/g, '&');

            const mp4Match = html.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i);
            if (mp4Match) return mp4Match[0].replace(/&#038;/g, '&');
        }

        return finalUrl;
    } catch (error) {
        console.error(`[ToonHub] Extraction failed for ${url}:`, error.message);
        return url;
    }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    console.log(`[ToonHub] Processing ${mediaType} ${tmdbId} (S:${season}, E:${episode})`);
    try {
        let mediaInfo;
        if (/^\d+$/.test(tmdbId)) {
            try {
                mediaInfo = await getTMDBDetails(tmdbId, mediaType);
            } catch (e) {
                mediaInfo = { title: tmdbId, year: null };
            }
        } else {
            try {
                mediaInfo = (await searchTMDBByTitle(tmdbId, mediaType)) || { title: tmdbId, year: null };
            } catch (e) {
                mediaInfo = { title: tmdbId, year: null };
            }
        }

        const searchResults = await searchToonHub(mediaInfo.title);
        let bestMatch = null;
        let maxScore = 0;

        for (const res of searchResults) {
            let score = calculateTitleSimilarity(mediaInfo.title, res.title);

            // Boost score if the title contains the requested season number (for TV shows)
            if (mediaType === 'tv' && season) {
                const titleSeasonMatch = res.title.match(/Season\s*(\d+)/i);
                if (titleSeasonMatch) {
                    const titleSeason = parseInt(titleSeasonMatch[1]);
                    if (titleSeason === season) {
                        score += 0.2; // Boost for matching season
                        console.log(`[ToonHub] Comparing "${mediaInfo.title}" vs "${res.title}" - Score: ${(score - 0.2).toFixed(2)} + 0.2 (season match) = ${score.toFixed(2)}`);
                    } else {
                        score -= 0.1; // Penalize for wrong season
                        console.log(`[ToonHub] Comparing "${mediaInfo.title}" vs "${res.title}" - Score: ${(score + 0.1).toFixed(2)} - 0.1 (wrong season) = ${score.toFixed(2)}`);
                    }
                } else {
                    console.log(`[ToonHub] Comparing "${mediaInfo.title}" vs "${res.title}" - Score: ${score.toFixed(2)}`);
                }
            } else {
                console.log(`[ToonHub] Comparing "${mediaInfo.title}" vs "${res.title}" - Score: ${score.toFixed(2)}`);
            }

            if (score > maxScore) {
                maxScore = score;
                bestMatch = res;
            }
        }

        if (!bestMatch || maxScore < 0.4) {
            console.warn("[ToonHub] No good match found on ToonHub");
            return [];
        }

        console.log(`[ToonHub] Best match: "${bestMatch.title}" (score: ${maxScore.toFixed(2)})`);

        // 1. Discovery on ToonStream (New Strategy)
        let toonStreamResults = await searchToonStream(bestMatch.title);

        // If no results, try with the original mediaInfo title (simpler)
        if (toonStreamResults.length === 0 && mediaInfo.title !== bestMatch.title) {
            toonStreamResults = await searchToonStream(mediaInfo.title);
        }

        let tsBestMatch = null;
        let tsMaxScore = 0;
        for (const res of toonStreamResults) {
            const score = calculateTitleSimilarity(bestMatch.title, res.title);
            const score2 = calculateTitleSimilarity(mediaInfo.title, res.title);
            let finalScore = Math.max(score, score2);

            // Boost series for TV/Anime
            if (res.type === 'series') finalScore += 0.1;

            console.log(`[ToonHub] ToonStream Compare: "${bestMatch.title}" vs "${res.title}" (${res.type}) - Score: ${finalScore.toFixed(2)}`);

            if (finalScore > tsMaxScore) {
                tsMaxScore = finalScore;
                tsBestMatch = res;
            }
        }

        const streams = [];
        if (tsBestMatch && tsMaxScore > 0.45) {
            console.log(`[ToonHub] Found matching series on ToonStream: ${tsBestMatch.title} (${tsBestMatch.type}, score: ${tsMaxScore.toFixed(2)})`);
            // If the search result itself is an episode page, use it directly
            let tsEpisodeUrl = tsBestMatch.type === 'episode' ? tsBestMatch.href : await getToonStreamEpisodes(tsBestMatch.href, episode || 1);

            if (tsEpisodeUrl) {
                console.log(`[ToonHub] Found direct ToonStream episode link: ${tsEpisodeUrl}`);
                streams.push({ url: tsEpisodeUrl, quality: 'HD', label: `Episode ${episode}` });
            }
        }

        // 2. Fallback/Supplement with ToonHub page links
        const detailResponse = await fetchWithTimeout(bestMatch.href, { headers: HEADERS }, 8000);
        const detailHtml = await detailResponse.text();
        const $ = cheerio.load(detailHtml);
        const content = $('.entry-content');

        if (mediaType === 'tv' && episode) {
            const epPadded = episode.toString().padStart(2, '0');
            const epRegex = new RegExp(`Episode\\s*(${episode}|${epPadded})`, 'i');

            content.find('p, strong, span, h3').each((i, el) => {
                const text = $(el).text();
                if (epRegex.test(text)) {
                    let current = $(el);
                    let foundLinks = false;
                    let depth = 0;
                    while (current.length && depth < 5) {
                        current.find('a[href]').each((j, a) => {
                            const href = $(a).attr('href');
                            const linkText = $(a).text();
                            const quality = linkText.match(/\d+p/i)?.[0] || extractQualityFromContext(current.text()) || 'HD';

                            if (href && !href.includes('ads') && !href.endsWith('.co/') && !href.endsWith('.co')) {
                                // Ignore dead toonstream.net links and ToonHub's internal redirects that point to them
                                if (href.includes('toonstream.net') || href.includes('redirect/main')) {
                                    console.log(`[ToonHub] Skipping dead/unreliable redirect link: ${href}`);
                                    return;
                                }
                                streams.push({ url: href, quality, label: `Episode ${episode}` });
                                foundLinks = true;
                            }
                        });
                        current = current.next();
                        if (current.length && /Episode\s*(\d+)/i.test(current.text()) && !epRegex.test(current.text())) break;
                        depth++;
                    }
                }
            });
        } else {
            // Movies logic
            content.find('a[href]').each((i, el) => {
                const href = $(el).attr('href');
                const text = $(el).text();
                if (href && (href.includes('/file/') || href.includes('/embed/') || href.includes('drive.google.com') || href.includes('toonstream.') || href.includes('redirect/'))) {
                    if (href.includes('toonstream.net') || href.includes('redirect/main')) return;
                    const quality = text.match(/\d+p/i)?.[0] || 'HD';
                    streams.push({ url: href, quality });
                }
            });
        }

        const finalResults = [];
        const seenUrls = new Set();

        for (const stream of streams) {
            if (seenUrls.has(stream.url)) continue;
            seenUrls.add(stream.url);

            const finalUrl = await extractDirectStream(stream.url);
            if (finalUrl) {
                // Extract season/episode info from the filename in the URL
                const filenameMatch = finalUrl.match(/name=([^&]+)/);
                let seasonEpInfo = null;
                let shouldInclude = true;

                if (filenameMatch) {
                    const filename = decodeURIComponent(filenameMatch[1]);
                    seasonEpInfo = extractSeasonEpisodeFromFilename(filename);

                    // Filter: only include if it matches the requested season/episode (for TV shows)
                    if (mediaType === 'tv' && season && episode && seasonEpInfo) {
                        if (seasonEpInfo.season !== season || seasonEpInfo.episode !== episode) {
                            console.log(`[ToonHub] Filtering out S${String(seasonEpInfo.season).padStart(2, '0')}E${String(seasonEpInfo.episode).padStart(2, '0')} (requested S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')})`);
                            shouldInclude = false;
                        }
                    }
                }

                if (shouldInclude) {
                    finalResults.push({
                        name: 'ToonHub',
                        title: formatStreamTitle(mediaInfo, stream, seasonEpInfo),
                        url: finalUrl,
                        quality: stream.quality,
                        headers: { 'Referer': MAIN_URL, 'User-Agent': HEADERS['User-Agent'] },
                        provider: 'ToonHub'
                    });
                }
            }
            if (finalResults.length >= 10) break;
        }

        return finalResults;
    } catch (error) {
        console.error("[ToonHub] getStreams error:", error);
        return [];
    }
}

function extractQualityFromContext(text) {
    if (text.includes('1080p')) return '1080p';
    if (text.includes('720p')) return '720p';
    if (text.includes('480p')) return '480p';
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = { getStreams };
}
