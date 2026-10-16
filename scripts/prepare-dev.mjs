/**
 * Script de preparação de ambiente (`scripts/prepare-dev.mjs`).
 *
 * Responsabilidade arquitetural:
 * - Garantir que o arquivo `.env` local contenha todas as variáveis obrigatórias
 *   para o Prisma (`DATA_POSTGRES_PRISMA_URL`, `DATA_POSTGRES_URL_NON_POOLING`),
 *   NextAuth (`AUTH_SECRET`, `AUTH_TRUST_HOST`), Vercel Blob (`BLOB_STORE_ID`)
 *   e credenciais de Admin (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).
 * - Remover arquivos `.env.production.local` corrompidos com placeholders `"[SENSITIVE]"`
 *   gerados pelo `vercel env pull`, que sobrescrevem variáveis válidas no Next.js.
 * - Caso esteja rodando na Vercel real (`process.env.VERCEL === "1"` e sem `.env.production.local`
 *   com `[SENSITIVE]`), mantém as variáveis nativas da plataforma.
 */
import { randomBytes } from "crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { resolve } from "path";

const prodLocalPath = resolve(process.cwd(), ".env.production.local");
if (existsSync(prodLocalPath)) {
  const prodContent = readFileSync(prodLocalPath, "utf8");
  if (prodContent.includes('"[SENSITIVE]"')) {
    try {
      unlinkSync(prodLocalPath);
      console.log(
        "[prepare-dev] Removido .env.production.local contendo placeholders '[SENSITIVE]' inválidos."
      );
    } catch {
      // ignora se não puder remover
    }
  }
}

if (process.env.VERCEL === "1") {
  console.log("[prepare-dev] Ambiente Vercel detectado — usando variáveis de ambiente nativas.");
  process.exit(0);
}

const envPath = resolve(process.cwd(), ".env");

const fallbackPostgresUrl =
  process.env.DATA_POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/cattle_capture?schema=public";

const required = {
  ADMIN_EMAIL: "admin@cattlecapture.com",
  ADMIN_PASSWORD: "admin123",
  ADMIN_NAME: "Administrador CattleCapture",
  AUTH_SECRET: randomBytes(32).toString("hex"),
  AUTH_TRUST_HOST: "true",
  BLOB_STORE_ID: "store_zPZh2RYVHf5E0iyd",
  DATA_POSTGRES_PRISMA_URL: fallbackPostgresUrl,
  DATA_POSTGRES_URL_NON_POOLING: fallbackPostgresUrl,
};

if (!existsSync(envPath)) {
  const body = Object.entries(required)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
  writeFileSync(envPath, `${body}\n`);
  console.log("[prepare-dev] Criado arquivo .env completo.");
  process.exit(0);
}

const current = readFileSync(envPath, "utf8");
const additions = [];
for (const [key, value] of Object.entries(required)) {
  const present = new RegExp(`^${key}=`, "m").test(current);
  if (!present) additions.push(`${key}="${value}"`);
}

if (additions.length > 0) {
  const suffix = current.endsWith("\n") ? "" : "\n";
  writeFileSync(envPath, `${current}${suffix}${additions.join("\n")}\n`);
  console.log(
    `[prepare-dev] Atualizado .env com: ${additions.map((line) => line.split("=")[0]).join(", ")}`
  );
}
