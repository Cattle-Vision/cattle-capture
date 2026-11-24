/**
 * Utilitários de Localização por Fazenda, GPS (WGS84) e Google Maps (`src/lib/location.ts`).
 *
 * Centraliza validação de coordenadas, parsing de links do Google Maps ou pares "lat, lng",
 * geração de links externos e captura segura via Geolocation API do navegador/celular.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface CapturedGpsResult extends Coordinates {
  accuracy?: number;
}

export function formatCoordinates(
  latitude?: number | null,
  longitude?: number | null,
  digits = 5
): string | null {
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return `${latitude.toFixed(digits)}, ${longitude.toFixed(digits)}`;
}

export function buildGoogleMapsUrl(
  latitude?: number | null,
  longitude?: number | null,
  fallbackQuery?: string | null
): string | null {
  if (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  const q = fallbackQuery?.trim();
  if (q) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }
  return null;
}

export function buildOsmEmbedUrl(latitude: number, longitude: number): string {
  const delta = 0.012;
  const minLon = (longitude - delta).toFixed(6);
  const minLat = (latitude - delta).toFixed(6);
  const maxLon = (longitude + delta).toFixed(6);
  const maxLat = (latitude + delta).toFixed(6);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Extrai latitude/longitude de textos como "-22.9056, -47.0608" ou URLs do Google Maps
 * (`@lat,lng`, `?q=lat,lng`, `!3dlat!4dlng`). Retorna `null` caso não reconheça coordenadas válidas.
 */
export function parseLocationCoordinates(rawInput: string): Coordinates | null {
  const text = rawInput.trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|destination|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/,
  ];

  for (const regex of patterns) {
    const match = text.match(regex);
    if (!match) continue;
    const lat = Number(match[1].replace(",", "."));
    const lng = Number(match[2].replace(",", "."));
    if (isValidLatLng(lat, lng)) {
      return {
        latitude: Math.round(lat * 1_000_000) / 1_000_000,
        longitude: Math.round(lng * 1_000_000) / 1_000_000,
      };
    }
  }

  return null;
}

export function captureBrowserGps(timeoutMs = 12000): Promise<CapturedGpsResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste navegador."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Math.round(pos.coords.latitude * 1_000_000) / 1_000_000,
          longitude: Math.round(pos.coords.longitude * 1_000_000) / 1_000_000,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Permissão de GPS negada. Libere a localização nas configurações do navegador."));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Tempo esgotado ao buscar sinal GPS. Tente novamente em área aberta."));
        } else {
          reject(new Error("Não foi possível obter a localização GPS do dispositivo."));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 30_000,
      }
    );
  });
}
