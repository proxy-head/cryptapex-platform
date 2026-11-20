# Cryptapex – Simulated Crypto Trading Platform

A full-stack crypto trading website where users can practice buying/selling major cryptocurrencies with virtual funds. The platform owner (admin) can view all user accounts and send additional funds to any user from the backend.

## Features

- **User Registration & Login** (JWT authentication)
- **Live simulated prices** for BTC, ETH, SOL, XRP, DOGE (prices fluctuate every 30s)
- **Buy & Sell** with USD balance
- **Portfolio tracking** with real-time total value
- **Transaction history**
- **Admin Panel**:
  - View every user’s account, balances, and portfolio value
  - Send (credit) USD funds to any user
- New users start with **$0**
- Data persists in a local JSON file (no external database required)

## Default Admin Account

```
Username: admin
Password: admin123
```

**Important:** Change the admin password and JWT secret before any public deployment.

## Tech Stack

- **Backend**: Node.js + Express
- **Auth**: JWT + bcrypt
- **Storage**: Simple JSON file (`data/db.json`)
- **Frontend**: Vanilla HTML / CSS / JavaScript (no build step)

## Quick Start (Local)

1. Make sure you have **Node.js 18+** installed.
2. Open a terminal in this folder and run:

```bash
npm install
npm start
```

3. Open your browser at: **http://localhost:3000**

## Project Structure

```
cryptapex-platform/
├── server.js          # Express backend + API
├── package.json
├── data/              # Created automatically (db.json)
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md
```

## Environment Variables (optional)

Create a `.env` file:

```
PORT=3000
JWT_SECRET=your-very-long-random-secret-here
```

## How Admin Works

1. Login with the admin account.
2. Click the **Admin** tab.
3. You will see a table of all registered users.
4. Use the “Send Funds” form to credit any user with extra USD.

All actions are logged and the balance updates immediately for the target user.

---

This is an educational project only. It does not connect to real exchanges or handle real money.
