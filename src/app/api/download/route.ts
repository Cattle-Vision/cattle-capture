import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');

  if (!filePath) {
    return NextResponse.json({ error: 'Caminho não fornecido' }, { status: 400 });
  }

  try {
    // filePath esperado: /storage/uploads/12345_foto.jpg
    const cleanPath = filePath.replace(/^\//, ''); // Remove a barra inicial se houver
    const absolutePath = path.join(process.cwd(), cleanPath);
    
    const fileBuffer = await fs.readFile(absolutePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${path.basename(absolutePath)}"`,
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
  }
}
