"use client";

/**
 * Ficha Completa do Animal e Galeria (`src/app/animal/[id]/page.tsx`).
 *
 * Funcionalidades:
 * - Visualização dos dados zootécnicos (Brinco, Apelido, Raça, Sexo, Peso, Idade).
 * - **Upload Direto de Fotos da Galeria/Computador**: Permite selecionar 1 ou mais fotos
 *   diretamente na ficha do animal, comprimindo-as no cliente (`compressImageFile`) e enviando
 *   para `/api/upload` com barra de progresso e feedback do Score IA.
 * - **Edição Inline (Modal)**: Permite atualizar peso, idade, brinco, apelido, raça e sexo (`PATCH /api/animals/[id]`).
 * - **Exclusão do Animal**: Remove o animal e suas fotos com confirmação (`DELETE /api/animals/[id]`).
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
} from "lucide-react";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoLightbox from "@/components/PhotoLightbox";
import { useToast } from "@/components/ui/Toast";
import { Animal, Photo } from "@/lib/types";
import { BREEDS, SEX_OPTIONS } from "@/lib/animal";
import { compressImageFile } from "@/lib/image-client";

function PageSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="h-16 bg-white border-b border-slate-200" />
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
    <div className="flex items-center gap-3 rounded-xl p-3.5 bg-slate-50 border border-slate-200/80">
      <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-sm font-extrabold text-slate-900 truncate">{value}</p>
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
  const [uploadStatus, setUploadStatus] = useState("");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  /* ── Upload Direto de 1 ou mais Fotos pela Galeria/Computador ── */
  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !animal) return;

    setUploading(true);
    const fileList = Array.from(files);
    let successCount = 0;

    for (let i = 0; i < fileList.length; i++) {
      const rawFile = fileList[i];
      setUploadStatus(
        fileList.length > 1
          ? `Otimizando e enviando ${i + 1}/${fileList.length}…`
          : "Otimizando e enviando imagem…"
      );

      try {
        // Comprime no cliente para evitar erro 413 na Vercel (< 400KB)
        const compressed = await compressImageFile(rawFile, 1600, 0.86);
        const fd = new FormData();
        fd.append("file", compressed.blob, `rear_${animal.tag}_${Date.now()}.jpg`);
        fd.append("animalId", animal.id);
        fd.append("view", "REAR");

        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok && data.photo) {
          successCount++;
          setAnimal((prev) =>
            prev
              ? {
                  ...prev,
                  photos: [data.photo as Photo, ...(prev.photos ?? [])],
                }
              : prev
          );
          if (data.lowQuality) {
            toast("Foto salva (Aviso: IA detectou baixa confiança de enquadramento).", "info");
          }
        } else {
          toast(data.error || `Falha ao enviar ${rawFile.name}`, "error");
        }
      } catch {
        toast(`Erro de rede ao enviar ${rawFile.name}`, "error");
      }
    }

    if (successCount > 0) {
      toast(
        successCount === 1
          ? "Foto enviada com sucesso para o dataset!"
          : `${successCount} fotos adicionadas ao dataset!`,
        "success"
      );
    }

    setUploading(false);
    setUploadStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  if (loading) return <PageSkeleton />;

  if (!animal) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-slate-50">
        <div className="card p-8 text-center max-w-sm w-full">
          <p className="font-bold text-slate-900 mb-2">Animal não encontrado</p>
          <p className="text-xs text-slate-500 mb-5">
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
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      {/* Input oculto para upload direto da galeria/computador */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleDirectUpload}
      />

      {/* Header */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/dashboard")}
              aria-label="Voltar ao painel"
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 truncate">{label}</h1>
                <span className="font-mono-tag text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900 text-white">
                  {animal.tag}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {animal.breed} · {animal.sex} · {photoCount} {photoCount === 1 ? "foto" : "fotos"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-2.5 rounded-xl text-slate-600 hover:bg-slate-100"
              title="Editar dados do animal"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleDeleteAnimal}
              className="p-2.5 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50"
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
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full mb-2">
                <Sparkles className="w-3 h-3" />
                Ficha Zootécnica · ICC
              </span>
              <h2 className="text-xl font-extrabold text-slate-900">
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
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : (
                  <Upload className="w-4 h-4 text-emerald-600" />
                )}
                {uploading ? "Enviando…" : "Enviar da Galeria"}
              </button>
              <Link href={cameraUrl} className="btn-primary py-2.5 px-4 text-xs">
                <Camera className="w-4 h-4" />
                Câmera Guiada
              </Link>
            </div>
          </div>

          {uploading && uploadStatus && (
            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3 text-xs font-bold text-emerald-900">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
              <span>{uploadStatus}</span>
            </div>
          )}

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
              <h3 className="text-base font-extrabold text-slate-900">
                Galeria do Dataset · Região Posterior
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Clique em qualquer imagem para ampliar em tela cheia ou verificar o Score IA
              </p>
            </div>
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
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 z-20 flex gap-2.5"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary flex-1 py-3 text-xs"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Galeria
        </button>
        <Link href={cameraUrl} className="btn-primary flex-1 py-3 text-xs">
          <Camera className="w-4 h-4" />
          Câmera Guiada
        </Link>
      </div>

      {/* Modal de Edição */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-base text-slate-900">Editar Ficha do Animal</h3>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
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
        />
      )}
    </div>
  );
}
