import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { del } from "@vercel/blob";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/photos/[id]
 * Proxy autenticado: verifica sessão e retorna a imagem do Blob privado.
 * O frontend aponta <img src="/api/photos/[id]"> em vez da URL raw do blob.
 */
export async function GET(
  _request: Request,
  { params }: Params
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { animal: true },
  }).catch(() => null);

  const isOwner = photo?.animal?.ownerId === Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  if (!photo || (!isOwner && !isAdmin)) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  // Faz proxy da imagem do Blob Storage privado para o cliente
  try {
    const imgRes = await fetch(photo.filePath);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Imagem não encontrada no storage" }, { status: 404 });
    }

    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";
    const body = imgRes.body;
    if (!body) return NextResponse.json({ error: "Sem conteúdo" }, { status: 502 });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Erro ao buscar imagem" }, { status: 502 });
  }
}

/**
 * DELETE /api/photos/[id]
 * Remove a foto do Blob Storage e do banco.
 */
export async function DELETE(
  _request: Request,
  { params }: Params
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({
      where: { id },
      include: { animal: true },
    });

    const isOwner = photo && photo.animal.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";
    if (!photo || (!isOwner && !isAdmin)) {
      return NextResponse.json({ error: "Proibido ou não encontrado" }, { status: 403 });
    }

    // Remove do blob storage (ignora se já não existir)
    await del(photo.filePath).catch(() => {});
    await prisma.photo.delete({ where: { id: photo.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
  }
}
