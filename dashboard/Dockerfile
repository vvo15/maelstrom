# Build context is the repo root (see docker-compose.yml) so shared/ is in the image.
FROM node:20-alpine
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
# npm ci once a lockfile is committed; npm install until then.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY shared/ /app/shared/
COPY dashboard/ ./
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0"]
