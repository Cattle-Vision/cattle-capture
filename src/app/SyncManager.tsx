'use client';

import { useEffect, useState } from 'react';
import { getSyncQueue, clearSyncItem } from '@/lib/sync';

export function SyncManager() {
  const [isOnline, setIsOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = async () => {
      setIsOnline(true);
      await processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (navigator.onLine) {
       processQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const processQueue = async () => {
    if (syncing) return;
    setSyncing(true);
    
    try {
      const queue = await getSyncQueue();
      if (!queue.length) {
        setSyncing(false);
        return;
      }
      
      console.log(`Sincronizando ${queue.length} itens offline...`);

      for (const item of queue) {
        try {
          let bodyData: any;
          
          if (item.isFormData) {
            bodyData = new FormData();
            bodyData.append('animalId', item.body.animalId);
            // Reconstruir o File/Blob do array buffer
            const blob = new Blob([item.body.file], { type: 'image/jpeg' });
            bodyData.append('file', blob, item.body.fileName);
          } else {
            bodyData = JSON.stringify(item.body);
          }

          const res = await fetch(item.url, {
            method: item.method,
            body: bodyData,
            headers: item.isFormData ? {} : { 'Content-Type': 'application/json' },
          });

          if (res.ok) {
            await clearSyncItem(item.id);
          }
        } catch (err) {
          console.error('Falha ao enviar item offline', err);
          break; // Stop se cair a rede de novo
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  if (!isOnline) {
     return (
       <div style={{ position: 'fixed', bottom: 10, right: 10, background: '#f59e0b', color: '#000', padding: '5px 10px', borderRadius: 4, zIndex: 9999, fontSize: '0.8rem', pointerEvents: 'none' }}>
         Trabalhando Offline
       </div>
     );
  }
  
  if (syncing) {
      return (
       <div style={{ position: 'fixed', bottom: 10, right: 10, background: '#3b82f6', color: '#fff', padding: '5px 10px', borderRadius: 4, zIndex: 9999, fontSize: '0.8rem', pointerEvents: 'none' }}>
         Sincronizando dados...
       </div>
     );
  }

  return null;
}
