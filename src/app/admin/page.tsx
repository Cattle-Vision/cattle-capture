'use client';

/**
 * Painel Administrativo e Curadoria do Dataset (`src/app/admin/page.tsx`).
 *
 * Melhorias Arquiteturais e Visuais:
 * - Corrige as miniaturas quebradas usando `getPhotoUrl(lastPhoto.id)` (`/api/photos/[id]`).
 * - Adiciona inspeção rápida das fotos de qualquer animal via `PhotoLightbox` direto no Admin.
 * - Métricas executivas: Total de Animais, Total de Fotos, Score Médio IA e Operadores.
 * - Busca e filtragem por brinco, proprietário, raça ou status de captura.
 * - Exportação completa do Dataset em `.ZIP` (`images/`, `manifest.json` e `dataset.csv`).
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  ArrowLeft,
  Users,
  ImageIcon,
  Loader2,
  Search,
  Sparkles,
  Camera,
  Eye,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { AnimalWithOwner, getPhotoUrl } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';
import PhotoLightbox from '@/components/PhotoLightbox';

function SkeletonCard() {
  return (
    <div className="card p-4 flex gap-4">
      <div className="w-16 h-16 skeleton rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 skeleton rounded w-3/4" />
        <div className="h-3 skeleton rounded w-1/2" />
        <div className="h-3 skeleton rounded w-1/3" />
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [animals, setAnimals] = useState<AnimalWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [previewAnimal, setPreviewAnimal] = useState<AnimalWithOwner | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/animals')
      .then((r) => {
        if (r.status === 401) {
          router.push('/login');
          return null;
        }
        if (r.status === 403) {
          router.push('/dashboard');
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAnimals(data as AnimalWithOwner[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const stats = useMemo(() => {
    const totalAnimals = animals.length;
    const allPhotos = animals.flatMap((a) => a.photos ?? []);
    const totalPhotos = allPhotos.length;
    const owners = new Set(animals.map((a) => a.ownerId)).size;
    const scoredPhotos = allPhotos.filter(
      (p) => typeof p.score === 'number' && !Number.isNaN(p.score)
    );
    const avgScore =
      scoredPhotos.length > 0
        ? Math.round(
            scoredPhotos.reduce((acc, p) => acc + (p.score as number), 0) /
              scoredPhotos.length
          )
        : null;

    return { totalAnimals, totalPhotos, owners, avgScore };
  }, [animals]);

  const filtered = useMemo(() => {
    return animals.filter((a) => {
      if (onlyWithPhotos && (a.photos?.length ?? 0) === 0) return false;
      const q = query.trim().toUpperCase();
      if (!q) return true;
      return (
        a.tag.toUpperCase().includes(q) ||
        (a.name || '').toUpperCase().includes(q) ||
        a.breed.toUpperCase().includes(q) ||
        (a.owner?.name || '').toUpperCase().includes(q) ||
        (a.owner?.email || '').toUpperCase().includes(q)
      );
    });
  }, [animals, query, onlyWithPhotos]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao exportar');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cattle-bcs-dataset-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Download do dataset ZIP iniciado com sucesso!', 'success');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Erro ao gerar o dataset.',
        'error'
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition shrink-0"
              aria-label="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 truncate">
                  Central Administrativa
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                  <ShieldCheck className="w-3 h-3" />
                  ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Curadoria e exportação global do dataset ICC
              </p>
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={downloading || stats.totalPhotos === 0}
            className="btn-primary py-2.5 px-4 text-xs sm:text-sm shrink-0"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{downloading ? 'Empacotando ZIP…' : 'Exportar Dataset (.ZIP)'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6">
        {loading ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 skeleton rounded-2xl" />
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </>
        ) : (
          <>
            {/* KPIs Executivos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Animais
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.totalAnimals}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Registros globais</p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                  Total Capturas
                </p>
                <p className="text-2xl font-extrabold text-emerald-700 mt-1">
                  {stats.totalPhotos}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Prontas para exportação</p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Score Médio IA
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.avgScore !== null ? `${stats.avgScore}%` : '—'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Confiança YOLO</p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Operadores
                </p>
                <p className="text-2xl font-extrabold text-slate-900 mt-1">
                  {stats.owners}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Usuários com coletas</p>
              </div>
            </div>

            {/* Busca e Filtro */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filtrar por brinco, raça ou nome/e-mail do operador…"
                  className="field-input pl-10"
                />
              </div>

              <button
                type="button"
                onClick={() => setOnlyWithPhotos((v) => !v)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition shrink-0 ${
                  onlyWithPhotos
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Apenas animais com fotos ({animals.filter((a) => (a.photos?.length ?? 0) > 0).length})
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="card py-20 px-4 flex flex-col items-center justify-center gap-3 text-center text-slate-400">
                <Users className="w-10 h-10 opacity-40" />
                <p className="font-bold text-slate-700">Nenhum registro encontrado</p>
                <p className="text-xs text-slate-500">
                  Ajuste os filtros ou cadastre novos animais no painel.
                </p>
              </div>
            ) : (
              <>
                {/* Mobile: Cards */}
                <div className="sm:hidden flex flex-col gap-3">
                  {filtered.map((animal) => {
                    const lastPhoto = animal.photos?.[0];
                    const photoUrl = lastPhoto ? getPhotoUrl(lastPhoto.id) : null;
                    const photoCount = animal.photos?.length ?? 0;

                    return (
                      <div key={animal.id} className="card p-4 flex gap-3.5 items-center">
                        <button
                          type="button"
                          onClick={() => photoCount > 0 && setPreviewAnimal(animal)}
                          className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200 relative"
                        >
                          {photoUrl ? (
                            <img
                              src={photoUrl}
                              alt={animal.tag}
                              loading="lazy"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-6 h-6 text-slate-300" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              href={`/animal/${animal.id}`}
                              className="font-mono-tag text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white"
                            >
                              {animal.tag}
                            </Link>
                            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 mt-1 truncate">
                            {animal.name || animal.breed} · {animal.sex} ({animal.weight}kg)
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            Operador: {animal.owner?.name || animal.owner?.email}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop: Tabela Completa */}
                <div className="hidden sm:block card overflow-hidden">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200/80 text-xs uppercase tracking-wider text-slate-400 font-bold">
                      <tr>
                        <th className="px-5 py-3.5">Prévia / Brinco</th>
                        <th className="px-5 py-3.5">Zootecnia</th>
                        <th className="px-5 py-3.5">Operador</th>
                        <th className="px-5 py-3.5">Score IA</th>
                        <th className="px-5 py-3.5">Capturas</th>
                        <th className="px-5 py-3.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((a) => {
                        const lastPhoto = a.photos?.[0];
                        const photoUrl = lastPhoto ? getPhotoUrl(lastPhoto.id) : null;
                        const photoCount = a.photos?.length ?? 0;
                        const score =
                          lastPhoto && typeof lastPhoto.score === 'number'
                            ? Math.round(lastPhoto.score)
                            : null;

                        return (
                          <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  disabled={photoCount === 0}
                                  onClick={() => photoCount > 0 && setPreviewAnimal(a)}
                                  className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center group relative"
                                  title={photoCount > 0 ? 'Inspecionar fotos' : 'Sem fotos'}
                                >
                                  {photoUrl ? (
                                    <img
                                      src={photoUrl}
                                      alt={a.tag}
                                      loading="lazy"
                                      className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                    />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-slate-300" />
                                  )}
                                </button>
                                <div>
                                  <Link
                                    href={`/animal/${a.id}`}
                                    className="font-mono-tag text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-emerald-700 transition"
                                  >
                                    {a.tag}
                                  </Link>
                                  {a.name && (
                                    <p className="text-xs font-semibold text-slate-700 mt-1">
                                      {a.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="px-5 py-3.5">
                              <p className="font-bold text-slate-900">
                                {a.breed} · {a.sex}
                              </p>
                              <p className="text-xs text-slate-500">
                                {a.weight} kg · {a.age} meses
                              </p>
                            </td>

                            <td className="px-5 py-3.5">
                              <p className="font-semibold text-slate-800">
                                {a.owner?.name || '—'}
                              </p>
                              <p className="text-xs text-slate-400">{a.owner?.email}</p>
                            </td>

                            <td className="px-5 py-3.5">
                              {score !== null ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                    score >= 40
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  <Sparkles className="w-3 h-3" />
                                  {score}%
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>

                            <td className="px-5 py-3.5">
                              <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-xs">
                                {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                              </span>
                            </td>

                            <td className="px-5 py-3.5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {photoCount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAnimal(a)}
                                    className="p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                    title="Inspecionar galeria"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                )}
                                <Link
                                  href={`/camera?animalId=${a.id}&animalName=${encodeURIComponent(
                                    a.name || a.tag
                                  )}`}
                                  className="p-2 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                                  title="Capturar foto"
                                >
                                  <Camera className="w-4 h-4" />
                                </Link>
                                <Link
                                  href={`/animal/${a.id}`}
                                  className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                  title="Abrir ficha completa"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Lightbox para inspeção rápida das fotos do animal selecionado */}
      {previewAnimal && (previewAnimal.photos?.length ?? 0) > 0 && (
        <PhotoLightbox
          photos={previewAnimal.photos}
          initialIndex={0}
          onClose={() => setPreviewAnimal(null)}
        />
      )}
    </div>
  );
}
