import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, role } = await getSession();
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const animalId = Number(id);
    const animal = await prisma.animal.findUnique({ where: { id: animalId } });
    if (!animal || (animal.ownerId !== Number(userId) && role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    const { name, breed, sex, weight, age } = await request.json();
    const updated = await prisma.animal.update({
      where: { id: animalId },
      data: {
        name: name !== undefined ? name : animal.name,
        breed: breed !== undefined ? breed : animal.breed,
        sex: sex !== undefined ? sex : animal.sex,
        weight: weight !== undefined ? Number(weight) : animal.weight,
        age: age !== undefined ? Number(age) : animal.age,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao atualizar animal' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, role } = await getSession();
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const animalId = Number(id);
    const animal = await prisma.animal.findUnique({
      where: { id: animalId },
      include: { photos: true },
    });
    if (!animal || (animal.ownerId !== Number(userId) && role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
    }

    // Apaga arquivos físicos
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
    for (const photo of animal.photos) {
      const filename = path.basename(photo.filePath);
      const fullPath = path.resolve(uploadDir, filename);
      if (fullPath.startsWith(uploadDir)) {
        try { await fs.unlink(fullPath); } catch { /* ignora */ }
      }
    }

    // Apaga registro (cascade apaga fotos)
    await prisma.animal.delete({ where: { id: animalId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao excluir animal' }, { status: 500 });
  }
}