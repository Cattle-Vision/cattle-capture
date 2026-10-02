'use client';

/**
 * Painel de administração — visão geral de todos os animais do dataset.
 *
 * Mobile: cards ao invés de tabela (tabela só em sm+)
 * Funcionalidades:
 * - Listagem de todos os animais com foto count e owner
 * - Pré-visualização das fotos (miniatura da mais recente)
 * - Link para perfil do animal
 * - Download do dataset (ZIP)
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Download, ArrowLeft, Users, ImageIcon, Loader2 } from 'lucide-react';
import { AnimalWithOwner, filePathToUrl } from '@/lib/types';
import { useToast } from '@/components/ui/Toast';

// ── Skeleton ──────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4 flex gap-4 shadow-sm">
      <div className="w-16 h-16 skeleton rounded-xl shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-4 skeleton rounded w-3/4" />
        <div className="h-3 skeleton rounded w-1/2" />
        <div className="h-3 skeleton rounded w-1/3" />
      </div>
    </div>
  );
}

// ── Card de animal (mobile) ───────────────────────────────────────────────
function AnimalCard({ animal }: { animal: AnimalWithOwner }) {
  const lastPhoto = animal.photos?.[0];
  const photoUrl = lastPhoto ? filePathToUrl(lastPhoto.filePath) : null;

  return (
    <Link
      href={`/animal/${animal.id}`}
      className="bg-white rounded-2xl border border-slate-100 p-4 flex gap-4 shadow-sm hover:shadow-md transition-shadow active:scale-[0.99]"
    >
      {/* Thumbnail */}
      <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon className="w-6 h-6 text-slate-300" />
        )}
      </div>

      {/* Dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-slate-900 truncate">
            {animal.tag} {animal.name ? `· ${animal.name}` : ''}
          </p>
          <span className="shrink-0 text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
            {animal.photos?.length ?? 0} foto{animal.photos?.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="text-sm text-slate-500 mt-0.5 truncate">{animal.breed} • {animal.sex}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          👤 {animal.owner?.name || animal.owner?.email || '—'}
        </p>
      </div>
    </Link>
  );
}

// ── Stats Banner ──────────────────────────────────────────────────────────
function StatsBanner({ animals }: { animals: AnimalWithOwner[] }) {
  const totalPhotos = animals.reduce((sum, a) => sum + (a.photos?.length ?? 0), 0);
  const owners = new Set(animals.map(a => a.ownerId)).size;

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {[
        { label: 'Animais', value: animals.length, color: 'bg-blue-50 text-blue-700' },
        { label: 'Fotos', value: totalPhotos, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Usuários', value: owners, color: 'bg-violet-50 text-violet-700' },
      ].map(stat => (
        <div key={stat.label} className={`${stat.color} rounded-2xl p-4 text-center`}>
          <p className="text-2xl font-bold">{stat.value}</p>
          <p className="text-xs font-medium opacity-70 mt-0.5">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Tabela desktop ────────────────────────────────────────────────────────
function DesktopTable({ animals }: { animals: AnimalWithOwner[] }) {
  return (
    <div className="hidden sm:block bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <table className="w-full text-left text-sm text-slate-600">
        <thead className="bg-slate-50 border-b border-slate-100">
          <tr>
            <th className="px-5 py-3.5 font-semibold text-slate-700">Animal</th>
            <th className="px-5 py-3.5 font-semibold text-slate-700">Proprietário</th>
            <th className="px-5 py-3.5 font-semibold text-slate-700">Raça / Sexo</th>
            <th className="px-5 py-3.5 font-semibold text-slate-700">Peso / Idade</th>
            <th className="px-5 py-3.5 font-semibold text-slate-700 text-right">Fotos</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {animals.map(a => (
            <tr key={a.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-5 py-3">
                <Link href={`/animal/${a.id}`} className="font-medium text-slate-900 hover:text-emerald-600 transition-colors">
                  {a.tag} {a.name ? `· ${a.name}` : ''}
                </Link>
              </td>
              <td className="px-5 py-3 text-slate-500">{a.owner?.name || a.owner?.email || '—'}</td>
              <td className="px-5 py-3">{a.breed} • {a.sex}</td>
              <td className="px-5 py-3">{a.weight}kg • {a.age}m</td>
              <td className="px-5 py-3 text-right">
                <span className="font-semibold text-emerald-600">{a.photos?.length ?? 0}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────
export default function AdminPage() {
  const [animals, setAnimals] = useState<AnimalWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    fetch('/api/admin/animals')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null; }
        if (r.status === 403) { router.push('/dashboard'); return null; }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setAnimals(data as AnimalWithOwner[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/export');
      if (!res.ok) throw new Error('export failed');

      // Forçar download sem abrir nova aba
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'dataset.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast('Download iniciado!', 'success');
    } catch {
      toast('Erro ao gerar o dataset. Tente novamente.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl hover:bg-slate-100 transition shrink-0"
            aria-label="Voltar ao Dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-900">Painel Admin</h1>
            <p className="text-xs text-slate-400">Dataset de imagens</p>
          </div>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-sm font-semibold transition active:scale-[0.98] shrink-0"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Baixar Dataset</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[1, 2, 3].map(i => <div key={i} className="h-20 skeleton rounded-2xl" />)}
            </div>
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          </>
        ) : animals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center text-slate-400">
            <Users className="w-12 h-12 opacity-30" />
            <p>Nenhum animal cadastrado no sistema.</p>
          </div>
        ) : (
          <>
            <StatsBanner animals={animals} />

            {/* Mobile: cards */}
            <div className="sm:hidden flex flex-col gap-3">
              {animals.map(a => <AnimalCard key={a.id} animal={a} />)}
            </div>

            {/* Desktop: tabela */}
            <DesktopTable animals={animals} />
          </>
        )}
      </main>
    </div>
  );
}
