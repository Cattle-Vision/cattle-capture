"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ShieldCheck, Camera, ImageOff, ScanLine, LogOut, Search } from "lucide-react";
import { Animal, filePathToUrl } from "@/lib/types";
import { logoutAction } from "@/app/login/actions";

function Skeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-video skeleton" />
      <div className="p-4 flex flex-col gap-2.5">
        <div className="h-4 skeleton w-2/3 rounded" />
        <div className="h-3 skeleton w-1/2 rounded" />
        <div className="flex gap-2 mt-1">
          <div className="h-8 skeleton flex-1 rounded-lg" />
          <div className="h-8 w-8 skeleton rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function AnimalCard({ animal }: { animal: Animal }) {
  const lastPhoto = animal.photos?.[0];
  const photoUrl  = lastPhoto ? filePathToUrl(lastPhoto.filePath) : null;
  const [imgErr, setImgErr] = useState(false);
  const label = animal.name || animal.tag;
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(label)}`;

  return (
    /* Card inteiro é clicável e leva ao perfil */
    <div className="card overflow-hidden group relative hover:shadow-md transition-all hover:-translate-y-0.5">
      {/* link principal — cobre o card inteiro */}
      <Link href={`/animal/${animal.id}`} className="absolute inset-0 z-0" aria-label={`Ver ${label}`} />

      {/* Foto */}
      <div className="aspect-video relative overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
        {photoUrl && !imgErr ? (
          <img
            src={photoUrl}
            alt={label}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">🐄</div>
        )}

        {/* Badge brinco */}
        <div
          className="absolute top-2 left-2 text-[11px] font-black px-2 py-0.5 rounded-md tracking-widest"
          style={{ background: "var(--color-brand)", color: "#fff" }}
        >
          {animal.tag}
        </div>

        {/* Badge fotos */}
        <div
          className="absolute bottom-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.65)", color: "#fff", backdropFilter: "blur(4px)" }}
        >
          {animal.photos?.length ?? 0} foto{(animal.photos?.length ?? 0) !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-bold text-base truncate" style={{ color: "var(--color-text-primary)" }}>
            {label}
          </h3>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-md shrink-0"
            style={{ background: "var(--color-surface-2)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
          >
            {animal.breed}
          </span>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--color-text-muted)" }}>
          {animal.sex} · {animal.weight} kg · {animal.age} meses
        </p>

        {/* Botão câmera — z-10 para ficar acima do link absoluto */}
        <Link
          href={cameraUrl}
          onClick={e => e.stopPropagation()}
          className="relative z-10 flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-bold text-white"
          style={{ background: "var(--color-brand)" }}
          aria-label={`Fotografar ${label}`}
        >
          <Camera className="w-4 h-4" />
          Fotografar traseira
        </Link>
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
      .then(r => { if (r.status === 401) { router.push("/login"); return null; } return r.json(); })
      .then(d => { if (Array.isArray(d)) setAnimals(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch("/api/admin/animals")
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, [router]);

  const filtered = animals.filter(a => {
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
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl">🐄</span>
            <div>
              <h1 className="text-sm font-bold leading-tight" style={{ color: "var(--color-text-primary)" }}>
                Meus animais
              </h1>
              {!loading && (
                <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {animals.length} cadastrado{animals.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg"
                style={{ background: "#FEF3C7", color: "#92400E" }}
              >
                <ShieldCheck className="w-3 h-3" />
                Admin
              </Link>
            )}
            <Link
              href="/identify"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg"
              style={{ background: "var(--color-text-primary)", color: "#fff" }}
            >
              <ScanLine className="w-3 h-3" />
              Identificar
            </Link>
            <Link
              href="/animal/new"
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg"
              style={{ background: "var(--color-brand)", color: "#fff" }}
            >
              <Plus className="w-3 h-3" />
              Novo
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="p-2 rounded-lg" style={{ color: "var(--color-text-muted)" }} title="Sair">
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 pb-28 sm:pb-8">
        {/* Busca */}
        {!loading && animals.length > 0 && (
          <div className="relative mb-5">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--color-text-muted)" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por brinco, apelido ou raça…"
              className="field-input pl-9"
            />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl"
              style={{ background: "var(--color-brand-muted)", border: "2px dashed var(--color-brand)" }}
            >
              🐄
            </div>
            <div>
              <p className="font-bold" style={{ color: "var(--color-text-primary)" }}>
                {query ? "Nenhum resultado" : "Nenhum animal cadastrado"}
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
                {query ? "Tente outro termo." : "Cadastre o primeiro animal para começar."}
              </p>
            </div>
            {!query && (
              <Link href="/animal/new" className="btn-primary px-6 py-3">
                <Plus className="w-4 h-4" />
                Cadastrar animal
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(a => <AnimalCard key={a.id} animal={a} />)}
          </div>
        )}
      </main>

      {/* FABs mobile */}
      <div
        className="sm:hidden fixed right-4 z-20 flex flex-col gap-3"
        style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <Link href="/identify" aria-label="Identificar" className="w-12 h-12 flex items-center justify-center rounded-full shadow-lg" style={{ background: "var(--color-text-primary)", color: "#fff" }}>
          <ScanLine className="w-5 h-5" />
        </Link>
        <Link href="/animal/new" aria-label="Novo animal" className="w-14 h-14 flex items-center justify-center rounded-full shadow-xl" style={{ background: "var(--color-brand)", color: "#fff" }}>
          <Plus className="w-6 h-6" />
        </Link>
      </div>
    </div>
  );
}
