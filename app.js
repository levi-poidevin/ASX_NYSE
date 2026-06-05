// ── MarketPulse App ──
// Uses Alpha Vantage API (free tier)

let API_KEY = localStorage.getItem('av_api_key') || 'QRPIKU8AKKG7VMNE';
let activeMarket = 'US';
let priceChart = null;
let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  if (!API_KEY) {
    showModal();
  } else {
    init();
  }
});

function init() {
  hideModal();
  startClock();
  loadIndices();
  renderWatchlist();
  bindEvents();
}

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

// ── MODAL ──
function showModal() {
  document.getElementById('modal-overlay').classList.remove('hidden');
}
function hideModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('save-key-btn').addEventListener('click', () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { alert('Please enter your API key.'); return; }
  API_KEY = key;
  localStorage.setItem('av_api_key', key);
  init();
});

document.getElementById('api-key-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('save-key-btn').click();
});

// ── EVENTS ──
function bindEvents() {
  // Market toggle
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMarket = btn.dataset.market;
    });
  });

  // Search
  document.getElementById('search-btn').addEventListener('click', doSearch);
  document.getElementById('ticker-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  // Quick picks
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // set market toggle
      activeMarket = btn.dataset.mkt;
      document.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.market === activeMarket);
      });
      document.getElementById('ticker-input').value = btn.dataset.sym;
      doSearch();
    });
  });

  // Index cards click → search
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

  // Append .AX for ASX stocks
  const symbol = activeMarket === 'ASX' && !raw.endsWith('.AX') ? raw + '.AX' : raw;

  showResultLoading(raw, activeMarket);
  document.getElementById('result-section').style.display = 'block';
  document.getElementById('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const data = await fetchDailyData(symbol);
    displayResult(raw, symbol, activeMarket, data);
    addToWatchlist(raw, symbol, activeMarket, data);
  } catch (err) {
    showError(err.message);
  }
}

// ── FETCH ──
async function fetchDailyData(symbol) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Network error. Please try again.');
  const json = await res.json();

  if (json['Note']) throw new Error('API rate limit hit. Free tier allows 25 requests/day. Wait a minute and try again.');
  if (json['Information']) throw new Error('API limit reached. Free tier: 25 requests/day.');
  if (!json['Time Series (Daily)']) {
    if (json['Error Message']) throw new Error(`Symbol not found: "${symbol}". Check the ticker is correct.`);
    throw new Error('No data returned. The symbol may be invalid.');
  }

  return json;
}

// ── DISPLAY RESULT ──
function displayResult(displaySym, fullSym, market, data) {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('result-card').style.display = 'block';

  const ts = data['Time Series (Daily)'];
  const dates = Object.keys(ts).sort((a,b) => new Date(b)-new Date(a)); // newest first
  const latest = ts[dates[0]];
  const prev = ts[dates[1]];

  const close = parseFloat(latest['4. close']);
  const prevClose = parseFloat(prev['4. close']);
  const change = close - prevClose;
  const changePct = (change / prevClose) * 100;
  const isUp = change >= 0;
  const currency = market === 'ASX' ? 'A$' : '$';

  document.getElementById('r-symbol').textContent = displaySym;
  document.getElementById('r-market').textContent = market === 'ASX' ? '🇦🇺 ASX · AUD' : '🇺🇸 NYSE/NASDAQ · USD';
  document.getElementById('r-price').textContent = `${currency}${close.toFixed(2)}`;
  
  const changeEl = document.getElementById('r-change');
  const sign = isUp ? '+' : '';
  changeEl.textContent = `${sign}${change.toFixed(2)} (${sign}${changePct.toFixed(2)}%)`;
  changeEl.className = 'result-change ' + (isUp ? 'up' : 'down');

  document.getElementById('r-open').textContent = `${currency}${parseFloat(latest['1. open']).toFixed(2)}`;
  document.getElementById('r-high').textContent = `${currency}${parseFloat(latest['2. high']).toFixed(2)}`;
  document.getElementById('r-low').textContent = `${currency}${parseFloat(latest['3. low']).toFixed(2)}`;
  document.getElementById('r-vol').textContent = formatVolume(parseInt(latest['6. volume']));
  document.getElementById('r-prev').textContent = `${currency}${prevClose.toFixed(2)}`;
  document.getElementById('r-date').textContent = dates[0];

  drawChart(ts, dates, currency, isUp);
}

// ── CHART ──
function drawChart(ts, dates, currency, isUp) {
  const last30 = dates.slice(0, 30).reverse();
  const prices = last30.map(d => parseFloat(ts[d]['4. close']));

  if (priceChart) priceChart.destroy();

  const ctx = document.getElementById('price-chart').getContext('2d');
  const color = isUp ? '#2ed573' : '#ff4757';

  const gradient = ctx.createLinearGradient(0, 0, 0, 180);
  gradient.addColorStop(0, color + '33');
  gradient.addColorStop(1, color + '00');

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: last30.map(d => d.slice(5)),
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
          callbacks: {
            label: ctx => `${currency}${ctx.parsed.y.toFixed(2)}`
          }
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
  const cards = document.querySelectorAll('.index-card');
  for (const card of cards) {
    const sym = card.dataset.sym;
    const mkt = card.dataset.mkt;
    const fullSym = mkt === 'ASX' ? sym + '.AX' : sym;
    try {
      const data = await fetchDailyData(fullSym);
      const ts = data['Time Series (Daily)'];
      const dates = Object.keys(ts).sort((a,b) => new Date(b)-new Date(a));
      const latest = ts[dates[0]];
      const prev = ts[dates[1]];
      const close = parseFloat(latest['4. close']);
      const prevClose = parseFloat(prev['4. close']);
      const change = close - prevClose;
      const pct = (change / prevClose) * 100;
      const isUp = change >= 0;
      const currency = mkt === 'ASX' ? 'A$' : '$';
      const sign = isUp ? '+' : '';

      card.querySelector('.idx-price').textContent = `${currency}${close.toFixed(2)}`;
      const chgEl = card.querySelector('.idx-change');
      chgEl.textContent = `${sign}${pct.toFixed(2)}%`;
      chgEl.className = 'idx-change ' + (isUp ? 'up' : 'down');
      card.classList.remove('loading');

      // small delay to avoid rate limiting
      await sleep(500);
    } catch(e) {
      card.querySelector('.idx-change').textContent = 'unavailable';
      card.classList.remove('loading');
    }
  }
}

// ── WATCHLIST ──
function addToWatchlist(displaySym, fullSym, market, data) {
  if (watchlist.find(w => w.sym === displaySym)) return;

  const ts = data['Time Series (Daily)'];
  const dates = Object.keys(ts).sort((a,b) => new Date(b)-new Date(a));
  const close = parseFloat(ts[dates[0]]['4. close']);
  const prevClose = parseFloat(ts[dates[1]]['4. close']);
  const change = close - prevClose;
  const pct = (change / prevClose) * 100;

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
      <div class="watch-item" style="animation-delay:${i*0.05}s">
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
  ['r-open','r-high','r-low','r-vol','r-prev','r-date'].forEach(id => {
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
  if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
  return n.toString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
