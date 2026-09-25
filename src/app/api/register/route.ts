import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password || password.length < 6) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 400 });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hash },
    });

    const cookieStore = await cookies();
    cookieStore.set('auth-token', user.id.toString(), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    cookieStore.set('user-role', user.role, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, role: user.role } }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Erro ao cadastrar usuário' }, { status: 500 });
  }
}
