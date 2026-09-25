FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl python3

WORKDIR /app

COPY package*.json ./
RUN npm install --network-timeout=1000000

COPY . .

FROM node:22-slim AS runner

RUN apt-get update -y && apt-get install -y openssl python3

WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV=production
ENV DATABASE_URL=file:./dev.db

EXPOSE 3000

CMD ["sh", "-c", "npx prisma generate && npm run build && npx prisma db push && npm run start"]