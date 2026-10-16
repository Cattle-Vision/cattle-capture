/**
 * Definições Globais de Tipos e Helpers de URL (`src/lib/types.ts`).
 *
 * Decisão Arquitetural:
 * - Todas as imagens no frontend são servidas exclusivamente através do proxy
 *   autenticado `/api/photos/[id]` via `getPhotoUrl(photo.id)`. Isso garante que
 *   URLs privadas do Vercel Blob Storage ou Data URIs salvas no PostgreSQL funcionem
 *   de forma transparente e segura em todos os componentes (`Dashboard`, `Admin`,
 *   `PhotoGrid` e `PhotoLightbox`).
 */
export interface Photo {
  id: string;
  animalId?: string;
  filePath?: string;
  view?: string;
  score?: number | null;
  createdAt?: string;
}

export interface Animal {
  id: string;
  tag: string;
  name: string;
  breed: string;
  sex: string;
  weight: number;
  age: number;
  ownerId: number;
  createdAt?: string;
  updatedAt?: string;
  photos: Photo[];
}

export interface AnimalWithOwner extends Animal {
  owner: {
    name: string;
    email: string;
  };
}

/**
 * Retorna a URL autenticada da rota proxy para renderização segura da foto.
 */
export function getPhotoUrl(photoOrId: Pick<Photo, "id"> | string): string {
  const id = typeof photoOrId === "string" ? photoOrId : photoOrId.id;
  return `/api/photos/${encodeURIComponent(id)}`;
}

/**
 * Mantido para retrocompatibilidade: prioriza o ID da foto quando disponível.
 */
export function filePathToUrl(filePathOrId: string, photoId?: string): string {
  if (photoId) {
    return `/api/photos/${encodeURIComponent(photoId)}`;
  }
  if (!filePathOrId) return "";
  if (filePathOrId.startsWith("data:")) return filePathOrId;
  if (
    filePathOrId.startsWith("http://") ||
    filePathOrId.startsWith("https://")
  ) {
    return filePathOrId;
  }
  const relative = filePathOrId.replace(/^\//, "");
  return `/api/${relative}`;
}
