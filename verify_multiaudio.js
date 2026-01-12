const { getStreams } = require('./src/providers/movies4u/index.js');

async function testExtraction() {
    // Testing with a movie that is likely to have multiple audios
    const tmdbId = "eko";
    const mediaType = 'movie';

    console.log(`Testing extraction for TMDB ID: ${tmdbId}...`);

    try {
        const streams = await getStreams(tmdbId, mediaType);

        console.log(`\nFound ${streams.length} streams:`);
        streams.forEach((stream, index) => {
            console.log(`\n--- Stream ${index + 1} ---`);
            console.log(`Title: ${stream.title.replace(/\n/g, ' | ')}`);
            console.log(`Quality: ${stream.quality}`);
            console.log(`URL: ${stream.url.substring(0, 100)}...`);

            if (stream.title.includes('Multi-Audio')) {
                console.log(`✅ SUCCESS: Found Multi-Audio stream!`);
            }
        });

        const hasMultiAudio = streams.some(s => s.title.includes('Multi-Audio'));
        const hasAuto = streams.some(s => s.quality === 'AUTO');

        if (hasMultiAudio && hasAuto) {
            console.log('\n✨ VERIFICATION PASSED: Master playlist with Multi-Audio detected and labeled correctly.');
        } else if (streams.length > 0) {
            console.log('\n⚠️ VERIFICATION INCOMPLETE: Streams found but no multi-audio master playlist detected. This might be because the chosen movie doesn\'t have multi-audio on the site.');
        } else {
            console.log('\n❌ VERIFICATION FAILED: No streams found.');
        }

    } catch (error) {
        console.error('Test failed with error:', error);
    }
}

testExtraction();
