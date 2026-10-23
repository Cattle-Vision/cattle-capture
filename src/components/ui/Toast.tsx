'use client';

/**
 * Sistema Unificado de Notificações (Toasts) e Modais de Confirmação/Alerta Internos (`src/components/ui/Toast.tsx`).
 *
 * Arquitetura:
 * - Elimina por completo os popups nativos do navegador (`window.confirm` e `window.alert`),
 *   que bloqueiam a thread da UI e degradam a experiência mobile PWA.
 * - Fornece `toast(message, type)` para notificações não-bloqueantes com auto-dismiss.
 * - Fornece `confirm(options)` retornando uma `Promise<boolean>` resolvida via modal interno.
 * - Fornece `alert(options)` retornando uma `Promise<void>` resolvida quando o usuário clica em fechar/entendi.
 * - Suporte integral ao tema Claro/Escuro (CSS variables), safe-area do iOS e acessibilidade via teclado (Escape).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
  Check,
} from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

export interface AlertOptions {
  title?: string;
  message: string;
  buttonText?: string;
  variant?: 'info' | 'success' | 'danger';
}

interface ModalState {
  type: 'confirm' | 'alert';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  buttonText?: string;
  variant?: 'danger' | 'primary' | 'info' | 'success';
  resolve: (value: boolean) => void;
}

export interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
  alert: (options: string | AlertOptions) => Promise<void>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let _id = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++_id;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirm = useCallback(
    (options: string | ConfirmOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        if (typeof options === 'string') {
          setModalState({
            type: 'confirm',
            title: 'Confirmação',
            message: options,
            confirmText: 'Confirmar',
            cancelText: 'Cancelar',
            variant: 'primary',
            resolve,
          });
        } else {
          setModalState({
            type: 'confirm',
            title: options.title || 'Confirmação',
            message: options.message,
            confirmText: options.confirmText || 'Confirmar',
            cancelText: options.cancelText || 'Cancelar',
            variant: options.variant || 'primary',
            resolve,
          });
        }
      });
    },
    []
  );

  const alert = useCallback(
    (options: string | AlertOptions): Promise<void> => {
      return new Promise((resolve) => {
        const handleResolve = () => resolve();
        if (typeof options === 'string') {
          setModalState({
            type: 'alert',
            title: 'Aviso',
            message: options,
            buttonText: 'Entendi',
            variant: 'info',
            resolve: () => handleResolve(),
          });
        } else {
          setModalState({
            type: 'alert',
            title: options.title || 'Aviso',
            message: options.message,
            buttonText: options.buttonText || 'Entendi',
            variant: options.variant || 'info',
            resolve: () => handleResolve(),
          });
        }
      });
    },
    []
  );

  const handleClose = (value: boolean) => {
    modalState?.resolve(value);
    setModalState(null);
  };

  // Suporte a tecla Escape para fechar modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalState) {
        handleClose(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalState]);

  const typeStyles: Record<ToastType, string> = {
    success: 'bg-emerald-600 border-emerald-500 text-white',
    error: 'bg-red-600 border-red-500 text-white',
    info: 'bg-slate-900 border-slate-700 text-white',
  };

  return (
    <ToastContext.Provider value={{ toast, confirm, alert }}>
      {children}

      {/* Pilha de Toasts Não-Bloqueantes */}
      <div
        className="fixed bottom-16 sm:bottom-4 left-0 right-0 z-50 flex flex-col items-center gap-2 p-3 pointer-events-none"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`
              flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm font-semibold
              shadow-xl backdrop-blur-md pointer-events-auto max-w-sm w-full
              animate-slide-up
              ${typeStyles[t.type]}
            `}
          >
            {t.type === 'success' && <Check className="w-4 h-4 shrink-0 text-emerald-200 stroke-[3]" />}
            {t.type === 'error' && <AlertTriangle className="w-4 h-4 shrink-0 text-red-200 stroke-[2.5]" />}
            {t.type === 'info' && <Info className="w-4 h-4 shrink-0 text-slate-300 stroke-[2.2]" />}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Modal Interno de Confirmação / Alerta (Substitui popups nativos do navegador) */}
      {modalState && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose(false);
          }}
        >
          <div className="card shadow-2xl w-full max-w-sm sm:max-w-md overflow-hidden animate-scale-in border border-theme">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${
                    modalState.variant === 'danger'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25'
                      : modalState.variant === 'success'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {modalState.variant === 'danger' ? (
                    <AlertTriangle className="w-5 h-5 stroke-[2.2]" />
                  ) : modalState.variant === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
                  ) : modalState.type === 'confirm' ? (
                    <HelpCircle className="w-5 h-5 stroke-[2.2]" />
                  ) : (
                    <Info className="w-5 h-5 stroke-[2.2]" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-theme-primary leading-tight">
                    {modalState.title || (modalState.type === 'confirm' ? 'Confirmação' : 'Aviso')}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-theme-secondary leading-relaxed whitespace-pre-line">
                    {modalState.message}
                  </p>
                </div>

                <button
                  onClick={() => handleClose(false)}
                  className="p-1 rounded-md text-theme-muted hover:text-theme-primary transition"
                  aria-label="Fechar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 px-5 sm:px-6 py-3.5 bg-theme-surface-2 border-t border-theme">
              {modalState.type === 'confirm' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleClose(false)}
                    className="btn-secondary py-2 px-4 text-xs sm:text-sm min-h-[40px]"
                  >
                    {modalState.cancelText || 'Cancelar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClose(true)}
                    className={`py-2 px-4 text-xs sm:text-sm font-semibold rounded-md min-h-[40px] text-white transition shadow-xs ${
                      modalState.variant === 'danger'
                        ? 'bg-red-600 hover:bg-red-700 active:scale-98'
                        : 'btn-primary'
                    }`}
                  >
                    {modalState.confirmText || 'Confirmar'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => handleClose(true)}
                  className="btn-primary py-2 px-5 text-xs sm:text-sm min-h-[40px]"
                >
                  {modalState.buttonText || 'Entendi'}
                </button>
              )}
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
