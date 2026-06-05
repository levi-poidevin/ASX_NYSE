// ── MarketPulse App ──
// Yahoo Finance via corsproxy.io — no API key required

let activeMarket = 'US';
let priceChart = null;
let watchlist = JSON.parse(localStorage.getItem('watchlist') || '[]');
let currentSearch = { displaySym: null, fullSym: null, market: null };

// ── CROSSHAIR PLUGIN ──
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart) {
    if (chart._crosshairX == null) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,212,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chart._crosshairX, chartArea.top);
    ctx.lineTo(chart._crosshairX, chartArea.bottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(chartArea.left, chart._crosshairY);
    ctx.lineTo(chartArea.right, chart._crosshairY);
    ctx.stroke();
    ctx.restore();
  }
};

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

  // Range selector
  document.getElementById('range-selector').addEventListener('click', async e => {
    const btn = e.target.closest('.range-btn');
    if (!btn || !currentSearch.fullSym) return;
    document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const range = btn.dataset.range;
    try {
      const result = await fetchYahooData(currentSearch.fullSym, range);
      const currency = currentSearch.market === 'ASX' ? 'A$' : '$';
      drawCandlestick(result.timestamp, result.indicators.quote[0], currency, range);
    } catch (err) {
      showError(err.message);
    }
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

  document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.range-btn[data-range="3mo"]').classList.add('active');

  try {
    const result = await fetchYahooData(symbol, '3mo');
    currentSearch = { displaySym: raw, fullSym: symbol, market: activeMarket };
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
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchYahooData(symbol, range = '3mo') {
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}`;

  const tryProxy = async buildProxy => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(buildProxy(yahooUrl), { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.chart?.error) throw new Error(`Yahoo Finance: ${json.chart.error.description || 'Unknown error'}`);
      if (!json.chart?.result?.[0]) throw new Error(`Symbol "${symbol}" not found. Check the ticker is correct.`);
      return json.chart.result[0];
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await Promise.any(PROXY_FNS.map(tryProxy));
  } catch (err) {
    if (err instanceof AggregateError) {
      const meaningful = err.errors.find(e =>
        e.message.startsWith('Yahoo Finance:') || e.message.includes('not found')
      );
      throw meaningful ?? new Error('All data sources unavailable. Try again shortly.');
    }
    throw err;
  }
}

// ── DISPLAY RESULT ──
function displayResult(displaySym, fullSym, market, result) {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('result-card').style.display = 'block';
  document.getElementById('detail-panels').style.display = 'grid';

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
  document.getElementById('r-low').textContent  = low  != null ? `${currency}${low.toFixed(2)}`  : '—';
  document.getElementById('r-vol').textContent  = volume != null ? formatVolume(volume) : '—';
  document.getElementById('r-prev').textContent = `${currency}${prevClose.toFixed(2)}`;

  const lastTs = timestamps[timestamps.length - 1];
  document.getElementById('r-date').textContent = new Date(lastTs * 1000).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney', day: '2-digit', month: 'short', year: 'numeric'
  });

  // 52-week + market cap
  const w52h = meta.fiftyTwoWeekHigh;
  const w52l = meta.fiftyTwoWeekLow;
  document.getElementById('r-52h').textContent = w52h != null ? `${currency}${w52h.toFixed(2)}` : '—';
  document.getElementById('r-52l').textContent = w52l != null ? `${currency}${w52l.toFixed(2)}` : '—';
  document.getElementById('r-mcap').textContent = meta.marketCap != null ? formatVolume(meta.marketCap) : '—';

  // Day range progress bar
  if (low != null && high != null && high > low) {
    const pct = Math.max(0, Math.min(100, ((close - low) / (high - low)) * 100));
    document.getElementById('r-range-dot').style.left = `${pct}%`;
    document.getElementById('r-range-vals').textContent =
      `${currency}${low.toFixed(2)} — ${currency}${high.toFixed(2)}`;
  }

  drawCandlestick(timestamps, quotes, currency, '3mo');
}

// ── CANDLESTICK CHART ──
function drawCandlestick(timestamps, quotes, currency, range) {
  const candles = timestamps
    .map((ts, i) => ({
      x: ts * 1000,
      o: quotes.open[i],
      h: quotes.high[i],
      l: quotes.low[i],
      c: quotes.close[i]
    }))
    .filter(c => c.o != null && c.h != null && c.l != null && c.c != null);

  if (priceChart) priceChart.destroy();

  const canvas = document.getElementById('price-chart');
  const ctx = canvas.getContext('2d');
  const timeUnit = range === '5d' ? 'day' : range === '1mo' ? 'week' : 'month';

  priceChart = new Chart(ctx, {
    type: 'candlestick',
    data: {
      datasets: [{
        label: 'OHLC',
        data: candles,
        color: {
          up: '#00d4ff',
          down: '#ff4757',
          unchanged: 'rgba(255,255,255,0.4)'
        }
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(8,18,38,0.96)',
          borderColor: 'rgba(0,212,255,0.3)',
          borderWidth: 1,
          titleColor: 'rgba(255,255,255,0.45)',
          bodyColor: '#ffffff',
          padding: 12,
          callbacks: {
            title: items => {
              if (!items[0]) return '';
              return new Date(items[0].parsed.x).toLocaleDateString('en-AU', {
                day: '2-digit', month: 'short', year: 'numeric'
              });
            },
            label: item => {
              const d = item.raw;
              if (!d) return '';
              return [
                `O  ${currency}${d.o.toFixed(2)}`,
                `H  ${currency}${d.h.toFixed(2)}`,
                `L  ${currency}${d.l.toFixed(2)}`,
                `C  ${currency}${d.c.toFixed(2)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: timeUnit },
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: 'rgba(255,255,255,0.32)',
            font: { family: 'JetBrains Mono', size: 10 },
            maxTicksLimit: 8
          }
        },
        y: {
          position: 'right',
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: 'rgba(255,255,255,0.32)',
            font: { family: 'JetBrains Mono', size: 10 },
            callback: v => `${currency}${v.toFixed(0)}`
          }
        }
      }
    },
    plugins: [crosshairPlugin]
  });

  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    priceChart._crosshairX = e.clientX - rect.left;
    priceChart._crosshairY = e.clientY - rect.top;
    priceChart.update('none');
  };
  canvas.onmouseleave = () => {
    priceChart._crosshairX = null;
    priceChart._crosshairY = null;
    priceChart.update('none');
  };
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
  const sparkPrices = (result.indicators.quote[0].close || []).filter(v => v != null).slice(-10);

  watchlist.unshift({ sym: displaySym, fullSym, market, close, pct, sparkPrices });
  if (watchlist.length > 12) watchlist.pop();
  localStorage.setItem('watchlist', JSON.stringify(watchlist));
  renderWatchlist();
}

