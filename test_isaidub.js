/**
 * Isaidub Provider Test
 */

const { getStreams } = require('./src/providers/isaidub/index.js');

async function test() {
    console.log("Starting Isaidub test...");
    const inputId = process.argv[2] || 'Deadpool';
    const mediaType = process.argv[3] || 'movie';
    const season = process.argv[4] ? parseInt(process.argv[4]) : null;
    const episode = process.argv[5] ? parseInt(process.argv[5]) : null;

    const isNumeric = /^\d+$/.test(inputId);
    console.log(`\n--- Test Configuration ---`);
    console.log(`Input (tmdbId/Title): "${inputId}" (${isNumeric ? 'Numeric ID' : 'Search Query'})`);
    console.log(`Media Type: ${mediaType}`);
    if (mediaType === 'tv') {
        console.log(`Season: ${season || 'All'}, Episode: ${episode || 'All'}`);
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
