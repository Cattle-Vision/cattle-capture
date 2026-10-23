/**
 * API Unificada de Gestão de Animais (`src/app/api/animals/[[...slug]]/route.ts`).
 *
 * Consolidação Arquitetural:
 * - Unifica `/api/animals`, `/api/animals/recalibrate`, `/api/animals/[id]` e
 *   `/api/animals/[id]/recalibrate` em uma única Serverless Function para respeitar
 *   o limite de 12 funções do plano Hobby da Vercel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidTag, normalizeTag } from "@/lib/animal";
import { readPhotoBuffer, deleteStoredFile } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const photoMetadataSelect = {
  id: true,
  animalId: true,
  view: true,
  score: true,
  createdAt: true,
} as const;

async function canAccess(ownerId: number, session: { user: { id: string; role: string } }) {
  return ownerId === Number(session.user.id) || session.user.role === "ADMIN";
}

type Context = { params: Promise<{ slug?: string[] }> };

/* ── GET /api/animals OR /api/animals/[id] ── */
export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;

  // 1. GET /api/animals/[id]
  if (slug.length === 1 && slug[0] !== "recalibrate") {
    const animalId = slug[0];
    const animal = await prisma.animal.findUnique({
      where: { id: animalId },
      include: {
        photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
      },
    });

    if (!animal || !(await canAccess(animal.ownerId, session))) {
      return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
    }

    return NextResponse.json(animal);
  }

  // 2. GET /api/animals (lista todos do usuário ou busca por tag)
  if (slug.length === 0) {
    const { searchParams } = new URL(request.url);
    const tag = searchParams.get("tag");

    const userId = Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";

    if (tag) {
      const normalized = normalizeTag(tag);
      const animal = await prisma.animal.findFirst({
        where: isAdmin
          ? { tag: normalized }
          : { tag: normalized, ownerId: userId },
        include: {
          photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
        },
      });

      if (!animal) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }

      return NextResponse.json(animal);
    }

    const animals = await prisma.animal.findMany({
      where: { ownerId: userId },
      include: {
        photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(animals);
  }

  return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });
}

