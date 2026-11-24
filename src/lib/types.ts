/**
 * Definições Globais de Tipos e Helpers de URL do CattleCapture (`src/lib/types.ts`).
 *
 * Exclusivo para coleta padronizada de imagens e curadoria de dataset zootécnico (sem módulo ICS).
 */

export interface User {
  id: number | string;
  name: string;
  email: string;
  role: "ADMIN" | "USER" | string;
  createdAt?: string;
}

export interface Photo {
  id: string;
  animalId?: string;
  filePath?: string;
  view?: string;
  score?: number | null; // Confiança anatômica do enquadramento (0-100)
  createdAt?: string;
}

export interface VaccineRecord {
  id: string;
  animalId: string;
  name: string;
  dose?: string | null;
  batch?: string | null;
  appliedAt: string;
  nextDueAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export type DiseaseStatus = "ACTIVE" | "MONITORING" | "RECOVERED";

export interface DiseaseRecord {
  id: string;
  animalId: string;
  name: string;
  symptoms?: string | null;
  treatment?: string | null;
  status: DiseaseStatus;
  diagnosedAt: string;
  recoveredAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface AnimalLocationLog {
  id: string;
  animalId: string;
  location: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  reason?: string | null;
  movedAt: string;
  createdAt?: string;
}

export type ObservationCategory =
  | "GERAL"
  | "MANEJO"
  | "NUTRICAO"
  | "COMPORTAMENTO"
  | "OUTRA";

export interface AnimalObservation {
  id: string;
  animalId: string;
  category: ObservationCategory;
  title?: string | null;
  content: string;
  observedAt: string;
  createdById?: number | null;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustodyUser {
  id: number;
  name: string;
  email: string;
}

export interface AnimalCollaboratorRecord {
  id: string;
  animalId: string;
  userId: number;
  role: string;
  createdAt: string;
  user: CustodyUser;
}

export interface CustodyInfo {
  isOwner: boolean;
  isCollaborator: boolean;
  canManage: boolean;
  owner: CustodyUser;
  collaborators: AnimalCollaboratorRecord[];
}

export interface RfidScanResult {
  registered: boolean;
  rfid: string;
  animal?: Animal;
  sharedGranted?: boolean;
  isOwner?: boolean;
  message: string;
}

export interface Animal {
  id: string;
  tag: string;
  name: string;
  breed: string;
  sex: string;
  weight: number;
  age: number;
  length?: number | null;
  location?: string | null;
  locationAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  observations?: string | null;
  ownerId: number;
  vaccines?: VaccineRecord[];
  diseases?: DiseaseRecord[];
  locationLogs?: AnimalLocationLog[];
  observationRecords?: AnimalObservation[];
  isOwner?: boolean;
  isShared?: boolean;
  custody?: CustodyInfo;
  createdAt?: string;
  updatedAt?: string;
  photoCount?: number;
  photos: Photo[];
}

export interface AnimalWithOwner extends Animal {
  owner: {
    name: string;
    email: string;
  };
}

export function getPhotoUrl(photoOrId: Pick<Photo, "id"> | string, width?: number): string {
  const id = typeof photoOrId === "string" ? photoOrId : photoOrId.id;
  const query = width ? `?w=${Math.round(width)}` : "";
  return `/api/photos/${encodeURIComponent(id)}${query}`;
}

export function filePathToUrl(filePathOrId: string, photoId?: string): string {
  if (photoId) {
    return getPhotoUrl(photoId);
  }
  if (!filePathOrId) return "";
  if (filePathOrId.startsWith("data:")) return filePathOrId;
  if (filePathOrId.startsWith("http://") || filePathOrId.startsWith("https://")) {
    return filePathOrId;
  }
  const clean = filePathOrId.replace(/^\//, "");
  return `/api/${clean}`;
}
