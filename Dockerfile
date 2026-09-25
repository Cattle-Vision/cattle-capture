FROM node:22-slim

# Instalar dependências de sistema exigidas pelo Prisma no Debian Slim
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Instalar dependências (com timeout de rede estendido para conexões lentas/flutuantes)
COPY package*.json ./
RUN npm install --network-timeout=1000000

# Copiar os arquivos do projeto
COPY . .

# Gerar o Prisma Client
RUN npx prisma generate

# Fazer a build do Next.js
RUN npm run build

EXPOSE 3000

# Iniciar o servidor de produção
CMD ["npm", "run", "start"]
