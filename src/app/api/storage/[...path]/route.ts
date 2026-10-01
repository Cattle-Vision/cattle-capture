import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Serve arquivos da pasta `storage/` com autenticação.
 *
 * Esta route é a solução para o problema crítico de imagens quebradas:
 * o Next.js não serve a pasta `storage/` automaticamente (apenas `public/`),
 * portanto toda URL de imagem salva no banco deve passar por aqui.
 *
 * URL pattern: GET /api/storage/uploads/<filename>
 * → Lê `<cwd>/storage/uploads/<filename>` do disco
 * → Retorna o conteúdo como stream com Content-Type correto
 *
 * Segurança: requer sessão válida antes de qualquer I/O de arquivo.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Auth guard — sem sessão, sem arquivo
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  try {
    const { path: segments } = await params;

    // Reconstruir o caminho relativo a partir dos segmentos da URL
    // Ex: ['uploads', 'foo.jpg'] → 'uploads/foo.jpg'
    const relativePath = segments.join('/');

    // Caminho absoluto na pasta storage/ (fora de public/)
    const absolutePath = path.join(process.cwd(), 'storage', relativePath);

    // Normalizar para prevenir path traversal (ex: ../../etc/passwd)
    const storageRoot = path.join(process.cwd(), 'storage');
    if (!absolutePath.startsWith(storageRoot)) {
      return NextResponse.json({ error: 'Proibido' }, { status: 403 });
    }

    // Ler o arquivo; retorna 404 se não existir
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absolutePath);
    } catch {
      return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 });
    }

    // Inferir Content-Type pela extensão
    const ext = path.extname(relativePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };
    const contentType = contentTypeMap[ext] ?? 'application/octet-stream';

    // Converter para Uint8Array — BodyInit não aceita Buffer diretamente no TS strict
    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        // Cache de 1 hora no browser — as fotos não mudam após o upload
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[storage] Erro ao servir arquivo:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
