// ── MarketPulse App ──
// Uses Yahoo Finance unofficial API via corsproxy.io (no API key required)

let activeMarket = 'US';
let priceChart = null;
let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  loadIndices();
  renderWatchlist();
  bindEvents();
});

// ── CLOCK ──
function startClock() {
  const el = document.getElementById('clock');
  const update = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour12: false }) + ' AEST';
  };
  update();
  setInterval(update, 1000);
}

// ── EVENTS ──
function bindEvents() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMarket = btn.dataset.market;
    });
  });

  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('ticker-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeMarket = btn.dataset.mkt;
      document.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.market === activeMarket);
      });
      document.getElementById('ticker-input').value = btn.dataset.sym;
      doSearch();
    });
  });

  document.querySelectorAll('.index-card').forEach(card => {
    card.addEventListener('click', () => {
      activeMarket = card.dataset.mkt;
      document.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.market === activeMarket);
      });
      document.getElementById('ticker-input').value = card.dataset.sym;
      doSearch();
    });
  });
}

// ── SEARCH ──
async function doSearch() {
  const raw = document.getElementById('ticker-input').value.trim().toUpperCase();
  if (!raw) return;

  const symbol = activeMarket === 'ASX' && !raw.endsWith('.AX') ? raw + '.AX' : raw;

  showResultLoading(raw, activeMarket);
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const result = await fetchYahooData(symbol);
    displayResult(raw, symbol, activeMarket, result);
    addToWatchlist(raw, symbol, activeMarket, result);
  } catch (err) {
    showError(err.message);
  }
}

