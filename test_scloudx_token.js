const config = require('./src/providers/scloudx/config.js');

async function testTokenRetrieval(query) {
    const mainUrl = "https://scloudx.lol";
    const tokenEndpoint = `${mainUrl}/get-search-token`;

    console.log(`[Token Test] Testing for query: "${query}"`);
    console.log(`[Token Test] Endpoint: ${tokenEndpoint}`);

    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": `${mainUrl}/`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    };

    // Add cookie if present in config
    if (config.ALL_COOKIES) {
        headers["Cookie"] = config.ALL_COOKIES;
    } else if (config.CF_CLEARANCE) {
        headers["Cookie"] = `cf_clearance=${config.CF_CLEARANCE}`;
    }

    const body = `search_query=${encodeURIComponent(query)}`;

    try {
        console.log(`[Token Test] Sending POST request...`);
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: headers,
            body: body,
            redirect: 'manual' // We want to see the redirect URL if there is one
        });

        console.log(`[Token Test] Status: ${response.status}`);
        console.log(`[Token Test] Headers:`, JSON.stringify([...response.headers.entries()], null, 2));

        const location = response.headers.get('location');
        if (location) {
            console.log(`[Token Test] Success! Found redirect to: ${location}`);
            const tokenMatch = location.match(/token=([^&]+)/);
            if (tokenMatch) {
                console.log(`[Token Test] Extracted Token: ${tokenMatch[1]}`);
            }
        } else {
            console.log(`[Token Test] No redirect found. Response body:`);
            const text = await response.text();
            console.log(text.substring(0, 500));
        }

    } catch (error) {
        console.error(`[Token Test] Error:`, error.message);
    }
}

testTokenRetrieval("Avatar");
