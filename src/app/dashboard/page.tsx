"use client";

/**
 * Painel Principal do Operador (`src/app/dashboard/page.tsx`).
 *
 * Melhorias Arquiteturais e Visuais:
 * - Renderiza miniaturas via `getPhotoUrl(lastPhoto.id)` (`/api/photos/[id]`), eliminando
 *   erros 403 com Vercel Blob privado.
 * - Exibe KPIs do rebanho em tempo real (Total de Animais, Capturas, Peso Médio e Cobertura).
 * - Suporta busca instantânea combinada com filtros de status fotográfico ("Todos", "Com fotos", "Sem fotos").
 * - Barra de navegação inferior no mobile incluindo acesso rápido ao Painel Admin.
 */
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  ShieldCheck,
  Camera,
  ScanLine,
  LogOut,
  Search,
  Sparkles,
  Scale,
  Calendar,
  Images,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Animal, getPhotoUrl } from "@/lib/types";
import { logoutAction } from "@/app/login/actions";

type FilterMode = "all" | "with_photos" | "without_photos";

function Skeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[16/10] skeleton rounded-none" />
      <div className="p-4 flex flex-col gap-3">
        <div className="h-4 skeleton w-2/3" />
        <div className="h-3 skeleton w-1/2" />
        <div className="h-10 skeleton w-full rounded-xl mt-1" />
      </div>
    </div>
  );
}

