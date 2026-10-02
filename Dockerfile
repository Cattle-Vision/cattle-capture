FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts --network-timeout=1000000 || npm install --ignore-scripts --network-timeout=1000000

COPY . .
ENV DATABASE_URL=file:./dev.db
RUN npx prisma generate && npx next build

FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV DATABASE_URL=file:./dev.db
ENV AUTH_TRUST_HOST=true

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push && npm run start"]
