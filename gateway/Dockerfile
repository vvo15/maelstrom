# Build context is the repo root (see docker-compose.yml) so shared/ is in the image.
FROM node:20-alpine
WORKDIR /app/gateway
COPY gateway/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY shared/ /app/shared/
COPY gateway/ ./
EXPOSE 8080 8090
CMD ["npx", "tsx", "src/index.ts"]
