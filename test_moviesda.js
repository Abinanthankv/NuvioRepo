/**
 * Moviesda Provider Test
 * 
 * Usage:
 *   node test_moviesda.js [movie_name] [media_type]
 * 
 * Examples:
 *   node test_moviesda.js Mowgli
 *   node test_moviesda.js "Mask" movie
 *   node test_moviesda.js 12345 movie  (using TMDB ID)
 * 
 * The provider will:
 *   1. Search category pages for the movie
 *   2. Navigate through multi-level structure
 *   3. Extract direct MP4 URLs from onestream.watch
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
            console.log(JSON.stringify(streams, null, 2));
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
