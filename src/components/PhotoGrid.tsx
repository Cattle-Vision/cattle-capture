'use client';

/**
 * PhotoGrid — Grade responsiva de capturas do dataset (`src/components/PhotoGrid.tsx`).
 */
import { Trash2, ImageOff, Camera } from 'lucide-react';
import { Photo, getPhotoUrl } from '@/lib/types';
import { AsyncPhoto } from '@/components/AsyncPhoto';

interface PhotoGridProps {
  photos: Photo[];
  onDelete?: (photoId: string) => void;
  onSelect: (photo: Photo, index: number) => void;
}

function PhotoCard({
  photo,
  onDelete,
  onSelect,
  index,
}: {
  photo: Photo;
  onDelete?: (id: string) => void;
  onSelect: (photo: Photo, index: number) => void;
  index: number;
}) {
  const url = getPhotoUrl(photo.id, 480);

  const formattedDate = photo.createdAt
    ? new Date(photo.createdAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const hasScore = typeof photo.score === 'number' && !Number.isNaN(photo.score);
  const isHighScore = hasScore && (photo.score as number) >= 45;

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
      className="relative aspect-[3/4] rounded-[12px] overflow-hidden cursor-pointer select-none group active:scale-[0.99] transition-all bg-theme-surface-2 border border-theme hover:border-emerald-500/60"
    >
      <AsyncPhoto
        src={url}
        alt={`Foto ${index + 1}`}
        loadingLabel="Carregando foto…"
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        fallbackIcon={<ImageOff className="w-7 h-7 text-theme-muted" />}
      />

      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none" />

      {hasScore && (
        <div
          title={`Qualidade do enquadramento: ${Math.round(photo.score as number)}%`}
          className={`absolute top-2.5 left-2.5 z-10 inline-flex items-center px-2 py-0.5 rounded-[7px] text-[10px] font-semibold tabular-nums pointer-events-none ${
            isHighScore ? 'bg-black/70 text-emerald-300' : 'bg-black/70 text-amber-300'
          }`}
        >
          {Math.round(photo.score as number)}%
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(photo.id);
          }}
          aria-label="Excluir foto"
          className="
            absolute top-2.5 right-2.5 z-10 p-1.5 rounded-[8px]
            bg-black/60 hover:bg-red-600 text-white
            opacity-100 sm:opacity-0 sm:group-hover:opacity-100
            transition active:scale-90
          "
          title="Excluir foto"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex items-center justify-between gap-2 pointer-events-none">
        <span className="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[10px] font-semibold bg-black/55 text-white/90">
          {photo.view === 'REAR' ? 'Garupa' : photo.view || 'Captura'}
        </span>

        {formattedDate && (
          <span className="text-[10px] font-medium text-white/85 tabular-nums truncate">
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
      <div className="card-subtle py-10 px-6 flex flex-col items-center justify-center gap-2 text-center">
        <div className="w-10 h-10 rounded-[10px] bg-theme-surface border border-theme flex items-center justify-center text-theme-muted">
          <Camera className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-theme-primary">Nenhuma captura registrada</p>
        <p className="text-xs text-theme-secondary max-w-xs">
          Use a câmera guiada ou envie uma foto da galeria para compor o dataset deste animal.
        </p>
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
