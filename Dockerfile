FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY package*.json ./
RUN npm install --network-timeout=1000000

COPY . .

RUN npx prisma generate

RUN npm run build

EXPOSE 3000

# Roda db push antes de iniciar (cria o banco se não existir)
CMD ["sh", "-c", "npx prisma db push && npm run start"]
