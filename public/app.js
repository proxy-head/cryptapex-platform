const API = ''; // same origin

let token = localStorage.getItem('token');
let currentUser = null;
let currentSide = 'buy';
let prices = {};

// ========== HELPERS ==========
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function formatUSD(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function formatCrypto(n, sym) {
  if (n === 0) return '0';
  if (sym === 'XRP' || sym === 'DOGE') return n.toFixed(4);
  if (n < 0.0001) return n.toFixed(8);
  return n.toFixed(6);
}

// ========== AUTH ==========
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').classList.toggle('hidden', !isLogin);
    document.getElementById('register-form').classList.toggle('hidden', isLogin);
    hide(document.getElementById('auth-error'));
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = err.message;
    show(errEl);
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = err.message;
    show(errEl);
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  hide(document.getElementById('main-screen'));
  show(document.getElementById('auth-screen'));
});

// ========== APP ==========
async function enterApp() {
  hide(document.getElementById('auth-screen'));
  show(document.getElementById('main-screen'));
  
  document.getElementById('user-badge').textContent = 
    `${currentUser.username}${currentUser.role === 'admin' ? ' (Admin)' : ''}`;
  
  // Show admin tab if admin
  const adminTab = document.querySelector('.nav-tab.admin-only');
  if (currentUser.role === 'admin') show(adminTab);
  else hide(adminTab);

  await refreshPrices();
  await loadPortfolio();
  startPricePolling();
}

// Navigation
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.view').forEach(v => hide(v));
    show(document.getElementById('view-' + tab.dataset.view));
    
    if (tab.dataset.view === 'portfolio') loadPortfolio();
    if (tab.dataset.view === 'history') loadHistory();
    if (tab.dataset.view === 'admin') loadAdmin();
    if (tab.dataset.view === 'deposit') loadDeposit();
  });
});

// Prices
async function refreshPrices() {
  try {
    const data = await api('/api/prices');
    prices = data.prices;
    renderPrices();
  } catch (e) {
    console.error(e);
  }
}

