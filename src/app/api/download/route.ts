import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'storage', 'uploads');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Caminho não fornecido' }, { status: 400 });
  }

  try {
    // Resolve o caminho absoluto
    const fileName = path.basename(filePath);
    const absolutePath = path.resolve(UPLOAD_DIR, fileName);

    // Proteção contra path traversal
    if (!absolutePath.startsWith(UPLOAD_DIR)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const fileBuffer = await fs.readFile(absolutePath);
    const baseName = path.basename(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${baseName}"`,
        'Content-Type': 'image/jpeg',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }
}