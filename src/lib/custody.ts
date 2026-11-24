/**
 * Serviço de Guarda Compartilhada e Custódia (`src/lib/custody.ts`).
 *
 * Permite que múltiplos operadores/pecuaristas acessem um mesmo animal mediante
 * leitura presencial via leitor RFID BLE ou convite do proprietário principal.
 */
import { prisma } from "@/lib/prisma";

export interface CustodyUser {
  id: number;
  name: string;
  email: string;
}

export interface AnimalCollaboratorRecord {
  id: string;
  animalId: string;
  userId: number;
  role: string;
  createdAt: string;
  user: CustodyUser;
}

export interface CustodyInfo {
  isOwner: boolean;
  isCollaborator: boolean;
  canManage: boolean;
  owner: CustodyUser;
  collaborators: AnimalCollaboratorRecord[];
}

let tableEnsured = false;
let ensurePromise: Promise<void> | null = null;

export async function ensureCustodyTable(): Promise<void> {
  if (tableEnsured) return;
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    try {
      const existing = await prisma.$queryRaw<Array<{ reg: string | null }>>`
        SELECT to_regclass('"AnimalCollaborator"')::text AS reg
      `;
      if (existing?.[0]?.reg) {
        tableEnsured = true;
        return;
      }

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AnimalCollaborator" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "animalId" TEXT NOT NULL,
          "userId" INTEGER NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'COLLABORATOR',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AnimalCollaborator_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "AnimalCollaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "AnimalCollaborator_animalId_userId_key" ON "AnimalCollaborator"("animalId", "userId")`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "AnimalCollaborator_userId_idx" ON "AnimalCollaborator"("userId")`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "AnimalCollaborator_animalId_idx" ON "AnimalCollaborator"("animalId")`
      );
      tableEnsured = true;
    } catch (err) {
      console.warn("[custody] ensureCustodyTable warning:", err);
    } finally {
      ensurePromise = null;
    }
  })();

  return ensurePromise;
}

export async function canAccessAnimal(
  animalId: string,
  ownerId: number,
  userId: number,
  isAdmin: boolean
): Promise<boolean> {
  if (isAdmin || ownerId === userId) return true;
  await ensureCustodyTable();
  try {
    const collab = await prisma.animalCollaborator.findUnique({
      where: { animalId_userId: { animalId, userId } },
      select: { id: true },
    });
    return Boolean(collab);
  } catch {
    return false;
  }
}

export async function getAccessibleAnimalIds(
  userId: number,
  isAdmin: boolean
): Promise<{ ownedIds: string[]; sharedIds: string[] }> {
  await ensureCustodyTable();

  if (isAdmin) {
    const all = await prisma.animal.findMany({ select: { id: true } });
    return { ownedIds: all.map((a) => a.id), sharedIds: [] };
  }

  const [owned, sharedRecords] = await Promise.all([
    prisma.animal.findMany({
      where: { ownerId: userId },
      select: { id: true },
    }),
    prisma.animalCollaborator
      .findMany({
        where: { userId },
        select: { animalId: true },
      })
      .catch(() => [] as Array<{ animalId: string }>),
  ]);

  return {
    ownedIds: owned.map((o) => o.id),
    sharedIds: sharedRecords.map((r) => r.animalId),
  };
}

export async function addCollaborator(
  animalId: string,
  userId: number
): Promise<{ added: boolean; message: string }> {
  await ensureCustodyTable();

  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { id: true, ownerId: true },
  });

  if (!animal) {
    return { added: false, message: "Animal não encontrado" };
  }
  if (animal.ownerId === userId) {
    return { added: false, message: "Usuário já é o proprietário principal" };
  }

  try {
    await prisma.animalCollaborator.upsert({
      where: { animalId_userId: { animalId, userId } },
      update: {},
      create: {
        id: `collab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        animalId,
        userId,
        role: "COLLABORATOR",
      },
    });
    return { added: true, message: "Guarda compartilhada ativada com sucesso" };
  } catch (err) {
    console.error("[custody] addCollaborator error:", err);
    return {
      added: false,
      message: err instanceof Error ? err.message : "Erro ao conceder guarda compartilhada",
    };
  }
}

export async function removeCollaborator(
  animalId: string,
  targetUserId: number,
  requestingUserId: number,
  isAdmin: boolean
): Promise<{ success: boolean; message: string }> {
  await ensureCustodyTable();

  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { id: true, ownerId: true },
  });

  if (!animal) {
    return { success: false, message: "Animal não encontrado" };
  }
  if (animal.ownerId !== requestingUserId && !isAdmin) {
    return {
      success: false,
      message: "Apenas o proprietário principal pode revogar acessos",
    };
  }

  try {
    await prisma.animalCollaborator.deleteMany({
      where: { animalId, userId: targetUserId },
    });
    return {
      success: true,
      message: "Acesso de guarda compartilhada revogado com sucesso",
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erro ao remover colaborador",
    };
  }
}

export async function transferOwnership(
  animalId: string,
  newOwnerId: number,
  requestingUserId: number,
  isAdmin: boolean
): Promise<{ success: boolean; message: string }> {
  await ensureCustodyTable();

  const animal = await prisma.animal.findUnique({
    where: { id: animalId },
    select: { id: true, ownerId: true },
  });

  if (!animal) {
    return { success: false, message: "Animal não encontrado" };
  }
  if (animal.ownerId !== requestingUserId && !isAdmin) {
    return {
      success: false,
      message: "Apenas o proprietário principal pode transferir a guarda definitiva",
    };
  }

  const previousOwnerId = animal.ownerId;

  await prisma.animal.update({
    where: { id: animalId },
    data: { ownerId: newOwnerId },
  });

  await prisma.animalCollaborator
    .deleteMany({
      where: { animalId, userId: newOwnerId },
    })
    .catch(() => {});

  await addCollaborator(animalId, previousOwnerId);

  return { success: true, message: "Guarda definitiva transferida com sucesso!" };
}

export async function getCustodyDetails(
  animalId: string,
  ownerId: number,
  currentUserId: number,
  isAdmin: boolean
): Promise<CustodyInfo> {
  await ensureCustodyTable();

  const isOwner = ownerId === currentUserId;
  const canManage = isOwner || isAdmin;

  const [ownerRecord, collabRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, email: true },
    }),
    prisma.animalCollaborator
      .findMany({
        where: { animalId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      })
      .catch(() => []),
  ]);

  const owner: CustodyUser = ownerRecord || {
    id: ownerId,
    name: "Proprietário",
    email: "proprietario@fazenda.com",
  };

  const collaborators: AnimalCollaboratorRecord[] = collabRows.map((r) => ({
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

  const isCollaborator = collaborators.some((c) => c.userId === currentUserId);

  return {
    isOwner,
    isCollaborator,
    canManage,
    owner,
    collaborators,
  };
}
