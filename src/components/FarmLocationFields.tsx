"use client";

/**
 * Bloco reutilizável de Localização da Fazenda (GPS + Endereço + Google Maps)
 * (`src/components/FarmLocationFields.tsx`).
 *
 * Usado de maneira uniforme no cadastro de novo animal, modal de edição e aba de
 * movimentações entre fazendas/propriedades.
 */
import { useState } from "react";
import { Crosshair, ExternalLink, Loader2, MapPin } from "lucide-react";
import {
  buildGoogleMapsUrl,
  captureBrowserGps,
  parseLocationCoordinates,
} from "@/lib/location";
import { useToast } from "@/components/ui/Toast";

export interface FarmLocationValue {
  location: string;
  locationAddress: string;
  latitude: string;
  longitude: string;
}

interface FarmLocationFieldsProps {
  value: FarmLocationValue;
  onChange: (next: FarmLocationValue) => void;
  locationLabel?: string;
  locationPlaceholder?: string;
  compact?: boolean;
}

export default function FarmLocationFields({
  value,
  onChange,
  locationLabel = "Fazenda ou setor atual",
  locationPlaceholder = "Ex: Fazenda Santa Luzia · Piquete 04",
  compact = false,
}: FarmLocationFieldsProps) {
  const { toast } = useToast();
  const [capturingGps, setCapturingGps] = useState(false);

  const parsedLat = value.latitude.trim() !== "" ? Number(value.latitude.replace(",", ".")) : null;
  const parsedLng = value.longitude.trim() !== "" ? Number(value.longitude.replace(",", ".")) : null;
  const hasCoords =
    parsedLat !== null &&
    parsedLng !== null &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng);

  const mapsUrl = buildGoogleMapsUrl(
    hasCoords ? parsedLat : null,
    hasCoords ? parsedLng : null,
    value.locationAddress || value.location
  );

  const handleCaptureGps = async () => {
    setCapturingGps(true);
    try {
      const coords = await captureBrowserGps();
      onChange({
        ...value,
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
      });
      toast(
        coords.accuracy
          ? `Coordenadas GPS capturadas (precisão ~${coords.accuracy}m).`
          : "Coordenadas GPS capturadas.",
        "success"
      );
    } catch (err: any) {
      toast(err?.message || "Falha ao obter localização GPS.", "error");
    } finally {
      setCapturingGps(false);
    }
  };

  const handleAddressChange = (raw: string) => {
    const parsed = parseLocationCoordinates(raw);
    if (parsed) {
      onChange({
        ...value,
        locationAddress: raw,
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude),
      });
      toast("Coordenadas extraídas automaticamente do link/texto.", "info");
      return;
    }
    onChange({ ...value, locationAddress: raw });
  };

  return (
    <div
      className={`card-subtle ${
        compact ? "p-3 space-y-2.5" : "p-3.5 sm:p-4 space-y-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-theme-primary inline-flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-brand" />
          Localização da Fazenda & GPS
        </span>

        <div className="flex items-center gap-2">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-brand hover:underline inline-flex items-center gap-1"
            >
              <span>Abrir no Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <button
            type="button"
            onClick={handleCaptureGps}
            disabled={capturingGps}
            className="btn-secondary !py-1.5 !px-2.5 !min-h-[32px] text-[11px] font-semibold"
          >
            {capturingGps ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
            ) : (
              <Crosshair className="w-3.5 h-3.5 text-brand" />
            )}
            <span>{capturingGps ? "Buscando GPS…" : "Usar GPS atual"}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="field-label">{locationLabel}</label>
          <input
            type="text"
            value={value.location}
            onChange={(e) => onChange({ ...value, location: e.target.value })}
            placeholder={locationPlaceholder}
            className="field-input text-xs sm:text-sm"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="field-label">Endereço, cidade/UF ou link do Google Maps</label>
          <input
            type="text"
            value={value.locationAddress}
            onChange={(e) => handleAddressChange(e.target.value)}
            placeholder="Ex: Rod. SP-255 km 40, Ribeirão Preto - SP ou cole link Maps"
            className="field-input text-xs sm:text-sm"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="field-label">Latitude GPS</label>
          <input
            type="text"
            inputMode="decimal"
            value={value.latitude}
            onChange={(e) => onChange({ ...value, latitude: e.target.value })}
            placeholder="-21.17040"
            className="field-input font-mono text-xs tabular-nums"
          />
        </div>

        <div>
          <label className="field-label">Longitude GPS</label>
          <input
            type="text"
            inputMode="decimal"
            value={value.longitude}
            onChange={(e) => onChange({ ...value, longitude: e.target.value })}
            placeholder="-47.81030"
            className="field-input font-mono text-xs tabular-nums"
          />
        </div>
      </div>
    </div>
  );
}
