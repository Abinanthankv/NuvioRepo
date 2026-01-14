const { getStreams } = require('./src/providers/xdmovies/index.js');
const axios = require('axios');

async function checkLink(url, headers = {}) {
    try {
        const res = await axios.head(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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

async function runTest(query, type = 'movie', season = 1, episode = 1) {
    console.log(`\n--- XDmovies (xddrive) Test ---`);
    console.log(`Query: ${query}, Type: ${type}, S: ${season}, E: ${episode}`);

    try {
        const streams = await getStreams(query, type, season, episode);

        if (!streams || streams.length === 0) {
            console.log('No streams found.');
            return;
        }

        console.log(`\nValidating ${streams.length} stream(s)...`);
        const validStreams = [];
        for (const s of streams) {
            process.stdout.write(`Checking: ${s.name} [${s.quality}]... `);
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
            console.log(`   Name: ${s.name} | Quality: ${s.quality} | Size: ${s.size}`);
            console.log(`   URL: ${s.url}`);
            if (s.headers) {
                console.log(`   Headers: ${JSON.stringify(s.headers)}`);
            }
            console.log('');
        });
    } catch (error) {
        console.error('Test failed with error:', error.message);
    }
}

// Usage: node test_xddrive.js <tmdb_id_or_title> [type: movie/tv] [season] [episode]
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node test_xddrive.js <tmdb_id_or_title> [type] [season] [episode]');
    console.log('Example: node test_xddrive.js 272 movie'); // Batman Begins
    console.log('Example: node test_xddrive.js 1396 tv 1 1'); // Breaking Bad
    process.exit(1);
}

const query = args[0];
const type = args[1] || 'movie';
const season = parseInt(args[2]) || null;
const episode = parseInt(args[3]) || null;

runTest(query, type, season, episode);
