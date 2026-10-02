# CattleCapture

App para montar dataset de **fotos da traseira** de bois e vacas, com animal identificado pelo brinco, para treinar IA de **índice de condição corporal (ICC)**.

Banco: **SQLite** via Prisma (não precisa de MySQL nem de Docker no PC).

## No seu PC (sem Docker)

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

O `npm run dev` cria o `.env` se faltar, gera o cliente Prisma e aplica o schema no SQLite (`prisma/dev.db`).

- Cadastro: `/register` (e-mail com `admin` vira administrador)
- Identificar pelo brinco: `/identify`
- Câmera no celular na mesma rede: `npm run dev:https` (a câmera do navegador exige HTTPS fora de localhost)

## No servidor (Docker)

Definir `AUTH_SECRET` e subir com o `docker-compose.yml` do repositório. Volumes: fotos em `storage/uploads` e banco em `prisma/`.

## Fluxo de campo

1. Identificar o brinco (ou cadastrar raça, sexo, peso, idade).
2. Fotografar **somente a traseira**, com garupa e pinças no quadro.
3. Confirmar o checklist de qualidade.
4. Admin exporta ZIP + `manifest.json` para treino.
