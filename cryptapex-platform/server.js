const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'crypto-demo-super-secret-key-change-in-production';
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Initialize database
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: [],
      transactions: [],
      prices: {
        BTC: 64250.00,
        ETH: 3450.75,
        SOL: 148.20,
        XRP: 0.62,
        DOGE: 0.145
      },
      lastPriceUpdate: Date.now()
    };
    // Create default admin
    const adminHash = bcrypt.hashSync('admin123', 10);
    initial.users.push({
      id: 'admin-001',
      username: 'admin',
      email: 'admin@demo.com',
      password: adminHash,
      role: 'admin',
      balanceUSD: 0,
      portfolio: { BTC: 0, ETH: 0, SOL: 0, XRP: 0, DOGE: 0 },
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDB();

// Simulate price fluctuations every 30 seconds
setInterval(() => {
  const symbols = Object.keys(db.prices);
  symbols.forEach(sym => {
    const change = (Math.random() - 0.5) * 0.02; // ±1%
    db.prices[sym] = Math.max(0.0001, +(db.prices[sym] * (1 + change)).toFixed(sym === 'XRP' || sym === 'DOGE' ? 4 : 2));
  });
  db.lastPriceUpdate = Date.now();
  saveDB(db);
}, 30000);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = db.users.find(u => u.id === decoded.id);
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ========== AUTH ROUTES ==========
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (db.users.find(u => u.username === username || u.email === email)) {
    return res.status(400).json({ error: 'Username or email already exists' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: uuidv4(),
    username,
    email,
    password: hash,
    role: 'user',
    balanceUSD: 0, // Starting demo funds
    portfolio: { BTC: 0, ETH: 0, SOL: 0, XRP: 0, DOGE: 0 },
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, balanceUSD: user.balanceUSD, portfolio: user.portfolio }
  });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users.find(u => u.username === username || u.email === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, balanceUSD: user.balanceUSD, portfolio: user.portfolio }
  });
});

// ========== USER ROUTES ==========
app.get('/api/me', auth, (req, res) => {
  const { password, ...safe } = req.user;
  res.json(safe);
});

app.get('/api/prices', (req, res) => {
  res.json({ prices: db.prices, updatedAt: db.lastPriceUpdate });
});

app.get('/api/portfolio', auth, (req, res) => {
  const { balanceUSD, portfolio } = req.user;
  let totalValue = balanceUSD;
  Object.keys(portfolio).forEach(sym => {
    totalValue += portfolio[sym] * (db.prices[sym] || 0);
  });
  res.json({ balanceUSD, portfolio, totalValue: +totalValue.toFixed(2), prices: db.prices });
});

app.post('/api/trade', auth, (req, res) => {
  const { symbol, side, amount } = req.body; // amount in USD for buy, in crypto for sell
  const sym = (symbol || '').toUpperCase();
  if (!['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].includes(sym)) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }
  if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Invalid side' });
  const qty = parseFloat(amount);
  if (isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid amount' });

  const price = db.prices[sym];
  const user = req.user;

  if (side === 'buy') {
    const cost = qty; // amount is USD
    const cryptoQty = cost / price;
    if (user.balanceUSD < cost) return res.status(400).json({ error: 'Insufficient USD balance' });
    user.balanceUSD = +(user.balanceUSD - cost).toFixed(2);
    user.portfolio[sym] = +(user.portfolio[sym] + cryptoQty).toFixed(8);
  } else {
    // sell: amount is crypto quantity
    if (user.portfolio[sym] < qty) return res.status(400).json({ error: 'Insufficient crypto balance' });
    const proceeds = qty * price;
    user.portfolio[sym] = +(user.portfolio[sym] - qty).toFixed(8);
    user.balanceUSD = +(user.balanceUSD + proceeds).toFixed(2);
  }

  // Log transaction
  db.transactions.push({
    id: uuidv4(),
    userId: user.id,
    symbol: sym,
    side,
    amount: qty,
    price,
    timestamp: new Date().toISOString()
  });
  saveDB(db);

  res.json({
    success: true,
    balanceUSD: user.balanceUSD,
    portfolio: user.portfolio,
    message: `${side.toUpperCase()} order executed`
  });
});

app.get('/api/transactions', auth, (req, res) => {
  const txs = db.transactions
    .filter(t => t.userId === req.user.id)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json(txs);
});

// ========== ADMIN ROUTES ==========
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const users = db.users.map(u => {
    const { password, ...safe } = u;
    let totalValue = u.balanceUSD;
    Object.keys(u.portfolio || {}).forEach(sym => {
      totalValue += (u.portfolio[sym] || 0) * (db.prices[sym] || 0);
    });
    return { ...safe, totalValue: +totalValue.toFixed(2) };
  });
  res.json(users);
});

app.post('/api/admin/add-funds', auth, adminOnly, (req, res) => {
  const { userId, amount } = req.body;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.balanceUSD = +(user.balanceUSD + amt).toFixed(2);
  saveDB(db);
  res.json({
    success: true,
    message: `Added $${amt.toFixed(2)} demo funds to ${user.username}`,
    newBalance: user.balanceUSD
  });
});

app.post('/api/admin/set-balance', auth, adminOnly, (req, res) => {
  const { userId, balanceUSD } = req.body;
  const bal = parseFloat(balanceUSD);
  if (isNaN(bal) || bal < 0) return res.status(400).json({ error: 'Invalid balance' });
  const user = db.users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.balanceUSD = +bal.toFixed(2);
  saveDB(db);
  res.json({ success: true, message: `Set balance of ${user.username} to $${bal.toFixed(2)}` });
});

app.get('/api/admin/transactions', auth, adminOnly, (req, res) => {
  const txs = db.transactions
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 100)
    .map(t => {
      const user = db.users.find(u => u.id === t.userId);
      return { ...t, username: user ? user.username : 'unknown' };
    });
  res.json(txs);
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Cryptapex Platform running at http://localhost:${PORT}`);
  console.log(`   Admin login → username: admin  |  password: admin123`);
  console.log(`   New users start with $10,000 demo funds\n`);
});
