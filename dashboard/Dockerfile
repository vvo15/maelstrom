# Dev-server image for `docker compose up`. docker-compose.yml builds this with the
# repo root as context (context: ., dockerfile: dashboard/Dockerfile), so paths below
# are relative to the repo root, and the root .dockerignore keeps host node_modules
# and dist out of the image.
#
# Runs Vite directly and never tsc or `npm run build`: the dashboard's only shared/
# import is `import type { SirenEvent } from "../../shared/events"`, which Vite strips,
# so shared/ doesn't need to be in the image.
FROM node:24-alpine
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]
