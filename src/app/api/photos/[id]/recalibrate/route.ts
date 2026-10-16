import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 30;

/**
 * POST /api/photos/[id]/recalibrate
 *
 * Recalcula o score biométrico de uma foto individual usando a rede neural local.
 * Permitido para o proprietário do animal ou Administradores.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { id } = await params;
    const photo = await prisma.photo.findUnique({
      where: { id },
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
    });

    return NextResponse.json({
      success: true,
      message: `Score recalculado com sucesso: ${analysis.score}%`,
      photoId: photo.id,
      oldScore: photo.score,
      newScore: updated.score,
      analysis,
    });
  } catch (error) {
    console.error("[POST /api/photos/[id]/recalibrate] Erro:", error);
    return NextResponse.json(
      { error: "Falha ao recalcular score da foto" },
      { status: 500 }
    );
  }
}
