# SEA Dashboard

Dashboard de pilotage **Paid Search multi-marques / multi-marchés**. Centralise Google Ads, GA4, Search Console, Merchant Center et budgets Google Sheets dans une seule interface React.

---

## Sommaire

1. [Aperçu](#aperçu)
2. [Stack technique](#stack-technique)
3. [Prérequis](#prérequis)
4. [Installation pas-à-pas](#installation-pas-à-pas)
5. [Obtenir les credentials Google](#obtenir-les-credentials-google)
6. [Configuration métier](#configuration-métier)
7. [Lancement (dev / production locale)](#lancement)
8. [Structure du projet](#structure-du-projet)
9. [API backend](#api-backend)
10. [Frontend — vues](#frontend--vues)
11. [Base de données SQLite](#base-de-données-sqlite)
12. [Cache & rafraîchissement](#cache--rafraîchissement)
13. [Dépannage](#dépannage)
14. [Conventions de code](#conventions-de-code)

---

## Aperçu

Le dashboard fournit, pour les marques et marchés que tu configures :

- **Paid Search** — KPIs consolidés (spend, revenue, ROAS, conversions, CVR…), tendance YTD, détail par campagne, performance par marché, bilan hebdo automatique.
- **Budget** — pacing mensuel vs réel, projection fin de mois, spend journalier YTD.
- **Shopping** — price competitiveness, top/flop produits & marques, qualité du flux Merchant Center, scoring PMax.
- **Analytics (GA4)** — sessions, transactions, revenue, funnel d'achat, bounce rate, CVR/AOV.
- **Comarket** — vue partenaires (campagnes co-financées).

Toutes les données sont récupérées en live depuis les APIs Google et mises en cache (TTL 1h par défaut).

---

## Stack technique

**Backend** — Node 18+, ESM, Express 4
- `google-ads-api` — Google Ads Reporting API
- `@google-analytics/data` — GA4 Data API
- `googleapis` — Search Console, Sheets, Merchant Center, OAuth
- `better-sqlite3` — DB locale (audit campagnes)
- `nodemon` (dev) — auto-reload sur changement de fichier

**Frontend** — Vite + React 18
- `@tanstack/react-query` — fetch + cache
- `recharts` — graphiques
- `tailwindcss` — design tokens

**Workspaces npm** — `backend/` + `frontend/` orchestrés depuis la racine.

---

## Prérequis

- **Node.js ≥ 20** (recommandé 22 LTS) — [nodejs.org](https://nodejs.org)
- **npm ≥ 9** (livré avec Node)
- **Git** — [git-scm.com](https://git-scm.com)
- Un **compte Google** ayant accès :
  - À un compte Google Ads (idéalement un MCC/Manager pour gérer plusieurs sous-comptes)
  - Aux properties GA4 correspondantes
  - À Search Console (optionnel)
  - À Merchant Center (optionnel, pour le module Shopping)
  - À un Google Sheet de budgets (optionnel, pour le module Budget)

---

## Installation pas-à-pas

### 1. Cloner le projet

```bash
git clone <url-du-repo>.git
cd dashproject
```

### 2. Installer les dépendances

```bash
npm run install:all
```

Cette commande installe à la fois `backend/` et `frontend/` (npm workspaces).

### 3. Créer le fichier `.env`

```bash
cp backend/.env.example backend/.env
```

Édite `backend/.env` avec tes credentials Google (cf. section suivante).

### 4. Configurer tes marques / marchés

Édite les fichiers dans `backend/config/` (cf. [Configuration métier](#configuration-métier)).

### 5. Lancer

```bash
npm run dev:all
```

Ouvre [http://localhost:5173](http://localhost:5173) et clique **« Connecter Google Ads »** dans le header pour le premier login OAuth.

---

## Obtenir les credentials Google

Cinq éléments à récupérer :

### 1. OAuth Client ID + Client Secret

1. Va sur [Google Cloud Console](https://console.cloud.google.com)
2. **Créer un projet** (ou sélectionne-en un existant)
3. **APIs & Services → Library** → active ces APIs :
   - Google Ads API
   - Google Analytics Data API
   - Google Search Console API
   - Content API for Shopping (Merchant Center)
   - Google Sheets API
4. **APIs & Services → OAuth consent screen**
   - User type : **External** (ou Internal si Google Workspace)
   - Renseigne nom de l'app, email de support
   - **Scopes** : ajouter manuellement (ou laisser vide, ils sont demandés au runtime)
   - **Test users** : ajouter ton email Google (sinon le flow OAuth refusera la connexion)
5. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type : **Web application**
   - Authorized redirect URIs : `http://localhost:3001/auth/callback`
6. Télécharge / copie :
   - `GOOGLE_CLIENT_ID` (format `xxx.apps.googleusercontent.com`)
   - `GOOGLE_CLIENT_SECRET`

### 2. Google Ads Developer Token

1. Va sur ton **Google Ads Manager** (MCC) — [ads.google.com](https://ads.google.com)
2. **Tools & Settings → API Center** (visible uniquement sur un compte Manager)
3. Demande un developer token. **Status possibles** :
   - `Test only` : fonctionne uniquement sur des comptes test (suffisant pour démarrer)
   - `Basic / Standard` : nécessite une review Google (~24-48h, gratuite)
4. Copie la valeur dans `GOOGLE_DEVELOPER_TOKEN`

> 💡 Pour un usage personnel/perso, le mode Basic est généralement accordé sans souci si tu remplis correctement le formulaire (description honnête de l'usage).

### 3. Login Customer ID (MCC)

C'est l'ID de ton compte **Google Ads Manager** (le compte parent qui contient les sous-comptes).
- Format : `XXX-XXX-XXXX` (visible en haut à droite quand tu es connecté à ton MCC).
- Variable : `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
- Si tu n'utilises **pas** de MCC (un seul compte Ads direct), mets l'ID de ce compte.

### 4. (Optionnel) Google Sheet ID pour les budgets

Si tu veux utiliser le module Budget :
1. Crée un Sheet avec une feuille `Budgets` listant `marque, marché, mois, budget`
2. Récupère son ID depuis l'URL : `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`
3. Renseigne dans `backend/config/sheets.js`

### 5. Récap `.env`

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_DEVELOPER_TOKEN=xxxxx
GOOGLE_ADS_LOGIN_CUSTOMER_ID=123-456-7890
PORT=3001
```

**Scopes OAuth demandés au runtime** (configurés dans `backend/auth.js`) :
- `https://www.googleapis.com/auth/adwords`
- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/webmasters.readonly`
- `https://www.googleapis.com/auth/content`
- `https://www.googleapis.com/auth/spreadsheets.readonly`

Le compte Google qui fait le login doit avoir accès à toutes ces ressources.

---

## Configuration métier

Tous les fichiers sont dans `backend/config/`. Édition directe en JS (pas de DB, pas d'env vars).

| Fichier | Rôle | Obligatoire ? |
|---|---|---|
| `accounts.js` | Mapping `marque → { customer_id, label, markets }`. **Source de vérité** pour la liste des marques et marchés affichés dans le dashboard. | ✅ Oui |
| `ga4Properties.js` | Mapping `[marque][marché] → GA4 Property ID`. | ✅ Pour la vue Analytics |
| `ga4Streams.js` | Stream IDs GA4 par marché (filtrage par data stream). | Optionnel |
| `ga4FunnelEvents.js` | Noms d'événements GA4 du tunnel d'achat (view_item, add_to_cart, purchase…). | ✅ Pour le funnel |
| `gscProperties.js` | Mapping marchés → propriétés Search Console (URLs vérifiées). | Optionnel |
| `brandKeywords.js` | Mots-clés de marque pour distinguer Brand vs Generic dans les rapports. | Optionnel |
| `budgetMarketMap.js` | Mapping marchés → catégorie budget (regroupement de petits marchés). | Optionnel |
| `poasThresholds.js` | Seuil POAS de break-even par marché (utilisé seulement par le scoring Shopping). | Optionnel |
| `sheets.js` | IDs des Google Sheets de budgets. | Optionnel |

### Exemple minimal (`accounts.js`)

```js
export const BRANDS = {
  MA_MARQUE: {
    label: 'Ma Marque',
    customers: {
      FR: '123-456-7890',
      BE: '234-567-8901',
    },
  },
  AUTRE_MARQUE: {
    label: 'Autre Marque',
    customers: {
      FR: '345-678-9012',
    },
  },
};
```

### Exemple minimal (`ga4Properties.js`)

```js
export const GA4_PROPERTIES = {
  MA_MARQUE: {
    FR: '123456789',
    BE: '234567890',
  },
  AUTRE_MARQUE: {
    FR: '345678901',
  },
};
```

### Ajouter un nouveau marché

À modifier au minimum :
- `backend/config/accounts.js`
- `backend/config/ga4Properties.js`
- `backend/config/gscProperties.js` (si Search Console utilisé)
- `backend/config/budgetMarketMap.js` (si module Budget utilisé)
- `frontend/src/components/Header.jsx` → constante `MARKETS_BY_BRAND`

---

## Lancement

### Mode développement (terminal ouvert, hot-reload)

```bash
npm run dev:all       # back + front en parallèle
# ou séparément :
npm run dev:back      # backend sur :3001 via nodemon
npm run dev:front     # frontend sur :5173 via Vite
```

### Mode "détaché" sur Windows (sans terminal visible)

Le fichier `backend/run.js` est un wrapper qui supervise `server.js` et le redémarre automatiquement quand le dashboard demande un reboot (bouton ⚡ dans l'UI).

Crée un fichier `start_dashboard.vbs` (ou .bat) avec :

```vbs
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\chemin\vers\dashproject\backend && node run.js", 0, False
WshShell.Run "cmd /c cd /d C:\chemin\vers\dashproject\frontend && npm run dev -- --host", 0, False
```

Double-clique le `.vbs` : le backend tourne en arrière-plan, le bouton reboot fonctionne sans terminal ouvert.

### Mode production basique

Pour un serveur qui ne fait **pas** de hot-reload :

```bash
cd backend && node run.js   # avec restart auto sur reboot
# OU
cd backend && node server.js  # sans restart auto
cd frontend && npm run build && npm run preview
```

Pour un déploiement plus sérieux, utilise un process manager (PM2, systemd) qui relancera `node run.js` en cas de crash global.

---

## Structure du projet

```
dashproject/
├── backend/
│   ├── server.js                # Express app + routes inline (kpis, markets, campaigns, granularity, budget, comarket, trend/ytd)
│   ├── run.js                   # Wrapper qui supervise server.js (restart auto sur exit code 42)
│   ├── auth.js                  # OAuth Google + isAuthenticated()
│   ├── googleAdsClient.js       # Client Google Ads + cache + scoring shopping
│   ├── ga4Client.js             # Client GA4 + cache
│   ├── searchConsoleClient.js   # Client Search Console
│   ├── aggregation.js           # Helpers d'agrégation métriques
│   ├── dateUtils.js             # Périodes, comparaisons, formatage
│   ├── routes/
│   │   ├── ga4.js               # /api/ga4/*
│   │   ├── shopping.js          # /api/shopping/*
│   │   ├── recommendations.js   # /api/recommendations
│   │   └── reports.js           # /api/reports/weekly-summary
│   ├── services/
│   │   ├── merchantCenterClient.js
│   │   ├── budgetSheetReader.js
│   │   ├── queryBuilder.js
│   │   └── recommendationEngine.js
│   ├── config/                  # Configs métier (cf. section dédiée)
│   ├── database/
│   │   ├── schema.sql
│   │   └── db.js
│   ├── data/                    # SQLite files (gitignoré)
│   ├── tokens.json              # OAuth tokens (gitignoré)
│   └── .env                     # Credentials (gitignoré)
│
├── frontend/
│   ├── index.html
│   ├── tailwind.config.js       # Design tokens
│   ├── eslint.config.js
│   ├── .prettierrc.json
│   ├── src/
│   │   ├── App.jsx              # Routeur de vues
│   │   ├── index.css
│   │   ├── components/
│   │   ├── hooks/useAdsData.js  # React Query hooks
│   │   ├── contexts/
│   │   └── utils/
│   │       ├── api.js
│   │       ├── chartColors.js
│   │       ├── dateHelpers.js
│   │       ├── exportTable.js
│   │       ├── formatters.js
│   │       └── flags.jsx
│
├── package.json                 # Workspaces + scripts dev:all / dev:back / dev:front
└── README.md
```

---

## API backend

Toutes les routes nécessitent OAuth (`isAuthenticated()`) sauf indication contraire.

**Routes principales (server.js)**
- `GET /api/kpis` — KPIs consolidés
- `GET /api/trend` — Tendance journalière / hebdo / mensuelle
- `GET /api/trend/ytd` — Tendance YTD avec comparaison N-1
- `GET /api/markets` — Performance par marché
- `GET /api/campaigns` — Liste campagnes (filtrable par type)
- `GET /api/granularity` — Détail jour/semaine/mois
- `GET /api/budget` — Pacing budget mensuel
- `GET /api/budget/daily-spend` — Spend journalier YTD
- `GET /api/budget/recommendations` — Recos budget
- `GET /api/comarket` — Vue partenaires comarket
- `GET /api/mode` — Source des données (live / sheets)
- `GET /health` — Health check (public, pas d'auth)
- `POST /api/cache/clear` — Vide les caches Ads/GA4/GSC/MC/Budget
- `POST /api/system/reboot` — Reboot soft du process (cf. mode lancement)

**Routers**
- `/api/ga4/*` — `kpis`, `trend`, `channels`, `markets-summary`, `bounce-rate-ytd`, `trend/ytd`, `funnel-ytd`
- `/api/shopping/*` — `price-summary`, `brands-detail`, `products-by-brand`, `top-flop`, `feed-quality`, `scoring`
- `/api/recommendations` — Recommandations campagnes scorées
- `/api/reports/weekly-summary` — Résumé hebdo

---

## Frontend — vues

5 onglets dans la barre de navigation :

| Onglet | Composant racine | Contenu |
|---|---|---|
| **Paid Search** | `App.jsx` (dashboard) | KPIs + tendance + granularité + tableau marchés + scoring shopping + détail campagnes + bilan hebdo |
| **Budget** | `BudgetPacing` + `BudgetDailyChart` | Pacing mensuel et spend journalier YTD |
| **Comarket** | `ComarketView` | Performance partenaires comarket |
| **Shopping** | `ShoppingView` | Price competitiveness, top/flop, feed quality, drilldown marques |
| **Analytics** | `GA4View` | KPIs GA4, canaux, funnel, bounce rate, CVR/AOV |

**Composants partagés** :
- `DataTable` — composant tableau réutilisable (utilisé par MarketTable, GA4MarketTable, GranularityTable)
- `DrilldownTable` — tableau avec rows expandables (Shopping)
- `ExportButtons` — CSV download + TSV copy pour Sheets
- `KpiCards`, `AccordionSection`, `Header`

Les filtres globaux (marque/marché/preset/compareTo) sont persistés dans `localStorage` (clé `sea_dashboard_filters`).

---

## Base de données SQLite

Fichier : `backend/data/*.db` (gitignoré). Schéma : `backend/database/schema.sql`.

Utilisé pour l'audit de campagnes (recommendations engine). Création automatique au premier démarrage.

---

## Cache & rafraîchissement

- Google Ads, GA4, Search Console et Merchant Center ont chacun un cache mémoire dans leur client (TTL ~1h).
- Le bouton 🔄 du header appelle `POST /api/cache/clear` qui vide tous les caches backend, puis invalide les caches React Query côté front.
- Le bouton ⚡ déclenche `POST /api/system/reboot` qui redémarre proprement le process backend.

---

## Dépannage

| Symptôme | Cause probable / Solution |
|---|---|
| `Not authenticated` au chargement | Refresh token expiré ou absent. Cliquer **« Connecter Google »** dans le header. |
| `tokens.json` manquant | Normal au premier lancement. Sera créé après le premier OAuth. |
| `redirect_uri_mismatch` au login Google | L'URI dans Google Cloud Console ne correspond pas. Doit être exactement `http://localhost:3001/auth/callback`. |
| `Quota exceeded` (Google Ads / GA4) | Trop d'appels API. Attendre, ou augmenter `staleTime` dans `useAdsData.js`. |
| Données vides sur un marché | Vérifier que le Customer ID est dans `accounts.js` et la GA4 property dans `ga4Properties.js`. |
| `EADDRINUSE :3001` au démarrage | Un autre process écoute déjà le port 3001. Tuer ce process ou changer `PORT` dans `.env`. |
| Bouton Reboot ne relance pas le backend | Le backend tourne via `node server.js` direct (pas de superviseur). Utiliser `node run.js` ou `nodemon server.js`. |
| Frontend affiche des données obsolètes | Cliquer le bouton 🔄 du header. Si ça persiste, hard-refresh navigateur (Ctrl+Shift+R). |
| Page blanche au chargement | Vérifier la console navigateur (F12). Souvent dû à un crash backend — vérifier les logs. |

---

## Conventions de code

- **Backend** : ESM (`type: module`). Imports avec extension `.js`.
- **Frontend** : design tokens via Tailwind (`tailwind.config.js`). Les couleurs Recharts (qui ne peuvent pas utiliser des classes Tailwind) passent par `frontend/src/utils/chartColors.js`.
- **Naming routes Express** : pluriel pour les listes (`/api/markets`, `/api/campaigns`), singulier pour les concepts/agrégats (`/api/budget`, `/api/trend`).
- **ESLint + Prettier** côté frontend :

```bash
cd frontend
npm run lint           # vérifie
npm run lint:fix       # auto-corrige ce qui peut l'être
npm run format         # reformate tous les .js/.jsx/.css/.json
npm run format:check   # vérifie sans écrire
```

---

## Licence

Voir le fichier `LICENSE` à la racine.
