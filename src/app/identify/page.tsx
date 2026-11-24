"use client";

/**
 * Identificação Rápida de Animais (`src/app/identify/page.tsx`).
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Loader2,
  Camera,
  Plus,
  ChevronRight,
  Bluetooth,
  Users,
  CheckCircle2,
  AlertCircle,
  Shuffle,
} from "lucide-react";
import { normalizeTag } from "@/lib/animal";
import { Animal, RfidScanResult } from "@/lib/types";
import {
  apiFetchCached,
  getApiCacheSnapshot,
  invalidateApiCache,
  readPersistedApiCache,
  scanRfidTag,
} from "@/lib/api";
import { bluetoothRfid, BluetoothStatus, RfidEventDetail } from "@/lib/bluetooth-rfid";
import AppShell from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";

const ANIMALS_SUMMARY_ENDPOINT = "/api/animals?summary=1";
// Janela de supressão visual para reenvios periódicos da mesma tag pelo ESP32 (INTERVALO_MESMA_TAG = 3000 ms)
const SAME_TAG_DISPLAY_COOLDOWN_MS = 8_000;

export default function IdentifyPage() {
  const { toast } = useToast();

  const cachedAnimals = getApiCacheSnapshot<Animal[]>(ANIMALS_SUMMARY_ENDPOINT);
  const [queryOrTag, setQueryOrTag] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [allAnimals, setAllAnimals] = useState<Animal[]>(() =>
    Array.isArray(cachedAnimals) ? cachedAnimals : []
  );
  const [bleStatus, setBleStatus] = useState<BluetoothStatus>("disconnected");
  const [bleDeviceName, setBleDeviceName] = useState("");
  const [scanResult, setScanResult] = useState<RfidScanResult | null>(null);
  const [simulatedTag, setSimulatedTag] = useState("");

  const activeScanRef = useRef<{ tag: string; at: number }>({ tag: "", at: 0 });
  const requestSeqRef = useRef(0);

  const handleProcessRfid = useCallback(
    async (rfidTag: string, source: RfidEventDetail["source"] = "manual") => {
      const clean = normalizeTag(rfidTag);
      if (!clean) return;

      // O ESP32 reenvia o mesmo brinco a cada 3s enquanto estiver no campo da antena.
      // Mantemos o cartão estável na tela sem apagar botões ou repetir toasts/bipes.
      const now = Date.now();
      if (
        source === "ble" &&
        activeScanRef.current.tag === clean &&
        now - activeScanRef.current.at < SAME_TAG_DISPLAY_COOLDOWN_MS
      ) {
        activeScanRef.current.at = now;
        return;
      }

      const seq = ++requestSeqRef.current;
      setLoading(true);
      setError("");

      try {
        const res = await scanRfidTag(clean);
        if (seq !== requestSeqRef.current) return;

        activeScanRef.current = { tag: clean, at: Date.now() };
        setScanResult(res);

        if (res.registered && res.animal) {
          bluetoothRfid.playAudioFeedback("success");
          bluetoothRfid.triggerHaptic([80, 50, 80]);
          toast(
            res.isOwner
              ? "Animal identificado."
              : "Animal localizado e adicionado ao acesso compartilhado.",
            "success"
          );
          // Atualiza lista rápida em segundo plano caso guarda compartilhada tenha sido concedida
          invalidateApiCache(ANIMALS_SUMMARY_ENDPOINT);
          apiFetchCached<Animal[]>(ANIMALS_SUMMARY_ENDPOINT, 0)
            .then((list) => {
              if (Array.isArray(list)) setAllAnimals(list);
            })
            .catch(() => {});
        } else {
          bluetoothRfid.playAudioFeedback("alert");
          toast("Brinco ainda não cadastrado.", "info");
        }
      } catch (err: any) {
        if (seq !== requestSeqRef.current) return;
        setScanResult(null);
        activeScanRef.current = { tag: "", at: 0 };
        setError(err?.message || "Não foi possível consultar este código.");
        bluetoothRfid.playAudioFeedback("alert");
      } finally {
        if (seq === requestSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!cachedAnimals) {
      const persisted = readPersistedApiCache<Animal[]>(ANIMALS_SUMMARY_ENDPOINT);
      if (Array.isArray(persisted)) setAllAnimals(persisted);
    }
    apiFetchCached<Animal[]>(ANIMALS_SUMMARY_ENDPOINT, 15_000)
      .then((d) => {
        if (Array.isArray(d)) setAllAnimals(d);
      })
      .catch(() => {});

    setBleStatus(bluetoothRfid.getStatus());
    setBleDeviceName(bluetoothRfid.getDeviceName());

    const unsubStatus = bluetoothRfid.onStatusChange((status, name, errMsg) => {
      setBleStatus(status);
      setBleDeviceName(status === "connected" ? name || "" : "");
      if (status === "error" && errMsg) {
        setError(errMsg);
        toast(errMsg, "error");
      }
    });

    const unsubTag = bluetoothRfid.onTag(async (detail: RfidEventDetail) => {
      await handleProcessRfid(detail.tag, detail.source);
    });

    return () => {
      unsubStatus();
      unsubTag();
    };
  }, [cachedAnimals, handleProcessRfid, toast]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTag(queryOrTag);
    if (!normalized) {
      setError("Digite o número do brinco ou código eletrônico.");
      return;
    }
    await handleProcessRfid(normalized, "manual");
  };

  const handleConnectBle = async () => {
    setError("");
    const ok = await bluetoothRfid.connect();
    if (ok) toast("Leitor Bluetooth conectado.", "success");
  };

  const handleDisconnectBle = () => {
    bluetoothRfid.disconnect();
    toast("Leitor desconectado.", "info");
  };

  const handleSimulateTag = () => {
    const clean = simulatedTag.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().trim();
    if (!clean) return;
    bluetoothRfid.emitManualTag(clean, "simulation");
  };

  const generateSampleTag = () => {
    let hex = "E280";
    const chars = "0123456789ABCDEF";
    for (let i = 0; i < 20; i++) {
      hex += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSimulatedTag(hex);
  };

  const isBleSupported = bluetoothRfid.isSupported();

  const matchingAnimals = useMemo(() => {
    const q = queryOrTag.trim().toUpperCase();
    if (!q) return allAnimals.slice(0, 6);
    return allAnimals
      .filter(
        (a) =>
          a.tag.toUpperCase().includes(q) ||
          (a.name && a.name.toUpperCase().includes(q)) ||
          a.breed.toUpperCase().includes(q)
      )
      .slice(0, 8);
  }, [allAnimals, queryOrTag]);

  return (
    <AppShell
      title="Identificar animal"
      subtitle="Leitor Bluetooth ou busca rápida no lote"
      maxWidth="md"
    >
      <div className="space-y-5">
        {/* Ação unificada: Busca + Bluetooth */}
        <div className="card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-theme">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                  bleStatus === "connected"
                    ? "bg-brand text-white"
                    : bleStatus === "connecting"
                      ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 animate-pulse"
                      : "bg-brand-soft"
                }`}
              >
                <Bluetooth className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-theme-primary truncate">
                  {bleStatus === "connected"
                    ? `Leitor ativo: ${bleDeviceName || "Bluetooth"}`
                    : bleStatus === "connecting"
                      ? "Pareando leitor Bluetooth…"
                      : "Leitor de brinco Bluetooth"}
                </h2>
                <p className="text-xs text-theme-secondary truncate">
                  {!isBleSupported
                    ? "Use a busca manual por brinco ou apelido abaixo."
                    : bleStatus === "connected"
                      ? "Aproxime o leitor do brinco para abrir a ficha automaticamente."
                      : "Conecte seu leitor eletrônico para identificação instantânea."}
                </p>
              </div>
            </div>

            {isBleSupported && (
              <div className="shrink-0">
                {bleStatus === "connected" ? (
                  <button
                    type="button"
                    onClick={handleDisconnectBle}
                    className="btn-secondary !py-2 !px-3.5 !min-h-[38px] text-xs w-full sm:w-auto"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectBle}
                    disabled={bleStatus === "connecting"}
                    className="btn-primary !py-2 !px-4 !min-h-[38px] text-xs w-full sm:w-auto"
                  >
                    {bleStatus === "connecting" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bluetooth className="w-4 h-4" />
                    )}
                    <span>{bleStatus === "connecting" ? "Pareando…" : "Conectar leitor"}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-2.5">
            <label htmlFor="tag-input" className="field-label">
              Consultar brinco, apelido ou raça
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="tag-input"
                  value={queryOrTag}
                  onChange={(e) => setQueryOrTag(e.target.value)}
                  className="field-input pl-10"
                  placeholder="Digite o apelido ou código do brinco…"
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !queryOrTag.trim()}
                className="btn-secondary !px-5 text-xs sm:text-sm shrink-0"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span>{loading ? "Consultando…" : "Consultar código"}</span>
              </button>
            </div>
            {error && <div className="error-banner">{error}</div>}
          </form>

          {/* Teste discreto em acordeão nativo */}
          <details className="pt-1 text-xs">
            <summary className="cursor-pointer font-medium text-theme-muted hover:text-theme-primary select-none">
              Testar com código simulado
            </summary>
            <div className="mt-3 pt-3 border-t border-theme space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-theme-secondary">Simular leitura de leitor eletrônico</span>
                <button
                  type="button"
                  onClick={generateSampleTag}
                  className="font-semibold text-brand hover:underline inline-flex items-center gap-1"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Gerar exemplo</span>
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={simulatedTag}
                  onChange={(e) => setSimulatedTag(e.target.value.toUpperCase())}
                  placeholder="Código do brinco"
                  className="field-input font-mono-tag text-xs uppercase flex-1"
                />
                <button
                  type="button"
                  disabled={!simulatedTag.trim() || loading}
                  onClick={handleSimulateTag}
                  className="btn-secondary !px-3.5 !min-h-[38px] text-xs shrink-0"
                >
                  Simular
                </button>
              </div>
            </div>
          </details>
        </div>

        {/* Resultado de consulta direta */}
        {scanResult && (
          <div
            className={`card p-5 border ${
              scanResult.registered
                ? "border-emerald-700/35 bg-brand-soft/40"
                : "border-amber-600/35 bg-amber-500/[0.04]"
            }`}
          >
            {scanResult.registered && scanResult.animal ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[10px] bg-brand text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-semibold text-brand block">
                        {scanResult.isOwner ? "No seu rebanho" : "Guarda compartilhada ativada"}
                      </span>
                      <h3 className="text-base font-bold text-theme-primary">
                        {scanResult.animal.name || "Sem apelido"}
                      </h3>
                      <p className="text-xs text-theme-secondary">
                        {scanResult.animal.breed}, {scanResult.animal.sex} — {scanResult.animal.weight} kg
                      </p>
                      <p className="font-mono-tag text-[11px] text-theme-muted mt-0.5 break-all">
                        {scanResult.animal.tag}
                      </p>
                    </div>
                  </div>
                  {!scanResult.isOwner && (
                    <span className="px-2 py-0.5 rounded-[7px] text-[11px] font-semibold bg-sky-500/12 text-sky-700 dark:text-sky-300 inline-flex items-center gap-1 shrink-0">
                      <Users className="w-3 h-3" />
                      <span>Compartilhado</span>
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link href={`/animal/${scanResult.animal.id}`} className="btn-primary flex-1 text-xs">
                    <span>Abrir ficha</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/camera?animalId=${scanResult.animal.id}&animalName=${encodeURIComponent(
                      scanResult.animal.name || scanResult.animal.tag
                    )}`}
                    className="btn-secondary text-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Fotografar</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-theme-primary">
                      Código não cadastrado ({scanResult.rfid})
                    </h3>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      Deseja cadastrar este animal agora com o identificador lido?
                    </p>
                  </div>
                </div>
                <Link
                  href={`/animal/new?tag=${encodeURIComponent(scanResult.rfid)}`}
                  className="btn-primary w-full text-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar com este código</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Lista de acesso rápido */}
        {matchingAnimals.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-xs font-semibold text-theme-muted">
                {queryOrTag.trim() ? "Correspondências no lote" : "Acessados recentemente"}
              </h3>
              <Link
                href="/animal/new"
                className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo animal</span>
              </Link>
            </div>

            <div className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {matchingAnimals.map((a) => {
                const displayName = a.name?.trim() || "Sem apelido";
                const photoCount = a.photoCount ?? a.photos?.length ?? 0;
                return (
                  <div
                    key={a.id}
                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-theme-surface-2/60 transition"
                  >
                    <Link href={`/animal/${a.id}`} className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-theme-primary truncate">{displayName}</p>
                      <p className="text-xs text-theme-secondary truncate mt-0.5">
                        {a.breed} — {photoCount} {photoCount === 1 ? "foto" : "fotos"}{" "}
                        <span className="font-mono-tag text-[11px] text-theme-muted ml-1">
                          {a.tag.length > 14 ? `${a.tag.slice(0, 8)}…` : a.tag}
                        </span>
                      </p>
                    </Link>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Link
                        href={`/camera?animalId=${a.id}&animalName=${encodeURIComponent(displayName)}`}
                        className="btn-primary !py-1.5 !px-3 !min-h-[34px] text-xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Fotografar</span>
                      </Link>
                      <Link
                        href={`/animal/${a.id}`}
                        className="p-1.5 text-theme-muted hover:text-theme-primary"
                        aria-label="Abrir ficha"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
