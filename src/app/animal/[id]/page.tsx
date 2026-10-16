"use client";

/**
 * Ficha Completa do Animal e Galeria (`src/app/animal/[id]/page.tsx`).
 *
 * Funcionalidades:
 * - Visualização dos dados zootécnicos (Brinco, Apelido, Raça, Sexo, Peso, Idade).
 * - **Avaliação de Score IA Antes do Upload**: Ao escolher uma foto da galeria/computador,
 *   comprime a imagem, calcula o Score IA (`evaluatePhotoScoreBeforeUpload`) e apresenta um
 *   modal com o Score IA, diagnóstico e prévia da foto ANTES de enviar ao servidor.
 * - **Edição Inline (Modal)**: Permite atualizar peso, idade, brinco, apelido, raça e sexo (`PATCH /api/animals/[id]`).
 * - **Exclusão do Animal**: Remove o animal e suas fotos com confirmação (`DELETE /api/animals/[id]`).
 * - Suporte completo a Tema Claro/Escuro (`ThemeToggle`).
 */
import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Scale,
  Calendar,
  Tag,
  Dna,
  Upload,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoLightbox from "@/components/PhotoLightbox";
import ThemeToggle from "@/components/ThemeToggle";
import { useToast } from "@/components/ui/Toast";
import { Animal, Photo } from "@/lib/types";
import { BREEDS, SEX_OPTIONS } from "@/lib/animal";
import { compressImageFile } from "@/lib/image-client";
import { evaluatePhotoScoreBeforeUpload, VisionScoreResult } from "@/lib/vision-client";

interface PendingGalleryPhoto {
  blob: Blob;
  previewUrl: string;
  fileName: string;
  evaluating: boolean;
  scoreResult: VisionScoreResult | null;
}

function PageSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-theme-bg">
      <div className="h-16 bg-theme-surface border-b border-theme" />
      <div className="p-4 sm:p-6 max-w-4xl mx-auto flex flex-col gap-5">
        <div className="h-40 skeleton rounded-2xl" />
        <div className="h-8 skeleton rounded-lg w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl p-3.5 bg-theme-surface-2 border border-theme">
      <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-theme-muted">{label}</p>
        <p className="text-sm font-extrabold text-theme-primary truncate">{value}</p>
      </div>
    </div>
  );
}

