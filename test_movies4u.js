/**
 * Movies4u Provider Test
 * 
 * Usage:
 *   node test_movies4u.js [movie_name] [media_type]
 * 
 * Examples:
 *   node test_movies4u.js "Tron Ares"
 *   node test_movies4u.js "Interstellar" movie
 *   node test_movies4u.js 12345 movie  (using TMDB ID)
 * 
 * The provider will:
 *   1. Search movies4u.fans for the movie
 *   2. Navigate through movie page
 *   3. Extract direct HLS URLs from m4uplay.com using Packer deobfuscation
 */

const { getStreams } = require('./src/providers/movies4u/index.js');

async function test() {
    console.log("Starting Movies4u test...");
    const query = process.argv[2] || 'Tron Ares';
    const mediaType = process.argv[3] || 'movie';

    console.log(`Searching for: ${query} (Type: ${mediaType})`);

    try {
        const streams = await getStreams(query, mediaType);
        console.log("\n--- Results ---");
        if (streams && streams.length > 0) {
            streams.forEach((stream, index) => {
                console.log(`\nStream ${index + 1}:`);
                console.log(`Title:\n${stream.title}`);
                console.log(`URL: ${stream.url.substring(0, 100)}...`);
            });
            console.log(`\n✅ Success: Found ${streams.length} streams.`);
        } else {
            console.log("\n❌ Failure: No streams found. Check the search query or provider logic.");
        }
    } catch (error) {
        console.error("\n💥 Test failed with error:");
        console.error(error);
    }
}

test();
