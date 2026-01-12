# How to Get ALL Cookies from Browser

The `cf_clearance` cookie alone is not enough. Cloudflare checks multiple cookies and browser fingerprints.

## Method 1: Get All Cookies (Recommended)

### Step 1: Visit the Site
1. Open Chrome/Firefox
2. Visit https://scloudx.lol
3. Solve the Cloudflare challenge
4. Search for something (e.g., "avatar")

### Step 2: Copy ALL Cookies
1. Press `F12` (DevTools)
2. Go to **Network** tab
3. Refresh the page (`Ctrl+R` or `Cmd+R`)
4. Click on the first request (should be the search page)
5. Scroll down to **Request Headers**
6. Find the **Cookie** header
7. **Copy the ENTIRE cookie string** (it will be very long)

Example of what you should see:
```
Cookie: cf_clearance=xxx; __cf_bm=yyy; _ga=zzz; other_cookies=...
```

### Step 3: Update Config
Edit `src/providers/scloudx/config.js`:

```javascript
// Instead of just CF_CLEARANCE, add ALL_COOKIES:
ALL_COOKIES: "cf_clearance=xxx; __cf_bm=yyy; _ga=zzz; ...",
```

## Method 2: Use curl to Test

Run this in your browser's console while on scloudx.lol:

```javascript
// Copy this and run in browser console
copy(document.cookie);
```

This copies all cookies to your clipboard.

## Method 3: Export as cURL

1. In DevTools → Network tab
2. Right-click on the search request
3. Select **Copy → Copy as cURL**
4. Paste it somewhere to see all the headers
5. Extract the Cookie header value

## Why cf_clearance Alone Doesn't Work

Cloudflare uses multiple cookies:
- `cf_clearance` - Main challenge cookie
- `__cf_bm` - Bot management cookie  
- `_cfuvid` - Unique visitor ID
- Session cookies
- Analytics cookies

**All of these together** create your browser's "fingerprint".

## Next Steps

Once you have ALL cookies:
1. Update `config.js` with the full cookie string
2. Rebuild: `node build.js --minify`
3. Test: `node test_scloudx.js "Avatar" movie`
