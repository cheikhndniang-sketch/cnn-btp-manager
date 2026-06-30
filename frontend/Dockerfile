# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# VITE_API_URL est injecté au moment du build (variable Railway / --build-arg).
# Exemple : https://cnn-btp-api.up.railway.app/v1
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# `serve -s` gère le fallback SPA (toutes les routes -> index.html) et écoute sur $PORT.
RUN npm i -g serve@14
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
