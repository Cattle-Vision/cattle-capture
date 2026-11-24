'use client';

/**
 * PhotoLightbox — Visualizador fullscreen de fotos do dataset (`src/components/PhotoLightbox.tsx`).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download, RefreshCw, Loader2 } from 'lucide-react';
import { Photo, getPhotoUrl } from '@/lib/types';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
  onPhotoRecalibrated?: (photoId: string, newScore: number) => void;
}

export default function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
  onPhotoRecalibrated,
}: PhotoLightboxProps) {
  const [localPhotos, setLocalPhotos] = useState<Photo[]>(photos);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [recalibrating, setRecalibrating] = useState(false);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setLocalPhotos(photos);
  }, [photos]);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete) {
      setImgStatus(el.naturalWidth > 0 ? 'loaded' : 'error');
      return;
    }
    setImgStatus('loading');
  }, [currentIndex, photos]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target === dialogRef.current || e.target === stageRef.current) onClose();
  };

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : localPhotos.length - 1));
  }, [localPhotos.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i < localPhotos.length - 1 ? i + 1 : 0));
  }, [localPhotos.length]);

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
      const data = await apiFetch<any>(`/api/photos/${currentPhoto.id}/recalibrate`, { method: 'POST' });
      const updatedScore =
        typeof data?.newScore === 'number'
          ? data.newScore
          : typeof data?.score === 'number'
          ? data.score
          : data?.photo?.score ?? currentPhoto.score;
      setLocalPhotos((prev) =>
        prev.map((p, idx) => (idx === currentIndex ? { ...p, score: updatedScore } : p))
      );
      onPhotoRecalibrated?.(currentPhoto.id, updatedScore);
    } catch (err: any) {
      toast(err?.message || 'Erro ao reavaliar o enquadramento da foto.', 'error');
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
      className="fixed inset-0 m-0 p-0 w-full h-[100dvh] max-w-none max-h-none bg-[#0D110F]/96 backdrop-blur-md flex flex-col border-none outline-none animate-fade-in overflow-hidden"
      style={{ padding: 0 }}
    >
      <div
        className="relative z-20 shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 bg-black/55 border-b border-white/10"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-white/90 text-xs font-semibold tabular-nums bg-white/10 px-2.5 py-1 rounded-[8px]">
            {currentIndex + 1} / {localPhotos.length}
          </span>

          {hasScore && (
            <span className="inline-flex items-center text-xs font-semibold tabular-nums px-2.5 py-1 rounded-[8px] bg-white/10 text-[#74C69D]">
              Enquadramento {Math.round(currentPhoto.score as number)}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRecalibrateCurrent}
            disabled={recalibrating}
            aria-label="Reavaliar Enquadramento"
            className="bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-[8px] transition active:scale-95 flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50 min-h-[36px]"
            title="Recalcular qualidade do enquadramento"
          >
            {recalibrating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#74C69D]" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-[#74C69D]" />
            )}
            <span className="hidden sm:inline">
              {recalibrating ? 'Calculando…' : 'Enquadramento'}
            </span>
          </button>

          <a
            href={url}
            download={`cattle_capture_${currentPhoto.id}.jpg`}
            onClick={(e) => e.stopPropagation()}
            aria-label="Baixar imagem"
            className="bg-white/10 hover:bg-white/20 text-white w-9 h-9 rounded-[8px] transition active:scale-95 inline-flex items-center justify-center"
            title="Baixar imagem"
          >
            <Download className="w-4 h-4" />
          </a>

          <button
            onClick={onClose}
            aria-label="Fechar"
            className="bg-white/10 hover:bg-white/20 text-white w-9 h-9 rounded-[8px] transition active:scale-95 inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        onClick={handleBackdropClick}
        className="relative flex-1 min-h-0 w-full flex items-center justify-center px-3 py-3 sm:px-14 sm:py-5 overflow-hidden"
      >
        {imgStatus === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Loader2 className="w-7 h-7 animate-spin text-[#74C69D]" />
            <span className="text-xs font-medium text-white/80">Carregando imagem…</span>
          </div>
        )}

        {imgStatus === 'error' ? (
          <div className="flex flex-col items-center gap-2 text-white/70">
            <span className="text-sm font-medium">Não foi possível carregar esta imagem.</span>
          </div>
        ) : (
          <div className="relative flex items-center justify-center max-w-full max-h-full">
            <img
              ref={imgRef}
              key={currentPhoto.id}
              src={url}
              alt={`Foto ${currentIndex + 1}`}
              onLoad={() => setImgStatus('loaded')}
              onError={() => setImgStatus('error')}
              className={`block w-auto h-auto max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-7rem)] max-h-[calc(100dvh-9.5rem)] object-contain rounded-[10px] animate-scale-in select-none shadow-2xl transition-opacity duration-200 ${
                imgStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
              }`}
              draggable={false}
            />
          </div>
        )}

        {localPhotos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            aria-label="Foto anterior"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/80 text-white w-10 h-10 rounded-[10px] transition active:scale-95 z-10 backdrop-blur-sm border border-white/15 inline-flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {localPhotos.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            aria-label="Próxima foto"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-black/55 hover:bg-black/80 text-white w-10 h-10 rounded-[10px] transition active:scale-95 z-10 backdrop-blur-sm border border-white/15 inline-flex items-center justify-center"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {localPhotos.length > 1 && (
        <div
          className="relative z-20 shrink-0 flex flex-col items-center gap-2 px-3 py-2.5 bg-black/55 border-t border-white/10"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex gap-2 bg-black/40 px-3 py-1.5 rounded-full">
            {localPhotos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                aria-label={`Ir para foto ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === currentIndex ? 'bg-[#74C69D] w-5' : 'bg-white/40 w-2'
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
