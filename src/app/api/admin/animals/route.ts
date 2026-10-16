/**
 * Rota de Listagem Administrativa Global (`GET /api/admin/animals`).
 *
 * Responsabilidades:
 * - Exclusivo para `role === "ADMIN"`.
 * - Retorna todos os animais e metadados de fotos (`id`, `view`, `score`, `createdAt`)
 *   junto com os dados do proprietário (`owner.name`, `owner.email`).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const animals = await prisma.animal.findMany({
    include: {
      photos: {
        select: { id: true, animalId: true, view: true, score: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      owner: { select: { name: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(animals);
}
