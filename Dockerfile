FROM node:20-bookworm-slim AS build

# better-sqlite3 requires native build tools
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY config.yaml .env.example README.md SETUP_GUIDE.md ./

RUN npm run build

# --- Production stage ---
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/config.yaml ./

# Persistent volume mount point for SQLite
RUN mkdir -p /data

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV PORT=3000
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["node", "dist/cli.js", "start", "--config", "config.yaml"]
