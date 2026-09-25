import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const animalId = formData.get('animalId') as string;

    if (!file || !animalId) {
      return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 });
    }

    const animal = await prisma.animal.findUnique({ where: { id: Number(animalId) } });
    if (!animal || animal.ownerId !== Number(session.user.id)) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}_${file.name}`;
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
    
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    const photo = await prisma.photo.create({
      data: {
        animalId: Number(animalId),
        filePath: `/storage/uploads/${filename}`,
      }
    });

    return NextResponse.json({ success: true, photo }, { status: 201 });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
