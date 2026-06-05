# MarketPulse — US & ASX Stock Dashboard

A clean, dark-themed stock market dashboard showing live US (NYSE/NASDAQ) and Australian (ASX) stock data using the Alpha Vantage API.

## Files
- `index.html` — main page
- `style.css` — all styling
- `app.js` — all logic + API calls

## Setup

1. Get a FREE API key at: https://www.alphavantage.co/support/#api-key
2. Open `index.html` in a browser — it will ask for your key on first load
3. Done!

## Deploy to Vercel (FREE)

### Option A — Drag & Drop (easiest)
1. Go to https://vercel.com and sign up free
2. Click "Add New Project"
3. Drag this entire folder into the upload area
4. Click Deploy — you get a live URL instantly

### Option B — Via GitHub
1. Push these 3 files to a GitHub repo
2. Go to vercel.com → Import Git Repository
3. Select your repo → Deploy

## Features
- Search any US or ASX ticker
- 30-day price chart
- Live major indices (S&P500, NASDAQ, DOW, ASX200)
- Persistent watchlist (saved in browser)
- Australian time clock
- Works on mobile

## API Limits (Free Tier)
- 25 requests per day
- 5 requests per minute
- No credit card required

## ASX Tickers
ASX stocks automatically get `.AX` appended (e.g. BHP → BHP.AX)
Common tickers: BHP, CBA, NAB, WBC, ANZ, RIO, WES, CSL, MQG, TLS
