import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const animalId = formData.get('animalId') as string;

    if (!file || !animalId) {
      return NextResponse.json({ error: 'Arquivo e animalId são obrigatórios' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}_${file.name}`;
    
    // Caminho da pasta que será mapeada no Docker (bind mount)
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
    
    // Criar diretório se não existir
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);
    await fs.writeFile(filePath, buffer);

    // Salvar registro no banco
    const photo = await prisma.photo.create({
      data: {
        animalId: Number(animalId),
        filePath: `/storage/uploads/${filename}`, // Caminho relativo para exibição futura se necessário
      }
    });

    return NextResponse.json({ success: true, photo }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro ao fazer upload da imagem' }, { status: 500 });
  }
}
