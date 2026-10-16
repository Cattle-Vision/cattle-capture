/**
 * API Unificada de Fotos (`src/app/api/photos/[...slug]/route.ts`).
 *
 * Consolidação Arquitetural:
 * - Unifica `/api/photos/[id]` (GET binário / DELETE) e `/api/photos/[id]/recalibrate` (POST)
 *   em uma única Serverless Function, respeitando o limite de 12 funções do plano Hobby da Vercel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readPhotoBuffer, deleteStoredFile } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 45;
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string[] }> };

/* ── GET /api/photos/[id] ── */
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug } = await context.params;
  const photoId = slug?.[0];

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

/* ── POST /api/photos/[id]/recalibrate ── */
export async function POST(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { slug } = await context.params;
  const photoId = slug?.[0];
  const action = slug?.[1];

  if (!photoId || action !== "recalibrate") {
    return NextResponse.json({ error: "Ação não suportada" }, { status: 404 });
  }

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

    return NextResponse.json({
      success: true,
      message: `Score recalculado com sucesso: ${Math.round(analysis.score)}%!`,
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

/* ── DELETE /api/photos/[id] ── */
export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { slug } = await context.params;
  const photoId = slug?.[0];

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
