import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { deleteStoredFile } from "@/lib/storage";
import { isValidTag, normalizeTag } from "@/lib/animal";

async function canAccess(ownerId: number, session: { user: { id: string; role: string } }) {
  return ownerId === Number(session.user.id) || session.user.role === "ADMIN";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const animal = await prisma.animal.findUnique({
      where: { id },
      include: { photos: { orderBy: { createdAt: "desc" } } },
    });

    if (!animal || !(await canAccess(animal.ownerId, session))) {
      return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
    }

    return NextResponse.json(animal);
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const animal = await prisma.animal.findUnique({ where: { id } });
    if (!animal || !(await canAccess(animal.ownerId, session))) {
      return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.tag != null) {
      const tag = normalizeTag(String(body.tag));
      if (!isValidTag(tag)) {
        return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
      }
      const clash = await prisma.animal.findFirst({
        where: { ownerId: animal.ownerId, tag, NOT: { id } },
      });
      if (clash) {
        return NextResponse.json({ error: `Brinco ${tag} já está em uso.` }, { status: 409 });
      }
      data.tag = tag;
    }
    if (body.name != null) data.name = String(body.name).trim();
    if (body.breed != null) data.breed = String(body.breed).trim();
    if (body.sex === "Macho" || body.sex === "Fêmea") data.sex = body.sex;
    if (body.weight != null) {
      const weight = Number(body.weight);
      if (!Number.isFinite(weight) || weight <= 0) {
        return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
      }
      data.weight = weight;
    }
    if (body.age != null) {
      const age = Number(body.age);
      if (!Number.isFinite(age) || age < 0) {
        return NextResponse.json({ error: "Idade inválida." }, { status: 400 });
      }
      data.age = age;
    }

    const updated = await prisma.animal.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const animal = await prisma.animal.findUnique({
      where: { id },
      include: { photos: true },
    });

    if (!animal) {
      return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
    }

    if (!(await canAccess(animal.ownerId, session))) {
      return NextResponse.json({ error: "Proibido" }, { status: 403 });
    }

    await Promise.allSettled(animal.photos.map((photo) => deleteStoredFile(photo.filePath)));
    await prisma.animal.delete({ where: { id: animal.id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
