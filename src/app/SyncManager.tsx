'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSyncQueue, clearSyncItem, SyncQueuePayload } from '@/lib/sync';
import { getApiUrl, getStoredToken, invalidateApiCache } from '@/lib/api';
import { WifiOff, RefreshCw } from 'lucide-react';

export function SyncManager() {
  const [mounted, setMounted] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const q = await getSyncQueue();
      setPendingCount(q.length);
    } catch {
      // ignora
    }
  }, []);

  const flushSyncQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = (await getSyncQueue()) as SyncQueuePayload[];
    setPendingCount(queue.length);
    if (queue.length === 0) return;

    setSyncing(true);
    let syncedAny = false;
    const baseUrl = getApiUrl();

    for (const item of queue) {
      if (item.id === undefined) continue;
      try {
        let bodyData: FormData | string;
        if (item.isFormData) {
          const fd = new FormData();
          const formBody = item.body as {
            animalId: string;
            file: ArrayBuffer;
            fileName: string;
            preScore?: number;
            aiSource?: string;
          };
          fd.append('animalId', formBody.animalId);
          fd.append('view', 'REAR');
          fd.append('file', new Blob([formBody.file], { type: 'image/jpeg' }), formBody.fileName);
          if (typeof formBody.preScore === 'number' && Number.isFinite(formBody.preScore)) {
            fd.append('preScore', String(formBody.preScore));
            fd.append('aiSource', formBody.aiSource || 'yolo-onnx-client');
          }
          bodyData = fd;
        } else {
          bodyData = JSON.stringify(item.body);
        }

        const headers: Record<string, string> = item.isFormData
          ? {}
          : { 'Content-Type': 'application/json' };

        const token = getStoredToken();
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const targetUrl = item.url.startsWith('http')
          ? item.url
          : `${baseUrl}${item.url.startsWith('/') ? item.url : `/${item.url}`}`;

        const res = await fetch(targetUrl, { method: item.method, body: bodyData, headers });
        if (res.ok || res.status === 409) {
          await clearSyncItem(item.id);
          syncedAny = true;
        }
      } catch {
        // Mantém no IndexedDB para retry subsequente
      }
    }

    if (syncedAny) {
      invalidateApiCache('/api/animals');
      invalidateApiCache('/api/admin');
    }

    await refreshPendingCount();
    setSyncing(false);
  }, [refreshPendingCount]);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    void refreshPendingCount();
    if (navigator.onLine) {
      void flushSyncQueue();
    }

    const handleOnline = () => {
      setIsOnline(true);
      void flushSyncQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      void refreshPendingCount();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushSyncQueue, refreshPendingCount]);

  if (!mounted) return null;

  if (!isOnline) {
    return (
      <div className="bg-amber-600 text-white px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          Modo offline ativo — alterações e fotos ({pendingCount} pendente
          {pendingCount === 1 ? '' : 's'}) serão enviadas ao reconectar
        </span>
      </div>
    );
  }

  if (syncing || pendingCount > 0) {
    return (
      <div className="bg-emerald-700 text-white px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold">
        <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${syncing ? 'animate-spin' : ''}`} />
        <span>
          {syncing
            ? `Sincronizando ${pendingCount} registro(s) offline…`
            : `${pendingCount} registro(s) aguardando sincronização`}
        </span>
      </div>
    );
  }

  return null;
}
