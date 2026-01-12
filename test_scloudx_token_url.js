const config = require('./src/providers/scloudx/config.js');

async function testTokenUrl(tokenUrl) {
    console.log(`[Token URL Test] Testing: ${tokenUrl}`);

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `https://scloudx.lol/`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    };

    // Use full cookies if available
    if (config.ALL_COOKIES) {
        headers["Cookie"] = config.ALL_COOKIES;
    } else if (config.CF_CLEARANCE) {
        headers["Cookie"] = `cf_clearance=${config.CF_CLEARANCE}`;
    }

    try {
        console.log(`[Token URL Test] Fetching with cookies...`);
        const response = await fetch(tokenUrl, { headers: headers });
        console.log(`[Token URL Test] Status: ${response.status}`);

        const html = await response.text();
        if (html.includes('Just a moment') || html.includes('challenge-platform')) {
            console.log(`[Token URL Test] ❌ Still blocked by Cloudflare.`);
        } else {
            console.log(`[Token URL Test] ✅ Success! Received ${html.length} bytes.`);
            const titleMatch = html.match(/<title>(.*?)<\/title>/);
            console.log(`[Token URL Test] Page Title: ${titleMatch ? titleMatch[1] : 'N/A'}`);

            // Check for results
            if (html.includes('result-item')) {
                console.log(`[Token URL Test] ✅ Found search results in the page!`);
            } else {
                console.log(`[Token URL Test] ❌ No results found in the page.`);
            }
        }
    } catch (error) {
        console.error(`[Token URL Test] Error:`, error.message);
    }
}

const tokenUrl = "https://scloudx.lol/?token=b7df2d3f-fc86-4fd1-8e68-7c7bff51a6e0";
testTokenUrl(tokenUrl);
