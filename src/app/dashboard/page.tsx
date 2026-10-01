'use client';

/**
 * Dashboard — Lista de animais do usuário logado.
 *
 * Design mobile-first:
 * - Header compacto com avatar/menu overflow em telas pequenas
 * - Cards de animal com preview da última foto (via /api/storage/*)
 * - FAB (Floating Action Button) para novo animal em mobile
 * - Skeleton loading em vez de texto pulsante
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, LogOut, ShieldCheck, Camera, ChevronRight, ImageOff } from 'lucide-react';
import { Animal, filePathToUrl } from '@/lib/types';

// ── Skeleton de card ──────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
      <div className="aspect-video skeleton" />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-4 skeleton w-2/3 rounded" />
        <div className="h-3 skeleton w-1/2 rounded" />
        <div className="h-9 skeleton w-full rounded-xl mt-2" />
      </div>
    </div>
  );
}

// ── Card de animal ────────────────────────────────────────────────────────
function AnimalCard({ animal }: { animal: Animal }) {
  const lastPhoto = animal.photos?.[0];
  const photoUrl = lastPhoto ? filePathToUrl(lastPhoto.filePath) : null;
  const [imgError, setImgError] = useState(false);

  return (
    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Thumbnail da última foto */}
      <div className="aspect-video bg-slate-100 relative overflow-hidden">
        {photoUrl && !imgError ? (
          <img
            src={photoUrl}
            alt={animal.name || 'Animal'}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <ImageOff className="w-8 h-8" />
          </div>
        )}
        {/* Badge de contagem de fotos */}
        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm font-medium">
          {animal.photos?.length ?? 0} foto{animal.photos?.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-bold text-slate-900 text-base truncate">
            {animal.name || 'Sem Nome'}
          </h3>
          <span className="text-xs text-slate-400 shrink-0 ml-2">#{animal.id}</span>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {animal.breed} • {animal.sex} • {animal.weight}kg
        </p>

        <div className="flex gap-2">
          <Link
            href={`/animal/${animal.id}`}
            className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition active:scale-[0.98]"
          >
            Ver Perfil
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/camera?animalId=${animal.id}`}
            className="flex items-center justify-center p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition active:scale-[0.98]"
            aria-label="Capturar foto"
          >
            <Camera className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Página Principal ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/animals')
      .then(r => {
        if (r.status === 401) { router.push('/login'); return null; }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) setAnimals(data as Animal[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Verificar se é admin (silencioso — sem quebrar nada)
    fetch('/api/admin/animals')
      .then(r => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, [router]);

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900">Meus Animais</h1>
            {!loading && (
              <p className="text-xs text-slate-400">{animals.length} cadastrado{animals.length !== 1 ? 's' : ''}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Link
                href="/admin"
                title="Painel Admin"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-100 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </Link>
            )}
            <Link
              href="/animal/new"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo Animal
            </Link>
            <Link
              href="/api/auth/signout"
              title="Sair"
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <LogOut className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-28 sm:pb-10">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : animals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
              <Camera className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1">Nenhum animal cadastrado</p>
              <p className="text-sm text-slate-400">Cadastre seu primeiro animal para começar a capturar fotos.</p>
            </div>
            <Link
              href="/animal/new"
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-semibold hover:bg-emerald-700 transition"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Primeiro Animal
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {animals.map(a => <AnimalCard key={a.id} animal={a} />)}
          </div>
        )}
      </main>

      {/* FAB — Apenas mobile */}
      <div
        className="sm:hidden fixed bottom-4 right-4 z-20"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Link
          href="/animal/new"
          aria-label="Cadastrar novo animal"
          className="flex items-center justify-center w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-xl transition active:scale-95"
        >
          <Plus className="w-6 h-6" />
        </Link>
      </div>
    </div>
  );
}
