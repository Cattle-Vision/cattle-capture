'use client';
import { useEffect, useState } from 'react';
import { getSyncQueue, clearSyncItem } from '@/lib/sync';

export function SyncManager() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      const queue = await getSyncQueue();
      for (const item of queue) {
        try {
          let bodyData: any = item.body;
          if (item.isFormData) {
            bodyData = new FormData();
            bodyData.append('animalId', item.body.animalId);
            bodyData.append('file', new Blob([item.body.file], { type: 'image/jpeg' }), item.body.fileName);
          } else {
            bodyData = JSON.stringify(item.body);
          }

          const res = await fetch(item.url, {
            method: item.method,
            body: bodyData,
            headers: item.isFormData ? {} : { 'Content-Type': 'application/json' },
          });

          if (res.ok) await clearSyncItem(item.id);
        } catch { /* erro em uma requisição, mantem no db */ }
      }
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', () => setIsOnline(false));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', () => setIsOnline(false));
    };
  }, []);

  if (!mounted) return null;

  return !isOnline ? (
    <div className="fixed bottom-4 right-4 bg-amber-500 text-black px-4 py-2 rounded-lg text-sm shadow-xl z-50">
      Trabalhando Offline
    </div>
  ) : null;
}
