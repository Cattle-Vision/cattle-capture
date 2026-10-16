'use client';

/**
 * Sistema de Toast e Confirmação compatível com Tema Claro/Escuro (`src/components/ui/Toast.tsx`).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  const handleConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const typeStyles: Record<ToastType, string> = {
    success: 'bg-emerald-600 border-emerald-500',
    error: 'bg-red-600 border-red-500',
    info: 'bg-slate-800 border-slate-700',
  };

  const typeIcons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast Stack */}
      <div
        className="fixed bottom-16 sm:bottom-0 left-0 right-0 z-50 flex flex-col gap-2 p-4 pointer-events-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl border text-white text-sm font-semibold
              shadow-xl backdrop-blur-sm pointer-events-auto max-w-sm w-full
              animate-slide-up
              ${typeStyles[t.type]}
            `}
          >
            <span className="text-base leading-none">{typeIcons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Modal de Confirmação adaptável ao Tema Claro/Escuro */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="card shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="p-6">
              <p className="text-theme-primary text-base font-bold leading-relaxed">
                {confirmState.message}
              </p>
            </div>
            <div className="flex border-t border-theme">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-4 text-sm font-bold text-theme-secondary hover:bg-theme-surface-2 transition"
              >
                Cancelar
              </button>
              <div className="w-px bg-theme-surface-3" />
              <button
                onClick={() => handleConfirm(true)}
                className="flex-1 py-4 text-sm font-bold text-red-500 hover:bg-red-500/10 transition"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve estar dentro de <ToastProvider>');
  return ctx;
}
