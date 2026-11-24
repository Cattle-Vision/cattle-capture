/**
 * Cliente HTTP Same-Origin com SWR Cache e Invalidação (`src/lib/api.ts`)
 *
 * No CattleCapture (monolito Next.js + NextAuth), a autenticação usa cookies HttpOnly
 * gerenciados pelo NextAuth na própria origem (`/api/*`).
 */
import {
  AnimalLocationLog,
  AnimalObservation,
  DiseaseRecord,
  DiseaseStatus,
  ObservationCategory,
  RfidScanResult,
  User,
  VaccineRecord,
} from "./types";

const USER_CACHE_KEY = "cattle_capture_user_cache";
const SESSION_API_CACHE_PREFIX = "cc_api_cache:";

const responseCache = new Map<string, { data: unknown; timestamp: number }>();
const inflightRequests = new Map<string, Promise<unknown>>();

function readSessionApiCache(cleanEndpoint: string): { data: unknown; timestamp: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_API_CACHE_PREFIX}${cleanEndpoint}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: unknown; timestamp: number };
    if (!parsed || typeof parsed.timestamp !== "number") return null;
    responseCache.set(cleanEndpoint, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionApiCache(cleanEndpoint: string, data: unknown, timestamp: number): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify({ data, timestamp });
    if (serialized.length > 450_000) return;
    sessionStorage.setItem(`${SESSION_API_CACHE_PREFIX}${cleanEndpoint}`, serialized);
  } catch {
    // Ignora limite de quota
  }
}

export function invalidateApiCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    if (typeof window !== "undefined") {
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(SESSION_API_CACHE_PREFIX)) {
            sessionStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
    }
    return;
  }
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) {
      responseCache.delete(key);
    }
  }
  if (typeof window !== "undefined") {
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(`${SESSION_API_CACHE_PREFIX}${prefix}`)) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  }
}

export function getCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    return parsed && parsed.id && parsed.email ? parsed : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: User | null): void {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {
    // Ignora quota errors
  }
}

export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    const fullMessage = message.includes(String(status))
      ? message
      : `${message} (${status})`;
    super(fullMessage);
    this.status = status;
    this.data = data;
    this.name = "ApiError";
  }
}

export function getApiUrl(): string {
  return "";
}

export function getStoredToken(): string | null {
  return null;
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(USER_CACHE_KEY);
    invalidateApiCache();
    sessionStorage.removeItem("cc_auth_verified_at");
  } catch {
    // ignore
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: any;
}

export async function apiFetch<T = any>(endpoint: string, options: ApiFetchOptions = {}): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const headers = new Headers(options.headers || {});

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob)) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    body = JSON.stringify(body);
  }

  const response = await fetch(cleanEndpoint, {
    ...options,
    headers,
    body,
  });

  if (!response.ok) {
    let errorDetail = "";
    let errJson: any = null;
    try {
      errJson = await response.json();
      errorDetail = errJson.error || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }

    if (response.status === 401) {
      clearStoredToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { endpoint } }));
      }
    }

    throw new ApiError(
      errorDetail || `Falha na requisição (${response.status} ${response.statusText})`,
      response.status,
      errJson
    );
  }

  const method = (options.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";

  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json")
    ? ((await response.json()) as T)
    : ((await response.text()) as unknown as T);

  if (isMutation) {
    if (cleanEndpoint.startsWith("/api/animals") || cleanEndpoint.startsWith("/api/photos")) {
      invalidateApiCache("/api/animals");
      invalidateApiCache("/api/admin");
    } else if (cleanEndpoint.startsWith("/api/admin")) {
      invalidateApiCache("/api/admin");
      invalidateApiCache("/api/animals");
    }
  }

  return result;
}

export function getApiCacheSnapshot<T = any>(endpoint: string): T | null {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const entry = responseCache.get(cleanEndpoint);
  return entry ? (entry.data as T) : null;
}

