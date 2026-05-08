# Multi-stage build for the MagicDash frontend (Vite + React).
# Stage 1: install deps + run `vite build` → static assets in /dist.
# Stage 2: serve them with nginx + proxy /api and /auth to the backend.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY frontend/package.json ./frontend/package.json

RUN npm install --workspace=frontend

COPY frontend ./frontend

# Empty VITE_API_URL → frontend uses same-origin (nginx proxies /api).
ENV VITE_API_URL=""
RUN npm run build --workspace=frontend

# ── Runtime stage ────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Static assets.
COPY --from=build /app/frontend/dist /usr/share/nginx/html

# nginx config that:
#   • serves the SPA with HTML5 history API support
#   • proxies /api and /auth to the backend container
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
