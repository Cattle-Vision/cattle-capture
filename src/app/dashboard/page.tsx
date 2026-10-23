"use client";

/**
 * Painel Principal do Operador (`src/app/dashboard/page.tsx`).
 *
 * Melhorias Arquiteturais e Visuais:
 * - Renderiza miniaturas via `getPhotoUrl(lastPhoto.id)` (`/api/photos/[id]`), eliminando
 *   erros 403 com Vercel Blob privado.
 * - Exibe KPIs do rebanho em tempo real (Total de Animais, Capturas, Peso Médio e Cobertura).
 * - Suporta busca instantânea combinada com filtros de status fotográfico ("Todos", "Com fotos", "Sem fotos").
 * - Suporte integral a Tema Claro/Escuro (`ThemeToggle`) e barra inferior Mobile PWA (`MobileNav`).
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
  Activity,
  Scale,
  Calendar,
  Images,
  ChevronRight,
  Filter,
  Loader2,
  Layers,
  SearchX,
} from "lucide-react";
import { Animal, getPhotoUrl } from "@/lib/types";
import { logoutAction } from "@/app/login/actions";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import { useToast } from "@/components/ui/Toast";

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
    <div className="card overflow-hidden group relative hover:shadow-lg hover:border-emerald-500/60 transition-all duration-200 flex flex-col justify-between">
      {/* Link principal cobrindo a área superior/informativa */}
      <Link
        href={`/animal/${animal.id}`}
        className="block focus:outline-none"
        aria-label={`Ver ficha de ${label}`}
      >
        {/* Capa Fotográfica */}
        <div className="aspect-[16/10] relative overflow-hidden bg-theme-surface-2">
          {photoUrl && !imgErr ? (
            <img
              src={photoUrl}
              alt={label}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgErr(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-theme-surface-2 text-theme-muted">
              <Layers className="w-8 h-8 opacity-40 stroke-[1.5]" />
              <span className="text-[11px] font-medium text-theme-muted">Sem foto</span>
            </div>
          )}

          {/* Gradiente sutil */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/65 to-transparent pointer-events-none" />

          {/* Badge Brinco (Monospace) */}
          <div className="absolute top-2 left-2 font-mono-tag text-xs font-bold px-2 py-0.5 rounded-md bg-slate-900/85 text-white backdrop-blur-md shadow-xs tracking-wider">
            {animal.tag}
          </div>

          {/* Confiança IA se disponível */}
          {bestScore !== null && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-600/90 text-white backdrop-blur-md shadow-xs">
              <Activity className="w-3 h-3" />
              Confiança {bestScore}%
            </div>
          )}

          {/* Contador de fotos */}
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-black/65 text-white backdrop-blur-md">
            <Images className="w-3 h-3 text-emerald-400" />
            {photoCount} {photoCount === 1 ? "foto" : "fotos"}
          </div>
        </div>

        {/* Informações do Animal */}
        <div className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="font-extrabold text-base text-theme-primary truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {animal.name ? `${animal.name}` : `Brinco ${animal.tag}`}
            </h3>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 shrink-0">
              {animal.breed}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-theme-secondary">
            <span>{animal.sex}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Scale className="w-3.5 h-3.5 text-theme-muted" />
              {animal.weight} kg
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-theme-muted" />
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
  const [recalibratingHerd, setRecalibratingHerd] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleRecalibrateHerd = async () => {
    if (recalibratingHerd) return;
    const ok = window.confirm(
      "Deseja recalcular a confiança de todas as fotos dos seus animais com a IA atual calibrada?"
    );
    if (!ok) return;

    setRecalibratingHerd(true);
    try {
      const res = await fetch("/api/animals/recalibrate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao recalcular");

      toast(data.message || `${data.updatedCount ?? 0} fotos recalculadas com sucesso!`, "success");

      const freshRes = await fetch("/api/animals");
      if (freshRes.ok) {
        const freshAnimals = await freshRes.json();
        if (Array.isArray(freshAnimals)) setAnimals(freshAnimals);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao recalcular confiança", "error");
    } finally {
      setRecalibratingHerd(false);
    }
  };

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
    <div className="min-h-[100dvh] flex flex-col bg-theme-bg text-theme-primary">
      {/* Header Glassmorphic Compacto */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-emerald-600 flex items-center justify-center text-white shrink-0">
              <ScanLine className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-theme-primary truncate">
                Cattle<span className="text-emerald-600 dark:text-emerald-400">Capture</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] font-medium text-theme-secondary truncate hidden xs:block">
                {loading
                  ? "Carregando…"
                  : `${stats.totalAnimals} animais · ${stats.totalPhotos} fotos`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ThemeToggle className="p-1.5 sm:p-2" />
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition shrink-0"
                title="Central Administrativa"
                aria-label="Central Administrativa"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Admin</span>
              </Link>
            )}
            <Link
              href="/identify"
              className="hidden sm:inline-flex btn-secondary py-1.5 px-3 text-xs"
            >
              <ScanLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Identificar Brinco
            </Link>
            <Link
              href="/animal/new"
              className="hidden sm:inline-flex btn-primary py-1.5 px-3 text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Animal
            </Link>
            <form action={logoutAction} className="shrink-0">
              <button
                type="submit"
                className="p-1.5 sm:p-2 rounded-md text-theme-secondary hover:text-red-500 hover:bg-red-500/10 transition"
                title="Sair da conta"
                aria-label="Sair da conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 pb-20 sm:pb-8">
        {/* KPIs do Rebanho */}
        {!loading && animals.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                Animais
              </p>
              <p className="text-2xl font-extrabold text-theme-primary mt-1">
                {stats.totalAnimals}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">Cadastrados no painel</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Dataset ICC
              </p>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {stats.totalPhotos}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">Fotos de traseira</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                Cobertura
              </p>
              <p className="text-2xl font-extrabold text-theme-primary mt-1">
                {stats.coverage}%
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">
                {stats.withPhotos} de {stats.totalAnimals} com foto
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                Peso Médio
              </p>
              <p className="text-2xl font-extrabold text-theme-primary mt-1">
                {stats.avgWeight}{" "}
                <span className="text-sm font-semibold text-theme-secondary">kg</span>
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">Média do lote</p>
            </div>
          </div>
        )}

        {/* Barra de Busca e Filtros */}
        {!loading && animals.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por brinco (ex: NEL-0142), apelido ou raça…"
                className="field-input pl-10"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-theme-surface border border-theme rounded-xl p-1 shrink-0 overflow-x-auto">
              <Filter className="w-3.5 h-3.5 text-theme-muted ml-2 mr-1 shrink-0" />
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
                      : "text-theme-secondary hover:bg-theme-surface-2"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {stats.totalPhotos > 0 && (
              <button
                type="button"
                onClick={handleRecalibrateHerd}
                disabled={recalibratingHerd}
                className="btn-secondary py-1.5 px-3 text-xs flex items-center justify-center gap-1.5 shrink-0 border-emerald-500/30 hover:border-emerald-500/50"
                title="Recalcular confiança de todas as fotos do seu rebanho usando a IA calibrada localmente"
              >
                {recalibratingHerd ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                ) : (
                  <Activity className="w-3.5 h-3.5 text-emerald-500" />
                )}
                <span>
                  {recalibratingHerd ? "Recalculando…" : "Recalcular Confiança"}
                </span>
              </button>
            )}
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
          <div className="card py-16 px-6 flex flex-col items-center justify-center gap-3 text-center max-w-lg mx-auto my-6">
            <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Layers className="w-6 h-6 text-emerald-600 dark:text-emerald-400 stroke-[1.5]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-theme-primary">
                {query || filterMode !== "all"
                  ? "Nenhum animal encontrado para este filtro"
                  : "Comece cadastrando seu primeiro animal"}
              </h2>
              <p className="text-xs text-theme-secondary mt-1 max-w-sm mx-auto">
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
                    <ShieldCheck className="w-4 h-4 text-amber-500" />
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

      <MobileNav isAdmin={isAdmin} />
    </div>
  );
}
