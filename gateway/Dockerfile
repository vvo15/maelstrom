FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8080 8090
CMD ["npx", "tsx", "src/index.ts"]
