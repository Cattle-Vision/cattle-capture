'use client';

/**
 * Página de perfil de um animal — exibe dados + galeria de fotos.
 *
 * Fluxo:
 * 1. Carrega o animal via GET /api/animals/:id
 * 2. Exibe info em cards e fotos via PhotoGrid
 * 3. Delete de foto via DELETE /api/photos/:id (com confirmação Toast)
 * 4. Lightbox ao clicar em qualquer foto
 * 5. CTA sticky no bottom para capturar nova foto
 */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, Scale, Calendar, Tag, VenetianMask } from 'lucide-react';
import PhotoGrid from '@/components/PhotoGrid';
import PhotoLightbox from '@/components/PhotoLightbox';
import { useToast } from '@/components/ui/Toast';
import { Animal, Photo } from '@/lib/types';

// ── Skeleton da página ─────────────────────────────────────────────────────
function PageSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 animate-pulse">
      <div className="h-14 bg-white border-b" />
      <div className="p-4 max-w-4xl mx-auto flex flex-col gap-4">
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-8 skeleton rounded-lg w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] skeleton rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Card de dado do animal ─────────────────────────────────────────────────
function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
      <div className="text-emerald-600 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <p className="text-sm font-semibold text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Página Principal ───────────────────────────────────────────────────────
export default function AnimalProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast, confirm } = useToast();

  const [animal, setAnimal] = useState<Animal | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Carregar dados do animal
  useEffect(() => {
    if (!id) return;
    fetch(`/api/animals/${id}`)
      .then(res => {
        if (res.status === 401) { router.push('/login'); return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then(data => {
        if (data) setAnimal(data as Animal);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, router]);

  // Delete de foto com confirmação não-bloqueante
  const handleDelete = async (photoId: number) => {
    const ok = await confirm('Tem certeza que quer apagar esta foto? Esta ação não pode ser desfeita.');
    if (!ok) return;

    const res = await fetch(`/api/photos/${photoId}`, { method: 'DELETE' });
    if (res.ok) {
      setAnimal(prev =>
        prev ? { ...prev, photos: prev.photos.filter((p: Photo) => p.id !== photoId) } : prev
      );
      toast('Foto apagada com sucesso', 'success');
    } else {
      toast('Erro ao apagar a foto. Tente novamente.', 'error');
    }
  };

  if (loading) return <PageSkeleton />;

  if (!animal) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-4">
        <div className="text-center">
          <p className="text-red-500 font-medium mb-4">Animal não encontrado ou acesso negado.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-emerald-600 underline"
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      {/* Header sticky */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
        <button
          onClick={() => router.push('/dashboard')}
          aria-label="Voltar"
          className="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-bold text-slate-900 truncate">
            {animal.name || 'Animal sem nome'}
          </h1>
          <p className="text-xs text-slate-400">#{animal.id} • {animal.breed}</p>
        </div>
        {/* Botão câmera no header — visível em desktop */}
        <Link
          href={`/camera?animalId=${animal.id}`}
          className="hidden sm:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95 shrink-0"
        >
          <Camera className="w-4 h-4" />
          Capturar Foto
        </Link>
      </header>

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full flex flex-col gap-6 pb-28 sm:pb-6">
        {/* Card de informações */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900 mb-4">
            {animal.name || 'Sem nome'} <span className="text-slate-300 font-normal text-base">#{animal.id}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <InfoCard icon={<Tag className="w-4 h-4" />} label="Raça" value={animal.breed} />
            <InfoCard icon={<VenetianMask className="w-4 h-4" />} label="Sexo" value={animal.sex} />
            <InfoCard icon={<Scale className="w-4 h-4" />} label="Peso" value={`${animal.weight} kg`} />
            <InfoCard icon={<Calendar className="w-4 h-4" />} label="Idade" value={`${animal.age} meses`} />
          </div>
        </div>

        {/* Seção de galeria */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-slate-800">
              Galeria
              <span className="ml-2 text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                {animal.photos?.length ?? 0} fotos
              </span>
            </h3>
          </div>

          <PhotoGrid
            photos={animal.photos ?? []}
            onDelete={handleDelete}
            onSelect={(_, index) => setLightboxIndex(index)}
          />
        </div>
      </main>

      {/* CTA sticky bottom — apenas mobile */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 z-20 shadow-lg"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <Link
          href={`/camera?animalId=${animal.id}`}
          className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-3.5 rounded-2xl text-base font-semibold transition active:scale-[0.98]"
        >
          <Camera className="w-5 h-5" />
          Capturar Nova Foto
        </Link>
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && animal.photos?.length > 0 && (
        <PhotoLightbox
          photos={animal.photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