function AnimalCard({ animal }: { animal: Animal }) {
  const lastPhoto = animal.photos?.[0];
  const photoUrl = lastPhoto ? getPhotoUrl(lastPhoto.id) : null;
  const [imgErr, setImgErr] = useState(false);
  const label = animal.name || animal.tag;
  const photoCount = animal.photos?.length ?? 0;
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(label)}`;
  const bestScore =
    lastPhoto && typeof lastPhoto.score === "number" ? Math.round(lastPhoto.score) : null;

  return (
    <div className="card overflow-hidden group relative hover:shadow-lg hover:border-emerald-300/80 transition-all duration-200 flex flex-col justify-between">
      {/* Link principal cobrindo a área superior/informativa */}
      <Link
        href={`/animal/${animal.id}`}
        className="block focus:outline-none"
        aria-label={`Ver ficha de ${label}`}
      >
        {/* Capa Fotográfica */}
        <div className="aspect-[16/10] relative overflow-hidden bg-slate-100">
          {photoUrl && !imgErr ? (
            <img
              src={photoUrl}
              alt={label}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-slate-100 to-slate-200/70 text-slate-400">
              <span className="text-3xl opacity-50">🐄</span>
              <span className="text-[11px] font-semibold text-slate-400">Sem foto</span>
            </div>
          )}

          {/* Gradiente sutil */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

          {/* Badge Brinco (Monospace) */}
          <div className="absolute top-2.5 left-2.5 font-mono-tag text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900/85 text-white backdrop-blur-md shadow-xs tracking-wider">
            {animal.tag}
          </div>

          {/* Score IA se disponível */}
          {bestScore !== null && (
            <div className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/90 text-white backdrop-blur-md shadow-xs">
              <Sparkles className="w-3 h-3" />
              {bestScore}%
            </div>
          )}

          {/* Contador de fotos */}
          <div className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full bg-black/65 text-white backdrop-blur-md">
            <Images className="w-3 h-3 text-emerald-400" />
            {photoCount} {photoCount === 1 ? "foto" : "fotos"}
          </div>
        </div>

        {/* Informações do Animal */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="font-extrabold text-base text-slate-900 truncate group-hover:text-emerald-700 transition-colors">
              {animal.name ? `${animal.name}` : `Brinco ${animal.tag}`}
            </h3>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/60 shrink-0">
              {animal.breed}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
            <span>{animal.sex}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-slate-400" />
              {animal.weight} kg
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {animal.age}m
            </span>
          </div>
        </div>
      </Link>

      {/* Ações Rápidas */}
      <div className="px-4 pb-4 pt-1 flex items-center gap-2">
        <Link
          href={cameraUrl}
          className="btn-primary flex-1 py-2.5 text-xs"
          aria-label={`Fotografar ${label}`}
        >
          <Camera className="w-4 h-4" />
          Fotografar
        </Link>
        <Link
          href={`/animal/${animal.id}`}
          className="btn-secondary px-3 py-2.5 text-xs"
          title="Abrir ficha e galeria"
        >
          Ficha
          <ChevronRight className="w-3.5 h-3.5" />
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
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/animals")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login");
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (Array.isArray(d)) setAnimals(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/admin/animals")
      .then((r) => {
        if (r.ok) setIsAdmin(true);
      })
      .catch(() => {});
  }, [router]);

  const stats = useMemo(() => {
    const totalAnimals = animals.length;
    const totalPhotos = animals.reduce((acc, a) => acc + (a.photos?.length ?? 0), 0);
    const withPhotos = animals.filter((a) => (a.photos?.length ?? 0) > 0).length;
    const avgWeight =
      totalAnimals > 0
        ? Math.round(animals.reduce((acc, a) => acc + (Number(a.weight) || 0), 0) / totalAnimals)
        : 0;
    const coverage = totalAnimals > 0 ? Math.round((withPhotos / totalAnimals) * 100) : 0;
    return { totalAnimals, totalPhotos, withPhotos, avgWeight, coverage };
  }, [animals]);

  const filtered = useMemo(() => {
    return animals.filter((a) => {
      const photoCount = a.photos?.length ?? 0;
      if (filterMode === "with_photos" && photoCount === 0) return false;
      if (filterMode === "without_photos" && photoCount > 0) return false;

      const q = query.trim().toUpperCase();
      if (!q) return true;
      return (
        a.tag.toUpperCase().includes(q) ||
        a.name.toUpperCase().includes(q) ||
        a.breed.toUpperCase().includes(q)
      );
    });
  }, [animals, query, filterMode]);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      {/* Header Glassmorphic */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-xs shrink-0">
              <span className="text-lg">🐄</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                Cattle<span className="text-emerald-600">Capture</span>
              </h1>
              <p className="text-[11px] font-medium text-slate-500 truncate">
                {loading
                  ? "Carregando rebanho…"
                  : `${stats.totalAnimals} animais · ${stats.totalPhotos} capturas`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-amber-100 text-amber-900 border border-amber-300/80 hover:bg-amber-200 transition"
              >
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                <span>Admin</span>
              </Link>
            )}
            <Link
              href="/identify"
              className="hidden sm:inline-flex btn-secondary py-2 px-3.5 text-xs"
            >
              <ScanLine className="w-4 h-4 text-emerald-600" />
              Identificar Brinco
            </Link>
            <Link
              href="/animal/new"
              className="hidden sm:inline-flex btn-primary py-2 px-3.5 text-xs"
            >
              <Plus className="w-4 h-4" />
              Novo Animal
            </Link>
            <form action={logoutAction}>
              <button
                type="submit"
                className="p-2.5 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                title="Sair da conta"
                aria-label="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-28 sm:pb-10">
        {/* KPIs do Rebanho */}
        {!loading && animals.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Animais
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {stats.totalAnimals}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Cadastrados no painel</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Dataset ICC
              </p>
              <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                {stats.totalPhotos}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Fotos de traseira</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Cobertura
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {stats.coverage}%
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {stats.withPhotos} de {stats.totalAnimals} com foto
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Peso Médio
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">
                {stats.avgWeight} <span className="text-sm font-semibold text-slate-500">kg</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Média do lote</p>
            </div>
          </div>
        )}

        {/* Barra de Busca e Filtros */}
        {!loading && animals.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por brinco (ex: NEL-0142), apelido ou raça…"
                className="field-input pl-10"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1 shrink-0 overflow-x-auto">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1 shrink-0" />
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "with_photos", label: "Com fotos" },
                  { id: "without_photos", label: "Sem fotos" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    filterMode === tab.id
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Listagem */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-20 px-6 flex flex-col items-center justify-center gap-4 text-center max-w-lg mx-auto my-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-3xl">
              🐄
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">
                {query || filterMode !== "all"
                  ? "Nenhum animal encontrado para este filtro"
                  : "Comece cadastrando seu primeiro animal"}
              </h2>
              <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
                {query || filterMode !== "all"
                  ? "Limpe a busca ou altere o filtro para visualizar todos os animais."
                  : "Cadastre o brinco e os dados básicos do bovino para liberar a captura guiada de fotos."}
              </p>
            </div>
            {query || filterMode !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilterMode("all");
                }}
                className="btn-secondary px-5 py-2.5 text-sm"
              >
                Limpar filtros
              </button>
            ) : (
              <div className="flex flex-wrap justify-center gap-3 mt-1">
                <Link href="/animal/new" className="btn-primary px-6 py-3">
                  <Plus className="w-4 h-4" />
                  Cadastrar Primeiro Animal
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="btn-secondary px-5 py-3">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    Ver Todos no Painel Admin
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a) => (
              <AnimalCard key={a.id} animal={a} />
            ))}
          </div>
        )}
      </main>

      {/* Barra de Ação Inferior Mobile */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2.5 flex items-center justify-around gap-2"
        style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href="/identify"
          className="flex-1 btn-secondary py-2.5 text-xs"
        >
          <ScanLine className="w-4 h-4 text-emerald-600" />
          Identificar
        </Link>
        <Link
          href="/animal/new"
          className="flex-1 btn-primary py-2.5 text-xs"
        >
          <Plus className="w-4 h-4" />
          Novo Animal
        </Link>
      </div>
    </div>
  );
}
