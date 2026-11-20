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
  const fullName = document.getElementById('reg-fullname').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const address = document.getElementById('reg-address').value.trim();
  const password = document.getElementById('reg-password').value;
  try {
    const data = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, fullName, phone, address })
    });
    const successEl = document.getElementById('auth-success');
    successEl.textContent = data.message || 'Registration successful. Awaiting admin approval.';
    show(successEl);
    hide(document.getElementById('auth-error'));
    e.target.reset();
  } catch (err) {
    const errEl = document.getElementById('auth-error');
    errEl.textContent = err.message;
    show(errEl);
    hide(document.getElementById('auth-success'));
  }
});

// Forgot password toggle
document.getElementById('show-reset')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('register-form').classList.add('hidden');
  document.getElementById('reset-form').classList.remove('hidden');
  hide(document.getElementById('auth-error'));
  hide(document.getElementById('auth-success'));
});

document.getElementById('back-to-login')?.addEventListener('click', () => {
  document.getElementById('reset-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
});

document.getElementById('reset-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('reset-username').value.trim();
  const newPassword = document.getElementById('reset-password').value;
  try {
    const data = await api('/api/reset-password', {
      method: 'POST',
      body: JSON.stringify({ username, newPassword })
    });
    const successEl = document.getElementById('auth-success');
    successEl.textContent = data.message;
    show(successEl);
    hide(document.getElementById('auth-error'));
    e.target.reset();
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
    if (tab.dataset.view === 'profile') loadProfile();
    if (tab.dataset.view === 'kyc') loadKYCPage();
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
  if (!grid) return;
  const selected = document.getElementById('trade-symbol')?.value || 'BTC';
  const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
  grid.innerHTML = symbols.map(sym => {
    const price = prices[sym] || 0;
    return `
    <div class="price-card ${sym === selected ? 'selected' : ''}" data-sym="${sym}">
      <div class="sym">${sym}</div>
      <div class="price">${formatUSD(price)}</div>
    </div>
  `;
  }).join('');
  
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
        <td>${u.fullName || '-'}</td>
        <td>${u.email}</td>
        <td>${u.phone || '-'}</td>
        <td>${formatUSD(u.balanceUSD)}</td>
        <td>${u.approved ? 'Approved' : 'Pending'}</td>
        <td>${u.role}</td>
        <td>
          ${!u.approved && u.role !== 'admin' ? `<button class="btn primary approve-btn" data-id="${u.id}">Approve</button>` : ''}
          ${u.pendingProfile ? `<button class="btn primary approve-profile-btn" data-id="${u.id}">Approve Profile</button>` : ''}
          <button class="btn ghost reset-btn" data-id="${u.id}">Reset Pass</button>
          ${u.kycStatus === 'pending' ? `<button class="btn primary approve-kyc-btn" data-id="${u.id}">Approve KYC</button> <button class="btn ghost view-doc-btn" data-id="${u.id}" data-side="front">View Front</button> <button class="btn ghost view-doc-btn" data-id="${u.id}" data-side="back">View Back</button>` : ''}
          ${u.role !== 'admin' ? `<button class="btn ghost delete-btn" data-id="${u.id}" style="color:var(--red);">Delete</button>` : ''}
        </td>
      </tr>
    `).join('');

    body.querySelectorAll('.approve-profile-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/admin/approve-profile', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.id }) });
          loadAdmin();
        } catch (e) { alert(e.message); }
      });
    });

    body.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/admin/approve', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.id }) });
          loadAdmin();
        } catch (e) { alert(e.message); }
      });
    });

    
    body.querySelectorAll('.view-doc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await fetch(`/api/admin/kyc-document/${btn.dataset.id}/${btn.dataset.side}`, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          if (!res.ok) throw new Error('Failed to load document');
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        } catch (e) {
          alert(e.message);
        }
      });
    });

    body.querySelectorAll('.approve-kyc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await api('/api/admin/approve-kyc', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.id }) });
          loadAdmin();
        } catch (e) { alert(e.message); }
      });
    });

    body.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this user? This cannot be undone.')) return;
        try {
          await api('/api/admin/delete-user', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.id }) });
          loadAdmin();
        } catch (e) { alert(e.message); }
      });
    });

    body.querySelectorAll('.reset-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newPass = prompt('Enter new password for this user (min 6 chars):');
        if (!newPass || newPass.length < 6) return;
        try {
          await api('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ userId: btn.dataset.id, newPassword: newPass }) });
          alert('Password reset successfully');
        } catch (e) { alert(e.message); }
      });
    });
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
  const tabsEl = document.getElementById('deposit-tabs');
  const contentEl = document.getElementById('deposit-content');
  const warning = document.getElementById('kyc-warning');

  if (!tabsEl || !contentEl) return;

  api('/api/me').then(user => {
    const isAdmin = user.role === 'admin';
    if (!user.kycApproved && !isAdmin) {
      if (warning) warning.style.display = 'block';
      tabsEl.innerHTML = '';
      contentEl.innerHTML = '<p style="color:var(--muted);padding:20px;">Complete KYC verification to view deposit addresses. Go to the KYC tab.</p>';
      return;
    }
    if (warning) warning.style.display = 'none';
    renderDepositTabs();
  }).catch(err => {
    console.error(err);
    contentEl.innerHTML = '<p style="color:var(--red);">Unable to load deposit info. Please refresh.</p>';
  });

  function renderDepositTabs() {
    tabsEl.innerHTML = depositAddresses.map((d, i) => 
      `<button class="deposit-tab ${i===0?'active':''}" data-idx="${i}">${d.symbol}</button>`
    ).join('');

    function showTab(idx) {
      const d = depositAddresses[idx];
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(d.address)}`;
      contentEl.innerHTML = `
        <div class="deposit-detail">
          <div class="deposit-header">
            <span class="sym">${d.symbol}</span>
            <span class="network">${d.network}</span>
          </div>
          <div style="text-align:center;margin:16px 0;">
            <img src="${qrUrl}" alt="QR Code" style="border-radius:8px;background:#fff;padding:8px;" />
          </div>
          <div class="address-box">
            <code class="address">${d.address}</code>
            <button class="copy-btn" data-addr="${d.address}">Copy</button>
          </div>
          <p class="warning">Only send ${d.symbol} on the ${d.network} network. Wrong network = lost funds.</p>
        </div>
      `;
      contentEl.querySelector('.copy-btn').addEventListener('click', (e) => {
        navigator.clipboard.writeText(e.target.dataset.addr);
        e.target.textContent = 'Copied!';
        setTimeout(() => e.target.textContent = 'Copy', 1500);
      });
    }

    tabsEl.querySelectorAll('.deposit-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        tabsEl.querySelectorAll('.deposit-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        showTab(parseInt(btn.dataset.idx));
      });
    });
    showTab(0);
  }
}

