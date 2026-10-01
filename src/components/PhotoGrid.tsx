'use client';

/**
 * PhotoGrid — Grade de fotos responsiva com lazy loading.
 *
 * Responsabilidades:
 * - Renderizar fotos usando a URL correta via /api/storage/*
 * - Exibir skeleton durante carregamento de cada imagem
 * - Emitir evento onSelect para abrir o Lightbox
 * - Emitir evento onDelete para a página pai tratar
 *
 * Não faz fetch nem mutação — é puramente visual (controlled component).
 */

import { useState } from 'react';
import { Trash2, ImageOff } from 'lucide-react';
import { Photo, filePathToUrl } from '@/lib/types';

interface PhotoGridProps {
  photos: Photo[];
  onDelete: (photoId: number) => void;
  onSelect: (photo: Photo, index: number) => void;
}

function PhotoCard({
  photo,
  onDelete,
  onSelect,
  index,
}: {
  photo: Photo;
  onDelete: (id: number) => void;
  onSelect: (photo: Photo, index: number) => void;
  index: number;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const url = filePathToUrl(photo.filePath);

  return (
    <div className="relative aspect-[3/4] bg-slate-100 rounded-xl overflow-hidden shadow-sm border border-black/5 group">
      {/* Skeleton enquanto carrega */}
      {!loaded && !errored && (
        <div className="absolute inset-0 skeleton" />
      )}

      {/* Estado de erro */}
      {errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
          <ImageOff className="w-8 h-8" />
        </div>
      )}

      {/* Imagem com lazy loading nativo */}
      {!errored && (
        <img
          src={url}
          alt={`Foto ${index + 1}`}
          loading="lazy"
          className={`w-full h-full object-cover cursor-pointer transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          onClick={() => onSelect(photo, index)}
        />
      )}

      {/* Botão de delete — sempre visível em mobile, hover em desktop */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(photo.id);
        }}
        aria-label="Apagar foto"
        className="
          absolute top-2 right-2
          bg-black/60 hover:bg-red-600
          text-white p-2.5 rounded-full
          opacity-100 sm:opacity-0 sm:group-hover:opacity-100
          transition-all duration-200
          shadow-lg backdrop-blur-sm
          active:scale-95
        "
      >
        <Trash2 className="w-4 h-4" />
      </button>

      {/* Número da foto (overlay sutil) */}
      <div className="absolute bottom-1 left-2 text-white/60 text-xs font-medium select-none pointer-events-none">
        #{index + 1}
      </div>
    </div>
  );
}

export default function PhotoGrid({ photos, onDelete, onSelect }: PhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="col-span-full py-16 text-center text-slate-400 bg-white border border-dashed border-slate-200 rounded-xl flex flex-col items-center gap-3">
        <ImageOff className="w-10 h-10 opacity-40" />
        <p className="text-sm">Nenhuma foto cadastrada ainda.</p>
        <p className="text-xs text-slate-300">Use o botão acima para capturar</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
