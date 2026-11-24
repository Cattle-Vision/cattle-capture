/**
 * Rota de Perfil do Operador Autenticado (`GET` e `PATCH /api/auth/me`).
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const dbUser = Number.isFinite(userId)
    ? await prisma.user
        .findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, role: true, createdAt: true },
        })
        .catch(() => null)
    : null;

  return NextResponse.json({
    user: dbUser
      ? {
          id: String(dbUser.id),
          name: dbUser.name,
          email: dbUser.email,
          role: dbUser.role,
          createdAt: dbUser.createdAt,
        }
      : {
          id: session.user.id,
          name: session.user.name || "Operador",
          email: session.user.email || "",
          role: session.user.role || "USER",
        },
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const nextName = typeof body.name === "string" ? body.name.trim() : undefined;
    const currentPassword =
      typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (nextName !== undefined && nextName.length < 2) {
      return NextResponse.json(
        { error: "Nome deve ter pelo menos 2 caracteres." },
        { status: 400 }
      );
    }
    if (newPassword && newPassword.length < 6) {
      return NextResponse.json(
        { error: "Nova senha deve ter pelo menos 6 caracteres." },
        { status: 400 }
      );
    }

    const userId = Number(session.user.id);
    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }

    const dataToUpdate: { name?: string; password?: string } = {};
    if (nextName !== undefined && nextName !== dbUser.name) {
      dataToUpdate.name = nextName;
    }

    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Informe a senha atual para definir uma nova senha." },
          { status: 400 }
        );
      }
      const validCurrent = await bcrypt.compare(currentPassword, dbUser.password);
      if (!validCurrent) {
        return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
      }
      dataToUpdate.password = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser =
      Object.keys(dataToUpdate).length > 0
        ? await prisma.user.update({
            where: { id: userId },
            data: dataToUpdate,
            select: { id: true, name: true, email: true, role: true, createdAt: true },
          })
        : {
            id: dbUser.id,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            createdAt: dbUser.createdAt,
          };

    return NextResponse.json({
      message: "Perfil atualizado com sucesso.",
      user: {
        id: String(updatedUser.id),
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        createdAt: updatedUser.createdAt,
      },
    });
  } catch (err) {
    console.error("[/api/auth/me] Erro ao atualizar perfil:", err);
    return NextResponse.json({ error: "Erro ao atualizar perfil." }, { status: 500 });
  }
}
