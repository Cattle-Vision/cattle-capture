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
    const view = "REAR";

    if (!(file instanceof File) || !animalId) {
      return NextResponse.json({ error: "Arquivo ou animal ausente." }, { status: 400 });
    }

    if (file.size < 20_000) {
      return NextResponse.json({ error: "Foto pequena demais (mínimo ~20 KB)." }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "Arquivo maior que 12 MB." }, { status: 400 });
    }

    const animal = await prisma.animal.findUnique({ where: { id: animalId } });
    if (!animal || animal.ownerId !== Number(session.user.id)) {
      return NextResponse.json({ error: "Proibido" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Roda o modelo AI — pode retornar null se o runtime ONNX não estiver disponível
    // neste ambiente serverless. Nesse caso a foto é salva sem score e sem aviso de qualidade.
    const aiScore = await detectRearScore(buffer);

    // Envia para o Vercel Blob Storage
    const filename = safeJpegName(animal.tag);
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "image/jpeg",
    });

    // Sempre salva a foto — o score baixo é apenas um aviso, não um bloqueio
    const photo = await prisma.photo.create({
      data: {
        animalId,
        filePath: blob.url,
        view,
        score: aiScore,
      },
    });

    await prisma.animal.update({ where: { id: animalId }, data: { updatedAt: new Date() } });

    // lowQuality = true quando o modelo rodou e a confiança foi baixa
    const lowQuality = aiScore !== null && aiScore < 40.0;

    return NextResponse.json(
      { success: true, photo, score: aiScore, lowQuality },
      { status: 201 }
    );
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Falha no upload" }, { status: 500 });
  }
}
