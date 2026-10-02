import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { detectRearScore } from "@/lib/ai";
import { put } from "@vercel/blob";

function safeJpegName(tag: string) {
  const slug = tag.replace(/[^A-Z0-9\-_.]/gi, "_");
  return `${slug}_${Date.now()}.jpg`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const animalId = String(formData.get("animalId") ?? "");
    const view = String(formData.get("view") ?? "REAR").toUpperCase() === "REAR" ? "REAR" : "REAR";

    if (!(file instanceof File) || !animalId) {
      return NextResponse.json({ error: "Arquivo ou animal ausente." }, { status: 400 });
    }

    if (file.size < 20_000) {
      return NextResponse.json({ error: "Foto pequena demais para o dataset de ICC." }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo maior que 12 MB." }, { status: 400 });
    }

    const animal = await prisma.animal.findUnique({ where: { id: animalId } });
    if (!animal || animal.ownerId !== Number(session.user.id)) {
      return NextResponse.json({ error: "Proibido" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Execute AI Model!
    const aiScore = await detectRearScore(buffer);

    if (aiScore === null || aiScore < 40.0) {
      return NextResponse.json(
        { error: `Foto rejeitada. A IA não identificou uma traseira bovina com confiança suficiente (${aiScore ?? 0}%).` },
        { status: 400 }
      );
    }

    const filename = safeJpegName(animal.tag);
    
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType: 'image/jpeg',
    });

    const photo = await prisma.photo.create({
      data: {
        animalId,
        filePath: blob.url,
        view,
        score: aiScore,
      },
    });

    await prisma.animal.update({ where: { id: animalId }, data: { updatedAt: new Date() } });

    return NextResponse.json({ success: true, photo, score: aiScore }, { status: 201 });
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
  }
}

