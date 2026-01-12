const { getStreams } = require('./src/providers/movies4u/index.js');
const fs = require('fs');

async function testExtraction() {
    const tmdbId = "people we meet";
    const mediaType = 'movie';

    console.log(`Testing extraction for TMDB ID: ${tmdbId}...`);

    try {
        const streams = await getStreams(tmdbId, mediaType);

        console.log(`\nFound ${streams.length} streams:`);
        streams.forEach((stream, index) => {
            console.log(`\n--- Stream ${index + 1} ---`);
            console.log(`Title: ${stream.title.replace(/\n/g, ' | ')}`);
            console.log(`Quality: ${stream.quality}`);

            if (stream.url.startsWith('data:')) {
                console.log(`URL Type: Data URI (Custom Master)`);
                if (index === 0) {
                    const base64 = stream.url.split(',')[1];
                    const content = Buffer.from(base64, 'base64').toString();
                    fs.writeFileSync('granular_master.txt', content);
                    console.log(`✅ Granular master playlist saved to granular_master.txt`);
                }
            } else {
                console.log(`URL: ${stream.url.substring(0, 100)}...`);
            }
        });

        const hasGranular = streams.some(s => s.url.startsWith('data:'));
        if (hasGranular) {
            console.log('\n✨ VERIFICATION PASSED: Granular language-specific streams generated!');
        } else {
            console.log('\n⚠️ VERIFICATION INCOMPLETE: No granular streams found.');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

testExtraction();
