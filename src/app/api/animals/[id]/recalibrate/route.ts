import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 60;

/**
 * POST /api/animals/[id]/recalibrate
 *
 * Recalcula o score biométrico de todas as fotos de um animal específico usando a rede local.
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
    const animal = await prisma.animal.findUnique({
      where: { id },
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

    const isOwner = animal.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
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
        if (!photoData?.buffer) continue;

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
        console.warn(`[animal recalibrate] Erro ao recalcular foto ${photo.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} foto(s) recalculada(s) com sucesso para o animal ${animal.tag}.`,
      animalId: animal.id,
      tag: animal.tag,
      updatedCount,
      totalCount: animal.photos.length,
      results,
    });
  } catch (error) {
    console.error("[POST /api/animals/[id]/recalibrate] Erro:", error);
    return NextResponse.json(
      { error: "Falha ao recalcular fotos do animal" },
      { status: 500 }
    );
  }
}
