/**
 * API Administrativa Unificada (`src/app/api/admin/[[...slug]]/route.ts`).
 *
 * Consolidação Arquitetural:
 * - Unifica `/api/admin/animals`, `/api/admin/recalibrate`, `/api/admin/users` e
 *   `/api/admin/users/[id]` em uma única Serverless Function para respeitar rigorosamente
 *   o limite de 12 funções do plano Hobby da Vercel sem custo adicional.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";
import bcrypt from "bcryptjs";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
    console.warn("[admin] Aviso ao verificar migração de scores:", err);
  }
}

type Context = { params: Promise<{ slug?: string[] }> };

/* ── GET /api/admin/... ── */
export async function GET(req: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const { slug = [] } = await context.params;
  const subRoute = slug[0];

  // 1. GET /api/admin/animals
  if (subRoute === "animals") {
    await ensureScoresMigratedOnce();
    const animals = await prisma.animal.findMany({
      include: {
        photos: {
          select: {
            id: true,
            animalId: true,
            view: true,
            score: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(animals);
  }

  // 2. GET /api/admin/users
  if (subRoute === "users") {
    const callerId = Number(session.user.id);
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        animals: {
          select: {
            id: true,
            _count: {
              select: { photos: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      animalsCount: u.animals.length,
      photosCount: u.animals.reduce((acc, a) => acc + a._count.photos, 0),
      isSelf: u.id === callerId,
    }));

    return NextResponse.json(formattedUsers);
  }

  // 3. GET /api/admin/export (gera ZIP com fotos, manifest.json e dataset.csv)
  if (subRoute === "export") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const animals = await prisma.animal.findMany({
        include: {
          photos: { orderBy: { createdAt: "desc" } },
          owner: { select: { name: true, email: true } },
        },
        orderBy: { updatedAt: "desc" },
      });

      const zip = new AdmZip();
      const manifest: Array<Record<string, unknown>> = [];
      const csvRows: string[] = [
        [
          "file",
          "photo_id",
          "animal_id",
          "tag",
          "name",
          "breed",
          "sex",
          "weight_kg",
          "age_months",
          "view",
          "ai_score",
          "created_at",
          "owner_name",
          "owner_email",
        ].join(","),
      ];

      for (const animal of animals) {
        for (const photo of animal.photos) {
          const fileName = `${animal.tag}_${photo.id}.jpg`;
          const filePath = `images/${fileName}`;

          try {
            const photoData = await readPhotoBuffer(photo.filePath);
            if (photoData?.buffer) {
              zip.addFile(filePath, photoData.buffer);
            }
          } catch (err) {
            console.error("[/api/admin/export] Erro ao ler foto:", photo.id, err);
          }

          manifest.push({
            file: filePath,
            photoId: photo.id,
            animalId: animal.id,
            tag: animal.tag,
            name: animal.name,
            breed: animal.breed,
            sex: animal.sex,
            weight: animal.weight,
            age: animal.age,
            view: photo.view,
            aiScore: photo.score,
            createdAt: photo.createdAt.toISOString(),
            owner: {
              name: animal.owner.name,
              email: animal.owner.email,
            },
          });

          const escapeCsv = (val: unknown) => {
            const str = String(val ?? "");
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          };

          csvRows.push(
            [
              escapeCsv(filePath),
              escapeCsv(photo.id),
              escapeCsv(animal.id),
              escapeCsv(animal.tag),
              escapeCsv(animal.name),
              escapeCsv(animal.breed),
              escapeCsv(animal.sex),
              escapeCsv(animal.weight),
              escapeCsv(animal.age),
              escapeCsv(photo.view),
              escapeCsv(photo.score ?? ""),
              escapeCsv(photo.createdAt.toISOString()),
              escapeCsv(animal.owner.name),
              escapeCsv(animal.owner.email),
            ].join(",")
          );
        }
      }

      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));
      zip.addFile("dataset.csv", Buffer.from(csvRows.join("\n"), "utf-8"));

      const zipBuffer = zip.toBuffer();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const downloadFilename = `cattle-bcs-dataset-${timestamp}.zip`;

      return new NextResponse(new Uint8Array(zipBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${downloadFilename}"`,
          "Content-Length": String(zipBuffer.length),
        },
      });
    } catch (err) {
      console.error("[/api/admin/export] Erro ao gerar ZIP:", err);
      return NextResponse.json({ error: "Falha ao gerar dataset ZIP" }, { status: 500 });
    }
  }

  // 4. GET /api/admin (verificação de status admin)
  if (slug.length === 0) {
    return NextResponse.json({ ok: true, admin: true });
  }

  return NextResponse.json({ error: "Subrota administrativa não encontrada" }, { status: 404 });
}

/* ── POST /api/admin/... ── */
export async function POST(req: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const { slug = [] } = await context.params;
  const subRoute = slug[0];

  // 1. POST /api/admin/recalibrate (recalcula todos os scores do banco)
  if (subRoute === "recalibrate") {
    const photos = await prisma.photo.findMany({
      select: {
        id: true,
        filePath: true,
        score: true,
        animalId: true,
        animal: { select: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    let updatedCount = 0;
    const affectedAnimalIds = new Set<string>();
    const results: Array<{ id: string; tag?: string; oldScore: number | null; newScore: number }> = [];

    for (const photo of photos) {
      try {
        const photoData = await readPhotoBuffer(photo.filePath);
        if (!photoData?.buffer) {
          console.warn(`[admin/recalibrate] Buffer indisponível para foto ${photo.id}`);
          continue;
        }

        const analysis = await analyzeRearImage(photoData.buffer);

        await prisma.photo.update({
          where: { id: photo.id },
          data: { score: analysis.score },
        });

        if (photo.animalId) {
          affectedAnimalIds.add(photo.animalId);
        }

        updatedCount++;
        results.push({
          id: photo.id,
          tag: photo.animal?.tag,
          oldScore: photo.score,
          newScore: analysis.score,
        });
      } catch (err) {
        console.warn(`[admin/recalibrate] Erro ao recalcular foto ${photo.id}:`, err);
      }
    }

    if (affectedAnimalIds.size > 0) {
      await prisma.animal.updateMany({
        where: { id: { in: Array.from(affectedAnimalIds) } },
        data: { updatedAt: new Date() },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      totalCount: photos.length,
      message: `${updatedCount} de ${photos.length} fotos foram recalculadas com sucesso!`,
      results,
    });
  }

  // 2. POST /api/admin/users (criar ou promover usuário)
  if (subRoute === "users") {
    const callerId = Number(session.user.id);
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const targetRole = body.role === "ADMIN" ? "ADMIN" : "USER";

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      const updateData: { name: string; role: string; password?: string } = {
        name: name || existing.name,
        role: targetRole,
      };
      if (password && password.length >= 6) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        ...updated,
        animalsCount: 0,
        photosCount: 0,
        isSelf: updated.id === callerId,
        updatedExisting: true,
      });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Para novos usuários, a senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: targetRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...created,
      animalsCount: 0,
      photosCount: 0,
      isSelf: created.id === callerId,
    });
  }

  return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
}

/* ── PATCH /api/admin/users/[id] ── */
export async function PATCH(req: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const { slug = [] } = await context.params;
  // Esperado: /api/admin/users/[id] -> slug = ['users', id]
  if (slug[0] === "users" && slug[1]) {
    const userId = Number(slug[1]);
    const callerId = Number(session.user.id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "ID de usuário inválido" }, { status: 400 });
    }

    const body = await req.json();
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (userId === callerId && body.role && body.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Você não pode remover seu próprio privilégio de administrador." },
        { status: 400 }
      );
    }

    const updateData: { role?: string; name?: string; password?: string } = {};
    if (body.role === "ADMIN" || body.role === "USER") {
      updateData.role = body.role;
    }
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.password === "string" && body.password.length >= 6) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Operação PATCH não suportada neste endpoint" }, { status: 404 });
}

/* ── DELETE /api/admin/users/[id] ── */
export async function DELETE(req: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  const { slug = [] } = await context.params;
  // Esperado: /api/admin/users/[id] -> slug = ['users', id]
  if (slug[0] === "users" && slug[1]) {
    const userId = Number(slug[1]);
    const callerId = Number(session.user.id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "ID de usuário inválido" }, { status: 400 });
    }

    if (userId === callerId) {
      return NextResponse.json(
        { error: "Você não pode excluir sua própria conta de administrador." },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ message: "Usuário removido com sucesso" });
  }

  return NextResponse.json({ error: "Operação DELETE não suportada neste endpoint" }, { status: 404 });
}
