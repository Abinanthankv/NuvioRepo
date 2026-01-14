/**
 * ToonHub Provider Test
 */

const { getStreams } = require('./src/providers/toonhub/index.js');

async function test() {
    console.log("Starting ToonHub test...");
    // Test with a popular anime/cartoon
    const inputId = process.argv[2] || 'Ben 10';
    const mediaType = process.argv[3] || 'tv';
    const season = process.argv[4] ? parseInt(process.argv[4]) : 1;
    const episode = process.argv[5] ? parseInt(process.argv[5]) : 1;

    console.log(`\n--- Test Configuration ---`);
    console.log(`Input (tmdbId/Title): "${inputId}"`);
    console.log(`Media Type: ${mediaType}`);
    if (mediaType === 'tv') {
        console.log(`Season: ${season}, Episode: ${episode}`);
    }
    console.log(`--------------------------\n`);

    try {
        const streams = await getStreams(inputId, mediaType, season, episode);
        console.log("\n--- Final Results ---");
        if (streams && streams.length > 0) {
            streams.forEach((stream, index) => {
                console.log(`\nStream ${index + 1}:`);
                console.log(`Title:\n${stream.title}`);
                console.log(`URL: ${stream.url}`);
            });
            console.log(`\n✅ Success: Found ${streams.length} stream(s).`);
        } else {
            console.log("\n❌ Failure: No streams found.");
        }
    } catch (error) {
        console.error("\n💥 Test failed with error:");
        console.error(error.message);
    }
}

test();
