# Scloudx Cookie Configuration Guide

## Quick Start

1. **Get a fresh Cloudflare cookie:**
   - Visit https://scloudx.lol in your browser
   - Solve the "Verify you are human" challenge
   - Open DevTools (F12)
   - Go to: Application → Cookies → https://scloudx.lol
   - Find the `cf_clearance` cookie
   - Copy its value

2. **Update the config:**
   - Open `src/providers/scloudx/config.js`
   - Replace `YOUR_CF_CLEARANCE_COOKIE_HERE` with your cookie value
   - Save the file

3. **Rebuild the provider:**
   ```bash
   node build.js --minify
   ```

4. **Test it:**
   ```bash
   node test_scloudx.js "Avatar" movie
   ```

## When to Update

Update the cookie when you see:
- `[Scloudx] Search failed with status: 403`
- `[Scloudx] Cloudflare challenge detected`
- No results returned

Cloudflare cookies typically expire after 24-48 hours.

## Example Cookie Value

```javascript
CF_CLEARANCE: "GmEpz4Td9hFNSnIFuW2UwLkEdeYgfepsBtyrkxlet2w-1768201424-1.2.1.1-WfsVU1KhgRb04avWyiyDBf03AOfTTAwQ3lmz9euslCrP28NFlk9EIJDC5o6DBR6hHtjARcAeTaSv40ZxEUYgpJKegC4CdGZhg9pB14H_a5PzTiFPZSnUv6zerPCtTTRKvXC4rymx7m03ZlaHGXPeHFQVU48k4y5IqttaZ9fYvb.n3fc1vZGxzVJfrnooO6mySHnAGDRRT6oeA0sa8a8zTbRCWMo51QT0tgByVpJm.MehlYDlAtLv44rlSuIJAU.c"
```

## Troubleshooting

**Still getting 403 errors?**
- Make sure you copied the entire cookie value
- Check that there are no extra spaces
- Try getting a fresh cookie from the same IP address
- Cloudflare may be checking additional fingerprints

**Cookie expires too quickly?**
- This is normal for Cloudflare protection
- You'll need to update it regularly
- Consider setting up a backend service for automatic renewal

## Production Use

For production (React Native app), you have two options:

1. **Manual Updates** (Current approach)
   - Update the cookie in config.js when it expires
   - Rebuild and redeploy the app
   - Simple but requires manual intervention

2. **Backend Service** (Recommended for production)
   - Set up a Node.js backend with Puppeteer
   - Automatically refresh cookies
   - Your app calls the backend API
   - More complex but fully automated
