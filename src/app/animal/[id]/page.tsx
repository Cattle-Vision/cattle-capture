"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, Scale, Calendar, Tag, Dna } from "lucide-react";
import PhotoGrid from "@/components/PhotoGrid";
import PhotoLightbox from "@/components/PhotoLightbox";
import { useToast } from "@/components/ui/Toast";
import { Animal, Photo } from "@/lib/types";

function PageSkeleton() {
  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--color-bg)" }}>
      <div className="h-14 border-b" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }} />
      <div className="p-4 max-w-4xl mx-auto flex flex-col gap-4">
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-6 skeleton rounded-lg w-40" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] skeleton rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-3"
      style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}
    >
      <div style={{ color: "var(--color-brand)" }} className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>{label}</p>
        <p className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{value}</p>
      </div>
    </div>
  );
}

export default function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useToast();

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/animals/${id}`)
      .then((res) => {
        if (res.status === 401) { router.push("/login"); return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data) setAnimal(data as Animal);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  const handleDelete = async (photoId: string) => {
    const ok = await confirm("Apagar esta foto? Esta ação não pode ser desfeita.");
    if (!ok) return;
    const res = await fetch(`/api/photos/${photoId}`, { method: "DELETE" });
    if (res.ok) {
      setAnimal((prev) =>
        prev ? { ...prev, photos: prev.photos.filter((p: Photo) => p.id !== photoId) } : prev
      );
      toast("Foto apagada.", "success");
    } else {
      toast("Erro ao apagar a foto.", "error");
    }
  };

  if (loading) return <PageSkeleton />;

  if (!animal) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ background: "var(--color-bg)" }}>
        <div className="text-center">
          <p className="font-semibold mb-4" style={{ color: "var(--color-error)" }}>Animal não encontrado.</p>
          <button onClick={() => router.push("/dashboard")} className="btn-ghost">
            Voltar ao painel
          </button>
        </div>
      </div>
    );
  }

  const label = animal.name || animal.tag;
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(label)}`;
  const photoCount = animal.photos?.length ?? 0;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-20"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          aria-label="Voltar ao painel"
          className="p-2 rounded-lg shrink-0"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold truncate" style={{ color: "var(--color-text-primary)" }}>{label}</h1>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {animal.tag} · {animal.breed} · {animal.sex}
          </p>
        </div>
        <Link
          href={cameraUrl}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shrink-0"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          <Camera className="w-4 h-4" />
          Fotografar
        </Link>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full flex flex-col gap-6 pb-28 sm:pb-6">
        {/* Card de info */}
        <div className="card p-5">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{label}</h2>
              <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>Ficha do animal</p>
            </div>
            <span
              className="text-xs font-black px-3 py-1.5 rounded-lg tracking-widest"
              style={{ background: "var(--color-brand-muted)", color: "var(--color-brand-dark)", border: "1px solid var(--color-brand-light)" }}
            >
              {animal.tag}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={<Tag className="w-4 h-4" />} label="Raça" value={animal.breed} />
            <Stat icon={<Dna className="w-4 h-4" />} label="Sexo" value={animal.sex} />
            <Stat icon={<Scale className="w-4 h-4" />} label="Peso" value={`${animal.weight} kg`} />
            <Stat icon={<Calendar className="w-4 h-4" />} label="Idade" value={`${animal.age} meses`} />
          </div>
        </div>

        {/* Galeria */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
                Galeria · traseiras
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                {photoCount} {photoCount !== 1 ? "imagens" : "imagem"} no dataset
              </p>
            </div>
            <Link
              href={cameraUrl}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg sm:hidden"
              style={{ background: "var(--color-brand)", color: "#fff" }}
            >
              <Camera className="w-4 h-4" />
              Tirar foto
            </Link>
          </div>

          <PhotoGrid
            photos={animal.photos ?? []}
            onDelete={handleDelete}
            onSelect={(_, index) => setLightboxIndex(index)}
          />
        </div>
      </main>

      {/* Bottom bar mobile */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 border-t p-4 z-20"
        style={{
          background: "var(--color-surface)",
          borderColor: "var(--color-border)",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <Link
          href={cameraUrl}
          className="btn-primary w-full py-3.5 text-base"
        >
          <Camera className="w-5 h-5" />
          Fotografar traseira
        </Link>
      </div>

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
