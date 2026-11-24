"use client";

/**
 * Prontuário Completo do Animal (`src/app/animal/[id]/page.tsx`).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Camera,
  Tag,
  Upload,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Activity,
  AlertTriangle,
  Users,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  Copy,
  ExternalLink,
  MapPin,
  Bluetooth,
  BluetoothConnected,
} from "lucide-react";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoLightbox from "@/components/PhotoLightbox";
import AppShell from "@/components/AppShell";
import AnimalHealthTabs, { AnimalTabId } from "@/components/animal/AnimalHealthTabs";
import FarmLocationFields from "@/components/FarmLocationFields";
import { buildGoogleMapsUrl, formatCoordinates } from "@/lib/location";
import { useToast } from "@/components/ui/Toast";
import { Animal, Photo } from "@/lib/types";
import { BREEDS, SEX_OPTIONS, normalizeTag } from "@/lib/animal";
import { bluetoothRfid, BluetoothStatus } from "@/lib/bluetooth-rfid";
import { compressImageFile } from "@/lib/image-client";
import { evaluatePhotoScoreBeforeUpload, VisionScoreResult } from "@/lib/vision-client";
import {
  apiFetch,
  apiFetchCached,
  apiUpload,
  getApiCacheSnapshot,
  invalidateApiCache,
  readPersistedApiCache,
  recalibratePhotosSequentially,
  addCollaborator,
  removeCollaborator,
  transferOwnership,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface PendingGalleryPhoto {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  evaluating: boolean;
  scoreResult: VisionScoreResult | null;
}

function PageSkeleton() {
  return (
    <AppShell showBack backHref="/dashboard" title="Carregando ficha…">
      <div className="space-y-5">
        <div className="h-44 skeleton rounded-[14px]" />
        <div className="h-10 skeleton rounded-[10px] w-72" />
        <div className="h-64 skeleton rounded-[14px]" />
      </div>
    </AppShell>
  );
}

export default function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detailEndpoint = id ? `/api/animals/${id}` : "";
  const cachedAnimal = detailEndpoint ? getApiCacheSnapshot<Animal>(detailEndpoint) : null;

  const [animal, setAnimal] = useState<Animal | null>(() => cachedAnimal);
  const [loading, setLoading] = useState<boolean>(() => !cachedAnimal);
  const [uploading, setUploading] = useState(false);
  const [recalibratingAnimal, setRecalibratingAnimal] = useState(false);
  const [recalibratingProgress, setRecalibratingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [pendingPhoto, setPendingPhoto] = useState<PendingGalleryPhoto | null>(null);
  const [copiedTag, setCopiedTag] = useState(false);
  const [activeTab, setActiveTab] = useState<AnimalTabId>("gallery");

  const [bleSupported, setBleSupported] = useState(true);
  const [bleStatus, setBleStatus] = useState<BluetoothStatus>("disconnected");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [custodyActionLoading, setCustodyActionLoading] = useState(false);

  const isPresetBreed = (b?: string) =>
    Boolean(b && BREEDS.filter((preset) => preset !== "Outra").includes(b as any));

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState(() => {
    const initialBreed = cachedAnimal?.breed ?? "Nelore";
    const preset = isPresetBreed(initialBreed);
    return {
      tag: cachedAnimal?.tag ?? "",
      name: cachedAnimal?.name ?? "",
      breed: preset ? initialBreed : "Outra",
      customBreed: preset ? "" : initialBreed,
      sex: cachedAnimal?.sex ?? "Fêmea",
      weight: cachedAnimal ? String(cachedAnimal.weight) : "",
      age: cachedAnimal ? String(cachedAnimal.age) : "",
      length: cachedAnimal?.length != null ? String(cachedAnimal.length) : "",
      location: cachedAnimal?.location ?? "",
      locationAddress: cachedAnimal?.locationAddress ?? "",
      latitude: cachedAnimal?.latitude != null ? String(cachedAnimal.latitude) : "",
      longitude: cachedAnimal?.longitude != null ? String(cachedAnimal.longitude) : "",
      observations: cachedAnimal?.observations ?? "",
    };
  });

  const isAnimalOwner = Boolean(
    animal &&
      (animal.isOwner ??
        animal.custody?.isOwner ??
        (user ? animal.ownerId === Number(user.id) : false))
  );
  const canEditTag = isAnimalOwner || isAdmin;

  const currentEditTagRef = useRef(editForm.tag);
  useEffect(() => {
    currentEditTagRef.current = editForm.tag;
  }, [editForm.tag]);

  useEffect(() => {
    setBleSupported(bluetoothRfid.isSupported());
    setBleStatus(bluetoothRfid.getStatus());

    const unsubStatus = bluetoothRfid.onStatusChange((status, _name, errMsg) => {
      setBleStatus(status);
      if (status === "error" && errMsg) toast(errMsg, "error");
    });

    const unsubTag = bluetoothRfid.onTag((detail) => {
      if (!editing || !canEditTag) return;
      const normalized = normalizeTag(detail.tag);
      if (currentEditTagRef.current === normalized) return;
      currentEditTagRef.current = normalized;
      setEditForm((prev) => ({ ...prev, tag: normalized }));
      toast(`Código atualizado via Bluetooth: ${normalized}`, "success");
    });

    return () => {
      unsubStatus();
      unsubTag();
    };
  }, [canEditTag, editing, toast]);

  const handleToggleEditBle = async () => {
    if (bleStatus === "connected") {
      bluetoothRfid.disconnect();
      return;
    }
    const ok = await bluetoothRfid.connect();
    if (ok) toast("Leitor conectado.", "success");
  };

  const loadAnimal = useCallback(
    async (forceRefresh = false) => {
      if (!id) return;
      const endpoint = `/api/animals/${id}`;
      if (forceRefresh) invalidateApiCache(endpoint);
      try {
        const data = await apiFetchCached<Animal>(endpoint, forceRefresh ? 0 : 12_000);
        if (data) {
          setAnimal(data);
          const preset = isPresetBreed(data.breed);
          setEditForm({
            tag: data.tag,
            name: data.name || "",
            breed: preset ? data.breed : "Outra",
            customBreed: preset ? "" : data.breed,
            sex: data.sex,
            weight: String(data.weight),
            age: String(data.age),
            length: data.length != null ? String(data.length) : "",
            location: data.location || "",
            locationAddress: data.locationAddress || "",
            latitude: data.latitude != null ? String(data.latitude) : "",
            longitude: data.longitude != null ? String(data.longitude) : "",
            observations: data.observations || "",
          });
        }
      } catch (err: any) {
        if (err?.message?.includes("401") || err?.message?.includes("Token")) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    },
    [id, router]
  );

  useEffect(() => {
    if (id && !cachedAnimal) {
      const persisted = readPersistedApiCache<Animal>(`/api/animals/${id}`);
      if (persisted) {
        setAnimal(persisted);
        setLoading(false);
      }
    }
    loadAnimal(false);
  }, [id, cachedAnimal, loadAnimal]);

  const copyTag = () => {
    if (!animal) return;
    navigator.clipboard.writeText(animal.tag);
    setCopiedTag(true);
    toast("Identificador copiado.", "info");
    setTimeout(() => setCopiedTag(false), 2000);
  };

  const handleSelectFromGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !animal) return;

    try {
      const compressed = await compressImageFile(file, 2048, 0.94);
      setPendingPhoto({
        blob: compressed.blob,
        previewUrl: URL.createObjectURL(compressed.blob),
        fileName: file.name,
        evaluating: true,
        scoreResult: null,
      });

      const scoreRes = await evaluatePhotoScoreBeforeUpload(compressed.blob);
      setPendingPhoto((prev) =>
        prev ? { ...prev, evaluating: false, scoreResult: scoreRes } : null
      );
    } catch {
      toast("Não foi possível processar a imagem selecionada.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmGalleryUpload = async () => {
    if (!pendingPhoto || !animal) return;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append("file", pendingPhoto.blob, `rear_${animal.tag}_${Date.now()}.jpg`);
      fd.append("animalId", animal.id);
      fd.append("view", "REAR");
      if (pendingPhoto.scoreResult) {
        fd.append("preScore", String(pendingPhoto.scoreResult.score));
        fd.append(
          "aiSource",
          pendingPhoto.scoreResult.localRuntime
            ? "yolo-onnx-client"
            : pendingPhoto.scoreResult.source
        );
      }

      const data = await apiUpload<{ photo: Photo }>("/api/photos/upload", fd);
      if (data?.photo) {
        setAnimal((prev) =>
          prev ? { ...prev, photos: [data.photo as Photo, ...(prev.photos ?? [])] } : prev
        );
        toast(
          `Foto salva (enquadramento ${Math.round(
            data.photo.score ?? pendingPhoto.scoreResult?.score ?? 0
          )}%).`,
          "success"
        );
        setPendingPhoto(null);
      }
    } catch (err: any) {
      toast(err?.message || "Falha ao enviar foto.", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const ok = await confirm({
      title: "Excluir foto",
      message: "Deseja realmente apagar esta foto? Esta ação não pode ser desfeita.",
      confirmText: "Excluir",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/photos/${photoId}`, { method: "DELETE" });
      setAnimal((prev) =>
        prev ? { ...prev, photos: prev.photos.filter((p: Photo) => p.id !== photoId) } : prev
      );
      toast("Foto removida.", "success");
    } catch (err: any) {
      toast(err?.message || "Não foi possível excluir a foto.", "error");
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animal) return;
    const effectiveBreed =
      editForm.breed === "Outra" ? editForm.customBreed.trim() : editForm.breed.trim();

    if (!effectiveBreed) {
      toast("Digite o nome da raça personalizada.", "error");
      return;
    }

    setSavingEdit(true);
    try {
      const data = await apiFetch<Animal>(`/api/animals/${animal.id}`, {
        method: "PATCH",
        body: {
          tag: editForm.tag,
          name: editForm.name,
          breed: effectiveBreed,
          sex: editForm.sex,
          weight: Number(editForm.weight),
          age: Number(editForm.age),
          length: editForm.length.trim() !== "" ? Number(editForm.length) : null,
          location: editForm.location.trim() || null,
          locationAddress: editForm.locationAddress.trim() || null,
          latitude:
            editForm.latitude.trim() !== ""
              ? Number(editForm.latitude.replace(",", "."))
              : null,
          longitude:
            editForm.longitude.trim() !== ""
              ? Number(editForm.longitude.replace(",", "."))
              : null,
          observations: editForm.observations.trim() || null,
        },
      });

      if (data) {
        setEditing(false);
        toast("Dados atualizados.", "success");
        await loadAnimal(true);
      }
    } catch (err: any) {
      toast(err?.message || "Erro ao atualizar dados.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteAnimal = async () => {
    if (!animal) return;
    const ok = await confirm({
      title: `Excluir ${animal.name || animal.tag}`,
      message: `Deseja excluir este animal e suas ${animal.photos?.length ?? 0} foto(s)? Esta ação é irreversível.`,
      confirmText: "Excluir definitivamente",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/animals/${animal.id}`, { method: "DELETE" });
      toast("Animal excluído.", "success");
      router.push("/dashboard");
    } catch (err: any) {
      toast(err?.message || "Erro ao excluir animal.", "error");
    }
  };

  const handleRecalibrateAnimal = async () => {
    if (recalibratingAnimal || !animal) return;
    const photoIds = (animal.photos ?? []).map((p) => p.id);
    if (photoIds.length === 0) return;

    setRecalibratingAnimal(true);
    setRecalibratingProgress({ current: 0, total: photoIds.length });
    try {
      const summary = await recalibratePhotosSequentially(
        photoIds,
        ({ current, total, photoId, newScore }) => {
          setRecalibratingProgress({ current, total });
          if (newScore !== null) {
            setAnimal((prev) =>
              prev
                ? {
                    ...prev,
                    photos: (prev.photos ?? []).map((p) =>
                      p.id === photoId ? { ...p, score: newScore } : p
                    ),
                  }
                : prev
            );
          }
        }
      );

      toast(
        `${summary.updatedCount} de ${summary.totalCount} foto(s) reavaliadas.`,
        summary.failedCount > 0 ? "info" : "success"
      );
      invalidateApiCache("/api/animals");
      invalidateApiCache("/api/admin/animals");
      await loadAnimal(true);
    } catch (err: any) {
      toast(err?.message || "Erro ao reavaliar enquadramento.", "error");
    } finally {
      setRecalibratingAnimal(false);
      setRecalibratingProgress(null);
    }
  };

  const handlePhotoRecalibrated = (photoId: string, newScore: number) => {
    setAnimal((prev) =>
      prev
        ? {
            ...prev,
            photos: (prev.photos ?? []).map((p) =>
              p.id === photoId ? { ...p, score: newScore } : p
            ),
          }
        : prev
    );
    invalidateApiCache("/api/animals");
    invalidateApiCache("/api/admin/animals");
    toast(`Enquadramento atualizado para ${Math.round(newScore)}%.`, "success");
    void loadAnimal(true);
  };

  const handleInviteCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !animal) return;
    setInviting(true);
    try {
      const res = await addCollaborator(animal.id, { email: inviteEmail.trim() });
      toast(res.message || "Operador adicionado.", "success");
      setInviteEmail("");
      if (res.custody) {
        setAnimal((prev) => (prev ? { ...prev, custody: res.custody } : prev));
      } else {
        await loadAnimal(true);
      }
    } catch (err: any) {
      toast(err?.message || "Erro ao adicionar operador.", "error");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveCollaborator = async (targetUserId: number, targetName: string) => {
    if (!animal) return;
    const ok = await confirm({
      title: "Remover acesso",
      message: `Remover o acesso de ${targetName} a este animal?`,
      confirmText: "Remover",
      variant: "danger",
    });
    if (!ok) return;

    setCustodyActionLoading(true);
    try {
      const res = await removeCollaborator(animal.id, targetUserId);
      toast(res.message || "Acesso removido.", "success");
      if (res.custody) {
        setAnimal((prev) => (prev ? { ...prev, custody: res.custody } : prev));
      } else {
        await loadAnimal(true);
      }
    } catch (err: any) {
      toast(err?.message || "Erro ao remover acesso.", "error");
    } finally {
      setCustodyActionLoading(false);
    }
  };

  const handleTransferOwnership = async (newOwnerId: number, targetName: string) => {
    if (!animal) return;
    const ok = await confirm({
      title: "Transferir posse principal",
      message: `Transferir a propriedade principal para ${targetName}? Você continuará como colaborador.`,
      confirmText: "Transferir",
      variant: "danger",
    });
    if (!ok) return;

    setCustodyActionLoading(true);
    try {
      const res = await transferOwnership(animal.id, newOwnerId);
      toast(res.message || "Posse transferida.", "success");
      if (res.custody) {
        setAnimal((prev) =>
          prev ? { ...prev, custody: res.custody, isOwner: false, isShared: true } : prev
        );
      }
      await loadAnimal(true);
    } catch (err: any) {
      toast(err?.message || "Erro ao transferir posse.", "error");
    } finally {
      setCustodyActionLoading(false);
    }
  };

  if (loading) return <PageSkeleton />;

  if (!animal) {
    return (
      <AppShell showBack backHref="/dashboard" title="Animal não encontrado">
        <div className="card p-8 text-center max-w-sm mx-auto mt-8">
          <p className="font-bold text-theme-primary mb-2">Animal não encontrado</p>
          <p className="text-xs text-theme-secondary mb-5">
            O registro pode ter sido removido ou você não possui permissão de acesso.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary w-full">
            Voltar ao rebanho
          </button>
        </div>
      </AppShell>
    );
  }

  const displayName = animal.name?.trim() || "Sem apelido";
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(displayName)}`;
  const photos = animal.photos ?? [];
  const photoCount = photos.length;
  const custody = animal.custody;
  const isOwner = isAnimalOwner;
  const canManage = custody?.canManage ?? (isOwner || isAdmin);
  const coordText = formatCoordinates(animal.latitude, animal.longitude);
  const mapsUrl = buildGoogleMapsUrl(
    animal.latitude,
    animal.longitude,
    animal.locationAddress || animal.location
  );

  const custodySection = (
    <div className="card p-5 space-y-4">
      <div className="pb-3 border-b border-theme">
        <h2 className="text-base font-bold text-theme-primary">Guarda Compartilhada</h2>
        <p className="text-xs text-theme-secondary mt-0.5">
          Gerencie quem pode visualizar e registrar fotos deste animal
        </p>
      </div>

      <div className="card-subtle p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-theme-muted block">
            Proprietário principal
          </span>
          <p className="text-sm font-bold text-theme-primary truncate">
            {custody?.owner?.name || "Proprietário"}
          </p>
          {custody?.owner?.email && (
            <p className="text-xs text-theme-secondary truncate">{custody.owner.email}</p>
          )}
        </div>
        {isOwner && (
          <span className="text-[11px] font-semibold bg-brand-soft px-2.5 py-1 rounded-[7px] shrink-0">
            Você
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        <span className="text-xs font-semibold text-theme-secondary block">
          Colaboradores ({custody?.collaborators?.length ?? 0})
        </span>

        {custody?.collaborators && custody.collaborators.length > 0 ? (
          <div className="divide-y divide-[var(--border-subtle)] card-subtle overflow-hidden">
            {custody.collaborators.map((collab) => {
              const isMe = user && Number(user.id) === collab.userId;
              return (
                <div
                  key={collab.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-theme-primary truncate">
                        {collab.user?.name || "Operador"}
                      </span>
                      {isMe && (
                        <span className="text-[10px] font-semibold bg-brand-soft px-1.5 py-0.5 rounded">
                          Você
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-theme-secondary truncate">{collab.user?.email}</p>
                  </div>

                  {canManage && !isMe && (
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      <button
                        type="button"
                        disabled={custodyActionLoading}
                        onClick={() =>
                          handleTransferOwnership(collab.userId, collab.user?.name || "Operador")
                        }
                        className="btn-secondary !py-1.5 !px-2.5 !min-h-[32px] text-[11px]"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        <span>Transferir</span>
                      </button>

                      <button
                        type="button"
                        disabled={custodyActionLoading}
                        onClick={() =>
                          handleRemoveCollaborator(collab.userId, collab.user?.name || "Operador")
                        }
                        className="btn-danger !py-1.5 !px-2.5 !min-h-[32px] text-[11px]"
                      >
                        <UserMinus className="w-3 h-3" />
                        <span>Remover</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-theme-muted p-4 card-subtle text-center">
            Nenhum colaborador vinculado ainda.
          </p>
        )}
      </div>

      {canManage && (
        <form
          onSubmit={handleInviteCollaborator}
          className="pt-3 border-t border-theme flex flex-col sm:flex-row gap-2"
        >
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="E-mail do operador para compartilhar…"
            className="field-input flex-1 text-xs sm:text-sm"
          />
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            className="btn-primary !py-2 !px-4 !min-h-[40px] text-xs shrink-0"
          >
            {inviting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <UserPlus className="w-3.5 h-3.5" />
            )}
            <span>Compartilhar</span>
          </button>
        </form>
      )}
    </div>
  );

  return (
    <AppShell
      showBack
      backHref="/dashboard"
      title={displayName}
      subtitle={`${animal.breed} — ${animal.sex}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelectFromGallery}
      />

      <div className="space-y-5">
        {/* Hero Card da Ficha */}
        <section className="card overflow-hidden">
          <div className="p-5 sm:p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {!isOwner && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-[7px] bg-sky-500/12 text-sky-700 dark:text-sky-300">
                    <Users className="w-3 h-3" />
                    <span>Compartilhado</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={copyTag}
                  title={`Copiar identificador: ${animal.tag}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[7px] text-xs font-mono-tag text-theme-secondary bg-theme-surface-2 hover:text-theme-primary border border-theme transition"
                >
                  <Tag className="w-3 h-3 opacity-70" />
                  <span>{animal.tag}</span>
                  {copiedTag ? (
                    <Check className="w-3 h-3 text-brand" />
                  ) : (
                    <Copy className="w-3 h-3 opacity-60" />
                  )}
                </button>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-theme-primary tracking-tight truncate">
                {displayName}
              </h1>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-theme-secondary">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span>{animal.location || "Localização não informada"}</span>
                </span>
                {coordText && (
                  <span className="font-mono-tag text-[11px] text-theme-muted">
                    {coordText}
                  </span>
                )}
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
                  >
                    <span>Mapa</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Ações principais do animal */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href={cameraUrl} className="btn-primary !min-h-[40px] !py-2 !px-4 text-xs">
                <Camera className="w-4 h-4" />
                <span>Fotografar</span>
              </Link>

              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary !min-h-[40px] !py-2 !px-3.5 text-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Galeria</span>
              </button>

              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary !min-h-[40px] !py-2 !px-3 text-xs"
                title="Editar ficha"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>

              {isOwner && (
                <button
                  type="button"
                  onClick={handleDeleteAnimal}
                  className="btn-danger !min-h-[40px] !py-2 !px-3 text-xs"
                  title="Excluir animal"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Excluir</span>
                </button>
              )}
            </div>
          </div>

          {/* Métricas físicas em linha dividida única */}
          <div className="grid grid-cols-2 sm:grid-cols-5 border-t border-theme divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] bg-theme-surface-2/40">
            <div className="p-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-theme-muted">Raça</p>
              <p className="text-sm font-bold text-theme-primary mt-0.5 truncate">{animal.breed}</p>
            </div>
            <div className="p-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-theme-muted">Sexo</p>
              <p className="text-sm font-bold text-theme-primary mt-0.5 truncate">{animal.sex}</p>
            </div>
            <div className="p-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-theme-muted">Peso</p>
              <p className="text-sm font-bold text-theme-primary tabular-nums mt-0.5">
                {animal.weight} kg
              </p>
            </div>
            <div className="p-3.5 sm:px-5">
              <p className="text-[11px] font-semibold text-theme-muted">Idade</p>
              <p className="text-sm font-bold text-theme-primary tabular-nums mt-0.5">
                {animal.age} meses
              </p>
            </div>
            <div className="p-3.5 sm:px-5 col-span-2 sm:col-span-1">
              <p className="text-[11px] font-semibold text-theme-muted">Comprimento</p>
              <p className="text-sm font-bold text-theme-primary tabular-nums mt-0.5">
                {animal.length ? `${animal.length} cm` : "—"}
              </p>
            </div>
          </div>
        </section>

        {/* Abas do Prontuário */}
        <AnimalHealthTabs
          animal={animal}
          canEdit={true}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onReloadAnimal={() => loadAnimal(true)}
          collaboratorsCount={custody?.collaborators?.length ?? 0}
          custodyContent={custodySection}
          galleryContent={
            <div className="space-y-5">
              <div className="card p-4 sm:p-5">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4 pb-3 border-b border-theme">
                  <div>
                    <h2 className="text-base font-bold text-theme-primary">
                      Galeria de capturas ({photoCount})
                    </h2>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      Toque em qualquer imagem para ampliar ou reavaliar enquadramento
                    </p>
                  </div>

                  {photoCount > 0 && (
                    <button
                      type="button"
                      onClick={handleRecalibrateAnimal}
                      disabled={recalibratingAnimal}
                      className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs shrink-0 tabular-nums"
                    >
                      {recalibratingAnimal ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-brand" />
                      )}
                      <span>
                        {recalibratingAnimal
                          ? recalibratingProgress
                            ? `Reavaliando ${recalibratingProgress.current}/${recalibratingProgress.total}…`
                            : "Reavaliando…"
                          : "Reavaliar enquadramento"}
                      </span>
                    </button>
                  )}
                </div>

                <PhotoGrid
                  photos={photos}
                  onDelete={isOwner || isAdmin ? handleDeletePhoto : undefined}
                  onSelect={(_, index) => setLightboxIndex(index)}
                />
              </div>
            </div>
          }
        />
      </div>

      {/* Modal pré-upload de foto da galeria */}
      {pendingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="card max-w-md w-full overflow-hidden animate-scale-in">
            <div className="px-4 py-3 border-b border-theme flex items-center justify-between">
              <h3 className="font-bold text-sm text-theme-primary">Validação da imagem</h3>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setPendingPhoto(null)}
                className="p-1 rounded-lg text-theme-muted hover:text-theme-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3.5">
              <div className="aspect-[4/3] w-full rounded-[10px] overflow-hidden bg-black border border-theme">
                <img
                  src={pendingPhoto.previewUrl}
                  alt="Prévia da foto selecionada"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="card-subtle p-3.5">
                {pendingPhoto.evaluating ? (
                  <div className="flex items-center gap-3 py-1">
                    <Loader2 className="w-4 h-4 animate-spin text-brand shrink-0" />
                    <span className="text-xs font-semibold text-theme-primary">
                      Verificando nitidez e enquadramento…
                    </span>
                  </div>
                ) : pendingPhoto.scoreResult ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-theme-primary">
                        {pendingPhoto.scoreResult.feedback}
                      </span>
                      <span className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-[7px] bg-brand-soft shrink-0">
                        {Math.round(pendingPhoto.scoreResult.score)}%
                      </span>
                    </div>
                    {pendingPhoto.scoreResult.lowQuality && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Enquadramento baixo. Você ainda pode salvar ou trocar.</span>
                      </p>
                    )}
                  </div>
                ) : null}
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setPendingPhoto(null)}
                  className="btn-secondary flex-1 !py-2 !min-h-[40px] text-xs"
                >
                  Trocar foto
                </button>
                <button
                  type="button"
                  disabled={uploading || pendingPhoto.evaluating}
                  onClick={handleConfirmGalleryUpload}
                  className="btn-primary flex-1 !py-2 !min-h-[40px] text-xs"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{uploading ? "Enviando…" : "Salvar foto"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md max-h-[90dvh] overflow-y-auto animate-scale-in">
            <div className="px-5 py-4 border-b border-theme flex items-center justify-between sticky top-0 bg-theme-surface z-10">
              <h3 className="font-bold text-base text-theme-primary">Editar ficha</h3>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 flex flex-col gap-4">
              <div>
                <label className="field-label">Apelido ou nome</label>
                <input
                  type="text"
                  value={editForm.name}
                  placeholder="Ex: Mimosa, Estrela, Lote 42"
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="field-input font-semibold"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="field-label !mb-0">Brinco ou identificador</label>
                  {(isOwner || isAdmin) && bleSupported && (
                    <button
                      type="button"
                      onClick={handleToggleEditBle}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-[7px] border border-theme bg-theme-surface-2 text-theme-secondary hover:text-theme-primary transition"
                    >
                      {bleStatus === "connected" ? (
                        <BluetoothConnected className="w-3 h-3 text-brand" />
                      ) : (
                        <Bluetooth className="w-3 h-3 text-brand" />
                      )}
                      <span>
                        {bleStatus === "connected" ? "Leitor conectado" : "Ler via Bluetooth"}
                      </span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  disabled={!isOwner && !isAdmin}
                  value={editForm.tag}
                  onChange={(e) => setEditForm((p) => ({ ...p, tag: e.target.value.toUpperCase() }))}
                  className="field-input font-mono-tag text-xs uppercase disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Raça</label>
                  <select
                    value={editForm.breed}
                    onChange={(e) => setEditForm((p) => ({ ...p, breed: e.target.value }))}
                    className="field-input"
                  >
                    {BREEDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Sexo</label>
                  <select
                    value={editForm.sex}
                    onChange={(e) => setEditForm((p) => ({ ...p, sex: e.target.value }))}
                    className="field-input"
                  >
                    {SEX_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {editForm.breed === "Outra" && (
                <div>
                  <label className="field-label">Nome da raça</label>
                  <input
                    type="text"
                    required
                    value={editForm.customBreed}
                    onChange={(e) => setEditForm((p) => ({ ...p, customBreed: e.target.value }))}
                    placeholder="Ex: Simental, Tabapuã"
                    className="field-input text-sm"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="field-label">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    value={editForm.weight}
                    onChange={(e) => setEditForm((p) => ({ ...p, weight: e.target.value }))}
                    className="field-input tabular-nums"
                  />
                </div>
                <div>
                  <label className="field-label">Idade (m)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editForm.age}
                    onChange={(e) => setEditForm((p) => ({ ...p, age: e.target.value }))}
                    className="field-input tabular-nums"
                  />
                </div>
                <div>
                  <label className="field-label">Compr. (cm)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={editForm.length}
                    placeholder="165"
                    onChange={(e) => setEditForm((p) => ({ ...p, length: e.target.value }))}
                    className="field-input tabular-nums"
                  />
                </div>
              </div>

              <FarmLocationFields
                value={{
                  location: editForm.location,
                  locationAddress: editForm.locationAddress,
                  latitude: editForm.latitude,
                  longitude: editForm.longitude,
                }}
                onChange={(loc) => setEditForm((p) => ({ ...p, ...loc }))}
                compact
              />

              <div>
                <label className="field-label">Observação da ficha</label>
                <textarea
                  rows={2}
                  value={editForm.observations}
                  onChange={(e) => setEditForm((p) => ({ ...p, observations: e.target.value }))}
                  className="field-input text-xs resize-y"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary !py-2 !px-4 !min-h-[40px] text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary !py-2 !px-5 !min-h-[40px] text-xs"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lightboxIndex !== null && photoCount > 0 && (
        <PhotoLightbox
          photos={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPhotoRecalibrated={handlePhotoRecalibrated}
        />
      )}
    </AppShell>
  );
}
