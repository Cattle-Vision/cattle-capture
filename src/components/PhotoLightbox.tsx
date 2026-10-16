'use client';

/**
 * PhotoLightbox — Visualizador fullscreen de fotos (`src/components/PhotoLightbox.tsx`).
 *
 * Correção Crítica:
 * - Utiliza `getPhotoUrl(currentPhoto.id)` (`/api/photos/[id]`) em vez da URL raw
 *   do Vercel Blob privado, corrigindo a falha 403 ao ampliar fotos.
 * - Adiciona botão de download individual da imagem e exibição do Score IA.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, Sparkles, Loader2 } from 'lucide-react';
import { Photo, getPhotoUrl } from '@/lib/types';

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onPhotoRecalibrated?: (photoId: string, newScore: number) => void;
}

export default function PhotoLightbox({ photos, initialIndex, onClose, onPhotoRecalibrated }: PhotoLightboxProps) {
  const [localPhotos, setLocalPhotos] = useState<Photo[]>(photos);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [recalibrating, setRecalibrating] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
  }, [photos.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < photos.length - 1 ? i + 1 : 0));
  }, [photos.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, prev, next]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 50) {
      delta < 0 ? next() : prev();
    }
    touchStartX.current = null;
  };

  const currentPhoto = localPhotos[currentIndex];
  if (!currentPhoto) return null;

  const url = getPhotoUrl(currentPhoto.id);
  const hasScore = typeof currentPhoto.score === 'number' && !Number.isNaN(currentPhoto.score);

  const handleRecalibrateCurrent = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (recalibrating || !currentPhoto) return;
    setRecalibrating(true);
    try {
      const res = await fetch(`/api/photos/${currentPhoto.id}/recalibrate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao recalcular');
      const updatedScore = data.newScore;
      setLocalPhotos((prev) =>
        prev.map((p, idx) => (idx === currentIndex ? { ...p, score: updatedScore } : p))
      );
      onPhotoRecalibrated?.(currentPhoto.id, updatedScore);
    } catch (err) {
      console.error(err);
    } finally {
      setRecalibrating(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 m-0 p-0 w-full h-full max-w-none max-h-none bg-slate-950/95 backdrop-blur-md flex items-center justify-center border-none outline-none animate-fade-in"
      style={{ padding: 0 }}
    >
      {/* Top Bar */}
      <div
        className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-white/90 text-sm font-bold bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
            {currentIndex + 1} / {localPhotos.length}
          </span>
          {hasScore && (
            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              Confiança IA: {Math.round(currentPhoto.score as number)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecalibrateCurrent}
            disabled={recalibrating}
            aria-label="Recalcular Score IA"
            className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-full transition active:scale-95 flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
            title="Recalcular Score desta foto com a IA local"
          >
            {recalibrating ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            ) : (
              <Sparkles className="w-4 h-4 text-emerald-400" />
            )}
            <span className="hidden xs:inline">
              {recalibrating ? 'Calculando…' : 'Recalcular'}
            </span>
          </button>
          <a
            href={url}
            download={`cattle_photo_${currentPhoto.id}.jpg`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Baixar imagem"
            className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition active:scale-95"
            title="Baixar imagem"
          >
            <Download className="w-5 h-5" />
          </a>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Imagem principal */}
      <div className="w-full h-full flex items-center justify-center p-4 sm:p-10">
        <img
          key={currentPhoto.id}
          src={url}
          alt={`Foto ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain rounded-lg animate-scale-in select-none shadow-2xl"
          draggable={false}
        />
      </div>

      {/* Botão anterior */}
      {photos.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
          aria-label="Foto anterior"
          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition active:scale-95 z-10 backdrop-blur-sm"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Botão próximo */}
      {photos.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
          aria-label="Próxima foto"
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition active:scale-95 z-10 backdrop-blur-sm"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Dots de navegação */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm"
          style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex(i);
              }}
              aria-label={`Ir para foto ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentIndex ? 'bg-emerald-400 scale-125 w-4' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </dialog>
  );
}
