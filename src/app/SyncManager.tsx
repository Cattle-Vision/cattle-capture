'use client';
import { useEffect, useState } from 'react';
import { getSyncQueue, clearSyncItem } from '@/lib/sync';
import { Wifi } from 'lucide-react';

interface SyncItem {
  id: number;
  url: string;
  method: string;
  body: { animalId: string; file: ArrayBuffer; fileName: string } | Record<string, unknown>;
  isFormData: boolean;
}

export function SyncManager() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      const queue = (await getSyncQueue()) as SyncItem[];
      for (const item of queue) {
        try {
          let bodyData: FormData | string;
          if (item.isFormData) {
            const fd = new FormData();
            const formBody = item.body as { animalId: string; file: ArrayBuffer; fileName: string };
            fd.append('animalId', formBody.animalId);
            fd.append('file', new Blob([formBody.file], { type: 'image/jpeg' }), formBody.fileName);
            bodyData = fd;
          } else {
            bodyData = JSON.stringify(item.body);
          }

          const headers: Record<string, string> = item.isFormData
            ? {}
            : { 'Content-Type': 'application/json' };
          const res = await fetch(item.url, { method: item.method, body: bodyData, headers });
          if (res.ok) await clearSyncItem(item.id);
        } catch { /* mantém no db para retry */ }
      }
    };

    window.addEventListener('online', handleOnline);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!mounted) return null;

  // Banner no topo — não conflita com os Toasts no bottom
  return !isOnline ? (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-semibold shadow-md">
      <Wifi className="w-4 h-4" />
      Modo Offline — as fotos serão sincronizadas quando houver conexão
    </div>
  ) : null;
}
