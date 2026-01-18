const { getStreams } = require('./src/providers/tamilblastersbz');

async function test() {
    console.log('Testing Tamilblasters BZ provider with Kalamkaval...\n');

    try {
        const streams = await getStreams('Kalamkaval', 'movie');

        console.log(`\n✅ Found ${streams.length} streams:\n`);
        streams.forEach((stream, i) => {
            console.log(`${i + 1}. ${stream.title}`);
            console.log(`   URL: ${stream.url.substring(0, 80)}...`);
            console.log(`   Quality: ${stream.quality}`);
            console.log('');
        });
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

test();
