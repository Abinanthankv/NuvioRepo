/**
 * Moviesda Provider Test
 */

const { getStreams } = require('./src/providers/moviesda/index.js');

async function test() {
    console.log("Starting Moviesda test...");
    const query = process.argv[2] || 'Mowgli';
    const mediaType = process.argv[3] || 'movie';

    console.log(`Searching for: ${query} (Type: ${mediaType})`);

    try {
        const streams = await getStreams(query, mediaType);
        console.log("\n--- Results ---");
        if (streams && streams.length > 0) {
            // Focus on titles
            streams.forEach((stream, index) => {
                console.log(`\nStream ${index + 1}:`);
                console.log(`Title:\n${stream.title}`);
                console.log(`URL: ${stream.url.substring(0, 50)}...`);
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
