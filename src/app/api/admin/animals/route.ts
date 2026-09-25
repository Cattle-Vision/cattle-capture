import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const animals = await prisma.animal.findMany({
    include: { 
      photos: { select: { id: true } },
      owner: { select: { name: true, email: true } }
    },
    orderBy: { id: 'desc' },
  });
  
  return NextResponse.json(animals);
}
