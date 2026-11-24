/**
 * API Unificada de Fotos, Upload e Análise IA (`src/app/api/photos/[[...slug]]/route.ts`).
 *
 * Suporta:
 * - `GET /api/photos/[id]` (`?w=480`, WebP negotiation, ETag `304`, guarda compartilhada).
 * - `POST /api/photos/score` (`?mode=live`).
 * - `POST /api/photos/upload` (preserva `preScore` quando `aiSource=yolo-onnx-client`, ou executa `analyzeRearImage`).
 * - `POST /api/photos/[id]/recalibrate`.
 * - `DELETE /api/photos/[id]`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canAccessAnimal } from "@/lib/custody";
import { readPhotoBuffer, deleteStoredFile, storePhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug?: string[] }> };

/* ── GET /api/photos/[id] ── */
export async function GET(request: Request, context: Context) {
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

  if (!photo) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }

  const hasAccess = await canAccessAnimal(
    photo.animalId,
    photo.animal?.ownerId ?? 0,
    Number(session.user.id),
    session.user.role === "ADMIN"
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Acesso negado a esta foto" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsedWidth = Number(url.searchParams.get("w") || "0");
  const targetWidth =
    Number.isFinite(parsedWidth) && parsedWidth >= 120 && parsedWidth <= 1600
      ? Math.round(parsedWidth)
      : 0;
  const acceptHeader = (request.headers.get("accept") || "").toLowerCase();
  const wantsWebp = targetWidth > 0 && acceptHeader.includes("image/webp");
  const etag = `"${photo.id}-${targetWidth || "full"}-${wantsWebp ? "webp" : "orig"}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=31536000, immutable",
        Vary: "Accept",
      },
    });
  }

  try {
    const resolved = await readPhotoBuffer(photo.filePath);
    if (!resolved) {
      return NextResponse.json(
        { error: "Arquivo de imagem indisponível no storage" },
        { status: 404 }
      );
    }

    let outputBuffer = resolved.buffer;
    let outputContentType = resolved.contentType;

    if (targetWidth > 0 && targetWidth < 1600) {
      try {
        const { default: sharp } = await import("sharp");
        const pipeline = sharp(resolved.buffer)
          .rotate()
          .resize(targetWidth, null, { withoutEnlargement: true });

        if (wantsWebp) {
          outputBuffer = await pipeline.webp({ quality: 78 }).toBuffer();
          outputContentType = "image/webp";
        } else {
          outputBuffer = await pipeline.jpeg({ quality: 78, mozjpeg: true }).toBuffer();
          outputContentType = "image/jpeg";
        }
      } catch {
        // Fallback silencioso para buffer original
      }
    }

    return new NextResponse(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        "Content-Type": outputContentType,
        "Content-Length": String(outputBuffer.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: etag,
        Vary: "Accept",
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

  // 1. POST /api/photos/score
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

      const url = new URL(request.url);
      const fastLive = url.searchParams.get("mode") === "live";
      const result = await analyzeRearImage(buffer, { fastLive });
      return NextResponse.json(result, { status: 200 });
    } catch (err) {
      console.error("[/api/photos/score] Erro ao calcular score:", err);
      return NextResponse.json(
        {
          score: 0,
          confidence: 0,
          lowQuality: true,
          error: true,
          source: "vision-analysis",
          feedback: "Falha ao processar frame na IA — tente novamente.",
        },
        { status: 200 }
      );
    }
  }

  // 2. POST /api/photos/upload
  if (firstParam === "upload") {
    try {
      const formData = await request.formData();
      const file = formData.get("file");
      const animalId = String(formData.get("animalId") ?? "").trim();
      const view = String(formData.get("view") ?? "REAR").trim().toUpperCase() || "REAR";
      const aiSource = String(formData.get("aiSource") ?? "").trim();
      const preScoreRaw = formData.get("preScore");

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

      const hasAccess = await canAccessAnimal(
        animal.id,
        animal.ownerId,
        Number(session.user.id),
        session.user.role === "ADMIN"
      );
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Você não tem permissão para adicionar fotos a este animal." },
          { status: 403 }
        );
      }

      const rawBuffer = Buffer.from(await blobFile.arrayBuffer());
      const { filePath, optimizedBuffer, storageType } = await storePhotoBuffer(
        animal.tag,
        rawBuffer
      );

      // Edge AI: quando o dispositivo já calculou o enquadramento com os modelos ONNX locais,
      // preservamos o score validado no cliente sem duplicar inferência no servidor.
      const parsedClientScore =
        aiSource === "yolo-onnx-client" && preScoreRaw !== null
          ? Number(preScoreRaw)
          : NaN;
      const hasValidatedClientScore =
        Number.isFinite(parsedClientScore) && parsedClientScore >= 0 && parsedClientScore <= 100;

      const aiScore = hasValidatedClientScore
        ? Math.round(parsedClientScore * 10) / 10
        : (await analyzeRearImage(optimizedBuffer)).score;

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
          confidence: aiScore,
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

  // 3. POST /api/photos/[id]/recalibrate
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

      const hasAccess = await canAccessAnimal(
        photo.animal?.id || photo.animalId,
        photo.animal?.ownerId ?? 0,
        Number(session.user.id),
        session.user.role === "ADMIN"
      );
      if (!hasAccess) {
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
          animalId: true,
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
        message: `Confiança de enquadramento atualizada: ${Math.round(analysis.score)}%!`,
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
