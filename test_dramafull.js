const { getStreams } = require('./src/providers/dramafull/index.js');

async function test() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log('Usage: node test_dramafull.js "<name>" [season] [episode]');
        console.log('Example Movie: node test_dramafull.js "Sex Plate 17"');
        console.log('Example TV Show: node test_dramafull.js "True Beauty" 1 1');
        return;
    }

    const query = args[0];
    let mediaType = 'movie';
    let season = null;
    let episode = null;

    // Check if second argument is media type
    if (args[1] === 'tv' || args[1] === 'movie') {
        mediaType = args[1];
        season = args[2] ? parseInt(args[2]) : null;
        episode = args[3] ? parseInt(args[3]) : (season ? 1 : null);
    } else {
        // Assume old format: query [season] [episode]
        season = args[1] ? parseInt(args[1]) : null;
        episode = args[2] ? parseInt(args[2]) : (season ? 1 : null);
        mediaType = season ? 'tv' : 'movie';
    }

    console.log(`--- Testing DramaFull Provider ---`);
    console.log(`Query: ${query}`);
    console.log(`Media Type: ${mediaType}`);
    console.log('----------------------------------\n');

    try {
        const streams = await getStreams(query, mediaType, season, episode);

        console.log(`\nResults: ${streams.length} stream(s) found.`);

        streams.forEach((stream, index) => {
            console.log(`\n[Stream ${index + 1}]`);
            console.log(`Title: ${stream.title}`);
            console.log(`Quality: ${stream.quality}`);
            console.log(`Type: ${stream.type}`);
            console.log(`URL: ${stream.url}`);
            if (stream.subtitles && stream.subtitles.length > 0) {
                console.log(`Subtitles: ${stream.subtitles.length} found`);
                stream.subtitles.slice(0, 3).forEach(sub => console.log(`  - ${sub.language}: ${sub.url}`));
            }
        });
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

test();
