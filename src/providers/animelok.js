const cheerio = require('cheerio-without-node-native');

const BASE_URL = 'https://animelok.to';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

async function search(query) {
    console.log(`[Animelok] Searching for: ${query}`);
    try {
        const searchUrl = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
        const response = await fetchWithTimeout(searchUrl, {
            headers: { 'User-Agent': USER_AGENT }
        });
        const html = await response.text();
        const $ = cheerio.load(html);
        const results = [];

        $('a.group.relative').each((i, el) => {
            const title = $(el).find('h3').text().trim();
            const href = $(el).attr('href');
            const poster = $(el).find('img').attr('src');
            if (href && title) {
                results.push({
                    title,
                    id: href.replace('/anime/', ''),
                    poster,
                    type: 'tv' // Animelok is mostly anime (TV/Movies)
                });
            }
        });

        return results;
    } catch (error) {
        console.error('[Animelok] Search error:', error.message);
        return [];
    }
}

async function getStreams(id, type, season, episode) {
    // For Animelok, 'id' is the anime slug (e.g., 'naruto-20')
    const animeSlug = id;
    const apiUrl = `${BASE_URL}/api/anime/${animeSlug}/episodes/${episode}`;

    console.log(`Fetching streams for ${animeSlug} episode ${episode} from ${apiUrl}...`);

    try {
        const response = await fetchWithTimeout(apiUrl, {
            headers: {
                'Referer': `${BASE_URL}/watch/${animeSlug}?ep=${episode}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        const data = await response.json();
        const episodeData = data.episode;

        if (!episodeData || !episodeData.servers) {
            return [];
        }

        const streams = [];
        const subtitles = (episodeData.subtitles || []).map(sub => ({
            url: sub.url,
            language: sub.name,
            format: sub.url.endsWith('.vtt') ? 'vtt' : 'srt'
        }));

        for (const server of episodeData.servers) {
            const serverName = server.name || 'Unknown';
            const languages = server.languages || [];
            const hasSubtitles = subtitles.length > 0;

            // Handle Multi server (as-cdn)
            if (server.url.includes('zephyrflick.top') || server.url.includes('as-cdn')) {
                const videoIdMatch = server.url.match(/\/video\/([a-f0-9]{32})/);
                if (videoIdMatch) {
                    const videoId = videoIdMatch[1];
                    const stream = await extractAsCdnStream(videoId, serverName, data.anime, season, episode, languages, hasSubtitles);
                    if (stream) {
                        stream.subtitles = subtitles;
                        streams.push(stream);
                    }
                }
            }
            // Handle direct HLS servers (often as JSON string)
            else if (server.url.startsWith('[') && server.url.includes('.m3u8')) {
                try {
                    const sources = JSON.parse(server.url);
                    for (const source of sources) {
                        streams.push({
                            title: formatTitle(data.anime, serverName, source.quality || 'Auto', season, episode, languages, hasSubtitles),
                            url: source.url,
                            type: 'hls',
                            subtitles
                        });
                    }
                } catch (e) {
                    console.error('Failed to parse direct HLS sources:', e.message);
                }
            }
            // Handle other direct m3u8 links
            else if (server.url.includes('.m3u8')) {
                streams.push({
                    title: formatTitle(data.anime, serverName, 'Auto', season, episode, languages, hasSubtitles),
                    url: server.url,
                    type: 'hls',
                    subtitles
                });
            }
        }

        return streams;
    } catch (e) {
        console.error('getStreams failed:', e.message);
        return [];
    }
}

async function extractAsCdnStream(videoId, serverName, animeInfo, season, episode, languages, hasSubtitles) {
    const embedUrl = `https://as-cdn21.top/video/${videoId}`;
    const apiUrl = `https://as-cdn21.top/player/index.php?data=${videoId}&do=getVideo`;

    try {
        const response = await fetchWithTimeout(apiUrl, {
            method: 'POST',
            body: `hash=${videoId}&r=${encodeURIComponent(BASE_URL)}/`,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': embedUrl,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = await response.json();
        if (data && data.videoSource) {
            return {
                title: formatTitle(animeInfo, serverName, 'Auto', season, episode, languages, hasSubtitles),
                url: data.videoSource,
                type: 'hls'
            };
        }
    } catch (e) {
        console.error(`Failed to extract from as-cdn (${videoId}):`, e.message);
    }
    return null;
}

function formatTitle(animeInfo, serverName, quality, season, episode, languages, hasSubtitles) {
    const title = animeInfo.title || 'Unknown';
    const s = String(season || 1).padStart(2, '0');
    const e = String(episode || 1).padStart(2, '0');
    const epLabel = ` - S${s} E${e}`;

    let langStr = languages.join('/') || 'Unknown';
    if (hasSubtitles) langStr += ' + ESub';

    // ToonHub style format:
    // Animelok (Quality)
    // 📹: Title - S01 E01
    // 🚜: animelok | 🎧: Languages
    return `Animelok (${quality || 'Auto'})
\u{1F4F9}: ${title}${epLabel}
\u{1F69C}: animelok | \u{1F3A7}: ${langStr}`;
}

module.exports = {
    search,
    getStreams
};