function sparklineSVG(prices, isUp) {
  if (!prices || prices.length < 2) return '';
  const W = 80, H = 28;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - 2 - ((p - min) / span) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = isUp ? '#00d4ff' : '#ff4757';
  return `<svg class="watch-spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>` +
    `</svg>`;
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
        ${sparklineSVG(item.sparkPrices, isUp)}
        <button class="watch-remove" data-sym="${item.sym}" title="Remove">✕</button>
      </div>`;
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
  document.getElementById('detail-panels').style.display = 'none';
  document.getElementById('r-symbol').textContent = sym;
  document.getElementById('r-market').textContent = market === 'ASX' ? '🇦🇺 ASX' : '🇺🇸 US';
  document.getElementById('r-price').innerHTML = '<span class="spinner"></span>';
  document.getElementById('r-change').textContent = 'fetching...';
  document.getElementById('r-change').className = 'result-change';
  ['r-open','r-high','r-low','r-vol','r-prev','r-date','r-52h','r-52l','r-mcap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
}

function showError(msg) {
  document.getElementById('result-card').style.display = 'none';
  document.getElementById('detail-panels').style.display = 'none';
  const el = document.getElementById('error-msg');
  el.textContent = '⚠ ' + msg;
  el.style.display = 'block';
}

// ── UTILS ──
function formatVolume(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(2)  + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1)  + 'K';
  return n.toString();
}
