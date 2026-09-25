import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

// GET /api/admin/animals — todos os animais com dados do dono (somente ADMIN)
export async function GET() {
  try {
    const { role } = await getSession();
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const animals = await prisma.animal.findMany({
      include: {
        owner: { select: { id: true, name: true, email: true } },
        photos: true,
      },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json(animals);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
