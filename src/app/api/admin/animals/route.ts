/**
 * Rota de Listagem Administrativa Global (`GET /api/admin/animals`).
 *
 * Responsabilidades:
 * - Exclusivo para `role === "ADMIN"`.
 * - Garante que a migração idempotente de inversão de scores (`100 - score`) tenha sido aplicada.
 * - Retorna todos os animais e metadados de fotos (`id`, `view`, `score`, `createdAt`)
 *   junto com os dados do proprietário (`owner.name`, `owner.email`).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

let scoreMigrationChecked = false;

async function ensureScoresMigratedOnce() {
  if (scoreMigrationChecked) return;
  scoreMigrationChecked = true;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_cattle_migrations" (
        "name" TEXT NOT NULL,
        "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "_cattle_migrations_pkey" PRIMARY KEY ("name")
      );
    `);
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM "_cattle_migrations" WHERE "name" = '20261016150000_invert_ai_scores'
        ) THEN
          UPDATE "Photo"
          SET "score" = ROUND((100.0 - "score")::numeric, 1)::double precision
          WHERE "score" IS NOT NULL
            AND "score" >= 0
            AND "score" <= 100;

          INSERT INTO "_cattle_migrations" ("name")
          VALUES ('20261016150000_invert_ai_scores');
        END IF;
      END $$;
    `);
  } catch (err) {
    console.warn("[admin/animals] Aviso ao verificar migração de scores:", err);
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  await ensureScoresMigratedOnce();

  const animals = await prisma.animal.findMany({
    include: {
      photos: {
        select: { id: true, animalId: true, view: true, score: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(animals);
}
