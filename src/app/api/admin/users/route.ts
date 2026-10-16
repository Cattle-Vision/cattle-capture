import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 *
 * Lista todos os usuários cadastrados na plataforma com contagem de animais
 * e total de fotos capturadas. Exclusivo para usuários com role === "ADMIN".
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    const callerId = Number(session.user.id);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        animals: {
          select: {
            id: true,
            _count: {
              select: { photos: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedUsers = users.map((u) => {
      const animalsCount = u.animals.length;
      const photosCount = u.animals.reduce((acc, a) => acc + a._count.photos, 0);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        animalsCount,
        photosCount,
        isSelf: u.id === callerId,
      };
    });

    return NextResponse.json(formattedUsers);
  } catch (error) {
    console.error("[GET /api/admin/users] Erro:", error);
    return NextResponse.json({ error: "Erro ao listar usuários" }, { status: 500 });
  }
}

/**
 * POST /api/admin/users
 *
 * Permite a um administrador criar diretamente um novo usuário comum ("USER")
 * ou administrador ("ADMIN"), ou promover um e-mail já existente.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 });
    }

    const callerId = Number(session.user.id);
    const body = await req.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").toLowerCase().trim();
    const password = String(body.password || "");
    const targetRole = body.role === "ADMIN" ? "ADMIN" : "USER";

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e e-mail são obrigatórios" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      const updateData: { name: string; role: string; password?: string } = {
        name: name || existing.name,
        role: targetRole,
      };
      if (password && password.length >= 6) {
        updateData.password = await bcrypt.hash(password, 10);
      }

      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return NextResponse.json({
        ...updated,
        animalsCount: 0,
        photosCount: 0,
        isSelf: updated.id === callerId,
        updatedExisting: true,
      });
    }

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: "Para novos usuários, a senha deve ter pelo menos 6 caracteres" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: targetRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      ...created,
      animalsCount: 0,
      photosCount: 0,
      isSelf: created.id === callerId,
    });
  } catch (error) {
    console.error("[POST /api/admin/users] Erro:", error);
    return NextResponse.json({ error: "Erro ao salvar usuário" }, { status: 500 });
  }
}