export function readPersistedApiCache<T = any>(endpoint: string): T | null {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const entry = responseCache.get(cleanEndpoint) ?? readSessionApiCache(cleanEndpoint);
  return entry ? (entry.data as T) : null;
}

export async function apiFetchCached<T = any>(
  endpoint: string,
  ttlMs = 15_000
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const cached = responseCache.get(cleanEndpoint) ?? readSessionApiCache(cleanEndpoint);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  const inflight = inflightRequests.get(cleanEndpoint);
  if (inflight) {
    return inflight as Promise<T>;
  }

  const promise = apiFetch<T>(cleanEndpoint)
    .then((data) => {
      const now = Date.now();
      responseCache.set(cleanEndpoint, { data, timestamp: now });
      writeSessionApiCache(cleanEndpoint, data, now);
      return data;
    })
    .finally(() => {
      inflightRequests.delete(cleanEndpoint);
    });

  inflightRequests.set(cleanEndpoint, promise);
  return promise;
}

export function prefetchApi(endpoint: string, ttlMs = 15_000): void {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void apiFetchCached(endpoint, ttlMs).catch(() => {});
}

export async function scanRfidTag(rfid: string): Promise<RfidScanResult> {
  return apiFetch<RfidScanResult>("/api/animals/rfid-scan", {
    method: "POST",
    body: { rfid },
  });
}

export async function addCollaborator(
  animalId: string,
  payload: { email?: string; userId?: number }
): Promise<{ added: boolean; message: string; custody?: any }> {
  return apiFetch(`/api/animals/${encodeURIComponent(animalId)}/collaborators`, {
    method: "POST",
    body: payload,
  });
}

export async function removeCollaborator(
  animalId: string,
  targetUserId: number
): Promise<{ success: boolean; message: string; custody?: any }> {
  return apiFetch(
    `/api/animals/${encodeURIComponent(animalId)}/collaborators/${targetUserId}`,
    { method: "DELETE" }
  );
}

export async function transferOwnership(
  animalId: string,
  newOwnerId: number
): Promise<{ success: boolean; message: string; custody?: any }> {
  return apiFetch(`/api/animals/${encodeURIComponent(animalId)}/transfer-ownership`, {
    method: "POST",
    body: { newOwnerId },
  });
}

export async function apiUpload<T = any>(endpoint: string, formData: FormData): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const response = await fetch(cleanEndpoint, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let errorDetail = "";
    let errJson: any = null;
    try {
      errJson = await response.json();
      errorDetail = errJson.error || errJson.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }

    if (response.status === 401) {
      clearStoredToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { endpoint } }));
      }
    }

    throw new ApiError(
      errorDetail || `Falha no upload (${response.status})`,
      response.status,
      errJson
    );
  }

  invalidateApiCache("/api/animals");
  invalidateApiCache("/api/admin");
  return (await response.json()) as T;
}

export async function createVaccineRecord(
  animalId: string,
  payload: {
    name: string;
    dose?: string | null;
    batch?: string | null;
    appliedAt?: string;
    nextDueAt?: string | null;
    notes?: string | null;
  }
): Promise<VaccineRecord> {
  return apiFetch<VaccineRecord>(
    `/api/animals/${encodeURIComponent(animalId)}/vaccines`,
    { method: "POST", body: payload }
  );
}

