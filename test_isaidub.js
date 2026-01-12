/**
 * Isaidub Provider Test
 */

const { getStreams } = require('./src/providers/isaidub/index.js');

async function test() {
    console.log("Starting Isaidub test...");
    const query = process.argv[2] || 'Deadpool';
    const mediaType = process.argv[3] || 'movie';
    const season = process.argv[4] ? parseInt(process.argv[4]) : null;
    const episode = process.argv[5] ? parseInt(process.argv[5]) : null;

    console.log(`Searching for: ${query} (Type: ${mediaType}, S: ${season || 'any'}, E: ${episode || 'any'})`);

    try {
        const streams = await getStreams(query, mediaType, season, episode);
        console.log("\n--- Results ---");
        if (streams && streams.length > 0) {
            streams.forEach((stream, index) => {
                console.log(`\nStream ${index + 1}:`);
                console.log(`Title:\n${stream.title}`);
                console.log(`URL: ${stream.url}`);
            });
            console.log(`\n✅ Success: Found ${streams.length} streams.`);
        } else {
            console.log("\n❌ Failure: No streams found.");
        }
    } catch (error) {
        console.error("\n💥 Test failed with error:");
        console.error(error);
    }
}

test();
