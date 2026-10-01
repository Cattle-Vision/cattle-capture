'use client';

/**
 * PhotoLightbox — Visualizador fullscreen de fotos.
 *
 * Usa o elemento <dialog> nativo para acessibilidade e foco correto.
 * Suporta swipe/arrasto horizontal no mobile via pointer events.
 * Previne scroll do body enquanto aberto.
 *
 * Props:
 *   photos   — lista completa de fotos do animal
 *   initialIndex — índice da foto que abre o lightbox
 *   onClose  — callback para fechar
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Photo, filePathToUrl } from '@/lib/types';

interface PhotoLightboxProps {
  photos: Photo[];
  initialIndex: number;
  onClose: () => void;
}

export default function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Swipe tracking
  const touchStartX = useRef<number | null>(null);

  // Abrir dialog nativo e travar scroll do body
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Fechar ao clicar no backdrop (fora da imagem)
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  // Navegação por teclado
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const prev = useCallback(() => {
    setCurrentIndex(i => (i > 0 ? i - 1 : photos.length - 1));
  }, [photos.length]);

  const next = useCallback(() => {
    setCurrentIndex(i => (i < photos.length - 1 ? i + 1 : 0));
  }, [photos.length]);

  // Suporte a swipe no mobile
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

  const currentPhoto = photos[currentIndex];
  const url = filePathToUrl(currentPhoto.filePath);

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="
        fixed inset-0 m-0 p-0 w-full h-full max-w-none max-h-none
        bg-black/95 backdrop-blur-sm
        flex items-center justify-center
        border-none outline-none
        animate-fade-in
      "
      style={{ padding: 0 }}
    >
      {/* Botão fechar */}
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute top-4 right-4 z-10 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition active:scale-95"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <X className="w-5 h-5" />
      </button>

      {/* Contador */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium z-10"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        {currentIndex + 1} / {photos.length}
      </div>

      {/* Imagem principal */}
      <div className="w-full h-full flex items-center justify-center p-4">
        <img
          key={currentPhoto.id}
          src={url}
          alt={`Foto ${currentIndex + 1}`}
          className="max-w-full max-h-full object-contain animate-scale-in select-none"
          draggable={false}
        />
      </div>

      {/* Botão anterior */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          aria-label="Foto anterior"
          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition active:scale-95 z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Botão próximo */}
      {photos.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          aria-label="Próxima foto"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full transition active:scale-95 z-10"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Dots de navegação */}
      {photos.length > 1 && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10"
          style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {photos.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
              aria-label={`Ir para foto ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-all ${i === currentIndex ? 'bg-white scale-125' : 'bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </dialog>
  );
}