async function loadProfile() {
  loadKYCStatus();
  try {
    const user = await api('/api/me');
    document.getElementById('prof-fullname').value = user.fullName || '';
    document.getElementById('prof-email').value = user.email || '';
    document.getElementById('prof-phone').value = user.phone || '';
    document.getElementById('prof-address').value = user.address || '';
    document.getElementById('prof-username').value = user.username || '';
  } catch (e) {
    console.error(e);
  }
}

document.getElementById('save-profile')?.addEventListener('click', async () => {
  const msg = document.getElementById('profile-msg');
  const data = {
    fullName: document.getElementById('prof-fullname').value.trim(),
    email: document.getElementById('prof-email').value.trim(),
    phone: document.getElementById('prof-phone').value.trim(),
    address: document.getElementById('prof-address').value.trim()
  };
  try {
    const res = await api('/api/profile/update', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    msg.textContent = res.message;
    msg.className = 'msg success';
    msg.classList.remove('hidden');
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg error';
    msg.classList.remove('hidden');
  }
});

// KYC
async function loadKYCStatus() {
  try {
    const user = await api('/api/me');
    const statusEl = document.getElementById('kyc-status');
    const formEl = document.getElementById('kyc-form');
    if (user.kycApproved) {
      statusEl.innerHTML = '<span style="color:var(--green);">✓ KYC Approved</span>';
      formEl.style.display = 'none';
    } else if (user.kycStatus === 'pending') {
      statusEl.innerHTML = '<span style="color:var(--primary);">KYC Pending Review</span>';
      formEl.style.display = 'none';
    } else {
      statusEl.innerHTML = '<span style="color:var(--red);">KYC Not Submitted</span>';
      formEl.style.display = 'block';
    }
  } catch (e) {}
}

document.getElementById('submit-kyc')?.addEventListener('click', async () => {
  const formData = new FormData();
  formData.append('fullName', document.getElementById('kyc-fullname').value.trim());
  formData.append('idType', document.getElementById('kyc-idtype').value);
  formData.append('idNumber', document.getElementById('kyc-idnumber').value.trim());
  formData.append('country', document.getElementById('kyc-country').value.trim());
  const front = document.getElementById('kyc-front').files[0];
  const back = document.getElementById('kyc-back').files[0];
  if (front) formData.append('front', front);
  if (back) formData.append('back', back);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/kyc/submit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    alert('KYC submitted for review');
    loadKYCStatus();
  } catch (e) { alert(e.message); }
});

document.getElementById('go-to-kyc')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelector('.nav-tab[data-view="profile"]').click();
});

async function loadKYCPage() {
  try {
    const user = await api('/api/me');
    const statusEl = document.getElementById('kyc-status-page');
    const formEl = document.getElementById('kyc-form-page');
    if (user.kycApproved) {
      statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ KYC Approved</span>';
      formEl.style.display = 'none';
    } else if (user.kycStatus === 'pending') {
      statusEl.innerHTML = '<span style="color:var(--primary);font-weight:600;">KYC Pending Review</span>';
      formEl.style.display = 'none';
    } else {
      statusEl.innerHTML = '<span style="color:var(--red);">Please complete KYC to enable deposits.</span>';
      formEl.style.display = 'block';
    }
  } catch (e) {}
}

document.getElementById('submit-kyc-page')?.addEventListener('click', async () => {
  const formData = new FormData();
  formData.append('fullName', document.getElementById('kyc-fullname-page').value.trim());
  formData.append('idType', document.getElementById('kyc-idtype-page').value);
  formData.append('idNumber', document.getElementById('kyc-idnumber-page').value.trim());
  formData.append('country', document.getElementById('kyc-country-page').value.trim());
  const front = document.getElementById('kyc-front-page').files[0];
  const back = document.getElementById('kyc-back-page').files[0];
  if (front) formData.append('front', front);
  if (back) formData.append('back', back);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/kyc/submit', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    alert('KYC submitted for review');
    loadKYCPage();
  } catch (e) { alert(e.message); }
});
