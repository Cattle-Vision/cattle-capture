/**
 * Proxy Autenticado e Gerenciamento de Fotos (`GET / DELETE /api/photos/[id]`).
 *
 * Decisão Arquitetural:
 * - O frontend renderiza todas as imagens usando `<img src="/api/photos/[id]">`.
 * - Esta rota valida a sessão do usuário (dono do animal ou `ADMIN`), recupera os bytes
 *   reais através do `readPhotoBuffer` (que autentica via SDK `@vercel/blob` em stores
 *   privados ou decodifica Data URIs do PostgreSQL) e entrega o binário com cache HTTP otimizado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { readPhotoBuffer, deleteStoredFile } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const photo = await prisma.photo
    .findUnique({
      where: { id },
      include: { animal: { select: { ownerId: true, tag: true } } },
    })
    .catch(() => null);

  const isOwner = photo?.animal?.ownerId === Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  if (!photo || (!isOwner && !isAdmin)) {
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }

  try {
    const resolved = await readPhotoBuffer(photo.filePath);
    if (!resolved) {
      return NextResponse.json(
        { error: "Arquivo de imagem indisponível no storage" },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(resolved.buffer), {
      status: 200,
      headers: {
        "Content-Type": resolved.contentType,
        "Content-Length": String(resolved.buffer.byteLength),
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("[/api/photos/[id]] Erro ao servir imagem:", err);
    return NextResponse.json({ error: "Erro ao carregar imagem" }, { status: 502 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({
      where: { id },
      include: { animal: { select: { ownerId: true } } },
    });

    const isOwner = photo && photo.animal.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === "ADMIN";
    if (!photo || (!isOwner && !isAdmin)) {
      return NextResponse.json({ error: "Proibido ou não encontrado" }, { status: 403 });
    }

    await deleteStoredFile(photo.filePath);
    await prisma.photo.delete({ where: { id: photo.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/photos/[id]] Erro ao excluir foto:", err);
    return NextResponse.json({ error: "Erro ao excluir foto" }, { status: 500 });
  }
}
