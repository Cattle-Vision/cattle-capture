"use client";

/**
 * Painel em Abas de Saúde, Localização e Observações Gerais do Animal (`src/components/animal/AnimalHealthTabs.tsx`).
 *
 * Implementa RF08 (SRS) com 5 visões integradas na ficha do animal:
 * - Avaliação & Galeria (conteúdo recebido via prop `galleryContent`)
 * - Localização (registro de movimentação e histórico de piquetes/pastos)
 * - Vacinas (cadastro, lote, próxima dose e exclusão)
 * - Doenças (diagnóstico, sintomas, tratamento e status clínico)
 * - Observações Gerais (tabela dedicada `AnimalObservation` com categorias e CRUD completo)
 *
 * Suporta enfileiramento offline via `enqueueSync` (IndexedDB) quando `navigator.onLine === false`.
 */
import { useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  ExternalLink,
  FileText,
  Images,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Stethoscope,
  Syringe,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  createAnimalLocationLog,
  createDiseaseRecord,
  createObservationRecord,
  createVaccineRecord,
  deleteDiseaseRecord,
  deleteObservationRecord,
  deleteVaccineRecord,
  updateDiseaseRecord,
  updateObservationRecord,
} from "@/lib/api";
import FarmLocationFields, { FarmLocationValue } from "@/components/FarmLocationFields";
import {
  buildGoogleMapsUrl,
  buildOsmEmbedUrl,
  formatCoordinates,
} from "@/lib/location";
import { enqueueSync } from "@/lib/sync";
import {
  Animal,
  AnimalObservation,
  DiseaseStatus,
  ObservationCategory,
} from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

export type AnimalTabId =
  | "gallery"
  | "locations"
  | "vaccines"
  | "diseases"
  | "observations"
  | "custody";

const OBSERVATION_CATEGORY_LABELS: Record<ObservationCategory, string> = {
  GERAL: "Geral",
  MANEJO: "Manejo",
  NUTRICAO: "Nutrição",
  COMPORTAMENTO: "Comportamento",
  OUTRA: "Outra",
};

const DISEASE_STATUS_META: Record<
  DiseaseStatus,
  { label: string; badgeClass: string }
> = {
  ACTIVE: {
    label: "Em tratamento",
    badgeClass: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/25",
  },
  MONITORING: {
    label: "Em observação",
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/25",
  },
  RECOVERED: {
    label: "Curado",
    badgeClass:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/25",
  },
};

interface AnimalHealthTabsProps {
  animal: Animal;
  canEdit: boolean;
  activeTab: AnimalTabId;
  onTabChange: (tab: AnimalTabId) => void;
  onReloadAnimal: () => Promise<void>;
  galleryContent: React.ReactNode;
  custodyContent?: React.ReactNode;
  collaboratorsCount?: number;
}

