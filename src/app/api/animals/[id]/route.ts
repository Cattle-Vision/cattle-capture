import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * GET /api/animals/:id
 * Retorna os dados do animal com todas as fotos, apenas para o dono.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const animal = await prisma.animal.findUnique({
      where: { id: Number(id) },
      include: { photos: { orderBy: { createdAt: 'desc' } } },
    });

    if (!animal || animal.ownerId !== Number(session.user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(animal);
  } catch {
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/animals/:id
 * Apaga o animal e todas as suas fotos (arquivos + registros no banco).
 * Apenas o dono do animal pode deletar.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const animal = await prisma.animal.findUnique({
      where: { id: Number(id) },
      include: { photos: true },
    });

    if (!animal) {
      return NextResponse.json({ error: 'Animal não encontrado' }, { status: 404 });
    }

    // Somente o dono pode deletar (ou admin)
    const isOwner = animal.ownerId === Number(session.user.id);
    const isAdmin = session.user.role === 'ADMIN';
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 });
    }

    // Apagar os arquivos físicos de cada foto antes de deletar do banco
    await Promise.allSettled(
      animal.photos.map(async (photo: { filePath: string }) => {
        if (!photo.filePath) return;
        const relative = photo.filePath.replace(/^\//, ''); // remove barra inicial
        // turbopackIgnore comment evita o tracing desnecessário do projeto inteiro
        const absolute = path.join(/*turbopackIgnore: true*/ process.cwd(), 'storage', relative.replace(/^storage[\/\\]?/, ''));
        await fs.unlink(absolute).catch(() => {}); // silencia se não existir
      })
    );

    // onDelete: Cascade no schema apaga as Photos automaticamente
    await prisma.animal.delete({ where: { id: animal.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/animals/:id]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
