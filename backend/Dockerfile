# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

# Prisma a besoin d'OpenSSL pour générer/charger le moteur.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# On copie node_modules depuis le builder (même base) :
#  - le client Prisma déjà généré
#  - le binaire natif bcrypt compilé pour cette plateforme
#  - la CLI Prisma (pour `migrate deploy` au démarrage)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

EXPOSE 3000

# v2 2026-06-30 - cache bust
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
