"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ShieldCheck, Camera, ChevronRight, ImageOff, ScanLine, LogOut } from "lucide-react";
import { Animal, filePathToUrl } from "@/lib/types";
import { logoutAction } from "@/app/login/actions";

function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-video skeleton" />
      <div className="p-4 flex flex-col gap-2.5">
        <div className="h-4 skeleton w-2/3 rounded" />
        <div className="h-3 skeleton w-1/2 rounded" />
        <div className="h-10 skeleton w-full rounded-lg mt-1" />
      </div>
    </div>
  );
}

function AnimalCard({ animal }: { animal: Animal }) {
  const lastPhoto = animal.photos?.[0];
  const photoUrl = lastPhoto ? filePathToUrl(lastPhoto.filePath) : null;
  const [imgError, setImgError] = useState(false);
  const label = animal.name || animal.tag;

  return (
    <div className="card overflow-hidden group hover:shadow-md transition-shadow">
      {/* Foto */}
      <div className="aspect-video relative overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
        {photoUrl && !imgError ? (
          <img
            src={photoUrl}
            alt={label}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--color-border-strong)" }}>
            <ImageOff className="w-7 h-7" />
          </div>
        )}

        {/* Badge de fotos */}
        <div
          className="absolute bottom-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.6)", color: "#fff", backdropFilter: "blur(4px)" }}
        >
          {animal.photos?.length ?? 0} foto{(animal.photos?.length ?? 0) !== 1 ? "s" : ""}
        </div>

        {/* Badge brinco */}
        <div
          className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-md tracking-wide"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          {animal.tag}
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3
            className="font-bold text-base truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {label}
          </h3>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0 ml-2"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
          >
            {animal.breed}
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--color-text-muted)" }}>
          {animal.sex} · {animal.weight} kg · {animal.age} meses
        </p>

        <div className="flex gap-2">
          <Link
            href={`/animal/${animal.id}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}
          >
            Ver perfil
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/camera?animalId=${animal.id}&animalName=${encodeURIComponent(label)}`}
            className="flex items-center justify-center p-2.5 rounded-lg"
            style={{ background: "var(--color-brand)", color: "#fff" }}
            aria-label="Capturar traseira"
          >
            <Camera className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/animals")
      .then((r) => {
        if (r.status === 401) { router.push("/login"); return null; }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAnimals(data as Animal[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/admin/animals")
      .then((r) => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, [router]);

  const filtered = animals.filter((a) => {
    const q = query.trim().toUpperCase();
    if (!q) return true;
    return a.tag.includes(q) || a.name.toUpperCase().includes(q) || a.breed.toUpperCase().includes(q);
  });

  return (
    <div className="min-h-[100dvh]" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-10 border-b"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">🐄</span>
            <div className="min-w-0">
              <h1
                className="text-base font-bold leading-tight"
                style={{ color: "var(--color-text-primary)" }}
              >
                Meus animais
              </h1>
              {!loading && (
                <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {animals.length} cadastrado{animals.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg"
                style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </Link>
            )}
            <Link
              href="/identify"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg"
              style={{ background: "var(--color-text-primary)", color: "#fff" }}
            >
              <ScanLine className="w-3.5 h-3.5" />
              Identificar
            </Link>
            <Link
              href="/animal/new"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg"
              style={{ background: "var(--color-brand)", color: "#fff" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="p-2 rounded-lg"
                style={{ color: "var(--color-text-muted)" }}
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-28 sm:pb-10">
        {/* Barra de busca */}
        {!loading && animals.length > 0 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por brinco, apelido ou raça…"
            className="field-input mb-5"
          />
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: "var(--color-surface-2)", border: "2px dashed var(--color-border-strong)" }}
            >
              🐄
            </div>
            <div>
              <p className="font-bold text-base mb-1" style={{ color: "var(--color-text-primary)" }}>
                {query ? "Nenhum resultado" : "Nenhum animal cadastrado"}
              </p>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                {query ? "Tente outro termo de busca." : "Cadastre pelo brinco e fotografe a traseira."}
              </p>
            </div>
            {!query && (
              <Link href="/animal/new" className="btn-primary px-6 py-3">
                <Plus className="w-4 h-4" />
                Cadastrar primeiro animal
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => <AnimalCard key={a.id} animal={a} />)}
          </div>
        )}
      </main>

      {/* FABs mobile */}
      <div
        className="sm:hidden fixed right-4 z-20 flex flex-col gap-3"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href="/identify"
          aria-label="Identificar animal"
          className="flex items-center justify-center w-12 h-12 rounded-full shadow-lg"
          style={{ background: "var(--color-text-primary)", color: "#fff" }}
        >
          <ScanLine className="w-5 h-5" />
        </Link>
        <Link
          href="/animal/new"
          aria-label="Cadastrar novo animal"
          className="flex items-center justify-center w-14 h-14 rounded-full shadow-xl"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          <Plus className="w-6 h-6" />
        </Link>
      </div>
    </div>
  );
}
