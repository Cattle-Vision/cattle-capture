import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  try {
    const uploadDir = path.join(process.cwd(), 'storage', 'uploads');
    
    if (!fs.existsSync(uploadDir)) {
      return NextResponse.json({ error: 'Nenhuma foto encontrada' }, { status: 404 });
    }

    const zip = new AdmZip();
    zip.addLocalFolder(uploadDir);
    
    const zipBuffer = zip.toBuffer();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="dataset.zip"'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao gerar zip' }, { status: 500 });
  }
}
