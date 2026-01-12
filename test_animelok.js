const provider = require('./src/providers/animelok');
const axios = require('axios');

const TMDB_API_KEY = '1b3113663c9004682ed61086cf967c44'; // Using the key found in other providers

async function getTMDBTitle(id, type) {
    const url = `https://api.themoviedb.org/3/${type}/${id}?api_key=${TMDB_API_KEY}`;
    try {
        const res = await axios.get(url);
        return res.data.name || res.data.title;
    } catch (e) {
        console.error('TMDB fetch failed:', e.message);
        return null;
    }
}

async function runTest(query, type = 'tv', episode = 1, season = 1) {
    let title = query;

    // Check if query is a TMDB ID (all digits)
    if (/^\d+$/.test(query)) {
        console.log(`Querying TMDB for ID: ${query}...`);
        title = await getTMDBTitle(query, type);
        if (!title) {
            console.error('Could not find title for TMDB ID');
            return;
        }
        console.log(`Found TMDB Title: ${title}`);
    }

    console.log(`Searching Animelok for: "${title}"...`);
    const searchResults = await provider.search(title);

    if (searchResults.length === 0) {
        console.log('No results found on Animelok.');
        return;
    }

    // Usually the first result is the best match
    const bestMatch = searchResults[0];
    console.log(`Best Match: ${bestMatch.title} (${bestMatch.id})`);

    console.log(`\nFetching streams for ${bestMatch.title} - Episode ${episode}...`);
    const streams = await provider.getStreams(bestMatch.id, type, episode, season);

    if (streams.length === 0) {
        console.log('No streams found.');
        return;
    }

    console.log(`\nFound ${streams.length} stream(s):`);
    streams.forEach((s, i) => {
        console.log(`${i + 1}. ${s.title}`);
        console.log(`   URL: ${s.url}`);
        if (s.subtitles && s.subtitles.length > 0) {
            console.log(`   Subtitles: ${s.subtitles.length} tracks found`);
        }
        console.log('');
    });
}

// Usage: node test_animelok.js <name_or_tmdb_id> [type: movie/tv] [episode] [season]
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node test_animelok.js <name_or_tmdb_id> [type] [episode] [season]');
    console.log('Example: node test_animelok.js "Naruto" tv 1');
    console.log('Example: node test_animelok.js 20 tv 1'); // TMDB ID for Naruto is 20
    process.exit(1);
}

const query = args[0];
const type = args[1] || 'tv';
const episode = parseInt(args[2]) || 1;
const season = parseInt(args[3]) || 1;

runTest(query, type, episode, season);
