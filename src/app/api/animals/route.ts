import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

// GET /api/animals — lista os animais do usuário logado
export async function GET() {
  try {
    const { userId } = await getSession();
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const animals = await prisma.animal.findMany({
      where: { ownerId: Number(userId) },
      include: { photos: { select: { id: true } } },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json(animals);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao buscar animais' }, { status: 500 });
  }
}

// POST /api/animals — cria novo animal para o usuário logado
export async function POST(request: Request) {
  try {
    const { userId } = await getSession();
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { name, breed, sex, weight, age } = await request.json();
    if (!breed || !sex || !weight || !age) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    const animal = await prisma.animal.create({
      data: {
        name: name || '',
        breed,
        sex,
        weight: Number(weight),
        age: Number(age),
        ownerId: Number(userId),
      },
    });
    return NextResponse.json(animal, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao criar animal' }, { status: 500 });
  }
}
