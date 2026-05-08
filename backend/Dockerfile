# Multi-stage build for the MagicDash backend (Node 22 + Express).
# Stage 1: install full deps + native bindings (better-sqlite3, bcrypt, …).
# Stage 2: copy the runtime files into a slim image — no build toolchain.

FROM node:22-bookworm-slim AS deps
WORKDIR /app

# better-sqlite3 and friends compile native bindings — apt them in.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 build-essential \
 && rm -rf /var/lib/apt/lists/*

# npm workspaces requires both workspace package.json files to be present
# even when installing only one workspace.
COPY package.json package-lock.json* ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm install --workspace=backend --omit=dev

# ── Runtime stage ────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# Hoisted deps live at /app/node_modules — Node's module resolution walks
# up from /app/backend so the backend imports them transparently.
COPY --from=deps /app/node_modules ./node_modules

# App source.
COPY package.json ./
COPY backend ./backend

WORKDIR /app/backend

# Persistent dirs — bind-mounted from the host by docker-compose.
RUN mkdir -p data logs

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server.js"]
