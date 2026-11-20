const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cryptapex-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'cryptapex';

let db;
let usersCol, transactionsCol, pricesCol;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  usersCol = db.collection('users');
  transactionsCol = db.collection('transactions');
  pricesCol = db.collection('prices');

  // Ensure default prices exist
  const pricesDoc = await pricesCol.findOne({ _id: 'current' });
  if (!pricesDoc) {
    await pricesCol.insertOne({
      _id: 'current',
      BTC: 64250.00,
      ETH: 3450.75,
      SOL: 148.20,
      XRP: 0.62,
      DOGE: 0.145,
      lastPriceUpdate: Date.now()
    });
  }

  // Ensure admin exists
  const admin = await usersCol.findOne({ username: 'admin' });
  if (!admin) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    await usersCol.insertOne({
      id: 'admin-001',
      username: 'admin',
      email: 'admin@cryptapex.com',
      password: adminHash,
      fullName: 'Administrator',
      role: 'admin',
      approved: true,
      balanceUSD: 0,
      portfolio: { BTC: 0, ETH: 0, SOL: 0, XRP: 0, DOGE: 0 },
      createdAt: new Date().toISOString()
    });
  }
  console.log('Connected to MongoDB');
}

// Price fluctuation
setInterval(async () => {
  try {
    const prices = await pricesCol.findOne({ _id: 'current' });
    if (!prices) return;
    const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];
    const update = {};
    symbols.forEach(sym => {
      const change = (Math.random() - 0.5) * 0.02;
      update[sym] = Math.max(0.0001, +(prices[sym] * (1 + change)).toFixed(sym === 'XRP' || sym === 'DOGE' ? 4 : 2));
    });
    update.lastPriceUpdate = Date.now();
    await pricesCol.updateOne({ _id: 'current' }, { $set: update });
  } catch (e) {}
}, 30000);


const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    usersCol.findOne({ id: decoded.id }).then(user => {
      if (!user) return res.status(401).json({ error: 'User not found' });
      req.user = user;
      next();
    }).catch(() => res.status(401).json({ error: 'Invalid token' }));
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ========== AUTH ==========
app.post('/api/register', async (req, res) => {
  const { username, email, password, fullName, address, phone } = req.body;
  if (!username || !email || !password || !fullName) return res.status(400).json({ error: 'Username, email, password and full name are required' });
  const exists = await usersCol.findOne({ $or: [{ username }, { email }] });
  if (exists) return res.status(400).json({ error: 'Username or email already exists' });
  const hash = bcrypt.hashSync(password, 10);
  const user = {
    id: uuidv4(),
    username,
    email,
    password: hash,
    fullName: fullName || '',
    address: address || '',
    phone: phone || '',
    role: 'user',
    approved: false,
    balanceUSD: 0,
    portfolio: { BTC: 0, ETH: 0, SOL: 0, XRP: 0, DOGE: 0 },
    createdAt: new Date().toISOString()
  };
  await usersCol.insertOne(user);
  res.json({ message: 'Registration successful. Your account is pending admin approval.', pending: true });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await usersCol.findOne({ $or: [{ username }, { email: username }] });
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (user.role !== 'admin' && !user.approved) {
    return res.status(403).json({ error: 'Account pending admin approval. Please wait for approval.' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const { password: _, ...safe } = user;
  res.json({ token, user: safe });
});

app.post('/api/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;
  if (!username || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Username and new password (min 6 chars) required' });
  }
  const user = await usersCol.findOne({ $or: [{ username }, { email: username }] });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const hash = bcrypt.hashSync(newPassword, 10);
  await usersCol.updateOne({ id: user.id }, { $set: { password: hash } });
  res.json({ success: true, message: 'Password updated successfully' });
});

// ========== USER ==========
app.get('/api/me', auth, (req, res) => {
  const { password, ...safe } = req.user;
  res.json(safe);
});

app.get('/api/prices', async (req, res) => {
  const prices = await pricesCol.findOne({ _id: 'current' });
  res.json({ prices, updatedAt: prices?.lastPriceUpdate });
});

app.get('/api/portfolio', auth, async (req, res) => {
  const prices = await pricesCol.findOne({ _id: 'current' });
  const { balanceUSD, portfolio } = req.user;
  let totalValue = balanceUSD || 0;
  Object.keys(portfolio || {}).forEach(sym => {
    totalValue += (portfolio[sym] || 0) * (prices[sym] || 0);
  });
  res.json({ balanceUSD, portfolio, totalValue: +totalValue.toFixed(2), prices });
});

app.post('/api/trade', auth, async (req, res) => {
  const { symbol, side, amount } = req.body;
  const qty = parseFloat(amount);
  if (!symbol || !side || isNaN(qty) || qty <= 0) return res.status(400).json({ error: 'Invalid trade' });
  const prices = await pricesCol.findOne({ _id: 'current' });
  const price = prices[symbol];
  if (!price) return res.status(400).json({ error: 'Unknown symbol' });

  const user = await usersCol.findOne({ id: req.user.id });
  if (side === 'buy') {
    const cost = qty * price;
    if (user.balanceUSD < cost) return res.status(400).json({ error: 'Insufficient USD balance' });
    await usersCol.updateOne({ id: user.id }, {
      $inc: { balanceUSD: -cost, [`portfolio.${symbol}`]: qty }
    });
  } else if (side === 'sell') {
    if ((user.portfolio[symbol] || 0) < qty) return res.status(400).json({ error: 'Insufficient crypto balance' });
    const proceeds = qty * price;
    await usersCol.updateOne({ id: user.id }, {
      $inc: { balanceUSD: proceeds, [`portfolio.${symbol}`]: -qty }
    });
  } else return res.status(400).json({ error: 'Invalid side' });

  await transactionsCol.insertOne({
    id: uuidv4(),
    userId: user.id,
    symbol,
    side,
    amount: qty,
    price,
    total: qty * price,
    timestamp: new Date().toISOString()
  });

  const updated = await usersCol.findOne({ id: user.id });
  res.json({ success: true, balanceUSD: updated.balanceUSD, portfolio: updated.portfolio });
});

app.post('/api/transfer-to-fx', auth, async (req, res) => {
  const { amount } = req.body;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const user = await usersCol.findOne({ id: req.user.id });
  if (user.balanceUSD < amt) return res.status(400).json({ error: 'Insufficient balance' });
  await usersCol.updateOne({ id: user.id }, { $inc: { balanceUSD: -amt } });
  const updated = await usersCol.findOne({ id: user.id });
  res.json({ success: true, newBalance: updated.balanceUSD, transferred: amt });
});

app.post('/api/profile/update', auth, async (req, res) => {
  const { fullName, email, phone, address } = req.body;
  await usersCol.updateOne({ id: req.user.id }, {
    $set: {
      pendingProfile: {
        fullName: fullName || req.user.fullName,
        email: email || req.user.email,
        phone: phone || req.user.phone,
        address: address || req.user.address,
        requestedAt: new Date().toISOString()
      }
    }
  });
  res.json({ success: true, message: 'Profile update submitted for admin approval' });
});

app.get('/api/transactions', auth, async (req, res) => {
  const txs = await transactionsCol.find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(50).toArray();
  res.json(txs);
});

// ========== ADMIN ==========
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const users = await usersCol.find({}).toArray();
  const prices = await pricesCol.findOne({ _id: 'current' });
  const result = users.map(u => {
    const { password, ...safe } = u;
    let totalValue = u.balanceUSD || 0;
    Object.keys(u.portfolio || {}).forEach(sym => {
      totalValue += (u.portfolio[sym] || 0) * (prices[sym] || 0);
    });
    return { ...safe, totalValue: +totalValue.toFixed(2), approved: !!u.approved };
  });
  res.json(result);
});

