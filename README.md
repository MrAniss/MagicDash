<div align="center">

# ✨ MagicDash

**The open-source acquisition performance dashboard.**
**Plug-and-play. Multi-channel. Multi-market.**

[Demo](#-quick-start-demo-mode-30-seconds) · [Features](#-what-magicdash-does) · [Setup](#-self-hosted-real-data) · [Tech stack](#-tech-stack)

![MagicDash dashboard preview](docs/screenshots/dashboard-overview.png)

</div>

---

## What is MagicDash?

MagicDash is a **performance marketing dashboard** that unifies your paid acquisition, web analytics and product-feed data into a single, opinionated cockpit. It centralises **Google Ads, Meta Ads, Google Analytics 4, Merchant Center and budget tracking** across every brand and market you operate.

Built for **e-commerce teams, performance agencies and CMOs** who are tired of jumping between five tabs to know whether yesterday was a good day.

> **Marketing analytics dashboard · PPC reporting tool · GA4 reporting · Google Ads dashboard · Meta Ads dashboard · Merchant Center monitoring · Multi-market e-commerce reporting**

---

## Why MagicDash?

| | Most dashboard tools | **MagicDash** |
|---|---|---|
| Setup time | Hours of OAuth, account linking, dashboard tuning | **30 seconds** in demo mode, fully working |
| Multi-brand / multi-market | Premium tier only | **Built-in, free** |
| Cross-channel KPIs | Per-channel silos | **One unified view** with same metrics across Ads ↔ GA4 |
| Open source | Closed, SaaS-only | **MIT-licensed**, self-host on your own infra |
| Vendor lock-in | High | **Your data stays on your machine** |

---

## ✨ What MagicDash does

### 🔍 Paid Search (Google Ads)
- KPIs at a glance: spend, revenue, ROAS, conversions, CVR, AOV, CTR, CPC, impression share
- Year-to-date trend with N-1 comparison
- Daily / weekly / monthly granularity toggle
- Performance breakdown by market
- Per-campaign drill-down (Search · PMax · Shopping · Display · Demand Gen · Video)
- **Toggle data source: Google Ads ↔ GA4** to spot attribution gaps instantly
- Auto-generated weekly summary

### 💰 Budget Pacing
- Monthly pacing vs. real spend
- End-of-month projection
- Daily spend chart YTD
- Per-market budget breakdown (read from Google Sheets)

### 🛍️ Shopping & Merchant Center
- Price competitiveness vs. market benchmark
- Top / flop products & brands
- Feed quality scoring (eligibility, identifiers, attributes)
- Performance Max scoring with custom POAS thresholds

### 📱 Paid Social (Meta)
- Spend, ROAS, CPM, CTR, CPA across Facebook & Instagram
- Campaign / ad set / creative-level metrics
- Breakdown by age, gender, placement, device
- Winning vs. losing audiences

### 📊 Analytics (Google Analytics 4)
- Sessions, transactions, revenue, bounce rate, CVR, AOV
- Channel attribution (Direct, Organic, Paid Search, Paid Social, Email, etc.) with N-1 deltas
- Purchase funnel: view → cart → checkout → payment → confirmation
- Per-market performance

### 🚨 Feed Monitor
- Daily snapshots of your Merchant Center catalogue
- Diff alerts on critical attributes (title, price, image, availability, custom labels…)
- Detects silent feed regressions before they hit your campaigns

---

## 🚀 Quick start (demo mode, 30 seconds)

The fastest way to see MagicDash in action — **no Google or Meta accounts required**.

```bash
git clone https://github.com/<you>/magicdash.git
cd magicdash
npm run install:all
npm run dev:all
```

Open http://localhost:5173 — you'll see the **first-launch wizard**. Click **✨ Demo Mode**.

Login with the credentials shown:

```
email:    admin@demo.local
password: DemoPass2026
```

That's it. You now have a fully functional dashboard with:
- 4 demo brands (Acme Beauty, Acme Health, Acme Pharma, Acme Wellness)
- 5 markets (FR, UK, DE, IT, ES)
- 2 years of synthetic data with realistic seasonality
- All views populated and clickable

> The data is generated deterministically — same date range always shows the same numbers. Useful for pitching, screenshotting, or just exploring without real ad spend on the line.

---

## 🔧 Self-hosted (real data)

For production use, you'll connect MagicDash to your own Google Ads, GA4, Meta Ads and Merchant Center accounts.

### 1. Prerequisites

- **Node.js ≥ 20** (recommended: 22 LTS)
- A **Google Cloud project** with these APIs enabled:
  - Google Ads API
  - Google Analytics Data API
  - Content API for Shopping (Merchant Center)
  - Google Sheets API (optional, for budget tracking)
- A **Google Ads MCC** with a developer token (Basic level after review, ~24h)
- (Optional) A **Meta Business** account with Marketing API access

### 2. Install

```bash
git clone https://github.com/<you>/magicdash.git
cd magicdash
npm run install:all
```

### 3. Configure

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials (see table below)
```

The `.env` file uses a simple naming convention — one variable per (provider × brand × market):

```env
# Auth
JWT_SECRET=<random 48+ chars>             # generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_DEVELOPER_TOKEN=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=XXX-XXX-XXXX

# Per (brand, market) accounts
GOOGLE_ADS_ID_BRAND_A_FR=123-456-7890
GA4_PROPERTY_BRAND_A_FR=123456789
MC_ID_BRAND_A_FR=987654321

# (Optional) Meta
META_ACCESS_TOKEN=...
META_AD_ACCOUNT_ID_FR=act_xxxxxxxxxxxx

# (Optional) Budget tracking
BUDGET_SHEET_ID=<google sheet id>
```

Brands are referenced internally as `BRAND_A`, `BRAND_B`, `BRAND_C`, `BRAND_D`. Their human labels are configurable in `frontend/src/components/Header.jsx`.

### 4. Create an admin user

```bash
node backend/scripts/addUser.js admin@example.com "yourPassword" "Admin Name"
```

### 5. Launch

```bash
npm run dev:all
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
```

On first launch, the wizard offers a **"Connect my data"** path that guides you through OAuth. After that, sign in with the admin user you created.

---

## 🧱 Tech stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, React Query, Recharts |
| **Backend** | Node 20, Express 4, ES modules |
| **Data clients** | `google-ads-api`, `@google-analytics/data`, `facebook-nodejs-business-sdk`, `googleapis` |
| **Storage** | SQLite (`better-sqlite3`) for audit history & feed snapshots; local JSON for users |
| **Auth** | bcrypt + JWT (dashboard login) + Google OAuth (data APIs) |
| **Process management** | PM2 (production), nodemon (dev) |
| **Scheduler** | `node-cron` for daily Merchant Center snapshots |

---

## 🏗️ Architecture

```
┌──────────────────────────────────┐
│  React frontend (Vite, port 5173) │
└───────────────┬───────────────────┘
                │ REST + JWT
┌───────────────▼───────────────────┐
│  Express backend (port 3001)       │
│  ┌─────────────────────────────┐  │
│  │  Auth · Setup wizard         │  │
│  │  /api/{kpis,trend,markets,…} │  │
│  │  /api/ga4/*  /api/shopping/* │  │
│  │  /api/paid-social/*          │  │
│  │  /api/feed-monitor/*         │  │
│  └─────────────────────────────┘  │
│  Cache layer (in-memory, ~1h TTL)  │
└───┬──────┬──────┬──────┬───────────┘
    │      │      │      │
    ▼      ▼      ▼      ▼
 Google  GA4   Meta   Merchant
  Ads          Ads    Center
```

**Demo mode** swaps every external API client for a deterministic synthetic-data generator — so the entire stack runs offline, with no credentials, for sales pitches and integration tests.

---

## 🔒 Security & privacy

- **Self-hosted**: your data never leaves your servers. No third-party SaaS sees your performance numbers.
- **Tokens stored locally** in `backend/tokens.json` (gitignored).
- **Bcrypt-hashed passwords** in `backend/users.json` (gitignored).
- **JWT-signed sessions** with configurable secret.
- **OAuth refresh handled server-side** — frontend never sees Google or Meta tokens.

---

## 🛣️ Roadmap

- [ ] Setup wizard: real-data path with OAuth flow + per-source forms
- [ ] Multi-tenant SaaS mode (multiple clients on one MagicDash instance)
- [ ] Microsoft Ads (Bing) integration
- [ ] TikTok Ads integration
- [ ] Anomaly detection & email alerts
- [ ] Custom KPI builder
- [ ] Public dashboard sharing (read-only links)

Got an idea? Open an issue.

---

## 📁 Project structure

```
magicdash/
├── backend/
│   ├── server.js              # Express app + /api routes
│   ├── googleAdsClient.js     # Google Ads API client (+ in-memory cache)
│   ├── ga4Client.js           # GA4 Data API client
│   ├── metaAdsClient.js       # Meta Marketing API client
│   ├── auth.js                # Google OAuth (data APIs)
│   ├── userAuth.js            # User login (bcrypt + JWT)
│   ├── routes/                # /api/ga4, /api/shopping, /api/paid-social,
│   │                          # /api/feed-monitor, /api/setup, …
│   ├── services/
│   │   ├── demo/              # Synthetic-data generator (DEMO_MODE)
│   │   ├── merchantCenterClient.js
│   │   ├── budgetSheetReader.js
│   │   ├── feedSnapshotService.js
│   │   ├── scheduler.js       # node-cron jobs
│   │   └── cacheWarmer.js
│   ├── config/                # Brand × market mappings (env-driven)
│   ├── database/              # SQLite schema + better-sqlite3 wrapper
│   └── scripts/
│       └── addUser.js         # Create / update an admin user
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # View router (Paid Search · Social · Analytics · Feed)
│   │   ├── components/
│   │   │   ├── SetupWizard.jsx   # First-launch wizard
│   │   │   ├── LoginScreen.jsx
│   │   │   ├── Header.jsx
│   │   │   ├── PaidSocialView.jsx
│   │   │   ├── GA4View.jsx
│   │   │   ├── ShoppingView.jsx
│   │   │   ├── FeedMonitorView.jsx
│   │   │   └── …               # Shared chart/table components
│   │   ├── contexts/AuthContext.jsx
│   │   ├── hooks/useAdsData.js   # React Query hooks
│   │   └── utils/
│   │
│   ├── public/                # Logo, favicon
│   └── tailwind.config.js     # Design tokens
│
├── ecosystem.config.cjs       # PM2 config (production)
└── package.json               # npm workspaces (backend + frontend)
```

---

## 🛠️ Common commands

```bash
# Development
npm run dev:all       # Backend + frontend in parallel (hot reload)
npm run dev:back      # Backend only
npm run dev:front     # Frontend only

# Production (PM2)
npm run pm:start      # Launch and persist
npm run pm:status     # Process status
npm run pm:logs       # Tail backend logs
npm run pm:restart
npm run pm:stop

# Build for production
cd frontend && npm run build   # Outputs to frontend/dist/
```

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| `JWT_SECRET missing or too short` at startup | Generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and put it in `backend/.env`. |
| Wizard keeps appearing | The `MAGICDASH_BOOTSTRAPPED=true` flag (or a JWT_SECRET ≥16 chars) wasn't set in `backend/.env`. The demo wizard will set it; for manual setup, add it yourself. |
| `Identifiants invalides` at login | No user in `backend/users.json`. Run `node backend/scripts/addUser.js <email> <password>`. |
| Empty data in a market | Verify `GOOGLE_ADS_ID_<BRAND>_<MARKET>` is set in `.env`. |
| Paid Social tab disabled | `META_ACCESS_TOKEN` and at least one `META_AD_ACCOUNT_ID_*` must be set. |
| `Quota exceeded` from Google APIs | API rate-limited. Increase `staleTime` in `frontend/src/hooks/useAdsData.js` or wait. |
| `EADDRINUSE :3001` | Another process owns port 3001. Run `npm run pm:delete` or change `PORT` in `.env`. |
| Page blanche / blank page | Open the browser console (F12) and check `npm run pm:logs` for backend errors. |

---

## 🤝 Contributing

Pull requests welcome. The codebase follows ESLint + Prettier (frontend) and standard Node ESM conventions (backend). Run `cd frontend && npm run lint:fix` before committing.

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

Made with <span style="color:#EC4899">♥</span> · MagicDash

</div>
