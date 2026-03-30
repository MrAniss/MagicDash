# Dhygietal SEA Dashboard

Dashboard interne de pilotage SEA multi-marques, multi-marchés, conçu pour l'agence **Dhygietal**. Centralise les données Google Ads, GA4, Merchant Center et budgets Google Sheets en une interface unifiée.

---

## Sommaire

- [Présentation](#présentation)
- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Stack technique](#stack-technique)
- [Installation](#installation)
- [Configuration](#configuration)
- [Structure du projet](#structure-du-projet)
- [Vues & onglets](#vues--onglets)
- [API Backend](#api-backend)
- [Marques & marchés supportés](#marques--marchés-supportés)

---

## Présentation

Le SEA Dashboard permet aux équipes de Dhygietal de piloter en temps réel les performances publicitaires de trois marques e-commerce santé/beauté :

- **Cocooncenter** — 20 marchés internationaux
- **Pascal Coste Shopping** — France
- **Parapharmacie Lafayette** — France

Toutes les données sont récupérées directement depuis les APIs Google (Google Ads, GA4, Merchant Center) et croisées avec les budgets définis dans Google Sheets. Aucun export manuel, aucune mise à jour fichier — tout est temps réel avec cache intelligent.

---

## Fonctionnalités

### Dashboard principal
- **KPIs consolidés** : Spend, Revenue, ROAS, Conversions, CVR, Clics, Impressions avec comparaison période précédente ou N-1
- **Graphique de tendance** : évolution quotidienne / hebdomadaire sur n'importe quelle période
- **Tableau de granularité** : détail jour par jour ou semaine par semaine
- **Tableau par marché** : performance de chaque pays en un coup d'œil
- **Filtre par marque, marché et période** : présélections (Last Week, 7j, 30j, MTD, QTD, YTD) + dates personnalisées

### Analytics GA4
- Sessions, utilisateurs, transactions, revenue, CVR, panier moyen
- Breakdown par canal d'acquisition (Paid Search, Organic, Direct, etc.)
- Évolution temporelle avec comparaison de périodes

### Budget & Pacing
- Suivi du budget mensuel (depuis Google Sheets) vs dépenses réelles
- Gauge de pacing (% vs théorique) + % de consommation simple
- **Graphique spend journalier YTD** : courbe dépenses réelles vs cible journalière par marché, avec zones colorées over-pace (vert) / under-pace (rouge)
- Projections fin de mois : base / optimiste (+15%) / pessimiste (-15%)
- Daily spend cible restant pour atterrir sur le budget
- Tableau de pacing par marché

### Campagnes
- Liste de toutes les campagnes avec métriques 7j/30j/90j
- Filtrage par type (Search, Shopping, PMax, Display, Video, Demand Gen)
- Résumé par type de campagne

### Shopping
- Segmentation produits : TOP, TRAFIC SANS CONV, ZOMBIE, SOUS-PERFORMANCE, STANDARD
- Agrégation par marque produit
- Compétitivité prix vs benchmark marché (Merchant Center)
- Scorecards prix : Compétitif / À parité / Plus cher / Sans données
- Top 10 produits les plus chers vs concurrence

### Recommandations
- Suggestions automatiques d'optimisation : ajustement tROAS, augmentation budget, mise en pause
- Classification par priorité : HAUTE / MOYENNE / FAIBLE
- Estimation de l'impact financier de chaque recommandation
- Badge dans la navigation indiquant le nombre d'alertes haute priorité

### Concurrence *(masqué, en développement)*
- Impression share, click share, budget lost, rank lost
- Auction Insights : positionnement vs domaines concurrents
- Évolution dans le temps

### Assistant Data *(masqué, nécessite clé Gemini)*
- Interface conversationnelle en langage naturel (français)
- Questions libres sur Google Ads ou GA4 : "Quel est le ROAS de la France ce mois-ci ?"
- Gemini interprète la question → génère la requête GAQL ou GA4 → exécute → formate la réponse
- Réponse en texte naturel + tableau + graphique auto-généré
- Historique persisté en localStorage, mode debug avec requête générée visible

---

## Architecture

```
Utilisateur
    │
    ▼
Frontend React (Vite — port 5173)
    │  Filtre : marque, marché, période
    │
    ▼
Backend Express (Node.js — port 3001)
    ├── Google Ads API        → métriques campagnes (spend, ROAS, conversions...)
    ├── GA4 Data API          → métriques site (sessions, revenue, CVR...)
    ├── Google Merchant Center → prix produits + compétitivité prix
    ├── Google Sheets API     → budgets mensuels par marché
    └── Gemini AI API         → interprétation langage naturel (Assistant)
    │
    ▼
Agrégation + cache in-memory (15min à 3h selon la source)
    │
    ▼
JSON → React Query → Recharts / tableaux HTML
```

---

## Stack technique

### Backend
| Outil | Usage |
|-------|-------|
| Node.js + Express | Serveur API REST |
| `google-ads-api` | Requêtes GAQL Google Ads |
| `@google-analytics/data` | GA4 Data API |
| `googleapis` | Sheets, Merchant Center, OAuth2 |
| `@google/generative-ai` | Gemini AI (Assistant) |

### Frontend
| Outil | Usage |
|-------|-------|
| React 18 + Vite | UI et build |
| TanStack Query (React Query) | Fetching + cache client |
| Recharts | Graphiques (Line, Bar, ComposedChart) |
| Tailwind CSS | Styles |
| flagcdn.com | Drapeaux pays |

---

## Installation

### Prérequis
- Node.js 18+
- Accès aux APIs Google (voir Configuration)

### 1. Cloner le repo

```bash
git clone https://github.com/dhygietal/dashproject.git
cd dashproject
```

### 2. Installer les dépendances

```bash
# Depuis la racine (installe backend + frontend via workspaces)
npm install
```

### 3. Configurer les variables d'environnement

```bash
cp backend/.env.example backend/.env
# Remplir les valeurs dans backend/.env
```

### 4. Lancer en développement

```bash
# Backend (port 3001)
cd backend && node server.js

# Frontend (port 5173)
cd frontend && npm run dev
```

Accès : `http://localhost:5173`

---

## Configuration

### Variables d'environnement (`backend/.env`)

```env
GOOGLE_CLIENT_ID=           # OAuth2 client ID (Google Cloud Console)
GOOGLE_CLIENT_SECRET=       # OAuth2 client secret
GOOGLE_DEVELOPER_TOKEN=     # Token développeur Google Ads
GOOGLE_ADS_LOGIN_CUSTOMER_ID=566-480-6196   # ID MCC Cocooncenter
GEMINI_API_KEY=             # Clé API Google AI Studio (pour l'Assistant)
PORT=3001
```

### Authentification Google

L'authentification OAuth2 se fait via le flux `/auth/login`. Un fichier `tokens.json` est créé automatiquement après la première connexion et stocke le refresh token.

### Budgets Google Sheets

Les budgets mensuels sont lus depuis un Google Spreadsheet dont l'ID est défini dans `backend/config/sheets.js`. Le format attendu : une ligne par marché, une colonne par mois.

---

## Structure du projet

```
dashproject/
├── backend/
│   ├── server.js                   # Point d'entrée + endpoints principaux
│   ├── auth.js                     # OAuth2 Google
│   ├── googleAdsClient.js          # Client Google Ads (cache 15min)
│   ├── ga4Client.js                # Client GA4 (cache 15min)
│   ├── aggregation.js              # Helpers d'agrégation métriques
│   ├── config/
│   │   ├── accounts.js             # Comptes Google Ads par marque/marché
│   │   ├── ga4Properties.js        # Property IDs GA4
│   │   ├── ga4Streams.js           # Stream IDs GA4 (auto-peuplé)
│   │   ├── budgetMarketMap.js      # Mapping marchés → budget Sheet
│   │   └── sheets.js               # IDs Google Sheets
│   ├── routes/
│   │   ├── ga4.js                  # /api/ga4/*
│   │   ├── shopping.js             # /api/shopping/*
│   │   ├── recommendations.js      # /api/recommendations/*
│   │   ├── competition.js          # /api/competition/*
│   │   └── assistant.js            # /api/assistant/query
│   └── services/
│       ├── budgetSheetReader.js    # Lecture budgets Sheets (cache 1h)
│       ├── merchantCenterClient.js # Prix + compétitivité MC (cache 1-3h)
│       ├── recommendationEngine.js # Moteur de recommandations
│       ├── geminiClient.js         # Intégration Gemini AI
│       └── queryBuilder.js         # Exécution requêtes dynamiques (Assistant)
│
└── frontend/
    └── src/
        ├── App.jsx                 # Shell + navigation par onglets
        ├── components/
        │   ├── Header.jsx          # Nav, filtres marque/marché/période
        │   ├── KpiCards.jsx        # Cartes KPI avec deltas
        │   ├── TrendChart.jsx      # Graphique tendance
        │   ├── GranularityTable.jsx
        │   ├── MarketTable.jsx
        │   ├── BudgetPacing.jsx    # Page Budget complète
        │   ├── BudgetDailyChart.jsx
        │   ├── CampaignDrilldown.jsx
        │   ├── ShoppingView.jsx
        │   ├── GA4View.jsx
        │   ├── RecommendationsView.jsx
        │   ├── CompetitionView.jsx
        │   ├── ComarketView.jsx
        │   └── AssistantView.jsx
        ├── hooks/
        │   ├── useAdsData.js
        │   └── useBudget.js
        └── utils/
            ├── dateHelpers.js
            ├── formatters.js
            └── flags.jsx
```

---

## Vues & onglets

| Onglet | Composant | Description |
|--------|-----------|-------------|
| Dashboard | KpiCards, TrendChart, MarketTable… | Vue principale avec tous les KPIs |
| Analytics | GA4View | Données Google Analytics 4 |
| Budget | BudgetPacing, BudgetDailyChart | Suivi budget mensuel et pacing journalier |
| Campagnes | CampaignDrilldown | Détail par campagne |
| Comarket | ComarketView | Campagnes co-financées partenaires |
| Recommandations | RecommendationsView | Suggestions d'optimisation automatiques |
| Shopping | ShoppingView | Performance produits + compétitivité prix |
| Concurrence *(masqué)* | CompetitionView | Auction insights et impression share |
| Assistant *(masqué)* | AssistantView | Requêtes en langage naturel via Gemini |

---

## API Backend

### Principaux endpoints

| Méthode | Endpoint | Paramètres |
|---------|----------|------------|
| GET | `/api/kpis` | `brand, market, from, to, compareTo` |
| GET | `/api/trend` | `brand, market, from, to, granularity, compareTo` |
| GET | `/api/markets` | `brand, from, to, compareTo` |
| GET | `/api/campaigns` | `brand, market, from, to, type` |
| GET | `/api/granularity` | `brand, market, from, to, granularity` |
| GET | `/api/budget` | `brand, market, month, compareTo` |
| GET | `/api/budget/daily-spend` | `brand, market, year` |
| GET | `/api/ga4/kpis` | `brand, market, from, to, compareTo` |
| GET | `/api/ga4/trend` | `brand, market, from, to, granularity` |
| GET | `/api/ga4/channels` | `brand, market, from, to` |
| GET | `/api/shopping/products` | `brand, market, from, to` |
| GET | `/api/recommendations/audit` | `brand, month` |
| POST | `/api/assistant/query` | `{ question, context }` |
| POST | `/api/cache/clear` | — |

---

## Marques & marchés supportés

### Cocooncenter
| Marché | Compte Google Ads | GA4 Property |
|--------|-------------------|-------------|
| France (FR) | 432-928-8276 | 298280318 |
| Belgique (BE) | 622-722-1825 | — |
| Pays-Bas (NL) | 426-916-4266 | — |
| Allemagne (DE) | 791-513-9319 | — |
| Italie (IT) | 143-906-5278 | — |
| Espagne (ES) | 835-420-9149 | — |
| Royaume-Uni (UK) | 684-585-8456 | — |
| Autriche (AT) | 892-036-9741 | — |
| Portugal (PT) | 185-734-9056 | — |
| Luxembourg (LU) | 339-119-3668 | — |
| Suède (SE) | 995-360-5444 | — |
| Norvège (NO) | 682-321-1943 | — |
| Finlande (FI) | 418-859-4423 | — |
| Pologne (PL) | 629-192-9054 | — |
| Irlande (IE) | 903-581-1386 | — |
| Roumanie (RO) | 677-043-2168 | — |
| Arabie Saoudite (SA) | 880-717-7535 | — |
| Canada (CA) | 998-980-4415 | — |
| Australie (AU) | 973-987-0903 | — |
| États-Unis (US) | 674-997-1705 | — |

### Pascal Coste Shopping
| Marché | Compte Google Ads | GA4 Property |
|--------|-------------------|-------------|
| France (FR) | 412-763-0025 | 346986639 |

### Parapharmacie Lafayette
| Marché | Compte Google Ads | GA4 Property |
|--------|-------------------|-------------|
| France (FR) | 422-013-5964 | 280350749 |

---

## Développé par

**Dhygietal** — Agence e-commerce spécialisée santé & beauté
[hygie31.com](https://hygie31.com)
