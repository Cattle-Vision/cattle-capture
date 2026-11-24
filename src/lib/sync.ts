import { openDB } from "idb";

const DB_NAME = "cattle-capture-db";
const DB_VERSION = 2;

export interface OfflinePhotoUploadBody {
  file: ArrayBuffer;
  fileName: string;
  animalId: string;
  preScore?: number;
  aiSource?: string;
}

export interface SyncQueuePayload {
  id?: number;
  url: string;
  method: string;
  body: Record<string, unknown> | OfflinePhotoUploadBody;
  isFormData: boolean;
  label?: string;
  createdAt: number;
}

export async function initDB() {
  if (typeof window === "undefined") return null;
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("herdSnapshot")) {
        db.createObjectStore("herdSnapshot", { keyPath: "key" });
      }
    },
  });
}

export async function enqueueSync(
  url: string,
  method: string,
  body: Record<string, unknown> | OfflinePhotoUploadBody,
  isFormData = false,
  label?: string
) {
  const db = await initDB();
  if (!db) return;
  await db.add("syncQueue", {
    url,
    method,
    body,
    isFormData,
    label,
    createdAt: Date.now(),
  });
}

export async function getSyncQueue(): Promise<SyncQueuePayload[]> {
  const db = await initDB();
  if (!db) return [];
  return (await db.getAll("syncQueue")) as SyncQueuePayload[];
}

export async function clearSyncItem(id: number) {
  const db = await initDB();
  if (!db) return;
  await db.delete("syncQueue", id);
}

export async function saveHerdSnapshot<T = unknown>(key: string, data: T): Promise<void> {
  const db = await initDB();
  if (!db) return;
  try {
    await db.put("herdSnapshot", { key, data, updatedAt: Date.now() });
  } catch {
    // Ignora falhas de cota no IndexedDB
  }
}

export async function getHerdSnapshot<T = unknown>(key: string): Promise<T | null> {
  const db = await initDB();
  if (!db) return null;
  try {
    const entry = await db.get("herdSnapshot", key);
    return entry ? (entry.data as T) : null;
  } catch {
    return null;
  }
}
