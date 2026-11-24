/**
 * API Unificada de Rebanho, Custódia, Saúde, Localização e Observações (`src/app/api/animals/[[...slug]]/route.ts`).
 *
 * Consolida todas as rotas `/api/animals/*` em uma única Serverless Function
 * (compatível com o plano Hobby da Vercel).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isValidTag, normalizeTag, parseOptionalCoordinate } from "@/lib/animal";
import {
  addCollaborator,
  canAccessAnimal,
  getAccessibleAnimalIds,
  getCustodyDetails,
  removeCollaborator,
  transferOwnership,
} from "@/lib/custody";
import { readPhotoBuffer, deleteStoredFile } from "@/lib/storage";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const photoMetadataSelect = {
  id: true,
  animalId: true,
  view: true,
  score: true,
  createdAt: true,
} as const;

const VALID_DISEASE_STATUSES = new Set(["ACTIVE", "MONITORING", "RECOVERED"]);
const VALID_OBSERVATION_CATEGORIES = new Set([
  "GERAL",
  "MANEJO",
  "NUTRICAO",
  "COMPORTAMENTO",
  "OUTRA",
]);

function parseDateOrThrow(raw: unknown, fieldLabel: string): Date {
  const parsed = raw ? new Date(String(raw)) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Data inválida para ${fieldLabel}.`);
  }
  return parsed;
}

async function assertAnimalAccess(
  animalId: string,
  userId: number,
  isAdmin: boolean
): Promise<{ id: string; ownerId: number; tag: string; location: string }> {
  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { id: true, ownerId: true, tag: true, location: true },
  });
  if (!animal) {
    throw Object.assign(new Error("Animal não encontrado."), { status: 404 });
  }
  const hasAccess = await canAccessAnimal(animal.id, animal.ownerId, userId, isAdmin);
  if (!hasAccess) {
    throw Object.assign(new Error("Você não possui permissão para acessar este animal."), {
      status: 403,
    });
  }
  return animal;
}

function jsonError(err: unknown, fallbackStatus = 400) {
  const status =
    typeof (err as { status?: number })?.status === "number"
      ? (err as { status: number }).status
      : fallbackStatus;
  const message = err instanceof Error ? err.message : "Erro ao processar requisição.";
  return NextResponse.json({ error: message }, { status });
}

type Context = { params: Promise<{ slug?: string[] }> };

/* ── GET /api/animals/... ── */
export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const { slug = [] } = await context.params;

  try {
    // 1. GET /api/animals (lista ou busca ?tag=...)
    if (slug.length === 0) {
      const { searchParams } = new URL(request.url);
      const tag = searchParams.get("tag");

      if (tag) {
        const normalized = normalizeTag(tag);
        const animal = await prisma.animal.findFirst({
          where: { tag: normalized },
          include: {
            photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
          },
        });
        if (!animal) {
          return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
        }
        const hasAccess = await canAccessAnimal(animal.id, animal.ownerId, userId, isAdmin);
        if (!hasAccess) {
          return NextResponse.json(
            {
              error:
                "Animal já cadastrado por outro produtor. Conecte o leitor RFID para ingressar na guarda compartilhada.",
              requiresScan: true,
              tag: normalized,
            },
            { status: 403 }
          );
        }
        const custody = await getCustodyDetails(animal.id, animal.ownerId, userId, isAdmin);
        return NextResponse.json({
          ...animal,
          isOwner: animal.ownerId === userId,
          isShared: animal.ownerId !== userId,
          custody,
        });
      }

      const summaryOnly = searchParams.get("summary") === "1";
      const rawLimit = Number(searchParams.get("limit") || "0");
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(200, Math.round(rawLimit))
          : undefined;

      const animals = await prisma.animal
        .findMany({
          where: isAdmin
            ? {}
            : { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] },
          include: {
            photos: {
              select: photoMetadataSelect,
              orderBy: { createdAt: "desc" as const },
              ...(summaryOnly ? { take: 1 } : {}),
            },
            ...(summaryOnly ? { _count: { select: { photos: true } } } : {}),
          },
          orderBy: { createdAt: "desc" },
          ...(limit ? { take: limit } : {}),
        })
        .catch(async () =>
          prisma.animal.findMany({
            where: isAdmin ? {} : { ownerId: userId },
            include: {
              photos: {
                select: photoMetadataSelect,
                orderBy: { createdAt: "desc" as const },
                ...(summaryOnly ? { take: 1 } : {}),
              },
              ...(summaryOnly ? { _count: { select: { photos: true } } } : {}),
            },
            orderBy: { createdAt: "desc" },
            ...(limit ? { take: limit } : {}),
          })
        );

      return NextResponse.json(
        animals.map((a) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const count = (a as any)._count?.photos ?? a.photos?.length ?? 0;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
          const { _count, ...rest } = a as any;
          return {
            ...rest,
            photoCount: count,
            isOwner: a.ownerId === userId,
            isShared: a.ownerId !== userId,
          };
        })
      );
    }

    // 2. GET /api/animals/[id]
    if (slug.length === 1 && slug[0] !== "recalibrate" && slug[0] !== "rfid-scan") {
      const animalId = slug[0];
      const animal = await prisma.animal.findUnique({
        where: { id: animalId },
        include: {
          photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
          vaccines: { orderBy: { appliedAt: "desc" } },
          diseases: { orderBy: { diagnosedAt: "desc" } },
          locationLogs: { orderBy: { movedAt: "desc" } },
          observationRecords: { orderBy: { observedAt: "desc" } },
          owner: { select: { id: true, name: true, email: true } },
          collaborators: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!animal) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }

      const isOwner = animal.ownerId === userId;
      const isCollaborator = animal.collaborators.some((c) => c.userId === userId);
      if (!isAdmin && !isOwner && !isCollaborator) {
        return NextResponse.json(
          { error: "Você não possui permissão para visualizar este animal." },
          { status: 403 }
        );
      }

      const ownerInfo = animal.owner || {
        id: animal.ownerId,
        name: "Proprietário",
        email: "proprietario@fazenda.com",
      };

      const collaboratorsList = animal.collaborators.map((r) => ({
        id: r.id,
        animalId: r.animalId,
        userId: r.userId,
        role: r.role,
        createdAt: r.createdAt.toISOString(),
        user: {
          id: r.user.id,
          name: r.user.name || "Operador",
          email: r.user.email || "",
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { owner: _o, collaborators: _c, ...animalBase } = animal;
      return NextResponse.json({
        ...animalBase,
        isOwner,
        isShared: !isOwner,
        custody: {
          isOwner,
          isCollaborator,
          canManage: isOwner || isAdmin,
          owner: ownerInfo,
          collaborators: collaboratorsList,
        },
      });
    }

    // 3. GET /api/animals/[id]/(vaccines|diseases|locations|observations)
    if (slug.length === 2) {
      const [animalId, sub] = slug;
      await assertAnimalAccess(animalId, userId, isAdmin);

      if (sub === "vaccines") {
        return NextResponse.json(
          await prisma.vaccineRecord.findMany({
            where: { animalId },
            orderBy: { appliedAt: "desc" },
          })
        );
      }
      if (sub === "diseases") {
        return NextResponse.json(
          await prisma.diseaseRecord.findMany({
            where: { animalId },
            orderBy: { diagnosedAt: "desc" },
          })
        );
      }
      if (sub === "locations") {
        return NextResponse.json(
          await prisma.animalLocationLog.findMany({
            where: { animalId },
            orderBy: { movedAt: "desc" },
          })
        );
      }
      if (sub === "observations") {
        const category = new URL(request.url).searchParams.get("category")?.trim().toUpperCase();
        return NextResponse.json(
          await prisma.animalObservation.findMany({
            where: {
              animalId,
              ...(category && VALID_OBSERVATION_CATEGORIES.has(category) ? { category } : {}),
            },
            orderBy: { observedAt: "desc" },
          })
        );
      }
    }

    return NextResponse.json({ error: "Rota não encontrada" }, { status: 404 });
  } catch (err) {
    return jsonError(err, 500);
  }
}

/* ── POST /api/animals/... ── */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const { slug = [] } = await context.params;

  try {
    // 1. POST /api/animals/rfid-scan
    if (slug.length === 1 && slug[0] === "rfid-scan") {
      const body = await request.json();
      const rawRfid = normalizeTag(String(body.rfid ?? body.tag ?? ""));
      if (!isValidTag(rawRfid)) {
        return NextResponse.json({ error: "Código RFID inválido ou vazio." }, { status: 400 });
      }

      const animal = await prisma.animal.findFirst({
        where: { tag: rawRfid },
        include: { photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } } },
      });

      if (!animal) {
        return NextResponse.json({
          registered: false,
          rfid: rawRfid,
          message: "Tag RFID não registrada. Prossiga com o cadastro do novo animal.",
        });
      }

      let sharedGranted = false;
      if (animal.ownerId !== userId) {
        const res = await addCollaborator(animal.id, userId);
        sharedGranted = res.added;
      }

      const custody = await getCustodyDetails(animal.id, animal.ownerId, userId, isAdmin);
      return NextResponse.json({
        registered: true,
        animal: {
          ...animal,
          isOwner: animal.ownerId === userId,
          isShared: animal.ownerId !== userId,
          custody,
        },
        sharedGranted,
        isOwner: animal.ownerId === userId,
        message:
          animal.ownerId === userId
            ? "Animal identificado com sucesso (Proprietário Principal)."
            : "Animal identificado! Guarda compartilhada ativada com sucesso.",
      });
    }

    // 2. POST /api/animals/recalibrate
    if (slug.length === 1 && slug[0] === "recalibrate") {
      const { ownedIds, sharedIds } = await getAccessibleAnimalIds(userId, isAdmin);
      const accessibleIds = Array.from(new Set([...ownedIds, ...sharedIds]));
      const whereClause = isAdmin ? {} : { animalId: { in: accessibleIds } };

      const photos = await prisma.photo.findMany({
        where: whereClause,
        include: { animal: { select: { id: true, tag: true } } },
        orderBy: { createdAt: "desc" },
      });

      if (photos.length === 0) {
        return NextResponse.json({
          success: true,
          message: "Nenhuma foto encontrada para recalibração.",
          updatedCount: 0,
          totalCount: 0,
        });
      }

      let updatedCount = 0;
      const affectedAnimalIds = new Set<string>();
      const results: Array<{ id: string; tag?: string; oldScore: number | null; newScore: number }> = [];

      for (const photo of photos) {
        try {
          const photoData = await readPhotoBuffer(photo.filePath);
          if (!photoData?.buffer) continue;
          const analysis = await analyzeRearImage(photoData.buffer);
          await prisma.photo.update({
            where: { id: photo.id },
            data: { score: analysis.score },
          });
          if (photo.animal?.id) affectedAnimalIds.add(photo.animal.id);
          updatedCount++;
          results.push({
            id: photo.id,
            tag: photo.animal?.tag,
            oldScore: photo.score,
            newScore: analysis.score,
          });
        } catch (err) {
          console.warn(`[recalibrate] Erro na foto ${photo.id}:`, err);
        }
      }

      if (affectedAnimalIds.size > 0) {
        await prisma.animal
          .updateMany({
            where: { id: { in: Array.from(affectedAnimalIds) } },
            data: { updatedAt: new Date() },
          })
          .catch(() => {});
      }

      return NextResponse.json({
        success: true,
        updatedCount,
        totalCount: photos.length,
        message: `${updatedCount} de ${photos.length} fotos foram recalculadas com sucesso!`,
        results,
      });
    }

    // 3. POST /api/animals (criação)
    if (slug.length === 0) {
      const body = await request.json();
      const rawTag = normalizeTag(String(body.tag ?? ""));
      const name = body.name ? String(body.name).trim() : "";
      const breed = String(body.breed ?? "Nelore").trim();
      const sex = String(body.sex ?? "Fêmea").trim();
      const weight = Number(body.weight);
      const age = Number(body.age);
      const location = body.location ? String(body.location).trim() : "";
      const locationAddress = body.locationAddress ? String(body.locationAddress).trim() : "";
      const latitude = parseOptionalCoordinate(body.latitude, -90, 90, "Latitude GPS");
      const longitude = parseOptionalCoordinate(body.longitude, -180, 180, "Longitude GPS");
      const observations = body.observations ? String(body.observations).trim() : "";

      let length: number | null = null;
      if (body.length !== undefined && body.length !== null && String(body.length).trim() !== "") {
        length = Number(body.length);
        if (Number.isNaN(length) || length <= 0) {
          return NextResponse.json(
            { error: "Tamanho / comprimento deve ser um número positivo (em cm)." },
            { status: 400 }
          );
        }
      }

      if (!isValidTag(rawTag)) {
        return NextResponse.json(
          { error: "Identificador/Brinco/RFID inválido. Mínimo 2 caracteres." },
          { status: 400 }
        );
      }
      if (Number.isNaN(weight) || weight <= 0) {
        return NextResponse.json({ error: "Peso deve ser um número positivo." }, { status: 400 });
      }
      if (Number.isNaN(age) || age < 0) {
        return NextResponse.json({ error: "Idade deve ser zero ou positiva." }, { status: 400 });
      }

      const existing = await prisma.animal.findFirst({ where: { tag: rawTag } });
      if (existing) {
        if (existing.ownerId === userId) {
          return NextResponse.json(
            { error: "Você já possui um animal cadastrado com este brinco/RFID.", id: existing.id },
            { status: 409 }
          );
        }
        await addCollaborator(existing.id, userId);
        return NextResponse.json(
          {
            error:
              "Este animal já está cadastrado por outro produtor. Você foi adicionado à Guarda Compartilhada deste animal!",
            id: existing.id,
            sharedGranted: true,
          },
          { status: 409 }
        );
      }

      const animal = await prisma.animal.create({
        data: {
          tag: rawTag,
          name,
          breed,
          sex,
          weight,
          age,
          length,
          location,
          locationAddress,
          latitude,
          longitude,
          observations,
          ownerId: userId,
        },
      });

      if (location || locationAddress || (latitude !== null && longitude !== null)) {
        await prisma.animalLocationLog
          .create({
            data: {
              animalId: animal.id,
              location: location || locationAddress || "Fazenda registrada via GPS",
              address: locationAddress,
              latitude,
              longitude,
              reason: "Localização inicial no cadastro",
              movedById: userId,
            },
          })
          .catch(() => {});
      }

      if (observations) {
        const cat = String(body.observationCategory ?? "GERAL")
          .trim()
          .toUpperCase();
        await prisma.animalObservation
          .create({
            data: {
              animalId: animal.id,
              category: VALID_OBSERVATION_CATEGORIES.has(cat) ? cat : "GERAL",
              title: body.observationTitle ? String(body.observationTitle).trim() : "Nota inicial",
              content: observations,
              createdById: userId,
              createdByName: session.user.name || session.user.email || "Operador",
            },
          })
          .catch(() => {});
      }

      return NextResponse.json(animal, { status: 201 });
    }

    // 4. POST /api/animals/[id]/...
    if (slug.length === 2) {
      const [animalId, sub] = slug;

      if (sub === "recalibrate") {
        const animal = await prisma.animal.findUnique({
          where: { id: animalId },
          include: {
            photos: {
              select: { id: true, filePath: true, score: true },
              orderBy: { createdAt: "desc" },
            },
          },
        });
        if (!animal) {
          return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
        }
        const hasAccess = await canAccessAnimal(animal.id, animal.ownerId, userId, isAdmin);
        if (!hasAccess) {
          return NextResponse.json(
            { error: "Você não tem permissão para recalcular as fotos deste animal" },
            { status: 403 }
          );
        }

        let updatedCount = 0;
        const results: Array<{ id: string; oldScore: number | null; newScore: number }> = [];
        for (const photo of animal.photos) {
          try {
            const photoData = await readPhotoBuffer(photo.filePath);
            if (!photoData?.buffer) continue;
            const analysis = await analyzeRearImage(photoData.buffer);
            await prisma.photo.update({
              where: { id: photo.id },
              data: { score: analysis.score },
            });
            updatedCount++;
            results.push({ id: photo.id, oldScore: photo.score, newScore: analysis.score });
          } catch (err) {
            console.warn(`[recalibrate/animal] Erro na foto ${photo.id}:`, err);
          }
        }

        await prisma.animal
          .update({ where: { id: animalId }, data: { updatedAt: new Date() } })
          .catch(() => {});

        return NextResponse.json({
          success: true,
          updatedCount,
          totalCount: animal.photos.length,
          message: `${updatedCount} foto(s) do animal foram recalculadas com sucesso!`,
          results,
        });
      }

      if (sub === "collaborators") {
        const animal = await prisma.animal.findUnique({ where: { id: animalId } });
        if (!animal) return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
        if (animal.ownerId !== userId && !isAdmin) {
          return NextResponse.json(
            { error: "Apenas o proprietário principal pode convidar colaboradores." },
            { status: 403 }
          );
        }
        const body = await request.json();
        let targetUserId = body.userId ? Number(body.userId) : null;
        if (!targetUserId && body.email) {
          const targetUser = await prisma.user.findUnique({
            where: { email: String(body.email).toLowerCase().trim() },
            select: { id: true },
          });
          if (!targetUser) {
            return NextResponse.json(
              { error: "Nenhum usuário com este e-mail foi encontrado." },
              { status: 404 }
            );
          }
          targetUserId = targetUser.id;
        }
        if (!targetUserId) {
          return NextResponse.json(
            { error: "Informe o e-mail ou o ID do usuário colaborador." },
            { status: 400 }
          );
        }
        const res = await addCollaborator(animal.id, targetUserId);
        const custody = await getCustodyDetails(animal.id, animal.ownerId, userId, isAdmin);
        return NextResponse.json({ ...res, custody });
      }

      if (sub === "transfer-ownership") {
        const body = await request.json();
        const newOwnerId = Number(body.newOwnerId);
        if (!newOwnerId || Number.isNaN(newOwnerId)) {
          return NextResponse.json({ error: "ID do novo proprietário inválido." }, { status: 400 });
        }
        const targetUser = await prisma.user.findUnique({ where: { id: newOwnerId } });
        if (!targetUser) {
          return NextResponse.json({ error: "Novo proprietário não encontrado." }, { status: 404 });
        }
        const res = await transferOwnership(animalId, newOwnerId, userId, isAdmin);
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 });
        }
        const custody = await getCustodyDetails(animalId, newOwnerId, userId, isAdmin);
        return NextResponse.json({ ...res, custody });
      }

      await assertAnimalAccess(animalId, userId, isAdmin);
      const body = await request.json();

      if (sub === "vaccines") {
        const name = String(body.name ?? "").trim();
        if (!name) return NextResponse.json({ error: "Informe o nome da vacina." }, { status: 400 });
        const appliedAt = parseDateOrThrow(body.appliedAt || new Date(), "data de aplicação");
        const nextDueAt = body.nextDueAt ? parseDateOrThrow(body.nextDueAt, "próximo reforço") : null;
        const created = await prisma.vaccineRecord.create({
          data: {
            animalId,
            name,
            dose: String(body.dose ?? "").trim(),
            batch: String(body.batch ?? "").trim(),
            appliedAt,
            nextDueAt,
            notes: String(body.notes ?? "").trim(),
            createdById: userId || null,
          },
        });
        return NextResponse.json(created, { status: 201 });
      }

      if (sub === "diseases") {
        const name = String(body.name ?? "").trim();
        if (!name) {
          return NextResponse.json(
            { error: "Informe o nome da enfermidade ou suspeita clínica." },
            { status: 400 }
          );
        }
        const rawStatus = String(body.status ?? "ACTIVE").trim().toUpperCase();
        const status = VALID_DISEASE_STATUSES.has(rawStatus) ? rawStatus : "ACTIVE";
        const diagnosedAt = parseDateOrThrow(body.diagnosedAt || new Date(), "data do diagnóstico");
        const recoveredAt = body.recoveredAt
          ? parseDateOrThrow(body.recoveredAt, "data de recuperação")
          : status === "RECOVERED"
            ? new Date()
            : null;
        const created = await prisma.diseaseRecord.create({
          data: {
            animalId,
            name,
            symptoms: String(body.symptoms ?? "").trim(),
            treatment: String(body.treatment ?? "").trim(),
            status,
            diagnosedAt,
            recoveredAt,
            notes: String(body.notes ?? "").trim(),
            createdById: userId || null,
          },
        });
        return NextResponse.json(created, { status: 201 });
      }

      if (sub === "locations") {
        const location = String(body.location ?? "").trim();
        const address = String(body.address ?? "").trim();
        const latitude = parseOptionalCoordinate(body.latitude, -90, 90, "Latitude GPS");
        const longitude = parseOptionalCoordinate(body.longitude, -180, 180, "Longitude GPS");
        const reason = String(body.reason ?? "").trim() || "Movimentação entre fazendas/propriedades";

        if (!location && !address && (latitude === null || longitude === null)) {
          return NextResponse.json(
            { error: "Informe o nome da fazenda, o endereço ou as coordenadas GPS." },
            { status: 400 }
          );
        }
        const effectiveLocation = location || address || "Localização registrada via GPS";
        const [log] = await prisma.$transaction([
          prisma.animalLocationLog.create({
            data: {
              animalId,
              location: effectiveLocation,
              address,
              latitude,
              longitude,
              reason,
              movedById: userId || null,
            },
          }),
          prisma.animal.update({
            where: { id: animalId },
            data: {
              location: effectiveLocation,
              locationAddress: address,
              latitude,
              longitude,
            },
          }),
        ]);
        return NextResponse.json(log, { status: 201 });
      }

      if (sub === "observations") {
        const content = String(body.content ?? "").trim();
        if (!content) {
          return NextResponse.json(
            { error: "Escreva o conteúdo da observação geral." },
            { status: 400 }
          );
        }
        const rawCat = String(body.category ?? "GERAL").trim().toUpperCase();
        const category = VALID_OBSERVATION_CATEGORIES.has(rawCat) ? rawCat : "GERAL";
        const observedAt = body.observedAt
          ? parseDateOrThrow(body.observedAt, "data da observação")
          : new Date();
        const created = await prisma.animalObservation.create({
          data: {
            animalId,
            category,
            title: String(body.title ?? "").trim(),
            content,
            observedAt,
            createdById: userId || null,
            createdByName: session.user.name || session.user.email || "Operador",
          },
        });
        await prisma.animal
          .update({ where: { id: animalId }, data: { observations: content } })
          .catch(() => {});
        return NextResponse.json(created, { status: 201 });
      }
    }

    return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
  } catch (err) {
    return jsonError(err, 400);
  }
}

