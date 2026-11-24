"use client";

/**
 * Painel do Rebanho (`src/app/dashboard/page.tsx`).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Camera,
  Search,
  ChevronRight,
  Layers,
  Copy,
  Check,
  LayoutGrid,
  List,
  RefreshCw,
  MapPin,
  Users,
  Images,
  ShieldCheck,
} from "lucide-react";
import { Animal, getPhotoUrl } from "@/lib/types";
import { AsyncPhoto } from "@/components/AsyncPhoto";
import {
  apiFetchCached,
  getApiCacheSnapshot,
  invalidateApiCache,
  prefetchApi,
  readPersistedApiCache,
} from "@/lib/api";
import { getHerdSnapshot, saveHerdSnapshot } from "@/lib/sync";
import { useAuth } from "@/lib/auth-context";
import AppShell from "@/components/AppShell";
import { useToast } from "@/components/ui/Toast";

type FilterMode = "all" | "owned" | "shared" | "with_photos" | "without_photos";
type ViewMode = "grid" | "list";

const ANIMALS_SUMMARY_ENDPOINT = "/api/animals?summary=1";

function getPhotoCount(animal: Animal): number {
  return animal.photoCount ?? animal.photos?.length ?? 0;
}

function CardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[16/10] skeleton rounded-none" />
      <div className="p-4 flex flex-col gap-3">
        <div className="h-4 skeleton w-2/3" />
        <div className="h-3 skeleton w-1/2" />
        <div className="h-10 skeleton w-full rounded-[10px] mt-1" />
      </div>
    </div>
  );
}

function FramingBadge({ animal }: { animal: Animal }) {
  const lastPhoto = animal.photos?.[0];
  if (lastPhoto && typeof lastPhoto.score === "number") {
    const pct = Math.round(lastPhoto.score);
    const ok = pct >= 40;
    return (
      <span
        title={`Qualidade de enquadramento da última captura: ${pct}%`}
        className={`inline-flex items-center px-2 py-0.5 rounded-[7px] text-xs font-bold tabular-nums shrink-0 ${
          ok
            ? "bg-brand text-white"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        }`}
      >
        Enquadr. {pct}%
      </span>
    );
  }
  const photoCount = getPhotoCount(animal);
  if (photoCount > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[11px] font-semibold bg-brand-soft text-brand shrink-0 tabular-nums">
        {photoCount} {photoCount === 1 ? "foto" : "fotos"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[7px] text-[11px] font-medium bg-theme-surface-2 text-theme-muted border border-theme shrink-0">
      Sem captura
    </span>
  );
}

function AnimalCard({ animal, currentUserId }: { animal: Animal; currentUserId?: number }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const lastPhoto = animal.photos?.[0];
  const photoUrl = lastPhoto ? getPhotoUrl(lastPhoto.id, 480) : null;
  const displayName = animal.name?.trim() || "Sem apelido";
  const photoCount = getPhotoCount(animal);
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(displayName)}`;
  const bestScore =
    lastPhoto && typeof lastPhoto.score === "number" ? Math.round(lastPhoto.score) : null;

  const isShared = animal.isShared || (currentUserId !== undefined && animal.ownerId !== currentUserId);

  const copyTag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(animal.tag);
    setCopied(true);
    toast("Identificador copiado.", "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const shortTag =
    animal.tag.length > 14 ? `${animal.tag.slice(0, 6)}…${animal.tag.slice(-4)}` : animal.tag;

  return (
    <div className="card overflow-hidden group flex flex-col justify-between hover:border-theme-strong transition">
      <Link
        href={`/animal/${animal.id}`}
        onMouseEnter={() => prefetchApi(`/api/animals/${animal.id}`)}
        onTouchStart={() => prefetchApi(`/api/animals/${animal.id}`)}
        className="block focus:outline-none"
        aria-label={`Abrir ficha de ${displayName}`}
      >
        {/* Imagem limpa sem excesso de etiquetas */}
        <div className="aspect-[16/10] relative overflow-hidden bg-theme-surface-2 border-b border-theme">
          {photoUrl ? (
            <AsyncPhoto
              src={photoUrl}
              alt={displayName}
              loadingLabel="Carregando…"
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
              fallbackIcon={<Layers className="w-7 h-7 opacity-35" />}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-theme-muted">
              <Layers className="w-6 h-6 opacity-40" />
              <span className="text-[11px] font-medium">Sem capturas</span>
            </div>
          )}

          {isShared && (
            <span
              title="Animal em guarda compartilhada"
              className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-[7px] bg-black/65 text-white backdrop-blur-xs"
            >
              <Users className="w-3 h-3" />
              <span>Compartilhado</span>
            </span>
          )}

          <div className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-[7px] bg-black/65 text-white backdrop-blur-xs">
            <Images className="w-3 h-3" />
            <span>{photoCount}</span>
          </div>
        </div>

        {/* Informações estruturadas abaixo da foto */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-bold text-[15px] text-theme-primary truncate group-hover:text-brand transition-colors">
                {displayName}
              </h3>
              <p className="text-xs text-theme-secondary truncate mt-0.5">
                {animal.breed} — {animal.sex}
              </p>
            </div>
            <FramingBadge animal={animal} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs text-theme-secondary tabular-nums">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-theme-primary">{animal.weight} kg</span>
              <span>{animal.age} meses</span>
            </div>

            <button
              type="button"
              onClick={copyTag}
              title={`Copiar identificador: ${animal.tag}`}
              className="inline-flex items-center gap-1 text-[11px] font-mono-tag text-theme-muted hover:text-theme-primary transition"
            >
              <span>{shortTag}</span>
              {copied ? (
                <Check className="w-3 h-3 text-brand" />
              ) : (
                <Copy className="w-3 h-3 opacity-60" />
              )}
            </button>
          </div>

          {(animal.location || bestScore !== null) && (
            <div className="flex items-center justify-between gap-2 text-[11px] text-theme-muted">
              {animal.location ? (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="w-3 h-3 text-brand shrink-0" />
                  <span className="truncate">{animal.location}</span>
                </span>
              ) : (
                <span />
              )}

              {bestScore !== null && (
                <span className="tabular-nums shrink-0 font-medium text-theme-secondary">
                  Enquadramento {bestScore}%
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div className="px-4 pb-4 flex items-center gap-2">
        <Link
          href={cameraUrl}
          className="btn-primary flex-1 !min-h-[38px] !py-1.5 text-xs"
          aria-label={`Fotografar ${displayName}`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Fotografar</span>
        </Link>
        <Link
          href={`/animal/${animal.id}`}
          className="btn-secondary !min-h-[38px] !py-1.5 !px-3 text-xs"
          title="Abrir ficha"
        >
          <span>Ficha</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function AnimalTableRow({ animal, currentUserId }: { animal: Animal; currentUserId?: number }) {
  const lastPhoto = animal.photos?.[0];
  const thumbUrl = lastPhoto ? getPhotoUrl(lastPhoto.id, 240) : null;
  const displayName = animal.name?.trim() || "Sem apelido";
  const photoCount = getPhotoCount(animal);
  const isShared = animal.isShared || (currentUserId !== undefined && animal.ownerId !== currentUserId);
  const cameraUrl = `/camera?animalId=${animal.id}&animalName=${encodeURIComponent(displayName)}`;

  return (
    <div className="p-3 sm:px-4 flex items-center gap-3.5 hover:bg-theme-surface-2/60 transition-colors">
      <Link
        href={`/animal/${animal.id}`}
        className="w-16 h-12 rounded-[8px] overflow-hidden bg-theme-surface-2 shrink-0 flex items-center justify-center border border-theme"
      >
        {thumbUrl ? (
          <AsyncPhoto
            src={thumbUrl}
            alt={displayName}
            compact
            fallbackIcon={<Layers className="w-4 h-4 text-theme-muted opacity-40" />}
          />
        ) : (
          <Layers className="w-4 h-4 text-theme-muted opacity-40" />
        )}
      </Link>

      <Link
        href={`/animal/${animal.id}`}
        onMouseEnter={() => prefetchApi(`/api/animals/${animal.id}`)}
        onTouchStart={() => prefetchApi(`/api/animals/${animal.id}`)}
        className="min-w-0 flex-1 grid grid-cols-1 md:grid-cols-12 gap-1.5 md:gap-4 items-center"
      >
        <div className="md:col-span-4 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-theme-primary truncate">{displayName}</span>
            {isShared && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/12 text-sky-700 dark:text-sky-300 shrink-0">
                Compartilhado
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono-tag text-theme-muted truncate">{animal.tag}</p>
        </div>

        <div className="md:col-span-3 text-xs text-theme-secondary tabular-nums truncate">
          {animal.breed}, {animal.sex} — {animal.weight} kg
        </div>

        <div className="md:col-span-3 text-xs text-theme-secondary truncate">
          {animal.location || `${photoCount} ${photoCount === 1 ? "foto" : "fotos"}`}
        </div>

        <div className="md:col-span-2 flex md:justify-end">
          <FramingBadge animal={animal} />
        </div>
      </Link>

      <div className="flex items-center gap-1.5 shrink-0">
        <Link href={cameraUrl} className="btn-primary !py-1.5 !px-3 !min-h-[36px] text-xs">
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Fotografar</span>
        </Link>
        <Link href={`/animal/${animal.id}`} className="btn-secondary !py-1.5 !px-3 !min-h-[36px] text-xs">
          <span>Ficha</span>
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const initialSnapshot = getApiCacheSnapshot<Animal[]>(ANIMALS_SUMMARY_ENDPOINT);
  const [animals, setAnimals] = useState<Animal[]>(() =>
    Array.isArray(initialSnapshot) ? initialSnapshot : []
  );
  const [loading, setLoading] = useState<boolean>(() => !Array.isArray(initialSnapshot));
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [usingOfflineCache, setUsingOfflineCache] = useState(false);
  const router = useRouter();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const currentUserId = user ? Number(user.id) : undefined;

  const loadAnimals = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        setRefreshing(true);
        invalidateApiCache("/api/animals");
      }
      try {
        const data = await apiFetchCached<Animal[]>(
          ANIMALS_SUMMARY_ENDPOINT,
          forceRefresh ? 0 : 15_000
        );
        if (Array.isArray(data)) {
          setAnimals(data);
          setUsingOfflineCache(false);
          saveHerdSnapshot("herd_summary", data).catch(() => {});
        }
      } catch (err: any) {
        if (err?.message?.includes("401") || err?.message?.includes("Token")) {
          router.push("/login");
          return;
        }
        const offlineList = await getHerdSnapshot<Animal[]>("herd_summary");
        if (Array.isArray(offlineList) && offlineList.length > 0) {
          setAnimals(offlineList);
          setUsingOfflineCache(true);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else {
        if (!Array.isArray(initialSnapshot)) {
          const persisted = readPersistedApiCache<Animal[]>(ANIMALS_SUMMARY_ENDPOINT);
          if (Array.isArray(persisted) && persisted.length > 0) {
            setAnimals(persisted);
            setLoading(false);
          } else {
            getHerdSnapshot<Animal[]>("herd_summary")
              .then((offlineList) => {
                if (Array.isArray(offlineList) && offlineList.length > 0) {
                  setAnimals((prev) => (prev.length === 0 ? offlineList : prev));
                  setLoading(false);
                }
              })
              .catch(() => {});
          }
        }
        loadAnimals(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, router, loadAnimals]);

  const stats = useMemo(() => {
    const totalAnimals = animals.length;
    const totalPhotos = animals.reduce((acc, a) => acc + getPhotoCount(a), 0);
    const withPhotos = animals.filter((a) => getPhotoCount(a) > 0).length;
    const withoutPhotos = totalAnimals - withPhotos;
    const sharedCount = animals.filter(
      (a) => a.isShared || (currentUserId !== undefined && a.ownerId !== currentUserId)
    ).length;
    const ownedCount = totalAnimals - sharedCount;
    const avgWeight =
      totalAnimals > 0
        ? Math.round(animals.reduce((acc, a) => acc + (Number(a.weight) || 0), 0) / totalAnimals)
        : 0;
    return {
      totalAnimals,
      totalPhotos,
      withPhotos,
      withoutPhotos,
      sharedCount,
      ownedCount,
      avgWeight,
    };
  }, [animals, currentUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return animals.filter((a) => {
      const photoCount = getPhotoCount(a);
      const isShared = a.isShared || (currentUserId !== undefined && a.ownerId !== currentUserId);

      if (filterMode === "owned" && isShared) return false;
      if (filterMode === "shared" && !isShared) return false;
      if (filterMode === "with_photos" && photoCount === 0) return false;
      if (filterMode === "without_photos" && photoCount > 0) return false;

      if (!q) return true;
      return (
        a.tag.toUpperCase().includes(q) ||
        (a.name && a.name.toUpperCase().includes(q)) ||
        (a.location && a.location.toUpperCase().includes(q)) ||
        (a.locationAddress && a.locationAddress.toUpperCase().includes(q)) ||
        a.breed.toUpperCase().includes(q)
      );
    });
  }, [animals, query, filterMode, currentUserId]);

  const filterTabs = useMemo(() => {
    return [
      { id: "all" as const, label: "Todos", count: stats.totalAnimals },
      ...(stats.sharedCount > 0
        ? [
            { id: "owned" as const, label: "Meus", count: stats.ownedCount },
            { id: "shared" as const, label: "Compartilhados", count: stats.sharedCount },
          ]
        : []),
      { id: "with_photos" as const, label: "Com fotos", count: stats.withPhotos },
      { id: "without_photos" as const, label: "Sem fotos", count: stats.withoutPhotos },
    ];
  }, [stats]);

  return (
    <AppShell
      title="Rebanho"
      subtitle={
        loading
          ? "Carregando…"
          : `${stats.totalAnimals} ${stats.totalAnimals === 1 ? "animal cadastrado" : "animais cadastrados"}`
      }
    >
      <div className="space-y-5">
        {!loading && usingOfflineCache && (
          <div className="px-4 py-2.5 rounded-[10px] bg-sky-500/10 border border-sky-500/25 text-xs text-sky-700 dark:text-sky-300">
            Exibindo cópia salva no aparelho. Novos registros sincronizam ao reconectar.
          </div>
        )}

        {/* Strip único de indicadores */}
        {!loading && animals.length > 0 && (
          <div className="card grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] overflow-hidden">
            <div className="p-4">
              <p className="text-[11px] font-semibold text-theme-muted">Rebanho ativo</p>
              <p className="text-2xl font-bold tabular-nums text-theme-primary mt-1">
                {stats.totalAnimals}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-brand">Com capturas</p>
              <p className="text-2xl font-bold tabular-nums text-brand mt-1">
                {stats.withPhotos}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-theme-muted">Capturas totais</p>
              <p className="text-2xl font-bold tabular-nums text-theme-primary mt-1">
                {stats.totalPhotos}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] font-semibold text-theme-muted">Peso médio</p>
              <p className="text-2xl font-bold tabular-nums text-theme-primary mt-1">
                {stats.avgWeight}{" "}
                <span className="text-xs font-medium text-theme-secondary">kg</span>
              </p>
            </div>
          </div>
        )}

        {/* Barra de busca e filtros */}
        {!loading && animals.length > 0 && (
          <div className="space-y-3">
            <div className="flex gap-2.5 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por apelido, brinco, raça ou fazenda…"
                  className="field-input pl-10"
                />
              </div>

              <div className="hidden sm:flex items-center bg-theme-surface border border-theme rounded-[10px] p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Visualização em grade"
                  title="Grade"
                  className={`p-1.5 rounded-[7px] transition ${
                    viewMode === "grid"
                      ? "bg-brand text-white"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="Visualização em tabela"
                  title="Lista"
                  className={`p-1.5 rounded-[7px] transition ${
                    viewMode === "list"
                      ? "bg-brand text-white"
                      : "text-theme-secondary hover:text-theme-primary"
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadAnimals(true)}
                disabled={refreshing}
                title="Atualizar lista"
                aria-label="Atualizar lista"
                className="btn-secondary !px-3 !min-h-[44px] shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {filterTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterMode(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition whitespace-nowrap inline-flex items-center gap-1.5 border ${
                    filterMode === tab.id
                      ? "bg-brand text-white border-transparent"
                      : "bg-theme-surface text-theme-secondary border-theme hover:text-theme-primary"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                      filterMode === tab.id
                        ? "bg-white/20 text-white"
                        : "bg-theme-surface-2 text-theme-muted"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Listagem */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-14 px-6 flex flex-col items-center justify-center gap-3 text-center max-w-lg mx-auto my-6">
            <div className="w-11 h-11 rounded-[12px] bg-brand-soft flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-theme-primary">
                {query || filterMode !== "all"
                  ? "Nenhum animal encontrado"
                  : "Seu rebanho está vazio"}
              </h2>
              <p className="text-xs text-theme-secondary mt-1 max-w-sm mx-auto">
                {query || filterMode !== "all"
                  ? "Limpe a busca ou troque o filtro para visualizar os animais."
                  : "Cadastre o primeiro bovino com apelido ou brinco para iniciar o acompanhamento."}
              </p>
            </div>
            {query || filterMode !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilterMode("all");
                }}
                className="btn-secondary !py-2 !px-4 !min-h-[38px] text-xs"
              >
                Limpar filtros
              </button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2.5 mt-1">
                <Link href="/animal/new" className="btn-primary px-5 text-sm">
                  <Plus className="w-4 h-4" />
                  <span>Cadastrar animal</span>
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="btn-secondary px-4 text-sm">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Gestão</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : viewMode === "list" ? (
          <div className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {filtered.map((a) => (
              <AnimalTableRow key={a.id} animal={a} currentUserId={currentUserId} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <AnimalCard key={a.id} animal={a} currentUserId={currentUserId} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