/* ── POST /api/animals OR /api/animals/recalibrate OR /api/animals/[id]/recalibrate ── */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;

  // 1. POST /api/animals/recalibrate (recalibra todo o rebanho do usuário ou sistema se admin)
  if (slug.length === 1 && slug[0] === "recalibrate") {
    const isAdmin = session.user.role === "ADMIN";
    const userId = Number(session.user.id);

    // Se admin, recalibra fotos de todo o rebanho; se usuário comum, restringe aos seus animais
    const whereClause = isAdmin ? {} : { animal: { ownerId: userId } };

    const photos = await prisma.photo.findMany({
      where: whereClause,
      include: {
        animal: { select: { id: true, tag: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (photos.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma foto encontrada para recalibração.",
        updatedCount: 0,
        totalCount: 0,
      });
    }

    let updatedCount = 0;
    const affectedAnimalIds = new Set<string>();
    const results: Array<{ id: string; tag?: string; oldScore: number | null; newScore: number }> = [];

    for (const photo of photos) {
      try {
        const photoData = await readPhotoBuffer(photo.filePath);
        if (!photoData?.buffer) {
          console.warn(`[recalibrate] Buffer indisponível para foto ${photo.id}`);
          continue;
        }

        const analysis = await analyzeRearImage(photoData.buffer);

        await prisma.photo.update({
          where: { id: photo.id },
          data: { score: analysis.score },
        });

        if (photo.animal?.id) {
          affectedAnimalIds.add(photo.animal.id);
        }

        updatedCount++;
        results.push({
          id: photo.id,
          tag: photo.animal?.tag,
          oldScore: photo.score,
          newScore: analysis.score,
        });
      } catch (err) {
        console.warn(`[recalibrate] Erro ao recalcular foto ${photo.id}:`, err);
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

  // 2. POST /api/animals/[id]/recalibrate (recalibra todas as fotos de um animal)
  if (slug.length === 2 && slug[1] === "recalibrate") {
    const animalId = slug[0];
    const animal = await prisma.animal.findUnique({
      where: { id: animalId },
      include: {
        photos: {
          select: {
            id: true,
            filePath: true,
            score: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!animal) {
      return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
    }

    if (!(await canAccess(animal.ownerId, session))) {
      return NextResponse.json(
        { error: "Você não tem permissão para recalcular as fotos deste animal" },
        { status: 403 }
      );
    }

    if (animal.photos.length === 0) {
      return NextResponse.json({
        success: true,
        message: "O animal não possui fotos para recalibrar.",
        updatedCount: 0,
        results: [],
      });
    }

    let updatedCount = 0;
    const results: Array<{ id: string; oldScore: number | null; newScore: number }> = [];

    for (const photo of animal.photos) {
      try {
        const photoData = await readPhotoBuffer(photo.filePath);
        if (!photoData?.buffer) {
          console.warn(`[recalibrate/animal] Buffer indisponível para foto ${photo.id}`);
          continue;
        }

        const analysis = await analyzeRearImage(photoData.buffer);

        await prisma.photo.update({
          where: { id: photo.id },
          data: { score: analysis.score },
        });

        updatedCount++;
        results.push({
          id: photo.id,
          oldScore: photo.score,
          newScore: analysis.score,
        });
      } catch (err) {
        console.warn(`[recalibrate/animal] Erro ao recalcular foto ${photo.id}:`, err);
      }
    }

    await prisma.animal.update({
      where: { id: animalId },
      data: { updatedAt: new Date() },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      updatedCount,
      totalCount: animal.photos.length,
      message: `${updatedCount} foto(s) do animal foram recalculadas com sucesso!`,
      results,
    });
  }

  // 3. POST /api/animals (criação de novo animal)
  if (slug.length === 0) {
    try {
      const body = await request.json();
      const rawTag = normalizeTag(body.tag ?? "");
      const name = body.name ? String(body.name).trim() : "";
      const breed = String(body.breed ?? "Nelore").trim();
      const sex = String(body.sex ?? "Fêmea").trim();
      const weight = Number(body.weight);
      const age = Number(body.age);

      if (!isValidTag(rawTag)) {
        return NextResponse.json(
          { error: "Identificador/Brinco inválido. Mínimo 2 caracteres." },
          { status: 400 }
        );
      }

      if (Number.isNaN(weight) || weight <= 0) {
        return NextResponse.json({ error: "Peso deve ser um número positivo." }, { status: 400 });
      }

      if (Number.isNaN(age) || age < 0) {
        return NextResponse.json({ error: "Idade deve ser zero ou positiva." }, { status: 400 });
      }

      const userId = Number(session.user.id);

      const existing = await prisma.animal.findFirst({
        where: { tag: rawTag, ownerId: userId },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Você já possui um animal cadastrado com este brinco.", id: existing.id },
          { status: 409 }
        );
      }

      const animal = await prisma.animal.create({
        data: {
          tag: rawTag,
          name,
          breed,
          sex,
          weight,
          age,
          ownerId: userId,
        },
      });

      return NextResponse.json(animal, { status: 201 });
    } catch (err) {
      console.error("[/api/animals] Erro ao cadastrar:", err);
      return NextResponse.json({ error: "Falha ao cadastrar o animal." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
}

/* ── PATCH /api/animals/[id] ── */
export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;
  if (slug.length === 1 && slug[0] !== "recalibrate") {
    const animalId = slug[0];
    try {
      const animal = await prisma.animal.findUnique({ where: { id: animalId } });
      if (!animal || !(await canAccess(animal.ownerId, session))) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }

      const body = await request.json();
      const updateData: {
        tag?: string;
        name?: string;
        breed?: string;
        sex?: string;
        weight?: number;
        age?: number;
      } = {};

      if (body.tag !== undefined) {
        const rawTag = normalizeTag(body.tag);
        if (!isValidTag(rawTag)) {
          return NextResponse.json({ error: "Brinco inválido." }, { status: 400 });
        }
        if (rawTag !== animal.tag) {
          const conflict = await prisma.animal.findFirst({
            where: { tag: rawTag, ownerId: animal.ownerId, NOT: { id: animalId } },
          });
          if (conflict) {
            return NextResponse.json(
              { error: "Já existe outro animal com este brinco." },
              { status: 409 }
            );
          }
        }
        updateData.tag = rawTag;
      }

      if (body.name !== undefined) {
        updateData.name = body.name ? String(body.name).trim() : "";
      }
      if (body.breed !== undefined) {
        updateData.breed = String(body.breed).trim();
      }
      if (body.sex !== undefined) {
        updateData.sex = String(body.sex).trim();
      }
      if (body.weight !== undefined) {
        const w = Number(body.weight);
        if (Number.isNaN(w) || w <= 0) {
          return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
        }
        updateData.weight = w;
      }
      if (body.age !== undefined) {
        const a = Number(body.age);
        if (Number.isNaN(a) || a < 0) {
          return NextResponse.json({ error: "Idade inválida." }, { status: 400 });
        }
        updateData.age = a;
      }

      const updated = await prisma.animal.update({
        where: { id: animalId },
        data: updateData,
        include: {
          photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
        },
      });

      return NextResponse.json(updated);
    } catch {
      return NextResponse.json({ error: "Erro ao atualizar animal" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
}

/* ── DELETE /api/animals/[id] ── */
export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;
  if (slug.length === 1 && slug[0] !== "recalibrate") {
    const animalId = slug[0];
    try {
      const animal = await prisma.animal.findUnique({
        where: { id: animalId },
        include: { photos: { select: { id: true, filePath: true } } },
      });

      if (!animal || !(await canAccess(animal.ownerId, session))) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }

      for (const photo of animal.photos) {
        try {
          await deleteStoredFile(photo.filePath);
        } catch {
          // Continua remoção mesmo se arquivo físico não existir
        }
      }

      await prisma.photo.deleteMany({ where: { animalId } });
      await prisma.animal.delete({ where: { id: animalId } });

      return NextResponse.json({ ok: true, message: "Animal excluído com sucesso." });
    } catch {
      return NextResponse.json({ error: "Erro ao excluir animal" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
}
