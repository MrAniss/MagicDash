# Dhygietal SEA Dashboard

Dashboard interne de pilotage Paid Search multi-marques / multi-marchés.
Centralise Google Ads, GA4, Search Console, Merchant Center et les budgets Google Sheets dans une seule interface React.

---

## Sommaire

1. [Stack technique](#stack-technique)
2. [Démarrage rapide](#démarrage-rapide)
3. [Configuration des credentials Google](#configuration-des-credentials-google)
4. [Structure du projet](#structure-du-projet)
5. [Configuration métier (marques, marchés, budgets)](#configuration-métier)
6. [API backend](#api-backend)
7. [Frontend — vues](#frontend--vues)
8. [Base de données SQLite](#base-de-données-sqlite)
9. [Cache & rafraîchissement](#cache--rafraîchissement)
10. [Dépannage](#dépannage)

---

## Stack technique

**Backend** — Node 18+, ESM, Express 4
- `google-ads-api` (v23) — Google Ads Reporting
- `@google-analytics/data` — GA4 Data API
- `googleapis` — Search Console, Sheets, Merchant Center, OAuth
- `better-sqlite3` — DB locale (audit campagnes)

**Frontend** — Vite + React 18
- `@tanstack/react-query` — fetch + cache
- `recharts` — graphiques
- `tailwindcss` — design tokens dans `frontend/tailwind.config.js`

**Workspaces npm** — `backend/` + `frontend/` orchestrés depuis la racine.

---

## Démarrage rapide

```bash
# 1. Installation des deux workspaces
npm run install:all

# 2. Configurer les credentials (cf. section suivante)
cp backend/.env.example backend/.env
#   → renseigner GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_DEVELOPER_TOKEN, GEMINI_API_KEY

# 3. Lancement (back + front en parallèle)
npm run dev:all
#   backend  → http://localhost:3001
#   frontend → http://localhost:5173

# OU séparément
npm run dev:back
npm run dev:front
```

À la première ouverture du frontend, cliquer sur **« Connecter Google »** dans le header pour lancer le flow OAuth. Le refresh token est stocké dans `backend/tokens.json` (gitignoré — ne jamais commiter).

---

## Configuration des credentials Google

`backend/.env` :

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | OAuth Client ID (Google Cloud Console → APIs & Services → Credentials) |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret |
| `GOOGLE_DEVELOPER_TOKEN` | Token Google Ads API (Ads MCC → API Center) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | ID du MCC parent (format `XXX-XXX-XXXX`). Default : `566-480-6196` |
| `PORT` | Port du backend (default `3001`) |

**Scopes OAuth requis** (configurés dans `backend/auth.js`) :
- `https://www.googleapis.com/auth/adwords` (Google Ads)
- `https://www.googleapis.com/auth/analytics.readonly` (GA4)
- `https://www.googleapis.com/auth/webmasters.readonly` (Search Console)
- `https://www.googleapis.com/auth/content` (Merchant Center)
- `https://www.googleapis.com/auth/spreadsheets.readonly` (Sheets)

Le compte Google qui se connecte doit avoir accès à **toutes** ces ressources (MCC Google Ads, properties GA4, Merchant Center, Sheet de budgets).

---

## Structure du projet

```
dashproject/
├── backend/
│   ├── server.js              # Express app + routes principales (kpis, markets, campaigns, granularity, budget, comarket, trend/ytd)
│   ├── auth.js                # OAuth Google + isAuthenticated()
│   ├── googleAdsClient.js     # Client Google Ads + cache + scoring shopping
│   ├── ga4Client.js           # Client GA4 + cache
│   ├── searchConsoleClient.js # Client Search Console
│   ├── aggregation.js         # Helpers d'agrégation métriques
│   ├── dateUtils.js           # Périodes, comparaisons, formatage
│   ├── routes/                # Routers Express montés dans server.js
│   │   ├── ga4.js             # /api/ga4/*
│   │   ├── shopping.js        # /api/shopping/* (scoring, top-flop, brands-detail, feed-quality, …)
│   │   ├── recommendations.js # /api/recommendations
│   │   └── reports.js         # /api/reports/weekly-summary
│   ├── services/
│   │   ├── merchantCenterClient.js  # Merchant Center (prix, statuts, price competitiveness)
│   │   ├── budgetSheetReader.js     # Lecture budgets Google Sheets
│   │   ├── queryBuilder.js          # Construction GAQL
│   │   └── recommendationEngine.js  # Scoring recommandations campagnes
│   ├── config/                # Configs métier — voir section dédiée
│   ├── database/
│   │   ├── schema.sql         # Schéma SQLite
│   │   └── db.js              # better-sqlite3 wrapper
│   ├── data/                  # SQLite files (gitignoré)
│   ├── tokens.json            # OAuth tokens (gitignoré)
│   └── .env                   # Credentials (gitignoré)
│
├── frontend/
│   ├── index.html
│   ├── tailwind.config.js     # Design tokens (couleurs, radius, shadows)
│   ├── src/
│   │   ├── App.jsx            # Routeur de vues (dashboard / budget / comarket / shopping / analytics)
│   │   ├── index.css          # Tailwind + styles globaux
│   │   ├── components/        # Composants & vues (cf. plus bas)
│   │   ├── hooks/useAdsData.js # React Query hooks pour le backend
│   │   ├── contexts/          # ComarketContext (toggle inclusion comarket)
│   │   └── utils/
│   │       ├── api.js         # fetchApi wrapper
│   │       ├── chartColors.js # Palette charts centralisée
│   │       ├── dateHelpers.js # Presets (last_week, MTD, QTD, YTD…)
│   │       ├── exportTable.js # CSV download + TSV copy
│   │       ├── formatters.js  # fEur, fNum, fPct, fROAS…
│   │       └── flags.jsx      # Drapeaux marchés
│
├── package.json               # Workspaces + scripts dev:all / dev:back / dev:front
└── README.md
```

---

## Configuration métier

Tous les fichiers ci-dessous sont dans `backend/config/` et exportent des constantes JS. Pas de variables d'environnement, pas de DB — édition directe.

| Fichier | Rôle |
|---|---|
| `accounts.js` | Mapping marque → liste de Customer IDs Google Ads + labels marchés. **Source de vérité** pour la liste des marques/marchés. |
| `brandKeywords.js` | Mots-clés brand utilisés pour distinguer Brand vs Generic dans certains rapports. |
| `budgetMarketMap.js` | Mapping marchés → catégorie budget (notamment `AUTRES_PAYS_MARKETS`). |
| `ga4Properties.js` | Mapping `[brand][market]` → GA4 Property ID. |
| `ga4Streams.js` | Stream IDs GA4 par marché (utilisé pour filtrer par data stream). |
| `ga4FunnelEvents.js` | Noms d'événements GA4 du tunnel (view_item, add_to_cart, …). |
| `gscProperties.js` | Mapping marchés → propriétés Search Console. |
| `poasThresholds.js` | Seuil POAS de break-even par marché. **Actuellement seul COCOONCENTER.FR est rempli.** |
| `sheets.js` | IDs des Google Sheets de budgets. |

> Pour ajouter un nouveau marché, modifier au minimum : `accounts.js`, `ga4Properties.js`, `gscProperties.js`, `budgetMarketMap.js` et le `MARKETS_BY_BRAND` dans `frontend/src/components/Header.jsx`.

---

## API backend

Toutes les routes nécessitent OAuth (`isAuthenticated()`) sauf indication contraire.

**Server.js (inline)**
- `GET /api/kpis` — KPIs consolidés (spend, revenue, ROAS, conversions, CVR, …)
- `GET /api/trend` — Tendance quotidienne / hebdo / mensuelle
- `GET /api/trend/ytd` — Tendance YTD avec comparaison N-1
- `GET /api/markets` — Performance par marché
- `GET /api/campaigns` — Liste campagnes (filtrage par type)
- `GET /api/granularity` — Détail jour/semaine/mois
- `GET /api/budget` — Pacing budget mensuel
- `GET /api/budget/daily-spend` — Spend journalier YTD
- `GET /api/budget/recommendations` — Recos budget
- `GET /api/comarket` — Vue partenaires comarket
- `GET /api/mode` — Source des données (live / sheets)
- `GET /health` — Health check (public)
- `POST /api/cache/clear` — Vide les caches Ads/GA4/GSC/MC/Budget
- `POST /api/system/reboot` — Reboot soft du process

**Routers**
- `/api/ga4/*` — `kpis`, `trend`, `channels`, `bounce-rate-ytd`, `trend/ytd`, `funnel-ytd`
- `/api/shopping/*` — `price-summary`, `brands-detail`, `products-by-brand`, `top-flop`, `feed-quality`, `scoring`
- `/api/recommendations` — Recommandations campagnes scorées
- `/api/reports/weekly-summary` — Résumé hebdo (utilisé par `WeeklyPerformanceSummary`)

---

## Frontend — vues

5 onglets dans la barre de navigation (`Header.jsx`) :

| Onglet | Composant racine | Rôle |
|---|---|---|
| **Paid Search** | `App.jsx` (dashboard) | KPIs + tendance + granularité + tableau marchés + scoring shopping + détail campagnes + bilan hebdo |
| **Budget** | `BudgetPacing` + `BudgetDailyChart` | Pacing mensuel et spend journalier YTD |
| **Comarket** | `ComarketView` | Performance partenaires comarket |
| **Shopping** | `ShoppingView` | Price competitiveness, top/flop, feed quality, drilldown marques |
| **Analytics** | `GA4View` | KPIs GA4, canaux, funnel, bounce rate, CVR/AOV |

**Composants partagés clés** :
- `ExportButtons` — bouton CSV + copie TSV pour Sheets (utilisé partout où il y a un tableau)
- `KpiCards`, `MarketTable`, `GA4MarketTable`, `DrilldownTable`, `GranularityTable`
- `AccordionSection` — sections collapsibles
- `Header` — filtres globaux (marque / marché / preset / compareTo)

Persistance des filtres dans `localStorage` (clé `sea_dashboard_filters`).

---

## Base de données SQLite

Fichier : `backend/data/*.db` (gitignoré). Schéma : `backend/database/schema.sql`.

Utilisée principalement par `routes/assets.js` (génération d'assets via Gemini) et l'audit de campagnes pour les recommandations. Création automatique au démarrage si absent.

---

## Cache & rafraîchissement

- Google Ads, GA4, Search Console et Merchant Center ont chacun un cache mémoire dans leur client (TTL ~1h).
- Le bouton « Refresh » du header appelle `POST /api/cache/clear` qui vide tout d'un coup.
- React Query côté frontend a son propre cache (cf. `staleTime` dans `useAdsData.js`).

---

## Dépannage

**`Not authenticated`** — Le refresh token est expiré ou absent. Cliquer « Connecter Google » dans le header.

**`Quota exceeded` (Google Ads / GA4)** — Le cache est court-circuité. Attendre ou augmenter `staleTime`.

**Données vides sur un marché** — Vérifier que le Customer ID est bien dans `accounts.js` et la GA4 property dans `ga4Properties.js`.

**`tokens.json` manquant** — Normal au premier lancement. Sera créé après le premier OAuth.

---

## Conventions

- Code en ESM (`type: module`) côté backend.
- Frontend : design tokens via Tailwind (`tailwind.config.js`). Les couleurs Recharts qui ne peuvent pas utiliser Tailwind passent par `frontend/src/utils/chartColors.js`.
- Naming des routes Express : pluriel pour les listes, singulier pour les concepts/agrégats. Cohérent après nettoyage.
- ESLint + Prettier configurés côté frontend :
  ```bash
  cd frontend
  npm run lint           # vérifie
  npm run lint:fix       # corrige ce qui est auto-corrigeable
  npm run format         # reformate tous les .js/.jsx/.css/.json
  npm run format:check   # vérifie sans écrire
  ```

---

## Licence

Usage interne Dhygietal. Voir `LICENSE`.
