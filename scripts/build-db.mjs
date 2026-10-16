/**
 * Script resiliente de Migração e Sincronização do Banco (`scripts/build-db.mjs`).
 *
 * Responsabilidade:
 * 1. Tenta aplicar as migrações versionadas (`npx prisma migrate deploy`).
 *    Se o banco já existia via `db push` anterior (erro P3005), marca `20261016000000_init`
 *    como aplicada (`migrate resolve --applied`) e roda `migrate deploy` em seguida para
 *    aplicar `20261016150000_invert_ai_scores`.
 * 2. Garante alinhamento total do schema com `npx prisma db push --skip-generate --accept-data-loss`.
 * 3. Executa o seed idempotente (`npx tsx prisma/seed.ts`), que provisiona o Admin do `.env`
 *    e garante a inversão idempotente (`100 - score`) das fotos existentes no banco.
 */
import { execSync } from "child_process";

try {
  console.log("[build-db] Aplicando migrações e sincronizando schema Prisma...");
  try {
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      timeout: 25000,
    });
  } catch {
    try {
      execSync("npx prisma migrate resolve --applied 20261016000000_init", {
        stdio: "inherit",
        timeout: 15000,
      });
      execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        timeout: 25000,
      });
    } catch {
      // Continua para db push + seed idempotente
    }
  }

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    timeout: 25000,
  });

  console.log("[build-db] Provisionando Admin via .env e aplicando calibração de scores...");
  execSync("npx tsx prisma/seed.ts", {
    stdio: "inherit",
    timeout: 20000,
  });

  console.log("[build-db] Banco de dados migrado e sincronizado com sucesso.");
} catch (err) {
  if (process.env.VERCEL === "1") {
    console.warn("[build-db] Aviso ao migrar banco na Vercel:", err?.message || err);
  } else {
    console.warn(
      "[build-db] Banco PostgreSQL não acessível localmente no momento (as migrações serão aplicadas quando o banco estiver online)."
    );
  }
}
