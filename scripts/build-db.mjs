/**
 * Script seguro e não-destrutivo de Migração Local do Banco (`scripts/build-db.mjs`).
 *
 * ATENÇÃO CRÍTICA:
 * - Nunca executa `prisma db push --accept-data-loss`, pois o CattleCapture e o CattleVision
 *   podem compartilhar a mesma instância PostgreSQL onde tabelas/colunas de ICS do CattleVision
 *   coexistem com o schema do CattleCapture.
 * - Em builds da Vercel (`VERCEL=1`), não executa mutações automáticas de banco para impedir que
 *   um build/preview do CattleCapture altere o banco de produção do CattleVision.
 * - Localmente, executa apenas `prisma migrate deploy` (aditivo) quando acessível.
 */
import { execSync } from "child_process";

if (process.env.VERCEL === "1" && process.env.ALLOW_VERCEL_BUILD_DB !== "true") {
  console.log(
    "[build-db] Ambiente Vercel detectado: pulando migração automática no build do CattleCapture para proteger bancos compartilhados."
  );
  process.exit(0);
}

try {
  console.log("[build-db] Aplicando migrações aditivas Prisma (sem --accept-data-loss)...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    timeout: 25000,
  });
  console.log("[build-db] Migrações aplicadas com sucesso.");
} catch {
  console.warn(
    "[build-db] Banco PostgreSQL não acessível localmente ou histórico gerenciado externamente; seguindo com o build."
  );
}
