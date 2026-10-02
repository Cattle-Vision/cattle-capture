import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import AdmZip from "adm-zip";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  try {
    const animals = await prisma.animal.findMany({
      include: {
        photos: true,
        owner: { select: { name: true, email: true } },
      },
    });

    const zip = new AdmZip();
    const manifest = [];

    for (const animal of animals) {
      for (const photo of animal.photos) {
        const filename = photo.filePath.split('/').pop() || `photo_${photo.id}.jpg`;
        
        try {
          const res = await fetch(photo.filePath);
          if (res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            zip.addFile(`images/${filename}`, Buffer.from(arrayBuffer));
          }
        } catch (err) {
          console.error("Error fetching photo for export:", err);
        }
        
        manifest.push({
          file: `images/${filename}`,
          photoId: photo.id,
          view: photo.view,
          capturedAt: photo.createdAt,
          animalId: animal.id,
          tag: animal.tag,
          name: animal.name,
          breed: animal.breed,
          sex: animal.sex,
          weightKg: animal.weight,
          ageMonths: animal.age,
          owner: animal.owner.email,
        });
      }
    }

    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2)));

    if (manifest.length === 0) {
      return NextResponse.json({ error: "Nenhuma foto encontrada" }, { status: 404 });
    }

    const zipBuffer = new Uint8Array(zip.toBuffer());
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="cattle-bcs-dataset.zip"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Erro ao gerar zip" }, { status: 500 });
  }
}
