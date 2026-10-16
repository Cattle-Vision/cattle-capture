/**
 * Rotas de Listagem e Criação de Animais (`GET / POST /api/animals`).
 *
 * Otimizações de Performance:
 * - Não trafega a coluna `filePath` nas listagens JSON (evitando envio desnecessário
 *   de strings longas de Data URI ou exposição de URLs internas do Vercel Blob).
 * - Inclui `score` e `createdAt` nas fotos para exibição rica na UI.
 * - Permite que usuários `ADMIN` busquem qualquer brinco no modo de identificação rápida.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidTag, normalizeTag } from "@/lib/animal";

const photoMetadataSelect = {
  id: true,
  animalId: true,
  view: true,
  score: true,
  createdAt: true,
} as const;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const ownerId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  if (tag) {
    const normalized = normalizeTag(tag);
    // Busca primeiro nos animais do usuário; se for Admin e não achar, busca globalmente
    let animal = await prisma.animal.findFirst({
      where: { ownerId, tag: normalized },
      include: { photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } } },
    });

    if (!animal && isAdmin) {
      animal = await prisma.animal.findFirst({
        where: { tag: normalized },
        include: { photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } } },
      });
    }

    if (!animal) {
      return NextResponse.json(
        { error: "Animal não encontrado", tag: normalized },
        { status: 404 }
      );
    }
    return NextResponse.json(animal);
  }

  const animals = await prisma.animal.findMany({
    where: { ownerId },
    include: {
      photos: {
        select: photoMetadataSelect,
        orderBy: { createdAt: "desc" },
      },
    },
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
      return NextResponse.json({ error: "Informe a raça do animal." }, { status: 400 });
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
      include: {
        photos: { select: photoMetadataSelect },
      },
    });
    return NextResponse.json(animal, { status: 201 });
  } catch (err) {
    console.error("[/api/animals] Erro ao criar animal:", err);
    return NextResponse.json(
      { error: "Não foi possível cadastrar o animal." },
      { status: 500 }
    );
  }
}
