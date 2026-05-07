FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json

RUN npm ci

COPY frontend ./frontend
COPY shared ./shared

RUN npm run build --workspace shared && npm run build --workspace frontend

FROM nginx:1.27-alpine AS runner

COPY frontend/nginx.conf /etc/nginx/default.conf.tpl
COPY frontend/docker-entrypoint.d/99-render-nginx-conf.sh /docker-entrypoint.d/99-render-nginx-conf.sh
RUN chmod +x /docker-entrypoint.d/99-render-nginx-conf.sh

ENV BACKEND_PORT=3300

COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
