import { openDB } from 'idb';

const DB_NAME = 'cattle-capture-db';
const DB_VERSION = 1;

export async function initDB() {
  if (typeof window === 'undefined') return null;
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

export async function enqueueSync(url: string, method: string, body: any, isFormData: boolean = false) {
  const db = await initDB();
  if (!db) return;
  await db.add('syncQueue', { url, method, body, isFormData, createdAt: Date.now() });
}

export async function getSyncQueue() {
  const db = await initDB();
  if (!db) return [];
  return await db.getAll('syncQueue');
}

export async function clearSyncItem(id: number) {
  const db = await initDB();
  if (!db) return;
  await db.delete('syncQueue', id);
}