/* ── PATCH /api/animals/... ── */
export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const { slug = [] } = await context.params;

  try {
    // 1. PATCH /api/animals/[id]
    if (slug.length === 1 && slug[0] !== "recalibrate") {
      const animalId = slug[0];
      const animal = await prisma.animal.findUnique({ where: { id: animalId } });
      if (!animal) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }
      const hasAccess = await canAccessAnimal(animal.id, animal.ownerId, userId, isAdmin);
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Você não possui permissão para editar este animal." },
          { status: 403 }
        );
      }

      const body = await request.json();
      const updateData: {
        tag?: string;
        name?: string;
        breed?: string;
        sex?: string;
        weight?: number;
        age?: number;
        length?: number | null;
        location?: string;
        locationAddress?: string;
        latitude?: number | null;
        longitude?: number | null;
        observations?: string;
      } = {};

      if (body.tag !== undefined) {
        if (animal.ownerId !== userId && !isAdmin) {
          return NextResponse.json(
            { error: "Apenas o proprietário principal pode alterar o brinco/RFID do animal." },
            { status: 403 }
          );
        }
        const rawTag = normalizeTag(String(body.tag));
        if (!isValidTag(rawTag)) {
          return NextResponse.json({ error: "Brinco/RFID inválido." }, { status: 400 });
        }
        if (rawTag !== animal.tag) {
          const conflict = await prisma.animal.findFirst({
            where: { tag: rawTag, NOT: { id: animalId } },
          });
          if (conflict) {
            return NextResponse.json(
              { error: "Já existe outro animal cadastrado com este identificador." },
              { status: 409 }
            );
          }
        }
        updateData.tag = rawTag;
      }

      if (body.name !== undefined) updateData.name = body.name ? String(body.name).trim() : "";
      if (body.breed !== undefined) updateData.breed = String(body.breed).trim();
      if (body.sex !== undefined) updateData.sex = String(body.sex).trim();
      if (body.weight !== undefined) {
        const w = Number(body.weight);
        if (Number.isNaN(w) || w <= 0) {
          return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
        }
        updateData.weight = w;
      }
      if (body.age !== undefined) {
        const a = Number(body.age);
        if (Number.isNaN(a) || a < 0) {
          return NextResponse.json({ error: "Idade inválida." }, { status: 400 });
        }
        updateData.age = a;
      }
      if (body.length !== undefined) {
        if (body.length === null || String(body.length).trim() === "") {
          updateData.length = null;
        } else {
          const l = Number(body.length);
          if (Number.isNaN(l) || l <= 0) {
            return NextResponse.json({ error: "Tamanho / comprimento inválido." }, { status: 400 });
          }
          updateData.length = l;
        }
      }
      if (body.location !== undefined) updateData.location = String(body.location ?? "").trim();
      if (body.locationAddress !== undefined) {
        updateData.locationAddress = String(body.locationAddress ?? "").trim();
      }
      if (body.latitude !== undefined) {
        updateData.latitude = parseOptionalCoordinate(body.latitude, -90, 90, "Latitude GPS");
      }
      if (body.longitude !== undefined) {
        updateData.longitude = parseOptionalCoordinate(body.longitude, -180, 180, "Longitude GPS");
      }
      if (body.observations !== undefined) {
        updateData.observations = String(body.observations ?? "").trim();
      }

      const updated = await prisma.animal.update({
        where: { id: animalId },
        data: updateData,
        include: {
          photos: { select: photoMetadataSelect, orderBy: { createdAt: "desc" } },
          vaccines: { orderBy: { appliedAt: "desc" } },
          diseases: { orderBy: { diagnosedAt: "desc" } },
          locationLogs: { orderBy: { movedAt: "desc" } },
          observationRecords: { orderBy: { observedAt: "desc" } },
        },
      });

      const locationChanged =
        (updateData.location !== undefined && updateData.location !== animal.location) ||
        (updateData.locationAddress !== undefined &&
          updateData.locationAddress !== animal.locationAddress) ||
        (updateData.latitude !== undefined && updateData.latitude !== animal.latitude) ||
        (updateData.longitude !== undefined && updateData.longitude !== animal.longitude);

      const effectiveLocation = updateData.location ?? animal.location;
      const effectiveAddress = updateData.locationAddress ?? animal.locationAddress;
      const effectiveLat = updateData.latitude !== undefined ? updateData.latitude : animal.latitude;
      const effectiveLng = updateData.longitude !== undefined ? updateData.longitude : animal.longitude;

      if (
        locationChanged &&
        (effectiveLocation || effectiveAddress || (effectiveLat !== null && effectiveLng !== null))
      ) {
        const log = await prisma.animalLocationLog
          .create({
            data: {
              animalId,
              location: effectiveLocation || effectiveAddress || "Localização GPS atualizada",
              address: effectiveAddress,
              latitude: effectiveLat,
              longitude: effectiveLng,
              reason: body.locationReason
                ? String(body.locationReason).trim()
                : "Atualização de fazenda/localização",
              movedById: userId,
            },
          })
          .catch(() => null);
        if (log) {
          updated.locationLogs = [log, ...updated.locationLogs];
        }
      }

      const custody = await getCustodyDetails(updated.id, updated.ownerId, userId, isAdmin);
      return NextResponse.json({
        ...updated,
        isOwner: updated.ownerId === userId,
        isShared: updated.ownerId !== userId,
        custody,
      });
    }

    // 2. PATCH /api/animals/[id]/diseases/[diseaseId] OR observations/[obsId]
    if (slug.length === 3) {
      const [animalId, sub, recordId] = slug;
      await assertAnimalAccess(animalId, userId, isAdmin);
      const body = await request.json();

      if (sub === "diseases") {
        const existing = await prisma.diseaseRecord.findFirst({
          where: { id: recordId, animalId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Registro de doença não encontrado." }, { status: 404 });
        }
        const data: Record<string, unknown> = {};
        if (body.name !== undefined) {
          const nextName = String(body.name).trim();
          if (!nextName) return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
          data.name = nextName;
        }
        if (body.symptoms !== undefined) data.symptoms = String(body.symptoms).trim();
        if (body.treatment !== undefined) data.treatment = String(body.treatment).trim();
        if (body.notes !== undefined) data.notes = String(body.notes).trim();
        if (body.diagnosedAt !== undefined) {
          data.diagnosedAt = parseDateOrThrow(body.diagnosedAt, "data do diagnóstico");
        }
        if (body.status !== undefined) {
          const nextStatus = String(body.status).trim().toUpperCase();
          if (!VALID_DISEASE_STATUSES.has(nextStatus)) {
            return NextResponse.json({ error: "Status clínico inválido." }, { status: 400 });
          }
          data.status = nextStatus;
          if (nextStatus === "RECOVERED" && body.recoveredAt === undefined && !existing.recoveredAt) {
            data.recoveredAt = new Date();
          } else if (nextStatus !== "RECOVERED" && body.recoveredAt === undefined) {
            data.recoveredAt = null;
          }
        }
        if (body.recoveredAt !== undefined) {
          data.recoveredAt = body.recoveredAt
            ? parseDateOrThrow(body.recoveredAt, "data de recuperação")
            : null;
        }
        return NextResponse.json(
          await prisma.diseaseRecord.update({ where: { id: recordId }, data })
        );
      }

      if (sub === "observations") {
        const existing = await prisma.animalObservation.findFirst({
          where: { id: recordId, animalId },
        });
        if (!existing) {
          return NextResponse.json({ error: "Observação não encontrada." }, { status: 404 });
        }
        const data: Record<string, unknown> = {};
        if (body.category !== undefined) {
          const rawCat = String(body.category).trim().toUpperCase();
          data.category = VALID_OBSERVATION_CATEGORIES.has(rawCat) ? rawCat : "GERAL";
        }
        if (body.title !== undefined) data.title = String(body.title).trim();
        if (body.content !== undefined) {
          const nextContent = String(body.content).trim();
          if (!nextContent) {
            return NextResponse.json({ error: "Conteúdo não pode ficar vazio." }, { status: 400 });
          }
          data.content = nextContent;
        }
        if (body.observedAt !== undefined) {
          data.observedAt = parseDateOrThrow(body.observedAt, "data da observação");
        }
        return NextResponse.json(
          await prisma.animalObservation.update({ where: { id: recordId }, data })
        );
      }
    }

    return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
  } catch (err) {
    return jsonError(err, 400);
  }
}

