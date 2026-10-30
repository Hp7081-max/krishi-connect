# Krishi Connect (Kisaan Setu) — Backend Server

A production-ready Node.js, Express & MongoDB backend built specifically for the **Krishi Connect (Kisaan Setu)** agricultural marketplace and farmer advisory web application.

---

## 🌾 Features & Architecture

- **Dual-Mode Persistence (Zero-Config + MongoDB)**:
  - **MongoDB Primary**: Connects automatically to local MongoDB or cloud MongoDB Atlas via `MONGODB_URI` in `.env`.
  - **Graceful Auto-Fallback**: If MongoDB is not running locally, the server seamlessly falls back to a persistent JSON database (`data/db.json`), ensuring the application never crashes and all endpoints, authentication, and state synchronization work out-of-the-box!
- **Real-time Live Sync (Socket.IO)**:
  - Instant updates for new crop listings, incoming buyer bids, deal status changes, driver assignments, and live transport tracking.
- **RESTful Endpoints**:
  - Full CRUD operations for Marketplace Listings, Bids, Deals, Escrow, and Contracts.
  - Agricultural Equipment Rental Hub (Krishi Yantra).
  - Farmer Wallet & Bank Payouts.
  - AI Crop Disease Scanner & Soil NPK Advisory.
  - Live Mandi prices & 5-Day Weather Forecasts.
- **Client Integration (`api-client.js`)**:
  - Exposes `window.KrishiAPI` directly to `fully final.html`.
  - Auto-negotiates online/offline modes, handles state hydration, authentication, and bidirectional synchronization.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (`.env`)
A default `.env` file is already created:
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/krishi_connect
JWT_SECRET=krishi_connect_super_secret_jwt_key_2026_agro_market
STORAGE_MODE=auto
```
> **Tip for MongoDB Atlas**: Simply replace `MONGODB_URI` with your Atlas connection string (e.g., `mongodb+srv://<username>:<password>@cluster0.mongodb.net/krishi_connect`).

### 3. Start the Server
```bash
npm start
```
Or for auto-reloading during development:
```bash
npm run dev
```

The server will start at:
👉 **`http://localhost:5000`**

Visiting `http://localhost:5000` in your browser will directly load the complete Krishi Connect application connected to the backend.

---

## 📡 API Reference

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new Farmer or Buyer (`contact`, `password`, `role`, `name`, `village`) |
| `POST` | `/api/auth/login` | Login with credentials (`contact`, `password`) |

### 🌾 Marketplace Listings (`/api/listings`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/listings` | Fetch all active crop lots (supports `?state=`, `?grade=`, `?cropKey=`) |
| `POST` | `/api/listings` | Post a new crop lot to the Mandi (`cropKey`, `qty`, `price`, `grade`, `state`, `district`, `photo`) |

### 💰 Bids & Negotiation (`/api/bids`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bids` | Get bids (supports `?listingId=`) |
| `POST` | `/api/bids` | Place a bid on a listing (`listingId`, `rate`, `qty`, `note`, `buyerName`) |
| `POST` | `/api/bids/:id/accept` | Farmer accepts a bid (auto-creates deal & legal contract) |
| `POST` | `/api/bids/:id/reject` | Farmer rejects a bid |
| `POST` | `/api/bids/:id/counter` | Farmer sends a counter-offer (`counterRate`) |
| `POST` | `/api/bids/:id/accept-counter` | Buyer accepts counter-offer |

### 🤝 Deals & Escrow Logistics (`/api/deals`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/deals` | Get all ongoing and completed deals |
| `POST` | `/api/deals/:id/advance` | Advance deal stage: `confirmed` ➔ `pickup` ➔ `transit` (auto-releases escrow) ➔ `delivered` |
| `POST` | `/api/deals/:id/assign-driver` | Assign transport vehicle & driver (`transporter`) |
| `POST` | `/api/deals/:id/release-escrow` | Release held escrow payment to farmer's wallet |
| `POST` | `/api/deals/:id/book-qc` | Book quality inspection certificate |

### 🚜 Equipment Rental Hub (`/api/equipment`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/equipment` | Browse available farm machinery (tractors, harvesters, drones) |
| `POST` | `/api/equipment` | List your equipment for rent (`name`, `rate`, `unit`, `location`) |
| `POST` | `/api/equipment/:id/book` | Book equipment |

### 🏦 Wallet & Payouts (`/api/wallet`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/wallet` | Check wallet balance & transaction passbook |
| `POST` | `/api/wallet/withdraw` | Withdraw available balance to registered bank account |

### 🧪 Farmer Advisory Tools (`/api/tools`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tools/scan-disease` | AI disease detector with treatment and fungicide recommendations |
| `POST` | `/api/tools/soil-advisory` | Soil test NPK analysis and optimal crop matching |
| `GET` | `/api/tools/weather` | 5-day agricultural weather forecast and irrigation advice |

### 🩺 System State & Health (`/api/state`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/state/sync` | Hydrate frontend state from backend database |
| `GET` | `/api/health` | Service health status & database connectivity details |

---

## 📁 Project Structure

```
Krishi COnnet/
├── config/
│   ├── db.js              # MongoDB connection & fallback management
│   └── initialData.js      # Seed data (crops, mandis, transporters, equipment)
├── models/
│   ├── User.js            # User Schema
│   ├── Listing.js         # Marketplace Crop Lots Schema
│   ├── Bid.js             # Bids Schema
│   ├── Deal.js            # Deals & Logistics Schema
│   └── Equipment.js       # Machinery Rental Schema
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── listings.js        # Crop listing routes
│   ├── bids.js            # Bidding & counter-offers
│   ├── deals.js           # Deal lifecycle & escrow
│   ├── equipment.js       # Farm equipment sharing
│   ├── wallet.js          # Farmer wallet & withdrawals
│   ├── tools.js           # AI disease scan & soil advisory
│   └── sync.js            # State sync & health checks
├── services/
│   └── dataService.js     # Unified data layer (MongoDB + JSON DB)
├── data/
│   └── db.json            # Persistent JSON database (auto-generated)
├── api-client.js          # Frontend window.KrishiAPI bridge
├── fully final.html       # Krishi Connect full frontend
├── server.js              # Express app & Socket.IO server
├── package.json           # Dependencies and scripts
└── .env                   # Environment configurations
```