export default function AnimalHealthTabs({
  animal,
  canEdit,
  activeTab,
  onTabChange,
  onReloadAnimal,
  galleryContent,
  custodyContent,
  collaboratorsCount = 0,
}: AnimalHealthTabsProps) {
  const { toast, confirm } = useToast();

  // Contadores de registros para os badges das abas
  const photoCount = animal.photos?.length ?? 0;
  const locationLogs = animal.locationLogs ?? [];
  const vaccines = animal.vaccines ?? [];
  const diseases = animal.diseases ?? [];
  const observations = animal.observationRecords ?? [];

  /* ── Estado da aba Localização ── */
  const [locForm, setLocForm] = useState<FarmLocationValue>({
    location: "",
    locationAddress: "",
    latitude: "",
    longitude: "",
  });
  const [locReason, setLocReason] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [showMapPreview, setShowMapPreview] = useState(false);

  /* ── Estado da aba Vacinas ── */
  const [vacForm, setVacForm] = useState({
    name: "",
    dose: "",
    batch: "",
    appliedAt: new Date().toISOString().slice(0, 10),
    nextDueAt: "",
    notes: "",
  });
  const [savingVaccine, setSavingVaccine] = useState(false);

  /* ── Estado da aba Doenças ── */
  const [disForm, setDisForm] = useState<{
    name: string;
    status: DiseaseStatus;
    symptoms: string;
    treatment: string;
    diagnosedAt: string;
    notes: string;
  }>({
    name: "",
    status: "ACTIVE",
    symptoms: "",
    treatment: "",
    diagnosedAt: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [savingDisease, setSavingDisease] = useState(false);

  /* ── Estado da aba Observações Gerais ── */
  const [obsCategoryFilter, setObsCategoryFilter] = useState<
    ObservationCategory | "ALL"
  >("ALL");
  const [obsForm, setObsForm] = useState<{
    category: ObservationCategory;
    title: string;
    content: string;
  }>({
    category: "GERAL",
    title: "",
    content: "",
  });
  const [savingObs, setSavingObs] = useState(false);
  const [editingObs, setEditingObs] = useState<AnimalObservation | null>(null);
  const [editObsForm, setEditObsForm] = useState<{
    category: ObservationCategory;
    title: string;
    content: string;
  }>({ category: "GERAL", title: "", content: "" });

  const filteredObservations = useMemo(() => {
    if (obsCategoryFilter === "ALL") return observations;
    return observations.filter((o) => o.category === obsCategoryFilter);
  }, [observations, obsCategoryFilter]);

  const handleMoveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextLoc = locForm.location.trim();
    const nextAddress = locForm.locationAddress.trim();
    const lat = locForm.latitude.trim() !== "" ? Number(locForm.latitude.replace(",", ".")) : null;
    const lng = locForm.longitude.trim() !== "" ? Number(locForm.longitude.replace(",", ".")) : null;

    if (!nextLoc && !nextAddress && (lat === null || lng === null)) {
      toast("Informe a fazenda, o endereço ou as coordenadas GPS.", "error");
      return;
    }
    if ((lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) {
      toast("Coordenadas GPS inválidas.", "error");
      return;
    }

    const payload = {
      location: nextLoc || nextAddress || "Fazenda via GPS",
      address: nextAddress || null,
      latitude: lat,
      longitude: lng,
      reason: locReason.trim() || "Movimentação entre fazendas/setores",
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueSync(
        `/api/animals/${encodeURIComponent(animal.id)}/locations`,
        "POST",
        payload,
        false,
        `Localização: ${payload.location}`
      );
      setLocForm({ location: "", locationAddress: "", latitude: "", longitude: "" });
      setLocReason("");
      toast("Sem internet: movimentação salva na fila offline.", "info");
      return;
    }

    setSavingLocation(true);
    try {
      await createAnimalLocationLog(animal.id, payload);
      setLocForm({ location: "", locationAddress: "", latitude: "", longitude: "" });
      setLocReason("");
      toast("Localização da fazenda atualizada!", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao atualizar localização.", "error");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vacForm.name.trim()) {
      toast("Informe o nome da vacina.", "error");
      return;
    }
    const payload = {
      name: vacForm.name.trim(),
      dose: vacForm.dose.trim() || null,
      batch: vacForm.batch.trim() || null,
      appliedAt: vacForm.appliedAt || undefined,
      nextDueAt: vacForm.nextDueAt || null,
      notes: vacForm.notes.trim() || null,
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueSync(
        `/api/animals/${encodeURIComponent(animal.id)}/vaccines`,
        "POST",
        payload,
        false,
        `Vacina: ${payload.name}`
      );
      setVacForm({
        name: "",
        dose: "",
        batch: "",
        appliedAt: new Date().toISOString().slice(0, 10),
        nextDueAt: "",
        notes: "",
      });
      toast("Sem internet: vacina enfileirada para sincronização.", "info");
      return;
    }

    setSavingVaccine(true);
    try {
      await createVaccineRecord(animal.id, payload);
      setVacForm({
        name: "",
        dose: "",
        batch: "",
        appliedAt: new Date().toISOString().slice(0, 10),
        nextDueAt: "",
        notes: "",
      });
      toast("Vacina registrada!", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao registrar vacina.", "error");
    } finally {
      setSavingVaccine(false);
    }
  };

  const handleDeleteVaccine = async (vaccineId: string) => {
    const ok = await confirm({
      title: "Remover registro de vacina",
      message: "Deseja realmente excluir este registro de vacinação?",
      confirmText: "Remover",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteVaccineRecord(animal.id, vaccineId);
      toast("Registro de vacina removido.", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao remover vacina.", "error");
    }
  };

  const handleAddDisease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disForm.name.trim()) {
      toast("Informe a doença ou ocorrência clínica.", "error");
      return;
    }
    const payload = {
      name: disForm.name.trim(),
      status: disForm.status,
      symptoms: disForm.symptoms.trim() || null,
      treatment: disForm.treatment.trim() || null,
      diagnosedAt: disForm.diagnosedAt || undefined,
      notes: disForm.notes.trim() || null,
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueSync(
        `/api/animals/${encodeURIComponent(animal.id)}/diseases`,
        "POST",
        payload,
        false,
        `Ocorrência: ${payload.name}`
      );
      setDisForm({
        name: "",
        status: "ACTIVE",
        symptoms: "",
        treatment: "",
        diagnosedAt: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      toast("Sem internet: ocorrência clínica salva na fila offline.", "info");
      return;
    }

    setSavingDisease(true);
    try {
      await createDiseaseRecord(animal.id, payload);
      setDisForm({
        name: "",
        status: "ACTIVE",
        symptoms: "",
        treatment: "",
        diagnosedAt: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      toast("Ocorrência clínica registrada!", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao registrar ocorrência.", "error");
    } finally {
      setSavingDisease(false);
    }
  };

  const handleChangeDiseaseStatus = async (diseaseId: string, status: DiseaseStatus) => {
    try {
      await updateDiseaseRecord(animal.id, diseaseId, {
        status,
        recoveredAt: status === "RECOVERED" ? new Date().toISOString() : null,
      });
      toast("Status clínico atualizado.", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao atualizar status.", "error");
    }
  };

  const handleDeleteDisease = async (diseaseId: string) => {
    const ok = await confirm({
      title: "Remover registro clínico",
      message: "Deseja realmente excluir esta ocorrência clínica?",
      confirmText: "Remover",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteDiseaseRecord(animal.id, diseaseId);
      toast("Registro clínico removido.", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao remover registro clínico.", "error");
    }
  };

  const handleAddObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsForm.content.trim()) {
      toast("Escreva o conteúdo da observação.", "error");
      return;
    }
    const payload = {
      category: obsForm.category,
      title: obsForm.title.trim() || null,
      content: obsForm.content.trim(),
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueSync(
        `/api/animals/${encodeURIComponent(animal.id)}/observations`,
        "POST",
        payload,
        false,
        `Observação (${payload.category})`
      );
      setObsForm({ category: "GERAL", title: "", content: "" });
      toast("Sem internet: observação salva na fila offline.", "info");
      return;
    }

    setSavingObs(true);
    try {
      await createObservationRecord(animal.id, payload);
      setObsForm({ category: "GERAL", title: "", content: "" });
      toast("Observação registrada!", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao registrar observação.", "error");
    } finally {
      setSavingObs(false);
    }
  };

  const handleSaveEditObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingObs || !editObsForm.content.trim()) return;
    try {
      await updateObservationRecord(animal.id, editingObs.id, {
        category: editObsForm.category,
        title: editObsForm.title.trim() || null,
        content: editObsForm.content.trim(),
      });
      setEditingObs(null);
      toast("Observação atualizada.", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao atualizar observação.", "error");
    }
  };

  const handleDeleteObservation = async (obsId: string) => {
    const ok = await confirm({
      title: "Excluir observação",
      message: "Deseja realmente remover esta observação da ficha?",
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteObservationRecord(animal.id, obsId);
      toast("Observação removida.", "success");
      await onReloadAnimal();
    } catch (err: any) {
      toast(err?.message || "Erro ao remover observação.", "error");
    }
  };

  const tabs: {
    id: AnimalTabId;
    label: string;
    icon: React.ReactNode;
    count: number;
  }[] = [
    {
      id: "gallery",
      label: "Avaliação & Galeria",
      icon: <Images className="w-3.5 h-3.5" />,
      count: photoCount,
    },
    {
      id: "locations",
      label: "Localização",
      icon: <MapPin className="w-3.5 h-3.5" />,
      count: locationLogs.length,
    },
    {
      id: "vaccines",
      label: "Vacinas",
      icon: <Syringe className="w-3.5 h-3.5" />,
      count: vaccines.length,
    },
    {
      id: "diseases",
      label: "Doenças",
      icon: <Stethoscope className="w-3.5 h-3.5" />,
      count: diseases.length,
    },
    {
      id: "observations",
      label: "Observações",
      icon: <FileText className="w-3.5 h-3.5" />,
      count: observations.length,
    },
    ...(custodyContent
      ? [
          {
            id: "custody" as const,
            label: "Equipe",
            icon: <Users className="w-3.5 h-3.5" />,
            count: collaboratorsCount,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Navegação em abas sublinhada editorial */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-theme">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`px-3.5 py-2.5 text-xs sm:text-[13px] font-semibold transition whitespace-nowrap inline-flex items-center gap-1.5 border-b-2 -mb-px ${
                active
                  ? "border-[var(--color-brand)] text-theme-primary"
                  : "border-transparent text-theme-muted hover:text-theme-primary"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                  active ? "bg-brand-soft font-bold" : "bg-theme-surface-2 text-theme-muted"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "custody" && custodyContent}

      {/* Conteúdo da Aba Ativa */}
      {activeTab === "gallery" && galleryContent}

      {/* Aba Localização */}
      {activeTab === "locations" && (() => {
        const currentCoords = formatCoordinates(animal.latitude, animal.longitude);
        const currentMapsUrl = buildGoogleMapsUrl(
          animal.latitude,
          animal.longitude,
          animal.locationAddress || animal.location
        );
        const canEmbedMap =
          typeof animal.latitude === "number" &&
          typeof animal.longitude === "number" &&
          Number.isFinite(animal.latitude) &&
          Number.isFinite(animal.longitude);

        return (
          <div className="card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-theme">
              <div className="min-w-0 space-y-1">
                <h2 className="text-base font-bold text-theme-primary">
                  Fazenda Atual & Histórico de Movimentação
                </h2>
                <p className="text-xs text-theme-secondary">
                  Fazenda / Setor:{" "}
                  <strong className="text-theme-primary">
                    {animal.location || "Não informada"}
                  </strong>
                </p>
                {animal.locationAddress && (
                  <p className="text-xs text-theme-secondary">{animal.locationAddress}</p>
                )}
                {currentCoords && (
                  <p className="text-[11px] font-mono text-theme-muted tabular-nums">
                    GPS: {currentCoords}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canEmbedMap && (
                  <button
                    type="button"
                    onClick={() => setShowMapPreview((v) => !v)}
                    className="btn-secondary !py-1.5 !px-3 !min-h-[34px] text-xs font-semibold"
                  >
                    {showMapPreview ? "Ocultar mapa" : "Ver mapa"}
                  </button>
                )}
                {currentMapsUrl && (
                  <a
                    href={currentMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary !py-1.5 !px-3 !min-h-[34px] text-xs font-semibold text-emerald-700 dark:text-emerald-400"
                  >
                    <span>Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {showMapPreview && canEmbedMap && (
              <div className="rounded-xl overflow-hidden border border-theme bg-theme-surface-2">
                <iframe
                  title="Mapa da fazenda atual"
                  src={buildOsmEmbedUrl(animal.latitude as number, animal.longitude as number)}
                  className="w-full h-56 border-0"
                  loading="lazy"
                />
              </div>
            )}

            {canEdit && (
              <form
                onSubmit={handleMoveLocation}
                className="space-y-3"
              >
                <FarmLocationFields
                  value={locForm}
                  onChange={setLocForm}
                  locationLabel="Nova fazenda ou setor"
                  locationPlaceholder="Ex: Fazenda Boa Vista · Retiro Norte"
                  compact
                />

                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
                  <input
                    type="text"
                    value={locReason}
                    onChange={(e) => setLocReason(e.target.value)}
                    placeholder="Motivo (opcional: transferência de propriedade, rotação de pasto)"
                    className="field-input text-xs flex-1"
                  />
                  <button
                    type="submit"
                    disabled={savingLocation}
                    className="btn-primary py-2 px-4 text-xs font-semibold shrink-0"
                  >
                    {savingLocation ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5" />
                    )}
                    <span>Registrar movimentação</span>
                  </button>
                </div>
              </form>
            )}

            {locationLogs.length === 0 ? (
              <p className="text-xs text-theme-muted py-4 text-center">
                Nenhuma movimentação registrada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {locationLogs.map((log) => {
                  const logCoords = formatCoordinates(log.latitude, log.longitude);
                  const logMapsUrl = buildGoogleMapsUrl(
                    log.latitude,
                    log.longitude,
                    log.address || log.location
                  );
                  return (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg bg-theme-surface-2/70 border border-theme flex flex-col sm:flex-row sm:items-start justify-between gap-2"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-xs font-bold text-theme-primary">{log.location}</p>
                        {log.address && (
                          <p className="text-[11px] text-theme-secondary">{log.address}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-theme-muted">
                          {logCoords && (
                            <span className="font-mono tabular-nums">GPS {logCoords}</span>
                          )}
                          {logMapsUrl && (
                            <a
                              href={logMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-700 dark:text-emerald-400 hover:underline font-medium inline-flex items-center gap-0.5"
                            >
                              Maps <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {log.reason && (
                          <p className="text-[11px] text-theme-secondary pt-0.5">{log.reason}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-theme-muted tabular-nums shrink-0">
                        {new Date(log.movedAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Aba Vacinas */}
      {activeTab === "vaccines" && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="pb-3 border-b border-theme">
            <h2 className="text-base font-bold text-theme-primary">Controle de Vacinas</h2>
            <p className="text-xs text-theme-secondary mt-0.5">
              Aplicações realizadas, lotes e previsão de reforço
            </p>
          </div>

          {canEdit && (
            <form
              onSubmit={handleAddVaccine}
              className="p-3.5 rounded-xl bg-theme-surface-2 border border-theme space-y-3"
            >
              <p className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                Nova aplicação de vacina
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={vacForm.name}
                  onChange={(e) => setVacForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nome da vacina (ex: Febre Aftosa)"
                  className="field-input text-xs sm:col-span-1"
                  required
                />
                <input
                  type="text"
                  value={vacForm.dose}
                  onChange={(e) => setVacForm((p) => ({ ...p, dose: e.target.value }))}
                  placeholder="Dose (ex: 2 ml)"
                  className="field-input text-xs"
                />
                <input
                  type="text"
                  value={vacForm.batch}
                  onChange={(e) => setVacForm((p) => ({ ...p, batch: e.target.value }))}
                  placeholder="Lote (opcional)"
                  className="field-input text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold uppercase text-theme-muted block mb-1">
                    Data da aplicação
                  </label>
                  <input
                    type="date"
                    value={vacForm.appliedAt}
                    onChange={(e) => setVacForm((p) => ({ ...p, appliedAt: e.target.value }))}
                    className="field-input text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-theme-muted block mb-1">
                    Próximo reforço (opcional)
                  </label>
                  <input
                    type="date"
                    value={vacForm.nextDueAt}
                    onChange={(e) => setVacForm((p) => ({ ...p, nextDueAt: e.target.value }))}
                    className="field-input text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase text-theme-muted block mb-1">
                    Observação
                  </label>
                  <input
                    type="text"
                    value={vacForm.notes}
                    onChange={(e) => setVacForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Via subcutânea, campanha…"
                    className="field-input text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={savingVaccine}
                className="btn-primary py-2 px-4 text-xs font-semibold"
              >
                {savingVaccine ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Syringe className="w-3.5 h-3.5" />
                )}
                <span>Registrar vacina</span>
              </button>
            </form>
          )}

          {vaccines.length === 0 ? (
            <p className="text-xs text-theme-muted py-4 text-center">
              Nenhuma vacina registrada para este animal.
            </p>
          ) : (
            <div className="space-y-2.5">
              {vaccines.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg bg-theme-surface-2/70 border border-theme flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-theme-primary">{v.name}</span>
                      {v.dose && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-theme-surface border border-theme text-theme-secondary">
                          Dose: {v.dose}
                        </span>
                      )}
                      {v.batch && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-surface border border-theme text-theme-muted">
                          Lote {v.batch}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-theme-secondary tabular-nums">
                      Aplicada em {new Date(v.appliedAt).toLocaleDateString("pt-BR")}
                      {v.nextDueAt &&
                        ` · Reforço previsto: ${new Date(v.nextDueAt).toLocaleDateString("pt-BR")}`}
                    </p>
                    {v.notes && <p className="text-[11px] text-theme-muted">{v.notes}</p>}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVaccine(v.id)}
                      className="p-1.5 rounded-md text-theme-muted hover:text-red-500 hover:bg-red-500/10 transition shrink-0"
                      title="Excluir vacina"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Aba Doenças */}
      {activeTab === "diseases" && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="pb-3 border-b border-theme">
            <h2 className="text-base font-bold text-theme-primary">Histórico Clínico e Doenças</h2>
            <p className="text-xs text-theme-secondary mt-0.5">
              Registro sanitário de ocorrências, sintomas e tratamentos aplicados
            </p>
          </div>

          {canEdit && (
            <form
              onSubmit={handleAddDisease}
              className="p-3.5 rounded-xl bg-theme-surface-2 border border-theme space-y-3"
            >
              <p className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-emerald-600" />
                Nova ocorrência clínica
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={disForm.name}
                  onChange={(e) => setDisForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Doença ou ocorrência (ex: Tristeza Parasitária)"
                  className="field-input text-xs sm:col-span-1"
                  required
                />
                <select
                  value={disForm.status}
                  onChange={(e) =>
                    setDisForm((p) => ({ ...p, status: e.target.value as DiseaseStatus }))
                  }
                  className="field-input text-xs"
                >
                  <option value="ACTIVE">Em tratamento</option>
                  <option value="MONITORING">Em observação</option>
                  <option value="RECOVERED">Curado</option>
                </select>
                <input
                  type="date"
                  value={disForm.diagnosedAt}
                  onChange={(e) =>
                    setDisForm((p) => ({ ...p, diagnosedAt: e.target.value }))
                  }
                  className="field-input text-xs"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={disForm.symptoms}
                  onChange={(e) => setDisForm((p) => ({ ...p, symptoms: e.target.value }))}
                  placeholder="Sintomas observados"
                  className="field-input text-xs"
                />
                <input
                  type="text"
                  value={disForm.treatment}
                  onChange={(e) => setDisForm((p) => ({ ...p, treatment: e.target.value }))}
                  placeholder="Tratamento / medicação"
                  className="field-input text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={savingDisease}
                className="btn-primary py-2 px-4 text-xs font-semibold"
              >
                {savingDisease ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Stethoscope className="w-3.5 h-3.5" />
                )}
                <span>Registrar ocorrência</span>
              </button>
            </form>
          )}

          {diseases.length === 0 ? (
            <p className="text-xs text-theme-muted py-4 text-center">
              Nenhuma ocorrência clínica registrada para este animal.
            </p>
          ) : (
            <div className="space-y-2.5">
              {diseases.map((d) => {
                const statusMeta = DISEASE_STATUS_META[d.status] || DISEASE_STATUS_META.ACTIVE;
                return (
                  <div
                    key={d.id}
                    className="p-3 rounded-lg bg-theme-surface-2/70 border border-theme flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-theme-primary">{d.name}</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${statusMeta.badgeClass}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-theme-secondary tabular-nums">
                        Diagnosticada em {new Date(d.diagnosedAt).toLocaleDateString("pt-BR")}
                        {d.recoveredAt &&
                          ` · Alta em ${new Date(d.recoveredAt).toLocaleDateString("pt-BR")}`}
                      </p>
                      {d.symptoms && (
                        <p className="text-[11px] text-theme-secondary">
                          <strong>Sintomas:</strong> {d.symptoms}
                        </p>
                      )}
                      {d.treatment && (
                        <p className="text-[11px] text-theme-secondary">
                          <strong>Tratamento:</strong> {d.treatment}
                        </p>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                        <select
                          aria-label="Alterar status clínico"
                          value={d.status}
                          onChange={(e) =>
                            handleChangeDiseaseStatus(d.id, e.target.value as DiseaseStatus)
                          }
                          className="field-input !w-auto !py-1 !px-2 text-[11px]"
                        >
                          <option value="ACTIVE">Em tratamento</option>
                          <option value="MONITORING">Em observação</option>
                          <option value="RECOVERED">Curado</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteDisease(d.id)}
                          className="p-1.5 rounded-md text-theme-muted hover:text-red-500 hover:bg-red-500/10 transition"
                          title="Excluir ocorrência"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba Observações Gerais (`AnimalObservation`) */}
      {activeTab === "observations" && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="pb-3 border-b border-theme">
            <h2 className="text-base font-bold text-theme-primary">Observações Gerais</h2>
            <p className="text-xs text-theme-secondary mt-0.5">
              Anotações de manejo, nutrição, comportamento e histórico livre do animal
            </p>
          </div>

          {animal.observations && (
            <div className="p-3 rounded-lg bg-emerald-500/8 border border-emerald-500/20 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                  Resumo na ficha
                </span>
                <p className="text-xs text-theme-primary mt-0.5 whitespace-pre-wrap">
                  {animal.observations}
                </p>
              </div>
            </div>
          )}

          {canEdit && (
            <form
              onSubmit={handleAddObservation}
              className="p-3.5 rounded-xl bg-theme-surface-2 border border-theme space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-theme-primary flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  Nova observação
                </span>
                <select
                  aria-label="Categoria da observação"
                  value={obsForm.category}
                  onChange={(e) =>
                    setObsForm((p) => ({
                      ...p,
                      category: e.target.value as ObservationCategory,
                    }))
                  }
                  className="field-input !w-auto !py-1 !px-2.5 text-xs"
                >
                  {(Object.keys(OBSERVATION_CATEGORY_LABELS) as ObservationCategory[]).map(
                    (cat) => (
                      <option key={cat} value={cat}>
                        {OBSERVATION_CATEGORY_LABELS[cat]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <input
                type="text"
                value={obsForm.title}
                onChange={(e) => setObsForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="Título resumido (opcional)"
                className="field-input text-xs"
              />
              <textarea
                rows={2}
                required
                value={obsForm.content}
                onChange={(e) => setObsForm((p) => ({ ...p, content: e.target.value }))}
                placeholder="Descreva a observação de manejo, dieta, comportamento ou nota geral…"
                className="field-input text-xs resize-y min-h-[60px]"
              />
              <button
                type="submit"
                disabled={savingObs}
                className="btn-primary py-2 px-4 text-xs font-semibold"
              >
                {savingObs ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Activity className="w-3.5 h-3.5" />
                )}
                <span>Adicionar observação</span>
              </button>
            </form>
          )}

          {/* Filtro por categoria */}
          {observations.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                ["ALL", "GERAL", "MANEJO", "NUTRICAO", "COMPORTAMENTO", "OUTRA"] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setObsCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition whitespace-nowrap ${
                    obsCategoryFilter === cat
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-theme-surface text-theme-secondary border-theme hover:text-theme-primary"
                  }`}
                >
                  {cat === "ALL" ? "Todas" : OBSERVATION_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {filteredObservations.length === 0 ? (
            <p className="text-xs text-theme-muted py-4 text-center">
              Nenhuma observação cadastrada nesta categoria.
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredObservations.map((obs) => {
                const isEditingThis = editingObs?.id === obs.id;
                return (
                  <div
                    key={obs.id}
                    className="p-3 rounded-lg bg-theme-surface-2/70 border border-theme space-y-2"
                  >
                    {isEditingThis ? (
                      <form onSubmit={handleSaveEditObservation} className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={editObsForm.category}
                            onChange={(e) =>
                              setEditObsForm((p) => ({
                                ...p,
                                category: e.target.value as ObservationCategory,
                              }))
                            }
                            className="field-input !w-auto !py-1 !px-2 text-xs"
                          >
                            {(
                              Object.keys(OBSERVATION_CATEGORY_LABELS) as ObservationCategory[]
                            ).map((cat) => (
                              <option key={cat} value={cat}>
                                {OBSERVATION_CATEGORY_LABELS[cat]}
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingObs(null)}
                              className="p-1 rounded text-theme-muted hover:text-theme-primary"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={editObsForm.title}
                          onChange={(e) =>
                            setEditObsForm((p) => ({ ...p, title: e.target.value }))
                          }
                          placeholder="Título (opcional)"
                          className="field-input text-xs"
                        />
                        <textarea
                          rows={2}
                          required
                          value={editObsForm.content}
                          onChange={(e) =>
                            setEditObsForm((p) => ({ ...p, content: e.target.value }))
                          }
                          className="field-input text-xs"
                        />
                        <button type="submit" className="btn-primary py-1.5 px-3 text-xs">
                          <Check className="w-3 h-3" /> Salvar
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-theme-surface border border-theme text-emerald-700 dark:text-emerald-400">
                              {OBSERVATION_CATEGORY_LABELS[obs.category] || obs.category}
                            </span>
                            {obs.title && (
                              <span className="text-xs font-bold text-theme-primary">
                                {obs.title}
                              </span>
                            )}
                            <span className="text-[11px] text-theme-muted tabular-nums">
                              {new Date(obs.observedAt).toLocaleString("pt-BR", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-theme-primary whitespace-pre-wrap leading-relaxed">
                            {obs.content}
                          </p>
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingObs(obs);
                                setEditObsForm({
                                  category: obs.category,
                                  title: obs.title || "",
                                  content: obs.content,
                                });
                              }}
                              className="p-1.5 rounded-md text-theme-muted hover:text-theme-primary hover:bg-theme-surface transition"
                              title="Editar observação"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteObservation(obs.id)}
                              className="p-1.5 rounded-md text-theme-muted hover:text-red-500 hover:bg-red-500/10 transition"
                              title="Excluir observação"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