/* ── DELETE /api/animals/... ── */
export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = Number(session.user.id);
  const isAdmin = session.user.role === "ADMIN";
  const { slug = [] } = await context.params;

  try {
    // 1. DELETE /api/animals/[id]
    if (slug.length === 1 && slug[0] !== "recalibrate") {
      const animalId = slug[0];
      const animal = await prisma.animal.findUnique({
        where: { id: animalId },
        include: { photos: { select: { id: true, filePath: true } } },
      });

      if (!animal) {
        return NextResponse.json({ error: "Animal não encontrado" }, { status: 404 });
      }
      if (animal.ownerId !== userId && !isAdmin) {
        return NextResponse.json(
          { error: "Apenas o proprietário principal pode excluir este animal do sistema." },
          { status: 403 }
        );
      }

      await Promise.allSettled(animal.photos.map((photo) => deleteStoredFile(photo.filePath)));
      await prisma.photo.deleteMany({ where: { animalId } });
      await prisma.animal.delete({ where: { id: animalId } });

      return NextResponse.json({ ok: true, message: "Animal excluído com sucesso." });
    }

    // 2. DELETE /api/animals/[id]/(collaborators|vaccines|diseases|observations)/[recordId]
    if (slug.length === 3) {
      const [animalId, sub, targetId] = slug;

      if (sub === "collaborators") {
        const targetUserId = Number(targetId);
        if (!targetUserId || Number.isNaN(targetUserId)) {
          return NextResponse.json({ error: "ID do colaborador inválido." }, { status: 400 });
        }
        const res = await removeCollaborator(animalId, targetUserId, userId, isAdmin);
        if (!res.success) {
          return NextResponse.json({ error: res.message }, { status: 400 });
        }
        const updatedAnimal = await prisma.animal.findUnique({
          where: { id: animalId },
          select: { ownerId: true },
        });
        const custody = await getCustodyDetails(
          animalId,
          updatedAnimal?.ownerId ?? userId,
          userId,
          isAdmin
        );
        return NextResponse.json({ ...res, custody });
      }

      await assertAnimalAccess(animalId, userId, isAdmin);

      if (sub === "vaccines") {
        const record = await prisma.vaccineRecord.findFirst({ where: { id: targetId, animalId } });
        if (!record) {
          return NextResponse.json({ error: "Registro de vacina não encontrado." }, { status: 404 });
        }
        await prisma.vaccineRecord.delete({ where: { id: targetId } });
        return NextResponse.json({ ok: true, message: "Registro de vacina excluído." });
      }

      if (sub === "diseases") {
        const record = await prisma.diseaseRecord.findFirst({ where: { id: targetId, animalId } });
        if (!record) {
          return NextResponse.json({ error: "Registro de doença não encontrado." }, { status: 404 });
        }
        await prisma.diseaseRecord.delete({ where: { id: targetId } });
        return NextResponse.json({ ok: true, message: "Registro de doença excluído." });
      }

      if (sub === "observations") {
        const record = await prisma.animalObservation.findFirst({
          where: { id: targetId, animalId },
        });
        if (!record) {
          return NextResponse.json({ error: "Observação não encontrada." }, { status: 404 });
        }
        await prisma.animalObservation.delete({ where: { id: targetId } });
        return NextResponse.json({ ok: true, message: "Observação removida." });
      }
    }

    return NextResponse.json({ error: "Subrota não encontrada" }, { status: 404 });
  } catch (err) {
    return jsonError(err, 500);
  }
}
