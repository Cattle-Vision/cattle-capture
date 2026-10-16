import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * PATCH /api/admin/users/[id]
 *
 * Altera o cargo (`role`: "USER" | "ADMIN"), nome ou senha de um usuário.
 * Impede que o administrador logado remova seu próprio privilégio de admin.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    const callerId = Number(session.user.id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "ID de usuário inválido" }, { status: 400 });
    }

    const body = await req.json();

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    if (userId === callerId && body.role && body.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Você não pode remover seu próprio privilégio de administrador." },
        { status: 400 }
      );
    }

    const updateData: { role?: string; name?: string; password?: string } = {};
    if (body.role === "ADMIN" || body.role === "USER") {
      updateData.role = body.role;
    }
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.password === "string" && body.password.length >= 6) {
      updateData.password = await bcrypt.hash(body.password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/admin/users/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao atualizar usuário" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Exclui um usuário e seus registros vinculados (Cascade).
 * Impede que o administrador logado exclua a própria conta.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    const { id } = await params;
    const userId = Number(id);
    const callerId = Number(session.user.id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json({ error: "ID de usuário inválido" }, { status: 400 });
    }

    if (userId === callerId) {
      return NextResponse.json(
        { error: "Você não pode excluir sua própria conta de administrador." },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ message: "Usuário removido com sucesso" });
  } catch (error) {
    console.error("[DELETE /api/admin/users/[id]] Erro:", error);
    return NextResponse.json({ error: "Erro ao remover usuário" }, { status: 500 });
  }
}