export async function deleteVaccineRecord(
  animalId: string,
  vaccineId: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/api/animals/${encodeURIComponent(animalId)}/vaccines/${encodeURIComponent(vaccineId)}`,
    { method: "DELETE" }
  );
}

export async function createDiseaseRecord(
  animalId: string,
  payload: {
    name: string;
    symptoms?: string | null;
    treatment?: string | null;
    status?: DiseaseStatus;
    diagnosedAt?: string;
    recoveredAt?: string | null;
    notes?: string | null;
  }
): Promise<DiseaseRecord> {
  return apiFetch<DiseaseRecord>(
    `/api/animals/${encodeURIComponent(animalId)}/diseases`,
    { method: "POST", body: payload }
  );
}

export async function updateDiseaseRecord(
  animalId: string,
  diseaseId: string,
  payload: {
    status?: DiseaseStatus;
    treatment?: string | null;
    recoveredAt?: string | null;
    notes?: string | null;
  }
): Promise<DiseaseRecord> {
  return apiFetch<DiseaseRecord>(
    `/api/animals/${encodeURIComponent(animalId)}/diseases/${encodeURIComponent(diseaseId)}`,
    { method: "PATCH", body: payload }
  );
}

export async function deleteDiseaseRecord(
  animalId: string,
  diseaseId: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/api/animals/${encodeURIComponent(animalId)}/diseases/${encodeURIComponent(diseaseId)}`,
    { method: "DELETE" }
  );
}

export async function listAnimalLocations(
  animalId: string
): Promise<AnimalLocationLog[]> {
  return apiFetch<AnimalLocationLog[]>(
    `/api/animals/${encodeURIComponent(animalId)}/locations`
  );
}

export async function createAnimalLocationLog(
  animalId: string,
  payload: {
    location: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    reason?: string | null;
  }
): Promise<AnimalLocationLog> {
  return apiFetch<AnimalLocationLog>(
    `/api/animals/${encodeURIComponent(animalId)}/locations`,
    { method: "POST", body: payload }
  );
}

export interface SequentialRecalibrationResult {
  updatedCount: number;
  failedCount: number;
  totalCount: number;
  results: Array<{
    id: string;
    newScore: number;
    photo?: any;
  }>;
}

export async function recalibratePhotosSequentially(
  photoIds: string[],
  onProgress?: (progress: {
    current: number;
    total: number;
    photoId: string;
    newScore: number | null;
  }) => void
): Promise<SequentialRecalibrationResult> {
  const uniqueIds = Array.from(new Set(photoIds.filter(Boolean)));
  const results: SequentialRecalibrationResult["results"] = [];
  let failedCount = 0;

  for (let i = 0; i < uniqueIds.length; i++) {
    const photoId = uniqueIds[i];
    try {
      const res = await apiFetch<any>(
        `/api/photos/${encodeURIComponent(photoId)}/recalibrate`,
        { method: "POST" }
      );
      const nextScore =
        typeof res?.newScore === "number"
          ? res.newScore
          : typeof res?.score === "number"
          ? res.score
          : 0;
      results.push({ id: photoId, newScore: nextScore, photo: res?.photo });
      onProgress?.({
        current: i + 1,
        total: uniqueIds.length,
        photoId,
        newScore: nextScore,
      });
    } catch {
      failedCount++;
      onProgress?.({
        current: i + 1,
        total: uniqueIds.length,
        photoId,
        newScore: null,
      });
    }
  }

  return {
    updatedCount: results.length,
    failedCount,
    totalCount: uniqueIds.length,
    results,
  };
}

export async function createObservationRecord(
  animalId: string,
  payload: {
    category?: ObservationCategory;
    title?: string | null;
    content: string;
    observedAt?: string;
  }
): Promise<AnimalObservation> {
  return apiFetch<AnimalObservation>(
    `/api/animals/${encodeURIComponent(animalId)}/observations`,
    { method: "POST", body: payload }
  );
}

export async function updateObservationRecord(
  animalId: string,
  observationId: string,
  payload: {
    category?: ObservationCategory;
    title?: string | null;
    content?: string;
  }
): Promise<AnimalObservation> {
  return apiFetch<AnimalObservation>(
    `/api/animals/${encodeURIComponent(animalId)}/observations/${encodeURIComponent(observationId)}`,
    { method: "PATCH", body: payload }
  );
}

export async function deleteObservationRecord(
  animalId: string,
  observationId: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(
    `/api/animals/${encodeURIComponent(animalId)}/observations/${encodeURIComponent(observationId)}`,
    { method: "DELETE" }
  );
}
