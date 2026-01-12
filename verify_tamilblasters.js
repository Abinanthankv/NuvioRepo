const { getStreams } = require('./src/providers/tamilblasters/index.js');

async function testExtraction() {
    const query = "dude";
    const mediaType = 'movie';

    console.log(`Testing Tamilblasters extraction for: ${query}...`);

    try {
        const streams = await getStreams(query, mediaType);

        console.log(`\nFound ${streams.length} streams:`);
        streams.forEach((stream, index) => {
            console.log(`\n--- Stream ${index + 1} ---`);
            console.log(`Title: ${stream.title.replace(/\n/g, ' | ')}`);
            console.log(`Quality: ${stream.quality}`);
            console.log(`URL: ${stream.url.substring(0, 100)}...`);
        });

        if (streams.length > 0) {
            console.log('\n✨ VERIFICATION COMPLETE: Check if multi-audio streams are unified and correctly labeled.');
        } else {
            console.log('\n❌ VERIFICATION FAILED: No streams found.');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

testExtraction();