// ── FETCH ──
const PROXY_FNS = [
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

async function fetchYahooData(symbol) {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3mo`;

  let lastErr = new Error('All data sources unavailable. Try again shortly.');

  for (const buildProxy of PROXY_FNS) {
    try {
      const res = await fetch(buildProxy(yahooUrl));
      if (!res.ok) {
        lastErr = new Error(`Request failed (HTTP ${res.status}). Try again shortly.`);
        continue;
      }
      const json = await res.json();
      if (json.chart?.error) {
        throw new Error(`Yahoo Finance: ${json.chart.error.description || 'Unknown error'}`);
      }
      if (!json.chart?.result?.[0]) {
        throw new Error(`Symbol "${symbol}" not found. Check the ticker is correct.`);
      }
      return json.chart.result[0];
    } catch (e) {
      if (e.message.startsWith('Yahoo Finance:') || e.message.includes('not found')) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// ── DISPLAY RESULT ──
function displayResult(displaySym, fullSym, market, result) {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('result-card').style.display = 'block';

  const meta = result.meta;
  const quotes = result.indicators.quote[0];
  const timestamps = result.timestamp;

  const close = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const open = meta.regularMarketOpen;
  const high = meta.regularMarketDayHigh;
  const low = meta.regularMarketDayLow;
  const volume = meta.regularMarketVolume;

  const change = close - prevClose;
  const changePct = (change / prevClose) * 100;
  const isUp = change >= 0;
  const currency = market === 'ASX' ? 'A$' : '$';
  const sign = isUp ? '+' : '';

  document.getElementById('r-symbol').textContent = displaySym;
  document.getElementById('r-market').textContent = market === 'ASX' ? '🇦🇺 ASX · AUD' : '🇺🇸 NYSE/NASDAQ · USD';
  document.getElementById('r-price').textContent = `${currency}${close.toFixed(2)}`;

  const changeEl = document.getElementById('r-change');
  changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
  changeEl.className = 'result-change ' + (isUp ? 'up' : 'down');

  document.getElementById('r-open').textContent = open != null ? `${currency}${open.toFixed(2)}` : '—';
  document.getElementById('r-high').textContent = high != null ? `${currency}${high.toFixed(2)}` : '—';
  document.getElementById('r-low').textContent = low != null ? `${currency}${low.toFixed(2)}` : '—';
  document.getElementById('r-vol').textContent = volume != null ? formatVolume(volume) : '—';
  document.getElementById('r-prev').textContent = `${currency}${prevClose.toFixed(2)}`;

  const lastTs = timestamps[timestamps.length - 1];
  document.getElementById('r-date').textContent = new Date(lastTs * 1000).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', year: 'numeric'
  });

  drawChart(timestamps, quotes.close, currency, isUp);
}

// ── CHART ──
function drawChart(timestamps, closes, currency, isUp) {
  const pairs = timestamps
    .map((ts, i) => ({ ts, price: closes[i] }))
    .filter(p => p.price != null)
    .slice(-30);

  const labels = pairs.map(p => {
    const d = new Date(p.ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const prices = pairs.map(p => p.price);

  if (priceChart) priceChart.destroy();

  const ctx = document.getElementById('price-chart').getContext('2d');
  const color = isUp ? '#2ed573' : '#ff4757';

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, color + '33');
  gradient.addColorStop(1, color + '00');

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        fill: true,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a1a24',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#6b6b80',
          bodyColor: '#f0f0f5',
          callbacks: { label: c => `${currency}${c.parsed.y.toFixed(2)}` }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#6b6b80', font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8 }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6b6b80',
            font: { family: 'DM Mono', size: 10 },
            callback: v => `${currency}${v.toFixed(0)}`
          }
        }
      }
    }
  });
}

// ── INDICES ──
async function loadIndices() {
  const cards = Array.from(document.querySelectorAll('.index-card'));
  await Promise.all(cards.map(async card => {
    const sym = card.dataset.sym;
    const mkt = card.dataset.mkt;
    const fullSym = mkt === 'ASX' ? sym + '.AX' : sym;
    try {
      const result = await fetchYahooData(fullSym);
      const meta = result.meta;
      const close = meta.regularMarketPrice;
      const prevClose = meta.previousClose ?? meta.chartPreviousClose;
      const pct = ((close - prevClose) / prevClose) * 100;
      const isUp = pct >= 0;
      const currency = mkt === 'ASX' ? 'A$' : '$';
      const sign = isUp ? '+' : '';

      card.querySelector('.idx-price').textContent = `${currency}${close.toFixed(2)}`;
      const chgEl = card.querySelector('.idx-change');
      chgEl.textContent = `${sign}${pct.toFixed(2)}%`;
      chgEl.className = 'idx-change ' + (isUp ? 'up' : 'down');
      card.classList.remove('loading');
    } catch {
      card.querySelector('.idx-change').textContent = 'unavailable';
      card.classList.remove('loading');
    }
  }));
}

// ── WATCHLIST ──
function addToWatchlist(displaySym, fullSym, market, result) {
  if (watchlist.find(w => w.sym === displaySym)) return;

  const meta = result.meta;
  const close = meta.regularMarketPrice;
  const prevClose = meta.previousClose ?? meta.chartPreviousClose;
  const pct = ((close - prevClose) / prevClose) * 100;

  watchlist.unshift({ sym: displaySym, fullSym, market, close, pct });
  if (watchlist.length > 12) watchlist.pop();
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  renderWatchlist();
}

function renderWatchlist() {
  const grid = document.getElementById('watchlist-grid');
  if (watchlist.length === 0) {
    grid.innerHTML = '<div class="empty-watch">No stocks added yet. Search and they\'ll appear here.</div>';
    return;
  }

  grid.innerHTML = watchlist.map((item, i) => {
    const isUp = item.pct >= 0;
    const sign = isUp ? '+' : '';
    const currency = item.market === 'ASX' ? 'A$' : '$';
    return `
      <div class="watch-item" style="animation-delay:${i * 0.05}s">
        <div class="watch-sym">${item.sym}</div>
        <div class="watch-price">${currency}${item.close.toFixed(2)}</div>
        <div class="watch-chg ${isUp ? 'up' : 'down'}">${sign}${item.pct.toFixed(2)}%</div>
        <button class="watch-remove" data-sym="${item.sym}" title="Remove">✕</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.watch-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      watchlist = watchlist.filter(w => w.sym !== btn.dataset.sym);
      localStorage.setItem('watchlist', JSON.stringify(watchlist));
      renderWatchlist();
    });
  });
}

// ── LOADING STATE ──
function showResultLoading(sym, market) {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('result-card').style.display = 'block';
  document.getElementById('r-symbol').textContent = sym;
  document.getElementById('r-market').textContent = market === 'ASX' ? '🇦🇺 ASX' : '🇺🇸 US';
  document.getElementById('r-price').innerHTML = '<span class="spinner"></span>';
  document.getElementById('r-change').textContent = 'fetching...';
  document.getElementById('r-change').className = 'result-change';
  ['r-open', 'r-high', 'r-low', 'r-vol', 'r-prev', 'r-date'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
}

function showError(msg) {
  document.getElementById('result-card').style.display = 'none';
  const el = document.getElementById('error-msg');
  el.textContent = '⚠ ' + msg;
  el.style.display = 'block';
}

// ── UTILS ──
function formatVolume(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}
