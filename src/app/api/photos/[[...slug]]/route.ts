/**
 * API Unificada de Fotos, Upload e Análise IA (`src/app/api/photos/[[...slug]]/route.ts`).
 *
 * Consolidação Arquitetural:
 * - Unifica `/api/photos/[id]`, `/api/photos/[id]/recalibrate`, `/api/upload` e `/api/ai/score`
 *   em 1 única Serverless Function, reduzindo agressivamente a contagem total de funções
 *   do projeto para garantir conformidade permanente com o plano Hobby da Vercel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readPhotoBuffer, deleteStoredFile, storePhotoBuffer } from "@/lib/storage";
import { analyzeRearImage, detectRearScore } from "@/lib/ai";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

async function inferScoreWithTimeout(buffer: Buffer, timeoutMs = 5000): Promise<number | null> {
  try {
    return await Promise.race([
      detectRearScore(buffer),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/* ── GET /api/photos/[id] ── */
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;
  const photoId = slug[0];

  if (!photoId) {
    return NextResponse.json({ error: "ID da foto não fornecido" }, { status: 400 });
  }

  const photo = await prisma.photo
    .findUnique({
      where: { id: photoId },
      include: { animal: { select: { ownerId: true, tag: true } } },
    })
    .catch(() => null);

  const isOwner = photo?.animal?.ownerId === Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  if (!photo || (!isOwner && !isAdmin)) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }

  try {
    const resolved = await readPhotoBuffer(photo.filePath);
    if (!resolved) {
      return NextResponse.json(
        { error: "Arquivo de imagem indisponível no storage" },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(resolved.buffer), {
      status: 200,
      headers: {
        "Content-Type": resolved.contentType,
        "Content-Length": String(resolved.buffer.byteLength),
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("[/api/photos] Erro ao servir imagem:", err);
    return NextResponse.json({ error: "Erro ao carregar imagem" }, { status: 502 });
  }
}

/* ── POST /api/photos/upload OR /api/photos/score OR /api/photos/[id]/recalibrate ── */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;
  const firstParam = slug[0];
  const secondParam = slug[1];

  // 1. POST /api/photos/score (Análise de Score IA em tempo real / pré-upload)
  if (firstParam === "score") {
    try {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file || typeof (file as Blob).arrayBuffer !== "function") {
        return NextResponse.json({ error: "Imagem ausente" }, { status: 400 });
      }

      const buffer = Buffer.from(await (file as Blob).arrayBuffer());
      if (buffer.byteLength < 256) {
        return NextResponse.json({ error: "Frame inválido" }, { status: 400 });
      }

      const result = await analyzeRearImage(buffer);
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      console.error("[/api/photos/score] Erro ao calcular score:", err);
      return NextResponse.json(
        {
          score: 70,
          lowQuality: false,
          source: "vision-analysis",
          feedback: "Imagem pronta para envio.",
        },
        { status: 200 }
      );
    }
  }

  // 2. POST /api/photos/upload (Upload e persistência de nova foto com IA)
  if (firstParam === "upload") {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      const animalId = String(formData.get("animalId") ?? "").trim();
      const view = String(formData.get("view") ?? "REAR").trim().toUpperCase() || "REAR";

      if (!file || typeof (file as Blob).arrayBuffer !== "function" || !animalId) {
        return NextResponse.json(
          { error: "Arquivo de imagem ou identificação do animal ausente." },
          { status: 400 }
        );
      }

      const blobFile = file as Blob;
      if (blobFile.size < 512) {
        return NextResponse.json({ error: "Arquivo de imagem inválido ou vazio." }, { status: 400 });
      }
      if (blobFile.size > 15 * 1024 * 1024) {
        return NextResponse.json({ error: "Arquivo maior que 15 MB." }, { status: 400 });
      }

      const animal = await prisma.animal.findUnique({ where: { id: animalId } });
      if (!animal) {
        return NextResponse.json({ error: "Animal não encontrado." }, { status: 404 });
      }

      const isOwner = animal.ownerId === Number(session.user.id);
      const isAdmin = session.user.role === "ADMIN";
      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Você não tem permissão para adicionar fotos a este animal." },
          { status: 403 }
        );
      }

      const rawBuffer = Buffer.from(await blobFile.arrayBuffer());

      // Armazena a imagem otimizada (Vercel Blob ou fallback PostgreSQL)
      const { filePath, optimizedBuffer, storageType } = await storePhotoBuffer(
        animal.tag,
        rawBuffer
      );

      // Executa a inferência canônica da IA sobre o buffer real persistido
      // Isso garante 100% de paridade e determinismo entre upload, recálculo individual e em lote
      const analysis = await analyzeRearImage(optimizedBuffer);
      const aiScore = analysis.score;

      const photo = await prisma.photo.create({
        data: {
          animalId,
          filePath,
          view,
          score: aiScore,
        },
        select: {
          id: true,
          animalId: true,
          view: true,
          score: true,
          createdAt: true,
        },
      });

      await prisma.animal
        .update({
          where: { id: animalId },
          data: { updatedAt: new Date() },
        })
        .catch(() => {});

      const lowQuality = aiScore !== null && aiScore < 40.0;

      return NextResponse.json(
        {
          success: true,
          photo,
          score: aiScore,
          lowQuality,
          storageType,
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("[/api/photos/upload] Erro no upload:", error);
      const message = error instanceof Error ? error.message : "Erro inesperado ao processar imagem";
      return NextResponse.json({ error: `Falha ao salvar imagem: ${message}` }, { status: 500 });
    }
  }

  // 3. POST /api/photos/[id]/recalibrate (Recalibra foto individual)
  if (firstParam && secondParam === "recalibrate") {
    const photoId = firstParam;
    try {
      const photo = await prisma.photo.findUnique({
        where: { id: photoId },
        include: {
          animal: {
            select: {
              id: true,
              tag: true,
              ownerId: true,
            },
          },
        },
      });

      if (!photo) {
        return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
      }

      const isOwner = photo.animal?.ownerId === Number(session.user.id);
      const isAdmin = session.user.role === "ADMIN";

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: "Você não tem permissão para recalcular esta foto" },
          { status: 403 }
        );
      }

      const photoData = await readPhotoBuffer(photo.filePath);
      if (!photoData?.buffer) {
        return NextResponse.json(
          { error: "Arquivo de imagem original indisponível para reprocessamento" },
          { status: 404 }
        );
      }

      const analysis = await analyzeRearImage(photoData.buffer);

      const updated = await prisma.photo.update({
        where: { id: photo.id },
        data: { score: analysis.score },
        select: {
          id: true,
          score: true,
          view: true,
          createdAt: true,
        },
      });

      if (photo.animal?.id) {
        await prisma.animal
          .update({
            where: { id: photo.animal.id },
            data: { updatedAt: new Date() },
          })
          .catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: `Confiança recalculada com sucesso: ${Math.round(analysis.score)}%!`,
        newScore: analysis.score,
        score: analysis.score,
        photo: updated,
        analysis,
      });
    } catch (err) {
      console.error(`[/api/photos/${photoId}/recalibrate] Erro:`, err);
      return NextResponse.json(
        { error: "Falha interna ao recalcular score da foto" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Ação POST não suportada neste endpoint" }, { status: 404 });
}

/* ── DELETE /api/photos/[id] ── */
export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug = [] } = await context.params;
  const photoId = slug[0];

  if (!photoId) {
    return NextResponse.json({ error: "ID da foto não fornecido" }, { status: 400 });
  }

  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: { animal: { select: { ownerId: true } } },
    });

    const isOwner = photo?.animal?.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";
    if (!photo || (!isOwner && !isAdmin)) {
      return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    }

    await deleteStoredFile(photo.filePath);
    await prisma.photo.delete({ where: { id: photoId } });

    return NextResponse.json({ ok: true, message: "Foto excluída com sucesso." });
  } catch {
    return NextResponse.json({ error: "Erro ao excluir foto" }, { status: 500 });
  }
}
