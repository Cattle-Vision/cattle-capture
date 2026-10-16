import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPhotoBuffer } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 60; // Permite tempo suficiente na Vercel para processar fotos

/**
 * POST /api/admin/recalibrate
 *
 * Recalcula cientificamente o Score IA de todas as fotos armazenadas no banco
 * de dados usando o modelo de detecção calibrado (e não uma inversão artificial).
 * Exclusivo para Administradores.
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    const photos = await prisma.photo.findMany({
      select: {
        id: true,
        filePath: true,
        score: true,
        animal: { select: { tag: true } },
      },
      orderBy: { createdAt: "desc" },
    });

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
        console.warn(`[recalibrate] Erro ao recalcular foto ${photo.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${updatedCount} fotos recalculadas com a IA calibrada com sucesso.`,
      updatedCount,
      totalCount: photos.length,
      results,
    });
  } catch (error) {
    console.error("[POST /api/admin/recalibrate] Erro:", error);
    return NextResponse.json({ error: "Erro ao recalcular scores das fotos" }, { status: 500 });
  }
}