app.post('/api/admin/approve', auth, adminOnly, async (req, res) => {
  const { userId } = req.body;
  const result = await usersCol.updateOne({ id: userId }, { $set: { approved: true } });
  if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, message: 'User approved' });
});

app.post('/api/admin/approve-profile', auth, adminOnly, async (req, res) => {
  const { userId } = req.body;
  const user = await usersCol.findOne({ id: userId });
  if (!user || !user.pendingProfile) return res.status(404).json({ error: 'No pending profile update' });
  await usersCol.updateOne({ id: userId }, {
    $set: user.pendingProfile,
    $unset: { pendingProfile: '' }
  });
  res.json({ success: true, message: 'Profile update approved' });
});



app.post('/api/kyc/submit', auth, upload.single('document'), async (req, res) => {
  const { fullName, idNumber, idType, country } = req.body;
  if (!fullName || !idNumber) return res.status(400).json({ error: 'Full name and ID number required' });
  const update = {
    kycData: { 
      fullName, 
      idNumber, 
      idType: idType || 'Passport', 
      country: country || '', 
      submittedAt: new Date().toISOString() 
    },
    kycStatus: 'pending'
  };
  if (req.file) {
    update.kycDocument = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      data: req.file.buffer.toString('base64'),
      uploadedAt: new Date().toISOString()
    };
  }
  await usersCol.updateOne({ id: req.user.id }, { $set: update });
  res.json({ success: true, message: 'KYC submitted for review' });
});

app.get('/api/admin/kyc-document/:userId', auth, adminOnly, async (req, res) => {
  const user = await usersCol.findOne({ id: req.params.userId });
  if (!user || !user.kycDocument) return res.status(404).json({ error: 'No document' });
  const buf = Buffer.from(user.kycDocument.data, 'base64');
  res.set('Content-Type', user.kycDocument.mimetype);
  res.send(buf);
});

app.post('/api/admin/approve-kyc', auth, adminOnly, async (req, res) => {
  const { userId } = req.body;
  await usersCol.updateOne({ id: userId }, { $set: { kycApproved: true, kycStatus: 'approved' } });
  res.json({ success: true, message: 'KYC approved' });
});

app.post('/api/admin/delete-user', auth, adminOnly, async (req, res) => {
  const { userId } = req.body;
  if (userId === 'admin-001') return res.status(400).json({ error: 'Cannot delete admin' });
  const result = await usersCol.deleteOne({ id: userId });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'User not found' });
  await transactionsCol.deleteMany({ userId });
  res.json({ success: true, message: 'User deleted' });
});

app.post('/api/admin/reset-password', auth, adminOnly, async (req, res) => {
  const { userId, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = bcrypt.hashSync(newPassword, 10);
  await usersCol.updateOne({ id: userId }, { $set: { password: hash } });
  res.json({ success: true, message: 'Password reset' });
});

app.post('/api/admin/add-funds', auth, adminOnly, async (req, res) => {
  const { userId, amount } = req.body;
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount' });
  await usersCol.updateOne({ id: userId }, { $inc: { balanceUSD: amt } });
  const user = await usersCol.findOne({ id: userId });
  res.json({ success: true, newBalance: user.balanceUSD });
});

// Start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Cryptapex running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});