export default function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [recalibratingAnimal, setRecalibratingAnimal] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Estado de Pré-Avaliação de Score IA antes do upload da galeria
  const [pendingPhoto, setPendingPhoto] = useState<PendingGalleryPhoto | null>(null);

  // Estado do Modal de Edição
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    tag: "",
    name: "",
    breed: "Nelore",
    sex: "Fêmea",
    weight: "",
    age: "",
  });

  useEffect(() => {
    if (!id) return;
    fetch(`/api/animals/${id}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login");
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data) {
          setAnimal(data as Animal);
          setEditForm({
            tag: data.tag,
            name: data.name || "",
            breed: data.breed,
            sex: data.sex,
            weight: String(data.weight),
            age: String(data.age),
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  /* ── Etapa 1: Ao selecionar uma foto da galeria, calcula o Score IA ANTES do upload ── */
  const handleSelectFromGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !animal) return;

    try {
      const compressed = await compressImageFile(file, 1600, 0.86);
      setPendingPhoto({
        blob: compressed.blob,
        previewUrl: URL.createObjectURL(compressed.blob),
        fileName: file.name,
        evaluating: true,
        scoreResult: null,
      });

      const scoreRes = await evaluatePhotoScoreBeforeUpload(compressed.blob);
      setPendingPhoto((prev) =>
        prev
          ? {
              ...prev,
              evaluating: false,
              scoreResult: scoreRes,
            }
          : null
      );
    } catch {
      toast("Não foi possível processar a imagem selecionada.", "error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ── Etapa 2: Confirma o upload após o usuário ver o Score IA ── */
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
      }

      const res = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.photo) {
        setAnimal((prev) =>
          prev
            ? {
                ...prev,
                photos: [data.photo as Photo, ...(prev.photos ?? [])],
              }
            : prev
        );
        toast(
          `Foto enviada com Score IA de ${Math.round(
            data.photo.score ?? pendingPhoto.scoreResult?.score ?? 0
          )}%!`,
          "success"
        );
        setPendingPhoto(null);
      } else {
        toast(data.error || "Falha ao enviar foto", "error");
      }
    } catch {
      toast("Erro de rede ao enviar a foto.", "error");
    } finally {
      setUploading(false);
    }
  };

  /* ── Excluir Foto ── */
  const handleDeletePhoto = async (photoId: string) => {
    const ok = await confirm("Deseja realmente apagar esta foto do dataset?");
    if (!ok) return;
    const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
    if (res.ok) {
      setAnimal((prev) =>
        prev ? { ...prev, photos: prev.photos.filter((p: Photo) => p.id !== photoId) } : prev
      );
      toast("Foto removida do dataset.", "success");
    } else {
      toast("Não foi possível excluir a foto.", "error");
    }
  };

  /* ── Salvar Edição do Animal ── */
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!animal) return;
    setSavingEdit(true);

    try {
      const res = await fetch(`/api/animals/${animal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: editForm.tag,
          name: editForm.name,
          breed: editForm.breed,
          sex: editForm.sex,
          weight: Number(editForm.weight),
          age: Number(editForm.age),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAnimal((prev) => (prev ? { ...prev, ...data, photos: prev.photos } : prev));
        setEditing(false);
        toast("Dados do animal atualizados!", "success");
      } else {
        toast(data.error || "Erro ao atualizar dados.", "error");
      }
    } catch {
      toast("Erro de conexão ao atualizar.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ── Excluir Animal ── */
  const handleDeleteAnimal = async () => {
    if (!animal) return;
    const ok = await confirm(
      `Excluir o animal ${animal.tag} e todas as suas ${animal.photos?.length ?? 0} fotos? Esta ação é irreversível.`
    );
    if (!ok) return;

    const res = await fetch(`/api/animals/${animal.id}`, { method: "DELETE" });
    if (res.ok) {
      toast("Animal excluído com sucesso.", "success");
      router.push("/dashboard");
    } else {
      toast("Erro ao excluir animal.", "error");
    }
  };

  /* ── Recalcular Scores de Todas as Fotos Deste Animal ── */
  const handleRecalibrateAnimal = async () => {
    if (recalibratingAnimal || !animal) return;
    setRecalibratingAnimal(true);
    try {
      const res = await fetch(`/api/animals/${animal.id}/recalibrate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao recalcular fotos do animal");

      toast(data.message || `${data.updatedCount ?? 0} foto(s) recalculada(s)!`, "success");

      if (Array.isArray(data.results)) {
        const scoreMap = new Map(
          data.results.map((r: { id: string; newScore: number }) => [r.id, r.newScore])
        );
        setAnimal((prev) =>
          prev
            ? {
                ...prev,
                photos: (prev.photos ?? []).map((p) =>
                  scoreMap.has(p.id) ? { ...p, score: scoreMap.get(p.id) as number } : p
                ),
              }
            : prev
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao recalcular scores do animal", "error");
    } finally {
      setRecalibratingAnimal(false);
    }
  };

  /* ── Atualização quando uma foto individual é recalculada no lightbox ── */
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
    toast(`Score da foto atualizado para ${Math.round(newScore)}%!`, "success");
  };

  if (loading) return <PageSkeleton />;

  if (!animal) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-theme-bg text-theme-primary">
        <div className="card p-8 text-center max-w-sm w-full">
          <p className="font-bold text-theme-primary mb-2">Animal não encontrado</p>
          <p className="text-xs text-theme-secondary mb-5">
            O registro pode ter sido removido ou você não possui permissão de acesso.
          </p>
          <button onClick={() => router.push("/dashboard")} className="btn-primary w-full">
            Voltar ao Painel
          </button>
        </div>
      </div>
    );
  }

  const label = animal.name || animal.tag;
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(label)}`;
  const photoCount = animal.photos?.length ?? 0;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-theme-bg text-theme-primary">
      {/* Input oculto para seleção da galeria/computador */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSelectFromGallery}
      />

      {/* Header */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Voltar ao painel"
              className="p-1.5 sm:p-2 rounded-xl text-theme-secondary hover:bg-theme-surface-2 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-theme-primary truncate max-w-[110px] xs:max-w-[180px] sm:max-w-xs">
                  {label}
                </h1>
                <span className="font-mono-tag text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md bg-slate-900 dark:bg-emerald-950 text-white dark:text-emerald-300 shrink-0">
                  {animal.tag}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-theme-secondary truncate max-w-[130px] sm:max-w-none">
                {animal.breed} · {animal.sex} · {photoCount} {photoCount === 1 ? "foto" : "fotos"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ThemeToggle className="p-2 sm:p-2.5" />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-2 sm:p-2.5 rounded-xl text-theme-secondary hover:bg-theme-surface-2"
              title="Editar dados do animal"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDeleteAnimal}
              className="p-2 sm:p-2.5 rounded-xl text-theme-secondary hover:text-red-500 hover:bg-red-500/10"
              title="Excluir animal"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full flex flex-col gap-6 pb-28 sm:pb-10">
        {/* Card Zootécnico */}
        <div className="card p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full mb-2">
                <Sparkles className="w-3 h-3" />
                Ficha Zootécnica · ICC
              </span>
              <h2 className="text-xl font-extrabold text-theme-primary">
                {animal.name ? `${animal.name} (${animal.tag})` : `Brinco ${animal.tag}`}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary py-2.5 px-4 text-xs"
              >
                <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Enviar da Galeria
              </button>
              <Link href={cameraUrl} className="btn-primary py-2.5 px-4 text-xs">
                <Camera className="w-4 h-4" />
                Câmera IA ao Vivo
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={<Tag className="w-4 h-4" />} label="Raça" value={animal.breed} />
            <Stat icon={<Dna className="w-4 h-4" />} label="Sexo" value={animal.sex} />
            <Stat icon={<Scale className="w-4 h-4" />} label="Peso" value={`${animal.weight} kg`} />
            <Stat
              icon={<Calendar className="w-4 h-4" />}
              label="Idade"
              value={`${animal.age} meses`}
            />
          </div>
        </div>

        {/* Galeria de Capturas */}
        <div>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div>
              <h3 className="text-base font-extrabold text-theme-primary">
                Galeria do Dataset · Região Posterior
              </h3>
              <p className="text-xs text-theme-secondary mt-0.5">
                Clique em qualquer imagem para ampliar em tela cheia ou verificar o Score IA
              </p>
            </div>

            {photoCount > 0 && (
              <button
                type="button"
                onClick={handleRecalibrateAnimal}
                disabled={recalibratingAnimal}
                className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5 shrink-0 border-emerald-500/30 hover:border-emerald-500/50"
                title="Recalcular todos os scores das fotos desta vaca com a IA local calibrada"
              >
                {recalibratingAnimal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span>
                  {recalibratingAnimal ? "Recalculando…" : "Recalcular Scores da Vaca"}
                </span>
              </button>
            )}
          </div>

          <PhotoGrid
            photos={animal.photos ?? []}
            onDelete={handleDeletePhoto}
            onSelect={(_, index) => setLightboxIndex(index)}
          />
        </div>
      </main>

      {/* Barra Inferior Mobile */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-theme-surface/95 backdrop-blur-md border-t border-theme p-3 z-20 flex gap-2.5"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary flex-1 py-3 text-xs"
        >
          <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          Galeria (com Score)
        </button>
        <Link href={cameraUrl} className="btn-primary flex-1 py-3 text-xs">
          <Camera className="w-4 h-4" />
          Câmera IA
        </Link>
      </div>

      {/* Modal de Pré-Avaliação de Score IA Antes do Upload */}
      {pendingPhoto && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="card max-w-md w-full overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-theme flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <h3 className="font-extrabold text-sm text-theme-primary">
                  Avaliação de Score IA Antes do Upload
                </h3>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setPendingPhoto(null)}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div className="aspect-[4/3] w-full rounded-xl overflow-hidden bg-black border border-theme relative">
                <img
                  src={pendingPhoto.previewUrl}
                  alt="Prévia da foto selecionada"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Card de Score Pré-Upload */}
              <div className="rounded-xl p-4 bg-theme-surface-2 border border-theme">
                {pendingPhoto.evaluating ? (
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-xs font-extrabold text-theme-primary">
                        Analisando foto com Inteligência Artificial…
                      </p>
                      <p className="text-[11px] text-theme-secondary">
                        Calculando score de enquadramento e nitidez antes de enviar
                      </p>
                    </div>
                  </div>
                ) : pendingPhoto.scoreResult ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-theme-muted block">
                          Score IA Calculado
                        </span>
                        <span className="text-xs font-bold text-theme-primary">
                          {pendingPhoto.scoreResult.feedback}
                        </span>
                      </div>
                      <span
                        className={`text-xl font-black px-3 py-1 rounded-xl ${
                          pendingPhoto.scoreResult.score >= 70
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : pendingPhoto.scoreResult.score >= 45
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-rose-500/15 text-rose-500"
                        }`}
                      >
                        {Math.round(pendingPhoto.scoreResult.score)}%
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-theme-surface overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          pendingPhoto.scoreResult.score >= 70
                            ? "bg-emerald-500"
                            : pendingPhoto.scoreResult.score >= 45
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        }`}
                        style={{
                          width: `${Math.min(100, Math.max(8, pendingPhoto.scoreResult.score))}%`,
                        }}
                      />
                    </div>

                    {pendingPhoto.scoreResult.lowQuality && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Confiança moderada/baixa — você ainda pode salvar ou escolher outra foto.
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
                  className="btn-secondary flex-1 py-2.5 text-xs"
                >
                  Escolher Outra
                </button>
                <button
                  type="button"
                  disabled={uploading || pendingPhoto.evaluating}
                  onClick={handleConfirmGalleryUpload}
                  className="btn-primary flex-1 py-2.5 text-xs"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  <span>{uploading ? "Enviando…" : "Confirmar e Salvar"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="card w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-theme flex items-center justify-between">
              <h3 className="font-extrabold text-base text-theme-primary">
                Editar Ficha do Animal
              </h3>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg text-theme-muted hover:bg-theme-surface-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Brinco</label>
                  <input
                    type="text"
                    required
                    value={editForm.tag}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, tag: e.target.value.toUpperCase() }))
                    }
                    className="field-input font-mono-tag uppercase"
                  />
                </div>
                <div>
                  <label className="field-label">Apelido</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="field-input"
                  />
                </div>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Peso (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    required
                    value={editForm.weight}
                    onChange={(e) => setEditForm((p) => ({ ...p, weight: e.target.value }))}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">Idade (meses)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editForm.age}
                    onChange={(e) => setEditForm((p) => ({ ...p, age: e.target.value }))}
                    className="field-input"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary py-2.5 px-4 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="btn-primary py-2.5 px-5 text-xs"
                >
                  {savingEdit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lightboxIndex !== null && photoCount > 0 && (
        <PhotoLightbox
          photos={animal.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPhotoRecalibrated={handlePhotoRecalibrated}
        />
      )}
    </div>
  );
}
