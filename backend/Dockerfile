FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY shared/package.json ./shared/package.json

RUN npm ci

COPY backend ./backend
COPY shared ./shared

RUN npm run build --workspace shared && npm run build --workspace backend

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY shared/package.json ./shared/package.json

RUN npm ci --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/drizzle ./backend/drizzle
COPY --from=builder /app/backend/drizzle.config.ts ./backend/drizzle.config.ts
COPY --from=builder /app/shared/dist ./shared/dist
COPY backend/scripts/docker-healthcheck.mjs ./backend/scripts/docker-healthcheck.mjs

EXPOSE 3300

CMD ["node", "backend/dist/index.js"]
