# CattleCapture v2.5 · Dataset ICC Bovino (Vercel Ready)

Plataforma para captura padronizada, validação por IA (YOLO ONNX) e curadoria de imagens da região posterior bovina para treinamento de modelos de **Índice de Condição Corporal (ICC / BCS)**.

## Arquitetura Serverless (Vercel)

- **Banco de Dados:** PostgreSQL (Neon / Supabase / Local) via Prisma ORM.
- **Armazenamento Híbrido Resiliente (`src/lib/storage.ts`):**
  1. Otimização de imagem no cliente (`src/lib/image-client.ts` — máx 1600px JPEG ~250KB, evitando o limite de 4.5MB das Serverless Functions da Vercel) e no servidor (`sharp`).
  2. Persistência no **Vercel Blob Storage** (`private` ou `public`) com leitura autenticada via proxy `/api/photos/[id]`.
  3. Fallback automático para Data URI base64 otimizado no PostgreSQL caso os tokens do Vercel Blob não estejam ativos no ambiente.
- **Autenticação & Login Admin via `.env` (`src/lib/auth.ts`):**
  - Credenciais administrativas configuráveis diretamente no `.env`:
    ```env
    ADMIN_EMAIL="admin@cattlecapture.com"
    ADMIN_PASSWORD="admin123"
    ADMIN_NAME="Administrador CattleCapture"
    ```
  - No login, o usuário pode informar `admin@cattlecapture.com` (ou apenas `admin`) e a senha definida em `ADMIN_PASSWORD`. O sistema provisiona/sincroniza automaticamente o registro na tabela `User` com `role = "ADMIN"`.

## Comandos Principais

```bash
npm install
npm run dev      # Ambiente de desenvolvimento
npm run build    # Build de produção (compatível com Vercel)
```
