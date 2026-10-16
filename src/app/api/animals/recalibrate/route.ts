import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 60;

/**
 * POST /api/animals/recalibrate
 *
 * Recalcula o score biométrico de todas as fotos dos animais pertencentes
 * ao usuário logado (ou do rebanho geral se for ADMIN).
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const scopeAll = searchParams.get("all") === "true";

    const isAdmin = session.user.role === "ADMIN";

    const userId = Number(session.user.id);

    // Se for admin e pediu all=true, processa tudo; senão processa apenas os animais do usuário
    const whereClause = isAdmin && scopeAll ? {} : { animal: { ownerId: userId } };

    const photos = await prisma.photo.findMany({
      where: whereClause,
      include: {
        animal: { select: { tag: true } },
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
    const results: Array<{ id: string; tag?: string; oldScore: number | null; newScore: number }> = [];

    for (const photo of photos) {
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
          tag: photo.animal?.tag,
          oldScore: photo.score,
          newScore: analysis.score,
        });
      } catch (err) {
        console.warn(`[recalibrate herd] Erro na foto ${photo.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} foto(s) recalculada(s) com sucesso com o modelo de visão calibrado!`,
      updatedCount,
      totalCount: photos.length,
      results,
    });
  } catch (error) {
    console.error("[POST /api/animals/recalibrate] Erro:", error);
    return NextResponse.json(
      { error: "Falha ao recalcular scores do rebanho" },
      { status: 500 }
    );
  }
}
