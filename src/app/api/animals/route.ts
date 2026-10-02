import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidTag, normalizeTag } from "@/lib/animal";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ownerId = Number(session.user.id);
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  if (tag) {
    const normalized = normalizeTag(tag);
    const animal = await prisma.animal.findFirst({
      where: { ownerId, tag: normalized },
      include: { photos: { orderBy: { createdAt: "desc" } } },
    });
    if (!animal) {
      return NextResponse.json({ error: "Animal não encontrado", tag: normalized }, { status: 404 });
    }
    return NextResponse.json(animal);
  }

  const animals = await prisma.animal.findMany({
    where: { ownerId },
    include: { photos: { select: { id: true, filePath: true, view: true }, orderBy: { createdAt: "desc" } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(animals);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const tag = normalizeTag(String(body.tag ?? ""));
    const name = String(body.name ?? "").trim();
    const breed = String(body.breed ?? "").trim();
    const sex = String(body.sex ?? "").trim();
    const weight = Number(body.weight);
    const age = Number(body.age);

    if (!isValidTag(tag)) {
      return NextResponse.json(
        { error: "Informe um identificador válido (brinco), ex: NEL-0142." },
        { status: 400 }
      );
    }
    if (!breed) {
      return NextResponse.json({ error: "Informe a raça." }, { status: 400 });
    }
    if (sex !== "Macho" && sex !== "Fêmea") {
      return NextResponse.json({ error: "Informe o sexo (Macho ou Fêmea)." }, { status: 400 });
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: "Informe um peso válido em kg." }, { status: 400 });
    }
    if (!Number.isFinite(age) || age < 0) {
      return NextResponse.json({ error: "Informe a idade em meses." }, { status: 400 });
    }

    const ownerId = Number(session.user.id);
    const existing = await prisma.animal.findFirst({ where: { ownerId, tag } });
    if (existing) {
      return NextResponse.json(
        { error: `Já existe um animal com o brinco ${tag}.`, id: existing.id },
        { status: 409 }
      );
    }

    const animal = await prisma.animal.create({
      data: {
        tag,
        name,
        breed,
        sex,
        weight,
        age,
        ownerId,
      },
    });
    return NextResponse.json(animal, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível cadastrar o animal." }, { status: 500 });
  }
}
