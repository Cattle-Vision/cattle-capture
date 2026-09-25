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
      if (!db.objectStoreNames.contains('animalCache')) {
        db.createObjectStore('animalCache', { keyPath: 'id' });
      }
    },
  });
}

// Salva requisição na fila offline
export async function enqueueSync(url: string, method: string, body: any, isFormData: boolean = false) {
  const db = await initDB();
  if (!db) return;
  await db.add('syncQueue', {
    url,
    method,
    body,
    isFormData, // Se for true, body deve ser manipulado para reconstruir o FormData
    createdAt: Date.now()
  });
}

// Obtém fila para sincronizar
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

// Caching de leitura (offline first)
export async function saveToCache(store: 'animalCache', data: any[]) {
  const db = await initDB();
  if (!db) return;
  const tx = db.transaction(store, 'readwrite');
  data.forEach(item => tx.store.put(item));
  await tx.done;
}

export async function getFromCache(store: 'animalCache') {
  const db = await initDB();
  if (!db) return [];
  return await db.getAll(store);
}
