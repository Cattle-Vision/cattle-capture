import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const { id } = await params;
    const photo = await prisma.photo.findUnique({
      where: { id: Number(id) },
      include: { animal: true }
    });

    if (!photo || photo.animal.ownerId !== Number(session.user.id)) {
      return NextResponse.json({ error: 'Proibido ou não encontrado' }, { status: 403 });
    }

    // Apagar o arquivo se existir (remove o prefixo /storage/)
    if (photo.filePath) {
       const relativePath = photo.filePath.replace(/^\/storage\//, '');
       const absolutePath = path.join(process.cwd(), 'storage', relativePath);
       await fs.unlink(absolutePath).catch(() => {});
    }

    await prisma.photo.delete({ where: { id: photo.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao deletar' }, { status: 500 });
  }
}
