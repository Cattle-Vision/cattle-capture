'use client';

/**
 * PhotoGrid — Grade de fotos responsiva com metadados de IA e proxy autenticado (`src/components/PhotoGrid.tsx`).
 *
 * Responsabilidades:
 * - Renderizar fotos usando `getPhotoUrl(photo.id)` (`/api/photos/[id]`), garantindo compatibilidade
 *   total com Vercel Blob Privado, Público e Data URI no PostgreSQL.
 * - Exibir badge de Score IA (confiança do modelo YOLO) e data de captura.
 * - Suportar abertura do Lightbox e exclusão individual com confirmação.
 */

import { useState } from 'react';
import { Trash2, ImageOff, ZoomIn, Sparkles, Calendar } from 'lucide-react';
import { Photo, getPhotoUrl } from '@/lib/types';

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
  const url = getPhotoUrl(photo.id);

  const formattedDate = photo.createdAt
    ? new Date(photo.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const hasScore = typeof photo.score === 'number' && !Number.isNaN(photo.score);
  const isHighScore = hasScore && (photo.score as number) >= 40;

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
      className="relative aspect-[3/4] rounded-2xl overflow-hidden cursor-pointer select-none group active:scale-[0.99] transition-all bg-slate-100 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-emerald-300"
    >
      {/* Skeleton enquanto carrega */}
      {!loaded && !errored && <div className="absolute inset-0 skeleton" />}

      {/* Estado de erro caso o arquivo não exista */}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-1.5 p-3 text-center">
          <ImageOff className="w-7 h-7 text-slate-300" />
          <span className="text-xs font-medium text-slate-400">Imagem indisponível</span>
        </div>
      )}

      {/* Imagem */}
      {!errored && (
        <img
          src={url}
          alt={`Foto ${index + 1}`}
          loading="lazy"
          className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}

      {/* Gradiente inferior para legibilidade dos metadados */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none" />

      {/* Badge de Score IA no topo esquerdo */}
      {hasScore && (
        <div
          className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold backdrop-blur-md shadow-xs pointer-events-none ${
            isHighScore
              ? 'bg-emerald-500/90 text-white'
              : 'bg-amber-500/90 text-white'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          IA {Math.round(photo.score as number)}%
        </div>
      )}

      {/* Overlay sutil de hover no desktop com ícone de zoom */}
      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="bg-black/65 text-white p-2.5 rounded-full backdrop-blur-sm shadow-lg">
          <ZoomIn className="w-5 h-5" />
        </div>
      </div>

      {/* Botão de delete */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
        aria-label="Apagar foto"
        className="absolute top-2.5 right-2.5 z-10 bg-black/60 hover:bg-red-600 active:bg-red-700 text-white p-2 rounded-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 shadow-lg backdrop-blur-sm cursor-pointer active:scale-90"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Rodapé do Card: Numeração e Data */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-white pointer-events-none">
        <span className="text-xs font-bold tracking-tight">
          Captura #{index + 1}
        </span>
        {formattedDate && (
          <span className="text-[10px] text-white/80 flex items-center gap-1 font-medium">
            <Calendar className="w-2.5 h-2.5" />
            {formattedDate}
          </span>
        )}
      </div>
    </div>
  );
}

export default function PhotoGrid({ photos, onDelete, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="col-span-full py-16 px-4 text-center flex flex-col items-center gap-3 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl">
          📷
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">Nenhuma foto registrada para este animal</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Utilize a câmera guiada ou envie uma imagem da galeria do seu dispositivo para iniciar o dataset.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
