"use client";

import React, { useEffect, useState } from "react";
import { Download, Smartphone, X, Check, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt({
  variant = "button",
  className = "",
}: {
  variant?: "button" | "banner" | "icon";
  className?: string;
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  if (isInstalled || (!deferredPrompt && !isIos)) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
        }
      } catch {
        // Ignora cancelamento
      }
      setDeferredPrompt(null);
    } else if (isIos) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      {variant === "icon" && (
        <button
          type="button"
          onClick={handleInstallClick}
          title="Instalar aplicativo"
          aria-label="Instalar aplicativo"
          className={`w-9 h-9 rounded-[10px] border border-theme bg-brand-soft hover:opacity-90 transition inline-flex items-center justify-center touch-manipulation active:scale-95 ${className}`}
        >
          <Smartphone className="w-4 h-4" />
        </button>
      )}

      {variant === "button" && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center justify-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-[10px] border border-theme bg-brand-soft hover:opacity-90 transition active:scale-95 touch-manipulation shrink-0 ${className}`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Instalar App</span>
        </button>
      )}

      {variant === "banner" && (
        <div className={`flex items-center justify-between gap-3 ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-theme-primary">
                Aplicativo no aparelho
              </p>
              <p className="text-[11px] text-theme-secondary">
                Acesso direto da tela inicial e suporte a coletas sem sinal.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Instalar</span>
          </button>
        </div>
      )}

      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="card p-5 max-w-sm w-full relative">
            <button
              onClick={() => setShowIosGuide(false)}
              className="absolute top-3.5 right-3.5 p-1.5 text-theme-muted hover:text-theme-primary rounded-lg"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="w-10 h-10 rounded-[10px] bg-brand-soft text-brand flex items-center justify-center mb-3">
              <Smartphone className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-theme-primary mb-1">
              Instalar CattleCapture no iPhone
            </h3>
            <p className="text-xs text-theme-secondary mb-4 leading-relaxed">
              Adicione à tela inicial para abrir em tela cheia diretamente no curral:
            </p>

            <ol className="text-xs text-theme-primary space-y-2.5 mb-5 card-subtle p-3.5">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Toque em <strong>Compartilhar</strong>{" "}
                  <Share className="w-3.5 h-3.5 inline text-brand mx-0.5" /> na barra do navegador.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Selecione <strong>Adicionar à Tela de Início</strong>.
                </span>
              </li>
            </ol>

            <button
              onClick={() => setShowIosGuide(false)}
              className="btn-primary w-full py-2.5 text-xs"
            >
              <Check className="w-4 h-4" />
              <span>Entendi</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default PwaInstallPrompt;
