"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

interface AsyncPhotoProps {
  src: string;
  alt: string;
  className?: string;
  containerClassName?: string;
  /** Rótulo exibido durante o carregamento assíncrono no banco/storage */
  loadingLabel?: string;
  /** Versão compacta para miniaturas pequenas (ex.: tabela/lista) */
  compact?: boolean;
  decoding?: "async" | "sync" | "auto";
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  fallbackIcon?: React.ReactNode;
}

/**
 * Renderizador assíncrono de imagens vindas da API/Banco (`/api/photos/[id]`).
 * Mantém a estrutura visual da tela visível instantaneamente enquanto exibe feedback claro
 * de carregamento ("Carregando foto...") até que os bytes cheguem ou falhem.
 */
export function AsyncPhoto({
  src,
  alt,
  className = "h-full w-full object-cover",
  containerClassName = "relative h-full w-full overflow-hidden",
  loadingLabel = "Carregando foto...",
  compact = false,
  decoding = "async",
  loading = "lazy",
  fetchPriority,
  fallbackIcon,
}: AsyncPhotoProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  useEffect(() => {
    const el = imgRef.current;
    // Se já veio do cache HTTP ou browser antes do efeito rodar, exibe imediatamente sem flash de loader
    if (el && el.complete) {
      setStatus(el.naturalWidth > 0 ? "loaded" : "error");
      return;
    }
    setStatus("loading");
  }, [src]);

  return (
    <div className={containerClassName}>
      {status === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-theme-surface-2/95 px-2 text-center"
        >
          <Loader2
            className={`${
              compact ? "h-4 w-4" : "h-5 w-5"
            } animate-spin text-brand`}
          />
          {!compact && (
            <span className="text-[11px] font-medium text-theme-secondary">
              {loadingLabel}
            </span>
          )}
        </div>
      )}

      {status === "error" ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-theme-surface-2 text-theme-muted">
          {fallbackIcon ?? <ImageOff className={compact ? "h-4 w-4" : "h-6 w-6 opacity-60"} />}
          {!compact && <span className="text-[11px] font-medium">Imagem indisponível</span>}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          decoding={decoding}
          loading={loading}
          fetchPriority={fetchPriority}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`${className} transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}
