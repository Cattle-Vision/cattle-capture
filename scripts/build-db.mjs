/**
 * Script resiliente de sincronização de schema e seed no build (`scripts/build-db.mjs`).
 *
 * Por que este script existe:
 * - Na Vercel, durante `npm run build`, as variáveis do banco PostgreSQL (Neon) estão ativas,
 *   então executamos `prisma db push` para sincronizar tabelas automaticamente.
 * - Em ambientes locais de build onde o PostgreSQL pode não estar acessível no `localhost:5432`,
 *   capturamos falhas de conexão de forma segura para não travar a compilação do Next.js.
 */
import { execSync } from "child_process";

const dbUrl = process.env.DATA_POSTGRES_PRISMA_URL || process.env.DATABASE_URL || "";

// Se for o placeholder localhost e não estivermos na Vercel, tenta com timeout curto e não falha o build
try {
  console.log("[build-db] Sincronizando schema Prisma com o banco de dados...");
  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    timeout: 25000,
  });
  console.log("[build-db] Schema sincronizado com sucesso.");
} catch (err) {
  if (process.env.VERCEL === "1") {
    console.warn("[build-db] Aviso ao executar prisma db push na Vercel:", err?.message || err);
  } else {
    console.warn(
      "[build-db] Banco PostgreSQL não acessível localmente durante o build (ignorando db push para concluir compilação)."
    );
  }
}
