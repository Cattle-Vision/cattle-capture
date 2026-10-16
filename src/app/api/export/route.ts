/**
 * Exportação Completa do Dataset (`GET /api/export`).
 *
 * Responsabilidades:
 * - Exclusivo para usuários com `role === "ADMIN"`.
 * - Recupera todas as fotos do dataset usando `readPhotoBuffer` (compatível com
 *   Vercel Blob Privado, Público e Data URI no PostgreSQL).
 * - Empacota as imagens em `images/<TAG>_<PHOTO_ID>.jpg`, além de gerar:
 *   1. `manifest.json`: metadados estruturados completos para pipelines de IA (YOLO/PyTorch).
 *   2. `dataset.csv`: planilha pronta para análise estatística em Excel, R ou Pandas.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readPhotoBuffer } from "@/lib/storage";
import AdmZip from "adm-zip";

export const maxDuration = 60;

function escapeCsv(val: unknown): string {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
  }

  try {
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
        "captured_at",
        "owner_name",
        "owner_email",
      ].join(","),
    ];

    for (const animal of animals) {
      const safeTag = animal.tag.replace(/[^A-Z0-9\-_.]/gi, "_");
      for (const photo of animal.photos) {
        const filename = `${safeTag}_${photo.id}.jpg`;
        const zipFilePath = `images/${filename}`;

        try {
          const resolved = await readPhotoBuffer(photo.filePath);
          if (resolved?.buffer) {
            zip.addFile(zipFilePath, resolved.buffer);
          }
        } catch (err) {
          console.error("[/api/export] Erro ao ler foto para exportação:", photo.id, err);
        }

        const item = {
          file: zipFilePath,
          photoId: photo.id,
          view: photo.view,
          aiScore: photo.score ?? null,
          capturedAt: photo.createdAt.toISOString(),
          animalId: animal.id,
          tag: animal.tag,
          name: animal.name,
          breed: animal.breed,
          sex: animal.sex,
          weightKg: animal.weight,
          ageMonths: animal.age,
          ownerName: animal.owner.name,
          ownerEmail: animal.owner.email,
        };

        manifest.push(item);
        csvRows.push(
          [
            item.file,
            item.photoId,
            item.animalId,
            item.tag,
            item.name,
            item.breed,
            item.sex,
            item.weightKg,
            item.ageMonths,
            item.view,
            item.aiScore ?? "",
            item.capturedAt,
            item.ownerName,
            item.ownerEmail,
          ]
            .map(escapeCsv)
            .join(",")
        );
      }
    }

    if (manifest.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma foto encontrada no sistema para exportação." },
        { status: 404 }
      );
    }

    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
    zip.addFile("dataset.csv", Buffer.from(csvRows.join("\n"), "utf8"));

    const zipBuffer = new Uint8Array(zip.toBuffer());
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="cattle-bcs-dataset-${new Date().toISOString().slice(0, 10)}.zip"`,
      },
    });
  } catch (err) {
    console.error("[/api/export] Erro ao gerar arquivo ZIP:", err);
    return NextResponse.json({ error: "Erro ao gerar pacote ZIP do dataset" }, { status: 500 });
  }
}
