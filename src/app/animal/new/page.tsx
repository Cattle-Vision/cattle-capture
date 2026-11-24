"use client";

/**
 * Cadastro de Novo Animal em Seções (`src/app/animal/new/page.tsx`).
 */
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2,
  Camera,
  Check,
  Shuffle,
  Tag,
  Bluetooth,
  BluetoothConnected,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BREEDS, SEX_OPTIONS, isValidTag, normalizeTag } from "@/lib/animal";
import { apiFetch } from "@/lib/api";
import { enqueueSync } from "@/lib/sync";
import { ObservationCategory } from "@/lib/types";
import { bluetoothRfid, BluetoothStatus } from "@/lib/bluetooth-rfid";
import AppShell from "@/components/AppShell";
import FarmLocationFields from "@/components/FarmLocationFields";

const OBSERVATION_CATEGORY_OPTIONS: { value: ObservationCategory; label: string }[] = [
  { value: "GERAL", label: "Geral" },
  { value: "MANEJO", label: "Manejo" },
  { value: "NUTRICAO", label: "Nutrição" },
  { value: "COMPORTAMENTO", label: "Comportamento" },
  { value: "OUTRA", label: "Outra" },
];

interface AnimalFormState {
  tag: string;
  name: string;
  breed: string;
  sex: string;
  weight: string;
  age: string;
  length: string;
  location: string;
  locationAddress: string;
  latitude: string;
  longitude: string;
  observations: string;
  observationCategory: ObservationCategory;
}

function NewAnimalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [goToCamera, setGoToCamera] = useState(true);

  const initialTag = normalizeTag(searchParams.get("tag") ?? "");

  const [formData, setFormData] = useState<AnimalFormState>({
    tag: initialTag,
    name: "",
    breed: "Nelore",
    sex: "Fêmea",
    weight: "",
    age: "",
    length: "",
    location: "",
    locationAddress: "",
    latitude: "",
    longitude: "",
    observations: "",
    observationCategory: "GERAL",
  });
  const [customBreed, setCustomBreed] = useState("");

  const [bleSupported, setBleSupported] = useState(true);
  const [bleStatus, setBleStatus] = useState<BluetoothStatus>("disconnected");
  const [bleDeviceName, setBleDeviceName] = useState("");
  const [bleScannedNow, setBleScannedNow] = useState(false);

  const currentTagRef = useRef(formData.tag);
  useEffect(() => {
    currentTagRef.current = formData.tag;
  }, [formData.tag]);

  useEffect(() => {
    if (initialTag) {
      currentTagRef.current = initialTag;
      setFormData((prev) => (prev.tag === initialTag ? prev : { ...prev, tag: initialTag }));
    }
  }, [initialTag]);

  useEffect(() => {
    setBleSupported(bluetoothRfid.isSupported());
    setBleStatus(bluetoothRfid.getStatus());
    setBleDeviceName(bluetoothRfid.getDeviceName());

    const unsubStatus = bluetoothRfid.onStatusChange((status, devName, errMsg) => {
      setBleStatus(status);
      setBleDeviceName(status === "connected" ? devName || "" : "");
      if (status === "error" && errMsg) toast(errMsg, "error");
    });

    const unsubTag = bluetoothRfid.onTag((detail) => {
      const normalized = normalizeTag(detail.tag);
      setBleScannedNow(true);
      if (currentTagRef.current === normalized) return;
      currentTagRef.current = normalized;
      setFormData((prev) => ({ ...prev, tag: normalized }));
      toast(`Código lido via Bluetooth: ${normalized}`, "success");
    });

    return () => {
      unsubStatus();
      unsubTag();
    };
  }, [toast]);

  const handleToggleBle = async () => {
    if (bleStatus === "connected") {
      bluetoothRfid.disconnect();
      return;
    }
    const ok = await bluetoothRfid.connect();
    if (ok) toast("Leitor conectado. Aproxime do brinco para preencher.", "success");
  };

  const setField = (field: keyof AnimalFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateSampleTag = () => {
    let hex = "E280";
    const chars = "0123456789ABCDEF";
    for (let i = 0; i < 20; i++) {
      hex += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setField("tag", hex);
  };

  const handleSubmit = async (e: React.FormEvent, openCameraAfter: boolean) => {
    e.preventDefault();
    const tag = normalizeTag(formData.tag);
    const effectiveBreed =
      formData.breed === "Outra" ? customBreed.trim() : formData.breed.trim();

    if (!isValidTag(tag)) {
      toast("Informe um brinco ou identificador válido (mínimo 2 caracteres).", "error");
      return;
    }
    if (!effectiveBreed) {
      toast(
        formData.breed === "Outra"
          ? "Digite o nome da raça personalizada."
          : "Selecione a raça do animal.",
        "error"
      );
      return;
    }
    if (!formData.weight || Number(formData.weight) <= 0) {
      toast("Informe um peso válido em kg.", "error");
      return;
    }
    if (formData.age === "" || Number(formData.age) < 0) {
      toast("Informe a idade em meses.", "error");
      return;
    }
    if (formData.length.trim() !== "" && Number(formData.length) <= 0) {
      toast("O comprimento em cm deve ser maior que zero.", "error");
      return;
    }

    const payload = {
      tag,
      name: formData.name.trim(),
      breed: effectiveBreed,
      sex: formData.sex,
      weight: Number(formData.weight),
      age: Number(formData.age),
      length: formData.length.trim() !== "" ? Number(formData.length) : null,
      location: formData.location.trim() || null,
      locationAddress: formData.locationAddress.trim() || null,
      latitude: formData.latitude.trim() !== "" ? Number(formData.latitude.replace(",", ".")) : null,
      longitude: formData.longitude.trim() !== "" ? Number(formData.longitude.replace(",", ".")) : null,
      observations: formData.observations.trim() || null,
      observationCategory: formData.observationCategory,
    };

    setLoading(true);
    setGoToCamera(openCameraAfter);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueSync(
          "/api/animals",
          "POST",
          payload as unknown as Record<string, unknown>,
          false,
          `Cadastro ${payload.name || tag}`
        );
        toast("Sem internet: ficha salva localmente para sincronização.", "info");
        router.push("/dashboard");
        return;
      } catch {
        toast("Não foi possível salvar na fila offline.", "error");
        setLoading(false);
        return;
      }
    }

    try {
      const data = await apiFetch<any>("/api/animals", { method: "POST", body: payload });
      if (data?.id) {
        toast("Animal cadastrado com sucesso.", "success");
        const label = data.name || data.tag || tag;
        if (openCameraAfter) {
          router.push(`/camera?animalId=${data.id}&animalName=${encodeURIComponent(label)}`);
        } else {
          router.push(`/animal/${data.id}`);
        }
        return;
      }
    } catch (err: any) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await enqueueSync(
          "/api/animals",
          "POST",
          payload as unknown as Record<string, unknown>,
          false,
          `Cadastro ${payload.name || tag}`
        );
        toast("Conexão perdida: ficha enfileirada no modo offline.", "info");
        router.push("/dashboard");
        return;
      }
      if (err?.data?.sharedGranted && err?.data?.id) {
        toast(err.message || "Animal já cadastrado. Guarda compartilhada ativada.", "info");
        router.push(`/animal/${err.data.id}`);
        return;
      }
      if (err?.data?.id) {
        toast("Animal já cadastrado em sua conta.", "info");
        router.push(`/animal/${err.data.id}`);
        return;
      }
      toast(err?.message || "Erro ao cadastrar o animal.", "error");
      setLoading(false);
    }
  };

  return (
    <AppShell
      showBack
      backHref="/dashboard"
      title="Cadastrar animal"
      subtitle="Preencha os dados para abrir a ficha"
      maxWidth="md"
    >
      <form onSubmit={(e) => handleSubmit(e, true)} className="space-y-5">
        {/* Seção 1: Identificação */}
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-theme">
            <div>
              <h2 className="text-sm font-bold text-theme-primary">1. Identificação</h2>
              <p className="text-xs text-theme-secondary">Apelido de campo e brinco oficial</p>
            </div>
            {bleSupported && (
              <button
                type="button"
                onClick={handleToggleBle}
                disabled={bleStatus === "connecting"}
                className={`${
                  bleStatus === "connected" ? "btn-secondary" : "btn-secondary"
                } !py-1.5 !px-3 !min-h-[36px] text-xs shrink-0`}
              >
                {bleStatus === "connecting" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : bleStatus === "connected" ? (
                  <BluetoothConnected className="w-3.5 h-3.5 text-brand" />
                ) : (
                  <Bluetooth className="w-3.5 h-3.5 text-brand" />
                )}
                <span>
                  {bleStatus === "connected"
                    ? `Conectado (${bleDeviceName || "BLE"})`
                    : bleScannedNow
                      ? "Leitor ativo"
                      : "Ler via Bluetooth"}
                </span>
              </button>
            )}
          </div>

          {initialTag && (
            <div className="p-3 rounded-[10px] bg-brand-soft flex items-center gap-2.5 text-xs">
              <Tag className="w-4 h-4 shrink-0" />
              <span>
                Código preenchido: <strong>{initialTag.length > 16 ? `${initialTag.slice(0, 10)}…` : initialTag}</strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label" htmlFor="name-field">
                Apelido ou nome
              </label>
              <input
                id="name-field"
                type="text"
                value={formData.name}
                onChange={(e) => setField("name", e.target.value)}
                className="field-input font-semibold"
                placeholder="Ex: Mimosa, Estrela, Lote 42"
                autoFocus={!initialTag}
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="field-label !mb-0" htmlFor="tag-field">
                  Brinco ou identificador <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={generateSampleTag}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                >
                  <Shuffle className="w-3 h-3" />
                  <span>Gerar</span>
                </button>
              </div>
              <input
                id="tag-field"
                type="text"
                value={formData.tag}
                onChange={(e) => {
                  setBleScannedNow(false);
                  setField("tag", e.target.value.toUpperCase());
                }}
                className="field-input font-mono-tag text-xs uppercase font-semibold"
                placeholder="Ex: NEL-0142 ou código lido"
                required
                autoComplete="off"
              />
            </div>
          </div>
        </section>

        {/* Seção 2: Características Físicas */}
        <section className="card p-5 space-y-4">
          <div className="pb-3 border-b border-theme">
            <h2 className="text-sm font-bold text-theme-primary">2. Características físicas</h2>
            <p className="text-xs text-theme-secondary">Raça, sexo e medidas corporais</p>
          </div>

          <div>
            <label className="field-label">
              Raça <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {BREEDS.map((breed) => {
                const active = formData.breed === breed;
                return (
                  <button
                    key={breed}
                    type="button"
                    onClick={() => setField("breed", breed)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      active
                        ? "bg-brand text-white border-transparent"
                        : "bg-theme-surface-2 text-theme-secondary border-theme hover:text-theme-primary"
                    }`}
                  >
                    {breed}
                  </button>
                );
              })}
            </div>

            {formData.breed === "Outra" && (
              <div className="mt-3">
                <label className="field-label" htmlFor="custom-breed-field">
                  Nome da raça <span className="text-red-500">*</span>
                </label>
                <input
                  id="custom-breed-field"
                  type="text"
                  required
                  value={customBreed}
                  onChange={(e) => setCustomBreed(e.target.value)}
                  placeholder="Ex: Simental, Tabapuã, Guzerá"
                  className="field-input text-sm"
                  autoFocus
                />
              </div>
            )}
          </div>

          <div>
            <label className="field-label">
              Sexo <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SEX_OPTIONS.map((opt) => {
                const active = formData.sex === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setField("sex", opt.value)}
                    className={`p-3 rounded-[10px] border text-left transition flex items-center justify-between ${
                      active
                        ? "bg-brand-soft border-emerald-700/40"
                        : "bg-theme-surface-2 border-theme text-theme-secondary hover:text-theme-primary"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-theme-primary">{opt.value}</p>
                      <p className="text-[11px] text-theme-secondary mt-0.5">{opt.label}</p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        active ? "bg-brand text-white" : "border border-theme"
                      }`}
                    >
                      {active && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="field-label" htmlFor="weight-field">
                Peso (kg) <span className="text-red-500">*</span>
              </label>
              <input
                id="weight-field"
                type="number"
                value={formData.weight}
                onChange={(e) => setField("weight", e.target.value)}
                className="field-input tabular-nums"
                placeholder="450"
                min="1"
                step="0.1"
                required
                inputMode="decimal"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="age-field">
                Idade (meses) <span className="text-red-500">*</span>
              </label>
              <input
                id="age-field"
                type="number"
                value={formData.age}
                onChange={(e) => setField("age", e.target.value)}
                className="field-input tabular-nums"
                placeholder="24"
                min="0"
                required
                inputMode="numeric"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="length-field">
                Comprimento (cm)
              </label>
              <input
                id="length-field"
                type="number"
                value={formData.length}
                onChange={(e) => setField("length", e.target.value)}
                className="field-input tabular-nums"
                placeholder="165"
                min="1"
                step="0.5"
                inputMode="decimal"
              />
            </div>
          </div>
        </section>

        {/* Seção 3: Localização e Nota Inicial */}
        <section className="card p-5 space-y-4">
          <div className="pb-3 border-b border-theme">
            <h2 className="text-sm font-bold text-theme-primary">3. Localização e anotações</h2>
            <p className="text-xs text-theme-secondary">Fazenda, GPS opcional e observação inicial</p>
          </div>

          <FarmLocationFields
            value={{
              location: formData.location,
              locationAddress: formData.locationAddress,
              latitude: formData.latitude,
              longitude: formData.longitude,
            }}
            onChange={(loc) => setFormData((prev) => ({ ...prev, ...loc }))}
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="field-label !mb-0" htmlFor="observations-field">
                Observação inicial
              </label>
              <select
                aria-label="Categoria da observação"
                value={formData.observationCategory}
                onChange={(e) =>
                  setField("observationCategory", e.target.value as ObservationCategory)
                }
                className="field-input !w-auto !py-1 !px-2.5 text-xs font-medium"
              >
                {OBSERVATION_CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              id="observations-field"
              rows={2}
              value={formData.observations}
              onChange={(e) => setField("observations", e.target.value)}
              className="field-input text-sm resize-y min-h-[68px]"
              placeholder="Opcional: histórico de lote, alimentação ou observação geral…"
            />
          </div>
        </section>

        {/* Ações finais */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 text-sm"
          >
            {loading && goToCamera ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>Cadastrar e fotografar</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={(e) => handleSubmit(e, false)}
            className="btn-secondary px-6 text-sm"
          >
            {loading && !goToCamera ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>Salvar ficha</span>
          </button>
        </div>
      </form>
    </AppShell>
  );
}

export default function NewAnimalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] flex items-center justify-center bg-theme-bg">
          <Loader2 className="w-7 h-7 animate-spin text-brand" />
        </div>
      }
    >
      <NewAnimalForm />
    </Suspense>
  );
}
