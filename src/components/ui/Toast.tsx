'use client';

/**
 * Sistema de Toast não-bloqueante para o cattle-capture.
 *
 * Substitui window.alert() e window.confirm() em toda a aplicação.
 * Funciona via Context + Portal — pode ser invocado de qualquer componente.
 *
 * Uso:
 *   const { toast } = useToast();
 *   toast('Foto apagada!', 'success');
 *   toast('Erro ao apagar', 'error');
 *
 *   // Para confirmação (retorna Promise<boolean>):
 *   const ok = await toast.confirm('Tem certeza que quer apagar esta foto?');
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
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
  /** Exibe um toast efêmero (auto-fecha em 3s) */
  toast: (message: string, type?: ToastType) => void;
  /** Exibe um diálogo de confirmação não-bloqueante. Retorna Promise<boolean>. */
  confirm: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, message, type }]);
    // Remove automaticamente após 3.5s
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise(resolve => {
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
    info: 'bg-zinc-800 border-zinc-700',
  };

  const typeIcons: Record<ToastType, string> = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  return (
    <ToastContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast Stack — canto inferior esquerdo, safe-area aware */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col gap-2 p-4 pointer-events-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl border text-white text-sm font-medium
              shadow-xl backdrop-blur-sm pointer-events-auto max-w-sm w-full
              animate-[slideUp_0.25s_ease-out]
              ${typeStyles[t.type]}
            `}
          >
            <span className="text-base leading-none">{typeIcons[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Modal de Confirmação — substitui window.confirm() */}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <p className="text-zinc-800 text-base font-medium leading-relaxed">
                {confirmState.message}
              </p>
            </div>
            <div className="flex border-t border-zinc-100">
              <button
                onClick={() => handleConfirm(false)}
                className="flex-1 py-4 text-sm font-medium text-zinc-500 hover:bg-zinc-50 active:bg-zinc-100 transition"
              >
                Cancelar
              </button>
              <div className="w-px bg-zinc-100" />
              <button
                onClick={() => handleConfirm(true)}
                className="flex-1 py-4 text-sm font-medium text-red-600 hover:bg-red-50 active:bg-red-100 transition"
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
