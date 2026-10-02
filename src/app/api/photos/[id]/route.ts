import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { del } from "@vercel/blob";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    await del(photo.filePath);
    await prisma.photo.delete({ where: { id: photo.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao deletar" }, { status: 500 });
  }
}
