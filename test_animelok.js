const provider = require('./src/providers/animelok/index.js');
const axios = require('axios');

const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44'; // Using the key found in other providers

async function getTMDBTitle(id, type, retries = 3) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`;
    for (let i = 0; i < retries; i++) {
        try {
            const res = await axios.get(url, { timeout: 8000 });
            return res.data.name || res.data.title;
        } catch (e) {
            console.error(`TMDB fetch attempt ${i + 1} failed:`, e.message);
            if (i === retries - 1) return null;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

async function checkLink(url, headers = {}) {
    try {
        const res = await axios.head(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://animelok.to/',
                ...headers
            },
            timeout: 5000,
            validateStatus: () => true
        });
        return res.status >= 200 && res.status < 400;
    } catch (e) {
        return false;
    }
}

async function runTest(query, type = 'tv', season = 1, episode = 1) {
    let title = query;

    // Let the provider handle TMDB IDs internally
    if (/^\d+$/.test(query)) {
        console.log(`Passing TMDB ID ${query} directly to provider...`);
    }

    let streams = [];
    let bestMatchTitle = title;

    if (/^\d+$/.test(query)) {
        console.log(`\nFetching streams for TMDB ID ${query} - S${season} E${episode} directly...`);
        streams = await provider.getStreams(query, type, season, episode);
    } else {
        console.log(`Searching Animelok for: "${title}"...`);
        const searchResults = await provider.search(title);

        if (searchResults.length === 0) {
            console.log('No results found on Animelok.');
            return;
        }

        // Search for a better match if season > 1
        let bestMatch = searchResults[0];
        if (season > 1) {
            const seasonMatch = searchResults.find(r => r.title.toLowerCase().includes(`season ${season}`) || r.title.toLowerCase().includes(` s${season}`));
            if (seasonMatch) bestMatch = seasonMatch;
        }

        bestMatchTitle = bestMatch.title;
        console.log(`Best Match: ${bestMatch.title} (${bestMatch.id})`);

        console.log(`\nFetching streams for ${bestMatch.title} - S${season} E${episode}...`);
        streams = await provider.getStreams(bestMatch.id, type, season, episode);
    }

    if (streams.length === 0) {
        console.log('No streams found.');
        return;
    }

    console.log(`\nValidating ${streams.length} stream(s)...`);
    const validStreams = [];
    for (const s of streams) {
        process.stdout.write(`Checking: ${s.title.split('\n')[0]}... `);
        const isValid = await checkLink(s.url, s.headers);
        if (isValid) {
            console.log('✅ WORKING');
            validStreams.push(s);
        } else {
            console.log('❌ FAILED (403/Error)');
        }
    }

    if (validStreams.length === 0) {
        console.log('\nNo working streams found.');
        return;
    }

    console.log(`\nFound ${validStreams.length} working stream(s):`);
    validStreams.forEach((s, i) => {
        console.log(`${i + 1}. ${s.title}`);
        console.log(`   URL: ${s.url}`);
        if (s.subtitles && s.subtitles.length > 0) {
            console.log(`   Subtitles: ${s.subtitles.length} tracks found`);
        }
        console.log('');
    });
}

// Usage: node test_animelok.js <name_or_tmdb_id> [type: movie/tv] [season] [episode]
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node test_animelok.js <name_or_tmdb_id> [type] [season] [episode]');
    console.log('Example: node test_animelok.js "Naruto" tv 1 1');
    console.log('Example: node test_animelok.js 20 tv 1 1'); // TMDB ID for Naruto is 20
    process.exit(1);
}

const query = args[0];
const type = args[1] || 'tv';
const season = parseInt(args[2]) || 1;
const episode = parseInt(args[3]) || 1;

runTest(query, type, season, episode);
