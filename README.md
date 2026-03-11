# FRC Live Dashboard — Netlify Deployment

## Project Structure

```
tba-dashboard/
├── netlify.toml                  # Tells Netlify where files live
├── public/
│   └── index.html                # Your frontend (unchanged visually)
└── netlify/
    └── functions/
        └── dashboard.js          # Serverless API proxy (replaces Code.gs)
```

## How to Deploy (Free, ~5 minutes)

### Option A — Drag & Drop (easiest)

1. Go to https://netlify.com and create a free account
2. From your dashboard, scroll down to **"Deploy manually"**
3. Zip the entire `tba-dashboard` folder
4. Drag the zip onto the Netlify drop zone
5. Done — Netlify gives you a free `yoursite.netlify.app` URL

### Option B — GitHub (best for updates)

1. Push this folder to a GitHub repository
2. Go to https://netlify.com → **"Add new site" → "Import from Git"**
3. Connect your GitHub repo
4. Set **Publish directory** to `public` and **Functions directory** to `netlify/functions`
5. Click Deploy

## What Changed From Google Apps Script

| Google Apps Script | Netlify Version |
|--------------------|-----------------|
| `UrlFetchApp.fetch()` | Native `fetch()` in Node.js |
| `google.script.run.getDashboardData()` | `fetch('/.netlify/functions/dashboard?week=...')` |
| `Utilities.formatDate()` | `new Date().toISOString().slice(0, 10)` |
| Twitch parent domain hardcoded | Now uses `location.hostname` automatically |

## Notes

- Your TBA API key is inside `netlify/functions/dashboard.js`
- If you want to keep it secret, add it as a Netlify environment variable:
  1. Netlify dashboard → Site settings → Environment variables
  2. Add `TBA_API_KEY` = your key
  3. In `dashboard.js`, replace the hardcoded key with `process.env.TBA_API_KEY`
