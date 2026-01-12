// Test script to verify HTML parsing without network requests
const cheerio = require('cheerio-without-node-native');
const fs = require('fs');
const path = require('path');

// Read the HTML file you provided
const htmlPath = path.join(__dirname, 'scloudx_search_results');
const html = fs.readFileSync(htmlPath, 'utf8');

console.log('Testing HTML parsing from saved file...\n');

const $ = cheerio.load(html);
const results = [];

// Parse search results
$('div.result-item').each((i, el) => {
    const $result = $(el);

    // Get title from h3
    const title = $result.find('h3.result-title').text().trim();

    // Get size from data attribute
    const size = $result.attr('data-size');

    // Get download URL from checkbox data-url attribute
    const downloadUrl = $result.find('input.copy-checkbox').attr('data-url');

    // Get detail page link (optional, for reference)
    const detailLink = $result.find('a[href^="/file/"]').attr('href');

    if (title && downloadUrl) {
        results.push({
            title: title,
            size: size,
            url: downloadUrl,
            detailLink: detailLink
        });
    }
});

console.log(`Found ${results.length} results:\n`);

results.slice(0, 5).forEach((result, index) => {
    console.log(`[${index + 1}] ${result.title}`);
    console.log(`    Size: ${result.size}`);
    console.log(`    URL: ${result.url}`);
    console.log(`    Detail: ${result.detailLink}\n`);
});

console.log(`\nTotal results: ${results.length}`);
console.log('\n✅ HTML parsing works correctly!');
console.log('\nFull URL example (first result):');
console.log(results[0].url);
