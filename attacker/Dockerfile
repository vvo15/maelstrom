# Maelstrom demo attacker. Runs under compose profile "attack" and can reach
# only the gateway service on the internal network.
FROM node:20-slim

WORKDIR /app

COPY attacker/package.json attacker/package-lock.json ./
RUN npm ci

COPY attacker/tsconfig.json ./
COPY attacker/src ./src

# Default to the repeatable scripted run. TARGET_URL is validated in config.ts
# and any value other than this exact gateway URL terminates before network I/O.
ENV ATTACKER_MODE=scripted
ENV TARGET_URL=http://gateway:8080

CMD ["npm", "start"]
