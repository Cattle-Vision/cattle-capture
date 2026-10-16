/**
 * Rota de Registro de Novos Usuários (`POST /api/auth/register`).
 *
 * Decisão Arquitetural:
 * - Caso o e-mail cadastrado coincida com `ADMIN_EMAIL` definido no `.env`,
 *   atribui automaticamente `role: "ADMIN"`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEnvAdminConfig } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();
    const trimmedName = String(name ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const pwd = String(password ?? "");

    if (!trimmedName || !normalizedEmail || !pwd) {
      return NextResponse.json({ error: "Preencha todos os campos." }, { status: 400 });
    }
    if (pwd.length < 6) {
      return NextResponse.json(
        { error: "A senha precisa ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return NextResponse.json({ error: "Este e-mail já está cadastrado." }, { status: 400 });
    }

    const envAdmin = getEnvAdminConfig();
    const role = normalizedEmail === envAdmin.email ? "ADMIN" : "USER";

    const hashedPassword = await bcrypt.hash(pwd, 10);
    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: normalizedEmail,
        password: hashedPassword,
        role,
      },
    });

    return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
  } catch (err) {
    console.error("[/api/auth/register] Erro ao registrar usuário:", err);
    return NextResponse.json({ error: "Erro interno ao criar conta." }, { status: 500 });
  }
}
