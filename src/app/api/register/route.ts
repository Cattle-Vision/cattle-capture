import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password // Idealmente, usar bcrypt no futuro
      }
    });

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao cadastrar usuário' }, { status: 500 });
  }
}
