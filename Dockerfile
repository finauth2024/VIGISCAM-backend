# syntax=docker/dockerfile:1

# ---------- Build stage ----------
FROM node:22-slim AS build
WORKDIR /app

# Prisma engines need OpenSSL.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies (postinstall runs `prisma generate`, so the schema is needed first).
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# Build the application.
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies; the generated Prisma client is kept (it is a runtime dependency).
RUN npm prune --omit=dev

# ---------- Runtime stage ----------
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Run as the non-root user provided by the base image.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
