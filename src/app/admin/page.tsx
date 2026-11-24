'use client';

/**
 * Painel Administrativo, Curadoria do Dataset e Gestão de Usuários (`src/app/admin/page.tsx`).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  Users,
  Loader2,
  Search,
  Activity,
  Camera,
  Eye,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  UserPlus,
  Trash2,
  Database,
  X,
} from 'lucide-react';
import { AnimalWithOwner, getPhotoUrl } from '@/lib/types';
import { AsyncPhoto } from '@/components/AsyncPhoto';
import {
  apiFetch,
  apiFetchCached,
  getApiCacheSnapshot,
  invalidateApiCache,
  getApiUrl,
  getStoredToken,
  readPersistedApiCache,
  recalibratePhotosSequentially,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/Toast';
import PhotoLightbox from '@/components/PhotoLightbox';
import { AppShell } from '@/components/AppShell';

interface AdminUserRow {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN' | string;
  createdAt: string;
  animalsCount: number;
  photosCount: number;
  isSelf?: boolean;
}

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
  const cachedAnimals = getApiCacheSnapshot<AnimalWithOwner[]>('/api/admin/animals');
  const cachedUsers = getApiCacheSnapshot<AdminUserRow[]>('/api/admin/users');

  const [activeTab, setActiveTab] = useState<'dataset' | 'users'>('dataset');
  const [animals, setAnimals] = useState<AnimalWithOwner[]>(() =>
    Array.isArray(cachedAnimals) ? cachedAnimals : []
  );
  const [users, setUsers] = useState<AdminUserRow[]>(() =>
    Array.isArray(cachedUsers) ? cachedUsers : []
  );
  const [loading, setLoading] = useState<boolean>(
    () => !Array.isArray(cachedAnimals) || !Array.isArray(cachedUsers)
  );
  const [downloading, setDownloading] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);
  const [recalibratingProgress, setRecalibratingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const [query, setQuery] = useState('');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [previewAnimal, setPreviewAnimal] = useState<AnimalWithOwner | null>(null);

  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'USER' | 'ADMIN'>('ADMIN');
  const [savingUser, setSavingUser] = useState(false);

  const { toast, confirm } = useToast();
  const router = useRouter();
  const { user, isAdmin, loading: authLoading } = useAuth();

  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (forceRefresh) {
        invalidateApiCache('/api/admin');
      }
      try {
        const ttl = forceRefresh ? 0 : 15_000;
        const [animalsData, usersData] = await Promise.all([
          apiFetchCached<AnimalWithOwner[]>('/api/admin/animals', ttl),
          apiFetchCached<AdminUserRow[]>('/api/admin/users', ttl),
        ]);
        if (Array.isArray(animalsData)) setAnimals(animalsData);
        if (Array.isArray(usersData)) setUsers(usersData);
      } catch (err: any) {
        if (err?.message?.includes('403') || err?.message?.includes('Acesso negado')) {
          router.push('/dashboard');
        } else if (err?.message?.includes('401') || err?.message?.includes('Token')) {
          router.push('/login');
        }
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push('/login');
      } else if (!isAdmin) {
        router.push('/dashboard');
      } else {
        if (!Array.isArray(cachedAnimals)) {
          const persistedAnimals = readPersistedApiCache<AnimalWithOwner[]>('/api/admin/animals');
          if (Array.isArray(persistedAnimals)) {
            setAnimals(persistedAnimals);
            setLoading(false);
          }
        }
        if (!Array.isArray(cachedUsers)) {
          const persistedUsers = readPersistedApiCache<AdminUserRow[]>('/api/admin/users');
          if (Array.isArray(persistedUsers)) {
            setUsers(persistedUsers);
          }
        }
        loadData();
      }
    }
  }, [authLoading, user, isAdmin, router, loadData]);

  const stats = useMemo(() => {
    const totalAnimals = animals.length;
    const allPhotos = animals.flatMap((a) => a.photos ?? []);
    const totalPhotos = allPhotos.length;
    const totalUsers = users.length;
    const totalAdmins = users.filter((u) => u.role === 'ADMIN').length;
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

    return { totalAnimals, totalPhotos, totalUsers, totalAdmins, avgScore };
  }, [animals, users]);

  const filteredAnimals = useMemo(() => {
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

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, userQuery]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const baseUrl = getApiUrl();
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}/api/admin/export`, { headers });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao exportar');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cattle-capture-dataset-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Download do dataset ZIP iniciado com sucesso!', 'success');
    } catch (err: any) {
      toast(err?.message || 'Erro ao gerar o dataset.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handleRecalibrateScores = async () => {
    if (recalibrating) return;
    const photoIds = animals.flatMap((a) => (a.photos ?? []).map((p) => p.id));
    if (photoIds.length === 0) {
      toast('Nenhuma foto encontrada para recalibração.', 'info');
      return;
    }

    const ok = await confirm({
      title: 'Reavaliar enquadramento',
      message: `Deseja recalcular a qualidade do enquadramento de ${photoIds.length} foto(s)?`,
      confirmText: 'Reavaliar',
      variant: 'primary',
    });
    if (!ok) return;

    setRecalibrating(true);
    setRecalibratingProgress({ current: 0, total: photoIds.length });
    try {
      const summary = await recalibratePhotosSequentially(photoIds, ({ current, total }) => {
        setRecalibratingProgress({ current, total });
      });
      toast(
        `${summary.updatedCount} de ${summary.totalCount} fotos recalculadas sequencialmente!`,
        summary.failedCount > 0 ? 'info' : 'success'
      );
      invalidateApiCache('/api/animals');
      invalidateApiCache('/api/admin/animals');
      await loadData(true);
    } catch (err: any) {
      toast(err?.message || 'Erro ao recalcular confiança da IA', 'error');
    } finally {
      setRecalibrating(false);
      setRecalibratingProgress(null);
    }
  };

  const handleToggleRole = async (target: AdminUserRow) => {
    const nextRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
    setUpdatingUserId(target.id);
    try {
      await apiFetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        body: { role: nextRole },
      });

      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, role: nextRole } : u))
      );
      toast(
        nextRole === 'ADMIN'
          ? `${target.name} agora é Administrador!`
          : `${target.name} alterado para Operador comum.`,
        'success'
      );
    } catch (err: any) {
      toast(err?.message || 'Falha ao atualizar cargo', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (target: AdminUserRow) => {
    const ok = await confirm({
      title: 'Excluir Usuário',
      message: `Tem certeza que deseja excluir o usuário "${target.name}" (${target.email})? Esta ação não pode ser desfeita.`,
      confirmText: 'Excluir Usuário',
      variant: 'danger',
    });
    if (!ok) return;

    setUpdatingUserId(target.id);
    try {
      await apiFetch(`/api/admin/users/${target.id}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      toast('Usuário removido com sucesso.', 'success');
    } catch (err: any) {
      toast(err?.message || 'Falha ao remover usuário', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleCreateOrPromoteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const data = await apiFetch<any>('/api/admin/users', {
        method: 'POST',
        body: {
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        },
      });

      setUsers((prev) => {
        const exists = prev.some((u) => u.id === data.id);
        if (exists) {
          return prev.map((u) =>
            u.id === data.id
              ? { ...u, name: data.name, role: data.role }
              : u
          );
        }
        return [data, ...prev];
      });

      toast(
        data?.updatedExisting
          ? `Usuário existente atualizado para ${data.role}!`
          : `Novo ${data.role === 'ADMIN' ? 'Administrador' : 'Operador'} cadastrado!`,
        'success'
      );
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('ADMIN');
    } catch (err: any) {
      toast(err?.message || 'Erro ao criar/promover usuário', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <AppShell
      showBack
      backHref="/dashboard"
      title="Central de Gestão"
      subtitle="Rebanho completo, capturas e usuários"
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* Hero Board da Gestão */}
        <section className="card p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-theme-primary tracking-tight">
                Painel consolidado do rebanho
              </h1>
              <p className="text-xs sm:text-sm text-theme-secondary mt-0.5">
                Acompanhe indicadores gerais, avalie o lote e exporte imagens e registros em ZIP.
              </p>
            </div>

            <button
              onClick={handleDownload}
              disabled={downloading || stats.totalPhotos === 0}
              className="btn-primary text-xs sm:text-sm shrink-0"
              title="Baixar arquivo ZIP com fotos e metadados do banco"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{downloading ? 'Gerando pacote…' : 'Baixar Dataset (ZIP)'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] rounded-[12px] border border-theme bg-theme-surface-2 overflow-hidden">
            <div className="p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">Rebanho</p>
              <p className="text-xl sm:text-2xl font-bold text-theme-primary mt-1 tabular-nums">
                {stats.totalAnimals}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">
                Animais catalogados
              </p>
            </div>

            <div className="p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                Capturas
              </p>
              <p className="text-xl sm:text-2xl font-bold text-brand mt-1 tabular-nums">
                {stats.totalPhotos}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">
                Fotos registradas
              </p>
            </div>

            <div className="p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">Operadores</p>
              <p className="text-xl sm:text-2xl font-bold text-theme-primary mt-1 tabular-nums">
                {stats.totalUsers}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">
                {stats.totalAdmins} {stats.totalAdmins === 1 ? 'administrador' : 'administradores'}
              </p>
            </div>

            <div className="p-3.5 sm:p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-theme-muted">Enquadramento</p>
              <p className="text-xl sm:text-2xl font-bold text-theme-primary mt-1 tabular-nums">
                {stats.avgScore !== null ? `${stats.avgScore}%` : 'Sem dados'}
              </p>
              <p className="text-[11px] text-theme-secondary mt-0.5">
                Qualidade média das fotos
              </p>
            </div>
          </div>
        </section>

        <div className="flex border-b border-theme gap-2">
          <button
            onClick={() => setActiveTab('dataset')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'dataset'
                ? 'border-[var(--color-brand)] text-brand'
                : 'border-transparent text-theme-secondary hover:text-theme-primary'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Rebanho e Capturas ({stats.totalAnimals})</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-3 px-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'users'
                ? 'border-[var(--color-brand)] text-brand'
                : 'border-transparent text-theme-secondary hover:text-theme-primary'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuários e Permissões ({stats.totalUsers})</span>
          </button>
        </div>

        {activeTab === 'dataset' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filtrar por brinco, nome, raça ou operador…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="field-input pl-10 text-xs sm:text-sm"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-theme-secondary select-none cursor-pointer bg-theme-surface border border-theme px-3 py-2 rounded-[10px]">
                  <input
                    type="checkbox"
                    checked={onlyWithPhotos}
                    onChange={(e) => setOnlyWithPhotos(e.target.checked)}
                    className="accent-[var(--color-brand)] w-3.5 h-3.5"
                  />
                  <span>Apenas com fotos</span>
                </label>

                {stats.totalPhotos > 0 && (
                  <button
                    onClick={handleRecalibrateScores}
                    disabled={recalibrating}
                    className="btn-secondary !py-2 !px-3 !min-h-[38px] text-xs"
                    title="Reavaliar o enquadramento das fotos"
                  >
                    {recalibrating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-brand" />
                    )}
                    <span className="tabular-nums">
                      {recalibrating
                        ? recalibratingProgress
                          ? `${recalibratingProgress.current}/${recalibratingProgress.total}…`
                          : 'Reavaliando…'
                        : 'Reavaliar fotos'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filteredAnimals.length === 0 ? (
              <div className="card py-12 px-4 text-center text-xs text-theme-muted">
                Nenhum animal encontrado para o filtro aplicado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredAnimals.map((animal) => {
                  const photos = animal.photos ?? [];
                  const photoCount = photos.length;
                  const firstPhoto = photos[0];
                  const photoUrl = firstPhoto ? getPhotoUrl(firstPhoto.id, 240) : null;

                  return (
                    <div
                      key={animal.id}
                      className="card p-3.5 flex gap-3.5 hover:border-[var(--color-brand)]/45 transition-all items-center"
                    >
                      <div className="w-20 h-20 rounded-[10px] overflow-hidden bg-theme-surface-2 border border-theme shrink-0 relative flex items-center justify-center">
                        {photoUrl ? (
                          <AsyncPhoto
                            src={photoUrl}
                            alt={animal.tag}
                            compact
                            fallbackIcon={<Camera className="w-6 h-6 text-theme-muted opacity-40" />}
                          />
                        ) : (
                          <Camera className="w-6 h-6 text-theme-muted opacity-40" />
                        )}
                        {photoCount > 1 && (
                          <span className="absolute bottom-1 right-1 bg-black/75 text-[9px] font-bold text-white px-1 py-0.5 rounded">
                            +{photoCount - 1}
                          </span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono-tag text-[11px] font-semibold px-2 py-0.5 rounded-[7px] bg-theme-surface-2 border border-theme text-theme-primary">
                            {animal.tag}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-theme-primary truncate">
                            {animal.name || animal.breed}
                          </span>
                          {firstPhoto && typeof firstPhoto.score === 'number' && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-[7px] bg-brand-soft text-brand tabular-nums">
                              Enquadr. {Math.round(firstPhoto.score)}%
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-theme-secondary truncate">
                          {animal.breed}, {animal.sex}, {animal.weight} kg, {animal.age} meses
                        </p>

                        <p className="text-[10px] text-theme-muted truncate mt-0.5">
                          Operador: <strong className="text-theme-secondary">{animal.owner?.name}</strong> ({animal.owner?.email})
                        </p>

                        <div className="flex items-center gap-3 mt-2">
                          <Link
                            href={`/animal/${animal.id}`}
                            className="text-[11px] font-bold text-brand hover:underline inline-flex items-center gap-1"
                          >
                            Ver ficha <ExternalLink className="w-3 h-3" />
                          </Link>
                          {photoCount > 0 && (
                            <button
                              onClick={() => setPreviewAnimal(animal)}
                              className="text-[11px] font-bold text-theme-secondary hover:text-theme-primary inline-flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> Ver fotos ({photoCount})
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar usuário por nome, e-mail ou cargo…"
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  className="field-input pl-10 text-xs sm:text-sm"
                />
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="btn-primary py-2 px-3 text-xs flex items-center justify-center gap-1.5 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Adicionar / Promover Usuário</span>
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="card py-12 px-4 text-center text-xs text-theme-muted">
                Nenhum usuário encontrado.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredUsers.map((target) => {
                  const isCurrentAdmin = target.role === 'ADMIN';
                  const isUpdating = updatingUserId === target.id;

                  return (
                    <div
                      key={target.id}
                      className="card p-4 flex flex-col justify-between hover:border-[var(--color-brand)]/45 transition gap-3"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-theme-primary truncate flex items-center gap-1.5">
                              {target.name}
                              {target.isSelf && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-soft text-brand">
                                  Você
                                </span>
                              )}
                            </h3>
                            <p className="text-xs text-theme-secondary truncate">{target.email}</p>
                          </div>

                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                              isCurrentAdmin
                                ? 'bg-[#B45309]/12 text-[#B45309] dark:text-[#FBBF24] border border-[#B45309]/25'
                                : 'bg-theme-surface-2 text-theme-secondary border border-theme'
                            }`}
                          >
                            {isCurrentAdmin ? (
                              <ShieldCheck className="w-3 h-3" />
                            ) : (
                              <Users className="w-3 h-3" />
                            )}
                            {target.role}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-theme-muted mt-2">
                          <span>{target.animalsCount} animais, {target.photosCount} fotos enviadas</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme">
                        {!target.isSelf && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleRole(target)}
                              disabled={isUpdating}
                              className={`py-1.5 px-3 text-xs font-semibold rounded-[8px] border transition flex items-center gap-1.5 ${
                                isCurrentAdmin
                                  ? 'bg-theme-surface hover:bg-theme-surface-2 border-theme text-theme-secondary'
                                  : 'bg-[#B45309]/12 text-[#B45309] dark:text-[#FBBF24] border-[#B45309]/30 hover:bg-[#B45309]/20'
                              }`}
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : isCurrentAdmin ? (
                                <ShieldAlert className="w-3 h-3" />
                              ) : (
                                <ShieldCheck className="w-3 h-3" />
                              )}
                              <span>{isCurrentAdmin ? 'Rebaixar para Usuário' : 'Tornar Admin'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteUser(target)}
                              disabled={isUpdating}
                              className="p-1.5 text-theme-muted hover:text-red-500 hover:bg-red-500/10 rounded-[8px] transition"
                              title="Excluir Usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Adicionar / Promover Usuário */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-fade-in">
          <div className="card w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-theme flex items-center justify-between">
              <h3 className="font-extrabold text-base text-theme-primary">
                Adicionar ou Promover Usuário
              </h3>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="p-1 rounded-md text-theme-muted hover:text-theme-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateOrPromoteUser} className="p-5 flex flex-col gap-4">
              <p className="text-xs text-theme-secondary">
                Se o e-mail já existir, o cargo será atualizado. Caso contrário, um novo usuário será criado.
              </p>

              <div>
                <label className="field-label">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="field-input"
                  placeholder="Nome do usuário"
                />
              </div>

              <div>
                <label className="field-label">E-mail</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="field-input"
                  placeholder="usuario@fazenda.com"
                />
              </div>

              <div>
                <label className="field-label">Senha (opcional se já cadastrado)</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="field-input"
                  placeholder="Senha para novo cadastro"
                />
              </div>

              <div>
                <label className="field-label">Perfil de Acesso</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as 'USER' | 'ADMIN')}
                  className="field-input"
                >
                  <option value="ADMIN">Administrador (Acesso total + Gestão de Usuários)</option>
                  <option value="USER">Operador de Campo (Apenas seus animais e fotos)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="btn-secondary py-2 px-4 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="btn-primary py-2 px-5 text-xs flex items-center gap-1.5"
                >
                  {savingUser ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Salvar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox para inspeção rápida de fotos do animal na tabela */}
      {previewAnimal && previewAnimal.photos && previewAnimal.photos.length > 0 && (
        <PhotoLightbox
          photos={previewAnimal.photos}
          initialIndex={0}
          onClose={() => setPreviewAnimal(null)}
          onPhotoRecalibrated={(photoId, newScore) => {
            setPreviewAnimal((prev) =>
              prev
                ? {
                    ...prev,
                    photos: prev.photos.map((p) =>
                      p.id === photoId ? { ...p, score: newScore } : p
                    ),
                  }
                : prev
            );
            setAnimals((prev) =>
              prev.map((a) =>
                a.id === previewAnimal.id
                  ? {
                      ...a,
                      photos: a.photos.map((p) =>
                        p.id === photoId ? { ...p, score: newScore } : p
                      ),
                    }
                  : a
              )
            );
            invalidateApiCache('/api/animals');
            invalidateApiCache('/api/admin/animals');
            toast(`Enquadramento atualizado para ${Math.round(newScore)}%.`, 'success');
          }}
        />
      )}
    </AppShell>
  );
}
