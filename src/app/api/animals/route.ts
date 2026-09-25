import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const animals = await prisma.animal.findMany({
    where: { ownerId: Number(session.user.id) },
    include: { photos: { select: { id: true, filePath: true } } },
    orderBy: { id: 'desc' },
  });
  return NextResponse.json(animals);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { name, breed, sex, weight, age } = await request.json();

  const animal = await prisma.animal.create({
    data: {
      name: name || '',
      breed,
      sex,
      weight: Number(weight),
      age: Number(age),
      ownerId: Number(session.user.id),
    },
  });
  return NextResponse.json(animal, { status: 201 });
}