function renderPrices() {
  const grid = document.getElementById('prices-grid');
  const selected = document.getElementById('trade-symbol').value;
  grid.innerHTML = Object.entries(prices).map(([sym, price]) => `
    <div class="price-card ${sym === selected ? 'selected' : ''}" data-sym="${sym}">
      <div class="sym">${sym}</div>
      <div class="price">${formatUSD(price)}</div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.price-card').forEach(card => {
    card.addEventListener('click', () => {
      document.getElementById('trade-symbol').value = card.dataset.sym;
      renderPrices();
      updateEstimate();
    });
  });
}

function startPricePolling() {
  setInterval(refreshPrices, 15000);
}

// Trade
document.querySelectorAll('.side-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSide = btn.dataset.side;
    document.getElementById('amount-label').textContent = 
      currentSide === 'buy' ? 'Amount (USD)' : 'Amount (Crypto)';
    updateEstimate();
  });
});

document.getElementById('trade-symbol').addEventListener('change', () => {
  renderPrices();
  updateEstimate();
});
document.getElementById('trade-amount').addEventListener('input', updateEstimate);

function updateEstimate() {
  const amount = parseFloat(document.getElementById('trade-amount').value) || 0;
  const sym = document.getElementById('trade-symbol').value;
  const price = prices[sym] || 0;
  const el = document.getElementById('trade-estimate');
  if (amount <= 0 || !price) {
    el.textContent = '';
    return;
  }
  if (currentSide === 'buy') {
    const qty = amount / price;
    el.textContent = `≈ You will receive ${formatCrypto(qty, sym)} ${sym}`;
  } else {
    const usd = amount * price;
    el.textContent = `≈ You will receive ${formatUSD(usd)}`;
  }
}

document.getElementById('execute-trade').addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('trade-amount').value);
  const symbol = document.getElementById('trade-symbol').value;
  const msg = document.getElementById('trade-msg');
  if (!amount || amount <= 0) {
    msg.textContent = 'Enter a valid amount';
    msg.className = 'msg error';
    show(msg);
    return;
  }
  try {
    const data = await api('/api/trade', {
      method: 'POST',
      body: JSON.stringify({ symbol, side: currentSide, amount })
    });
    msg.textContent = data.message;
    msg.className = 'msg success';
    show(msg);
    document.getElementById('trade-amount').value = '';
    updateEstimate();
    // Refresh user data
    currentUser.balanceUSD = data.balanceUSD;
    currentUser.portfolio = data.portfolio;
    await loadPortfolio();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error';
    show(msg);
  }
});

// Portfolio
async function loadPortfolio() {
  try {
    const data = await api('/api/portfolio');
    document.getElementById('total-value').textContent = formatUSD(data.totalValue);
    document.getElementById('usd-balance').textContent = formatUSD(data.balanceUSD);
    
    const list = document.getElementById('holdings-list');
    const holdings = Object.entries(data.portfolio)
      .filter(([_, qty]) => qty > 0)
      .map(([sym, qty]) => {
        const value = qty * (data.prices[sym] || 0);
        return `
          <div class="holding-card">
            <div class="left">
              <span class="sym">${sym}</span>
              <span class="qty">${formatCrypto(qty, sym)} ${sym}</span>
            </div>
            <div class="right">
              <div class="value">${formatUSD(value)}</div>
              <div class="usd">@ ${formatUSD(data.prices[sym])}</div>
            </div>
          </div>
        `;
      });
    
    if (holdings.length === 0) {
      list.innerHTML = '<p style="color:var(--muted);padding:20px;">No crypto holdings yet. Start trading!</p>';
    } else {
      list.innerHTML = holdings.join('');
    }
  } catch (e) {
    console.error(e);
  }
}

// History
async function loadHistory() {
  try {
    const txs = await api('/api/transactions');
    const body = document.getElementById('tx-body');
    if (txs.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No transactions yet</td></tr>';
      return;
    }
    body.innerHTML = txs.map(t => `
      <tr>
        <td>${new Date(t.timestamp).toLocaleString()}</td>
        <td class="side-${t.side}">${t.side.toUpperCase()}</td>
        <td>${t.symbol}</td>
        <td>${t.side === 'buy' ? formatUSD(t.amount) : formatCrypto(t.amount, t.symbol)}</td>
        <td>${formatUSD(t.price)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

// Admin
async function loadAdmin() {
  try {
    const users = await api('/api/admin/users');
    const select = document.getElementById('admin-user-select');
    select.innerHTML = users
      .filter(u => u.role !== 'admin')
      .map(u => `<option value="${u.id}">${u.username} ($${u.balanceUSD.toFixed(2)})</option>`)
      .join('');
    
    const body = document.getElementById('admin-users-body');
    body.innerHTML = users.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.email}</td>
        <td>${formatUSD(u.balanceUSD)}</td>
        <td>${formatUSD(u.totalValue)}</td>
        <td>${u.role}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('send-funds-btn').addEventListener('click', async () => {
  const userId = document.getElementById('admin-user-select').value;
  const amount = parseFloat(document.getElementById('admin-amount').value);
  const msg = document.getElementById('admin-msg');
  if (!userId || !amount || amount <= 0) {
    msg.textContent = 'Select a user and enter a valid amount';
    msg.className = 'msg error';
    show(msg);
    return;
  }
  try {
    const data = await api('/api/admin/add-funds', {
      method: 'POST',
      body: JSON.stringify({ userId, amount })
    });
    msg.textContent = data.message;
    msg.className = 'msg success';
    show(msg);
    document.getElementById('admin-amount').value = '';
    loadAdmin();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg error';
    show(msg);
  }
});

// ========== INIT ==========
(async function init() {
  if (token) {
    try {
      currentUser = await api('/api/me');
      enterApp();
    } catch (e) {
      localStorage.removeItem('token');
      token = null;
    }
  }
})();
// ========== DEPOSIT ==========
const depositAddresses = [
  { symbol: 'BTC',  network: 'Bitcoin',     address: 'bc1qrynlenszta5p8dxk4e82pxhs77ryhtruzstmpy' },
  { symbol: 'ETH',  network: 'ERC-20',      address: '0xCD5E6d892CD976700A026a2E490f3ef34B064245' },
  { symbol: 'SOL',  network: 'Solana',      address: '9hFcs8Gg9A6NTg1MMMSw25q8nneoEqLJ7Y92PrY5nyaJ' },
  { symbol: 'XRP',  network: 'Ripple',      address: 'rUgeB3HtVmVSvPz8YUFapvGRfwHPt3AyQf' },
  { symbol: 'DOGE', network: 'Dogecoin',    address: 'DEgwL6QBQBYztiBQNbgY4fuakmizzvoaBe' }
];

function loadDeposit() {
  const grid = document.getElementById('deposit-grid');
  if (!grid) return;
  grid.innerHTML = depositAddresses.map(d => `
    <div class="deposit-card">
      <div class="deposit-header">
        <span class="sym">${d.symbol}</span>
        <span class="network">${d.network}</span>
      </div>
      <div class="address-box">
        <code class="address">${d.address}</code>
        <button class="copy-btn" data-addr="${d.address}">Copy</button>
      </div>
      <p class="warning">Only send ${d.symbol} on the ${d.network} network. Wrong network = lost funds.</p>
    </div>
  `).join('');

  grid.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.addr).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = original, 1500);
      });
    });
  });
}