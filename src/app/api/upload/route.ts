/**
 * Rota de Upload e Validação de Imagens (`POST /api/upload`).
 *
 * Fluxo de Engenharia (Vercel Serverless Ready):
 * 1. Valida sessão JWT e permissões (proprietário do animal ou `ADMIN`).
 * 2. Extrai o arquivo binário do `FormData` (ou base64 JSON fallback).
 * 3. Otimiza a imagem via `sharp` e persiste através do `storePhotoBuffer`
 *    (Vercel Blob Private -> Vercel Blob Public -> Fallback Data URI PostgreSQL).
 * 4. Executa a inferência de IA (`detectRearScore`) com proteção de timeout (5s)
 *    para jamais estourar o limite de execução da Serverless Function.
 * 5. Registra os metadados no banco de dados e retorna o `photo` sem expor URLs internas.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { detectRearScore } from "@/lib/ai";
import { storePhotoBuffer } from "@/lib/storage";

export const maxDuration = 30;

async function inferScoreWithTimeout(buffer: Buffer, timeoutMs = 5000): Promise<number | null> {
  try {
    return await Promise.race([
      detectRearScore(buffer),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado. Faça login novamente." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const animalId = String(formData.get("animalId") ?? "").trim();
    const view = String(formData.get("view") ?? "REAR").trim().toUpperCase() || "REAR";

    if (!file || typeof (file as Blob).arrayBuffer !== "function" || !animalId) {
      return NextResponse.json(
        { error: "Arquivo de imagem ou identificação do animal ausente." },
        { status: 400 }
      );
    }

    const blobFile = file as Blob;
    if (blobFile.size < 512) {
      return NextResponse.json(
        { error: "Arquivo de imagem inválido ou vazio." },
        { status: 400 }
      );
    }
    if (blobFile.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Arquivo maior que 15 MB. Tente outra imagem." },
        { status: 400 }
      );
    }

    const animal = await prisma.animal.findUnique({ where: { id: animalId } });
    if (!animal) {
      return NextResponse.json({ error: "Animal não encontrado." }, { status: 404 });
    }

    const isOwner = animal.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Você não tem permissão para adicionar fotos a este animal." },
        { status: 403 }
      );
    }

    const rawBuffer = Buffer.from(await blobFile.arrayBuffer());

    // Armazena a imagem otimizada (Vercel Blob ou fallback PostgreSQL)
    const { filePath, optimizedBuffer, storageType } = await storePhotoBuffer(
      animal.tag,
      rawBuffer
    );

    // Avalia score de qualidade com o modelo ONNX (se disponível no ambiente)
    const aiScore = await inferScoreWithTimeout(optimizedBuffer);

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
        lowQuality,
        storageType,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/upload] Erro no processamento do upload:", error);
    const message =
      error instanceof Error ? error.message : "Erro inesperado ao processar imagem";
    return NextResponse.json(
      { error: `Falha ao salvar imagem: ${message}` },
      { status: 500 }
    );
  }
}
