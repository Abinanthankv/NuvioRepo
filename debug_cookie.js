// Debug script to test cookie loading and headers
const config = require('./src/providers/scloudx/config.js');

console.log('='.repeat(80));
console.log('Scloudx Cookie Debug');
console.log('='.repeat(80));
console.log('');

console.log('Config loaded:');
console.log('- CF_CLEARANCE:', config.CF_CLEARANCE ?
    `${config.CF_CLEARANCE.substring(0, 50)}...` :
    'NOT SET');
console.log('- MAIN_URL:', config.MAIN_URL);
console.log('');

// Test if cookie is valid format
if (config.CF_CLEARANCE && config.CF_CLEARANCE !== "YOUR_CF_CLEARANCE_COOKIE_HERE") {
    console.log('✅ Cookie is configured');
    console.log(`Cookie length: ${config.CF_CLEARANCE.length} characters`);

    // Build the cookie header
    const cookieHeader = `cf_clearance=${config.CF_CLEARANCE}`;
    console.log(`\nCookie header will be: cf_clearance=${config.CF_CLEARANCE.substring(0, 30)}...`);
} else {
    console.log('❌ Cookie is NOT configured or is placeholder');
}

console.log('');
console.log('='.repeat(80));
console.log('Next steps:');
console.log('1. Make sure you copied the ENTIRE cookie value from browser');
console.log('2. Check that you\'re using the same IP address');
console.log('3. Try getting ALL cookies from the browser (not just cf_clearance)');
console.log('='.repeat(80));
