# Scloudx Provider - Cookie Configuration

## ✅ Solution: Manual Cookie Updates

Since Cloudflare protection cannot be bypassed automatically, this provider uses a **manual cookie configuration** approach.

## How It Works

1. You manually get a fresh Cloudflare cookie from your browser
2. Update it in `src/providers/scloudx/config.js`
3. Rebuild the provider
4. The provider uses your cookie until it expires (24-48 hours)
5. When it expires, repeat the process

## Quick Setup

### Step 1: Get Your Cookie

1. Visit https://scloudx.lol in your browser
2. Solve the "Verify you are human" challenge  
3. Press `F12` to open DevTools
4. Go to: **Application** → **Cookies** → **https://scloudx.lol**
5. Find the `cf_clearance` cookie
6. **Copy its entire value**

### Step 2: Update Config

Edit `src/providers/scloudx/config.js`:

```javascript
CF_CLEARANCE: "paste_your_cookie_value_here",
```

### Step 3: Rebuild

```bash
node build.js --minify
```

### Step 4: Test

```bash
node test_scloudx.js "Avatar" movie
```

## When to Update

Update the cookie when you see these errors:
- `[Scloudx] Search failed with status: 403`
- `[Scloudx] Cloudflare challenge detected`
- `[Scloudx] No Cloudflare cookie configured`

## Files

- **`config.js`** - Cookie configuration (update this)
- **`index.js`** - Main provider code (don't modify)
- **`COOKIE_GUIDE.md`** - Detailed guide
- **`README.md`** - This file

## Limitations

- Cookies expire every 24-48 hours
- Requires manual updates
- Must rebuild after each update
- IP address may affect cookie validity

## Alternative: Backend Service

For automatic cookie management, consider setting up a backend service with Puppeteer. See `COOKIE_GUIDE.md` for details.
