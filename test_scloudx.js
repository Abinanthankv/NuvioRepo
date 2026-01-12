// Test script for Scloudx provider
const { getStreams } = require('./src/providers/scloudx.js');

async function test() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node test_scloudx.js <title|tmdbId> <movie|tv> [season] [episode]');
        console.log('Examples:');
        console.log('  node test_scloudx.js "Avatar" movie');
        console.log('  node test_scloudx.js "The Pitt" tv 1 5');
        console.log('  node test_scloudx.js "94605" tv 1 1  # Using TMDB ID');
        process.exit(1);
    }

    const titleOrId = args[0];
    const mediaType = args[1];
    const season = args[2] ? parseInt(args[2]) : null;
    const episode = args[3] ? parseInt(args[3]) : null;

    console.log('\n='.repeat(80));
    console.log(`Testing Scloudx Provider`);
    console.log('='.repeat(80));
    console.log(`Title/ID: ${titleOrId}`);
    console.log(`Type: ${mediaType}`);
    if (season !== null) console.log(`Season: ${season}`);
    if (episode !== null) console.log(`Episode: ${episode}`);
    console.log('='.repeat(80));
    console.log('');

    try {
        const streams = await getStreams(titleOrId, mediaType, season, episode);

        console.log('\n' + '='.repeat(80));
        console.log(`RESULTS: Found ${streams.length} streams`);
        console.log('='.repeat(80));

        if (streams.length === 0) {
            console.log('\n❌ No streams found!');
        } else {
            streams.forEach((stream, index) => {
                console.log(`\n[${index + 1}] ${stream.name}`);
                console.log('-'.repeat(80));
                console.log(`Title:\n${stream.title}`);
                console.log(`\nQuality: ${stream.quality}`);
                console.log(`URL: ${stream.url.substring(0, 100)}...`);
                console.log(`Provider: ${stream.provider}`);
            });
        }

        console.log('\n' + '='.repeat(80));
        console.log('Test completed successfully!');
        console.log('='.repeat(80));

    } catch (error) {
        console.error('\n' + '='.repeat(80));
        console.error('❌ ERROR:', error.message);
        console.error('='.repeat(80));
        console.error(error.stack);
        process.exit(1);
    }
}

test();
