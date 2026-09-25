import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('auth-token')?.value;

    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const animals = await prisma.animal.findMany({
      where: { ownerId: Number(userId) },
      include: { photos: true },
    });
    return NextResponse.json(animals);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar animais' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get('auth-token')?.value;

    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const data = await request.json();
    const animal = await prisma.animal.create({
      data: {
        breed: data.breed,
        sex: data.sex,
        weight: Number(data.weight),
        age: Number(data.age),
        ownerId: Number(userId),
      },
    });
    return NextResponse.json(animal, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar animal' }, { status: 500 });
  }
}
