'use client';

/**
 * PhotoGrid — Grade de fotos responsiva com lazy loading.
 *
 * Responsabilidades:
 * - Renderizar fotos usando a URL correta via /api/storage/*
 * - Card 100% clicável para abrir visualizador Lightbox com cursor: pointer explícito
 * - Emitir evento onDelete com string ID (cuid) para a página pai
 * - Feedback visual de hover e active no mobile e desktop
 */

import { useState } from 'react';
import { Trash2, ImageOff, ZoomIn } from 'lucide-react';
import { Photo, filePathToUrl } from '@/lib/types';

interface PhotoGridProps {
  photos: Photo[];
  onDelete: (photoId: string) => void;
  onSelect: (photo: Photo, index: number) => void;
}

function PhotoCard({
  photo,
  onDelete,
  onSelect,
  index,
}: {
  photo: Photo;
  onDelete: (id: string) => void;
  onSelect: (photo: Photo, index: number) => void;
  index: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = filePathToUrl(photo.filePath);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(photo, index)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(photo, index);
        }
      }}
      aria-label={`Ver foto ${index + 1}`}
      className="
        relative aspect-[3/4] bg-slate-100 rounded-2xl overflow-hidden shadow-sm
        border border-slate-200/80 group cursor-pointer select-none
        hover:shadow-md hover:border-emerald-300 transition-all duration-200
        active:scale-[0.98]
      "
    >
      {/* Skeleton enquanto carrega */}
      {!loaded && !errored && (
        <div className="absolute inset-0 skeleton" />
      )}

      {/* Estado de erro caso o arquivo não exista */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-1 p-2 text-center">
          <ImageOff className="w-7 h-7 text-slate-300" />
          <span className="text-[11px] text-slate-400">Imagem indisponível</span>
        </div>
      )}

      {/* Imagem */}
      {!errored && (
        <img
          src={url}
          alt={`Foto ${index + 1}`}
          loading="lazy"
          className={`
            w-full h-full object-cover transition-all duration-300
            group-hover:scale-105
            ${loaded ? 'opacity-100' : 'opacity-0'}
          `}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}

      {/* Overlay sutil de hover no desktop com ícone de zoom */}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="bg-black/60 text-white p-2 rounded-full backdrop-blur-sm">
          <ZoomIn className="w-5 h-5" />
        </div>
      </div>

      {/* Botão de delete — toque confortável no mobile e hover no desktop */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
        aria-label="Apagar foto"
        className="
          absolute top-2 right-2 z-10
          bg-black/60 hover:bg-red-600 active:bg-red-700
          text-white p-2.5 rounded-full
          opacity-100 sm:opacity-0 sm:group-hover:opacity-100
          transition-all duration-200
          shadow-lg backdrop-blur-sm cursor-pointer
          active:scale-90
        "
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Etiqueta discreta de numeração */}
      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] font-medium px-2 py-0.5 rounded-md backdrop-blur-sm pointer-events-none">
        Foto {index + 1}
      </div>
    </div>
  );
}

export default function PhotoGrid({ photos, onDelete, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="col-span-full py-16 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300">
          <ImageOff className="w-7 h-7" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-600">Nenhuma foto cadastrada ainda</p>
          <p className="text-xs text-slate-400 mt-0.5">Use o botão de captura para registrar a primeira imagem.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
      {photos.map((photo, index) => (
        <PhotoCard
          key={photo.id}
          photo={photo}
          index={index}
          onDelete={onDelete}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
