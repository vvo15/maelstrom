# Build context is the repo root (see docker-compose.yml) so shared/ is in the image.
FROM node:20-alpine
WORKDIR /app/attacker
COPY attacker/package*.json ./
# npm ci once a lockfile is committed; npm install until then.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY shared/ /app/shared/
COPY attacker/ ./
CMD ["npx", "tsx", "src/index.ts"]
