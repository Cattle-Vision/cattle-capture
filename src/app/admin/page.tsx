'use client';

/**
 * Painel Administrativo, Curadoria do Dataset e Gestão de Usuários (`src/app/admin/page.tsx`).
 *
 * Funcionalidades:
 * - Aba 1 ("Rebanho & Dataset"):
 *   - Curadoria global de animais e fotos com miniaturas via `/api/photos/[id]`.
 *   - Inspeção rápida via `PhotoLightbox` e exportação `.ZIP` completa.
 * - Aba 2 ("Usuários & Admins"):
 *   - Lista todos os usuários cadastrados com contagem de animais e fotos.
 *   - Permite promover qualquer usuário comum (`USER`) a administrador (`ADMIN`)
 *     ou rebaixar para `USER` com 1 clique (`PATCH /api/admin/users/[id]`).
 *   - Permite cadastrar novos usuários/admins ou promover por e-mail (`POST /api/admin/users`).
 *   - Permite remover contas de usuários (`DELETE /api/admin/users/[id]`).
 * - Suporte integral a Tema Claro/Escuro e barra inferior Mobile PWA (`MobileNav`).
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
import { useToast } from '@/components/ui/Toast';
import PhotoLightbox from '@/components/PhotoLightbox';
import ThemeToggle from '@/components/ThemeToggle';
import MobileNav from '@/components/MobileNav';

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
  const [activeTab, setActiveTab] = useState<'dataset' | 'users'>('dataset');
  const [animals, setAnimals] = useState<AnimalWithOwner[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [recalibrating, setRecalibrating] = useState(false);

  // Filtros de dataset e usuários
  const [query, setQuery] = useState('');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [previewAnimal, setPreviewAnimal] = useState<AnimalWithOwner | null>(null);

  // Estado de ação nos usuários
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'USER' | 'ADMIN'>('ADMIN');
  const [savingUser, setSavingUser] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    Promise.all([fetch('/api/admin/animals'), fetch('/api/admin/users')])
      .then(async ([animalsRes, usersRes]) => {
        if (animalsRes.status === 401 || usersRes.status === 401) {
          router.push('/login');
          return;
        }
        if (animalsRes.status === 403 || usersRes.status === 403) {
          router.push('/dashboard');
          return;
        }
        const [animalsData, usersData] = await Promise.all([
          animalsRes.json(),
          usersRes.json(),
        ]);
        if (Array.isArray(animalsData)) setAnimals(animalsData as AnimalWithOwner[]);
        if (Array.isArray(usersData)) setUsers(usersData as AdminUserRow[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [router]);

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

  /**
   * Executa a recalibração de todos os scores de fotos no banco de dados
   * via POST /api/admin/recalibrate com modelo biométrico ajustado.
   */
  const handleRecalibrateScores = async () => {
    if (recalibrating) return;
    const confirmMsg =
      'Deseja recalcular a confiança de todas as fotos do banco de dados com a IA calibrada? Isso atualizará os valores de confiança no banco.';
    if (!window.confirm(confirmMsg)) return;

    setRecalibrating(true);
    try {
      const res = await fetch('/api/admin/recalibrate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao recalcular confiança');
      }

      toast(
        data.message ||
          `${data.updatedCount ?? 0} fotos recalculadas com sucesso!`,
        'success'
      );

      // Recarrega os dados atualizados
      const freshRes = await fetch('/api/admin/animals');
      if (freshRes.ok) {
        const freshAnimals = await freshRes.json();
        if (Array.isArray(freshAnimals)) setAnimals(freshAnimals);
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Erro ao recalcular confiança da IA',
        'error'
      );
    } finally {
      setRecalibrating(false);
    }
  };

  /**
   * Alterna o papel de um usuário entre "USER" e "ADMIN" com 1 clique.
   */
  const handleToggleRole = async (target: AdminUserRow) => {
    const nextRole = target.role === 'ADMIN' ? 'USER' : 'ADMIN';
    setUpdatingUserId(target.id);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao alterar permissão');
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, role: nextRole } : u))
      );
      toast(
        nextRole === 'ADMIN'
          ? `${target.name} agora é Administrador!`
          : `${target.name} alterado para Operador comum.`,
        'success'
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Falha ao atualizar cargo',
        'error'
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  /**
   * Exclui um usuário após confirmação.
   */
  const handleDeleteUser = async (target: AdminUserRow) => {
    if (
      !window.confirm(
        `Tem certeza que deseja excluir o usuário "${target.name}" (${target.email})?`
      )
    ) {
      return;
    }

    setUpdatingUserId(target.id);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir usuário');
      }
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      toast('Usuário removido com sucesso.', 'success');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Falha ao remover usuário',
        'error'
      );
    } finally {
      setUpdatingUserId(null);
    }
  };

  /**
   * Cria um novo usuário/admin ou promove um e-mail já cadastrado.
   */
  const handleCreateOrPromoteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar usuário');
      }

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
        data.updatedExisting
          ? `Usuário existente atualizado para ${data.role}!`
          : `Novo ${data.role === 'ADMIN' ? 'Administrador' : 'Operador'} cadastrado!`,
        'success'
      );
      setShowAddUserModal(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('ADMIN');
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Erro ao criar/promover usuário',
        'error'
      );
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-theme-bg text-theme-primary flex flex-col pb-20 sm:pb-8">
      {/* Header Compacto */}
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <Link
              href="/dashboard"
              className="p-1.5 sm:p-2 rounded-md text-theme-secondary hover:bg-theme-surface-2 transition shrink-0"
              aria-label="Voltar ao Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-xs sm:text-sm font-bold text-theme-primary truncate max-w-[125px] xs:max-w-[200px] sm:max-w-none">
                  Central Administrativa
                </h1>
                <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">
                  <ShieldCheck className="w-3 h-3" />
                  ADMIN
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-theme-muted truncate hidden sm:block">
                Curadoria global do dataset ICC e gestão de permissões
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <ThemeToggle className="p-1.5 sm:p-2" />
            <button
              onClick={handleDownload}
              disabled={downloading || stats.totalPhotos === 0}
              className="btn-primary py-1.5 px-2.5 sm:px-3 text-xs shrink-0 flex items-center gap-1.5"
              title="Exportar dataset completo em ZIP"
              aria-label="Exportar dataset ZIP"
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {downloading ? 'Empacotando…' : 'Exportar ZIP'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-3 sm:px-6 py-5">
        {loading ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 skeleton rounded-lg" />
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
                <p className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                  Total Animais
                </p>
                <p className="text-2xl font-extrabold text-theme-primary mt-1">
                  {stats.totalAnimals}
                </p>
                <p className="text-[11px] text-theme-secondary mt-0.5">
                  Registros globais
                </p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Total Capturas
                </p>
                <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                  {stats.totalPhotos}
                </p>
                <p className="text-[11px] text-theme-secondary mt-0.5">
                  Prontas para exportação
                </p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-theme-muted">
                  Confiança Média IA
                </p>
                <p className="text-2xl font-extrabold text-theme-primary mt-1">
                  {stats.avgScore !== null ? `${stats.avgScore}%` : '—'}
                </p>
                <p className="text-[11px] text-theme-secondary mt-0.5">
                  Confiança Biométrica
                </p>
              </div>

              <div className="card p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Usuários / Admins
                </p>
                <p className="text-2xl font-extrabold text-theme-primary mt-1">
                  {stats.totalUsers}{' '}
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    ({stats.totalAdmins} admin{stats.totalAdmins === 1 ? '' : 's'})
                  </span>
                </p>
                <p className="text-[11px] text-theme-secondary mt-0.5">
                  Contas cadastradas
                </p>
              </div>
            </div>

            {/* Seletor de Abas */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div className="grid grid-cols-2 p-1 rounded-2xl bg-theme-surface-2 border border-theme w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('dataset')}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'dataset'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  <Database className="w-4 h-4 shrink-0" />
                  <span className="truncate">Rebanho ({animals.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
                    activeTab === 'users'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-theme-secondary hover:text-theme-primary'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">Usuários ({users.length})</span>
                </button>
              </div>

              {activeTab === 'dataset' && (
                <button
                  type="button"
                  onClick={handleRecalibrateScores}
                  disabled={recalibrating || stats.totalPhotos === 0}
                  className="btn-secondary py-2 px-3.5 text-xs sm:text-sm flex items-center justify-center gap-1.5 border-emerald-500/30 hover:border-emerald-500/50 w-full sm:w-auto"
                  title="Recalcular confiança da IA de todas as fotos no banco de dados"
                >
                  {recalibrating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  <span>
                    {recalibrating ? 'Recalibrando IA…' : 'Recalcular Confiança IA'}
                  </span>
                </button>
              )}

              {activeTab === 'users' && (
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="btn-primary py-2.5 px-4 text-xs sm:text-sm justify-center w-full sm:w-auto"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Adicionar / Promover Admin</span>
                </button>
              )}
            </div>

            {/* ABA 1: REBANHO & DATASET */}
            {activeTab === 'dataset' && (
              <>
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
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
                        : 'bg-theme-surface text-theme-secondary border-theme hover:bg-theme-surface-2'
                    }`}
                  >
                    Apenas com fotos (
                    {animals.filter((a) => (a.photos?.length ?? 0) > 0).length})
                  </button>
                </div>

                {filteredAnimals.length === 0 ? (
                  <div className="card py-16 px-4 flex flex-col items-center justify-center gap-3 text-center">
                    <Database className="w-10 h-10 text-theme-muted opacity-50" />
                    <p className="font-bold text-theme-primary">
                      Nenhum animal encontrado
                    </p>
                    <p className="text-xs text-theme-secondary">
                      Ajuste os filtros ou cadastre novos animais no painel.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="sm:hidden flex flex-col gap-3">
                      {filteredAnimals.map((animal) => {
                        const lastPhoto = animal.photos?.[0];
                        const photoUrl = lastPhoto
                          ? getPhotoUrl(lastPhoto.id)
                          : null;
                        const photoCount = animal.photos?.length ?? 0;

                        return (
                          <div
                            key={animal.id}
                            className="card p-4 flex gap-3.5 items-center"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                photoCount > 0 && setPreviewAnimal(animal)
                              }
                              className="w-16 h-16 rounded-xl bg-theme-surface-2 overflow-hidden shrink-0 flex items-center justify-center border border-theme relative"
                            >
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={animal.tag}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-theme-muted" />
                              )}
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <Link
                                  href={`/animal/${animal.id}`}
                                  className="font-mono-tag text-xs font-bold px-2 py-0.5 rounded bg-slate-900 dark:bg-emerald-950 text-white dark:text-emerald-300 border border-transparent dark:border-emerald-700/50"
                                >
                                  {animal.tag}
                                </Link>
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                  {photoCount}{' '}
                                  {photoCount === 1 ? 'foto' : 'fotos'}
                                </span>
                              </div>
                              <p className="text-sm font-bold text-theme-primary mt-1 truncate">
                                {animal.name || animal.breed} · {animal.sex} (
                                {animal.weight}kg)
                              </p>
                              <p className="text-xs text-theme-secondary truncate">
                                Operador:{' '}
                                {animal.owner?.name || animal.owner?.email}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block card overflow-hidden">
                      <table className="w-full text-left text-sm text-theme-secondary">
                        <thead className="bg-theme-surface-2 border-b border-theme text-xs uppercase tracking-wider text-theme-muted font-bold">
                          <tr>
                            <th className="px-5 py-3.5">Prévia / Brinco</th>
                            <th className="px-5 py-3.5">Zootecnia</th>
                            <th className="px-5 py-3.5">Operador</th>
                            <th className="px-5 py-3.5">Confiança IA</th>
                            <th className="px-5 py-3.5">Capturas</th>
                            <th className="px-5 py-3.5 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y border-theme">
                          {filteredAnimals.map((a) => {
                            const lastPhoto = a.photos?.[0];
                            const photoUrl = lastPhoto
                              ? getPhotoUrl(lastPhoto.id)
                              : null;
                            const photoCount = a.photos?.length ?? 0;
                            const score =
                              lastPhoto && typeof lastPhoto.score === 'number'
                                ? Math.round(lastPhoto.score)
                                : null;

                            return (
                              <tr
                                key={a.id}
                                className="hover:bg-theme-surface-2/60 transition-colors"
                              >
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      disabled={photoCount === 0}
                                      onClick={() =>
                                        photoCount > 0 && setPreviewAnimal(a)
                                      }
                                      className="w-12 h-12 rounded-xl bg-theme-surface-2 border border-theme overflow-hidden shrink-0 flex items-center justify-center group relative"
                                      title={
                                        photoCount > 0
                                          ? 'Inspecionar fotos'
                                          : 'Sem fotos'
                                      }
                                    >
                                      {photoUrl ? (
                                        <img
                                          src={photoUrl}
                                          alt={a.tag}
                                          loading="lazy"
                                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                        />
                                      ) : (
                                        <ImageIcon className="w-5 h-5 text-theme-muted" />
                                      )}
                                    </button>
                                    <div>
                                      <Link
                                        href={`/animal/${a.id}`}
                                        className="font-mono-tag text-xs font-bold px-2 py-0.5 rounded bg-slate-900 dark:bg-emerald-950 text-white dark:text-emerald-300 hover:bg-emerald-700 transition"
                                      >
                                        {a.tag}
                                      </Link>
                                      {a.name && (
                                        <p className="text-xs font-semibold text-theme-primary mt-1">
                                          {a.name}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td className="px-5 py-3.5">
                                  <p className="font-bold text-theme-primary">
                                    {a.breed} · {a.sex}
                                  </p>
                                  <p className="text-xs text-theme-secondary">
                                    {a.weight} kg · {a.age} meses
                                  </p>
                                </td>

                                <td className="px-5 py-3.5">
                                  <p className="font-semibold text-theme-primary">
                                    {a.owner?.name || '—'}
                                  </p>
                                  <p className="text-xs text-theme-muted">
                                    {a.owner?.email}
                                  </p>
                                </td>

                                <td className="px-5 py-3.5">
                                  {score !== null ? (
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-md ${
                                        score >= 45
                                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      <Activity className="w-3 h-3" />
                                      {score}%
                                    </span>
                                  ) : (
                                    <span className="text-xs text-theme-muted">
                                      —
                                    </span>
                                  )}
                                </td>

                                <td className="px-5 py-3.5">
                                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full text-xs">
                                    {photoCount}{' '}
                                    {photoCount === 1 ? 'foto' : 'fotos'}
                                  </span>
                                </td>

                                <td className="px-5 py-3.5 text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    {photoCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewAnimal(a)}
                                        className="p-2 rounded-lg text-theme-secondary hover:text-emerald-600 hover:bg-emerald-500/10"
                                        title="Inspecionar galeria"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                    )}
                                    <Link
                                      href={`/camera?animalId=${a.id}&animalName=${encodeURIComponent(
                                        a.name || a.tag
                                      )}`}
                                      className="p-2 rounded-lg text-theme-secondary hover:text-emerald-600 hover:bg-emerald-500/10"
                                      title="Capturar foto"
                                    >
                                      <Camera className="w-4 h-4" />
                                    </Link>
                                    <Link
                                      href={`/animal/${a.id}`}
                                      className="p-2 rounded-lg text-theme-secondary hover:text-theme-primary hover:bg-theme-surface-2"
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

            {/* ABA 2: USUÁRIOS & ADMINS */}
            {activeTab === 'users' && (
              <>
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
                    <input
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      placeholder="Buscar usuário por nome, e-mail ou nível de acesso…"
                      className="field-input pl-10"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {filteredUsers.map((u) => {
                    const isSelf = Boolean(u.isSelf);
                    const isAdmin = u.role === 'ADMIN';
                    const isBusy = updatingUserId === u.id;

                    return (
                      <div
                        key={u.id}
                        className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-2xl flex items-center justify-center font-extrabold text-sm shrink-0 ${
                              isAdmin
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-extrabold text-theme-primary truncate">
                                {u.name}
                              </p>
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isAdmin
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                                    : 'bg-theme-surface-2 text-theme-secondary border border-theme'
                                }`}
                              >
                                {isAdmin ? (
                                  <>
                                    <ShieldCheck className="w-3 h-3" />
                                    ADMIN
                                  </>
                                ) : (
                                  'OPERADOR COMUM'
                                )}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                  Você
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-theme-secondary truncate mt-0.5">
                              {u.email}
                            </p>
                            <p className="text-[11px] text-theme-muted mt-1">
                              {u.animalsCount} animais cadastrados ·{' '}
                              {u.photosCount} fotos enviadas
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          <button
                            type="button"
                            disabled={isBusy || isSelf}
                            onClick={() => handleToggleRole(u)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 disabled:opacity-45 ${
                              isAdmin
                                ? 'bg-theme-surface-2 text-theme-secondary border-theme hover:bg-amber-500/10 hover:text-amber-600'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/25'
                            }`}
                            title={
                              isSelf
                                ? 'Você não pode alterar seu próprio cargo'
                                : isAdmin
                                ? 'Rebaixar para usuário comum'
                                : 'Promover este usuário a Administrador'
                            }
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isAdmin ? (
                              <ShieldAlert className="w-3.5 h-3.5" />
                            ) : (
                              <ShieldCheck className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {isAdmin
                                ? 'Tornar Usuário Comum'
                                : 'Tornar Admin'}
                            </span>
                          </button>

                          {!isSelf && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteUser(u)}
                              className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Modal para criar novo usuário/admin ou promover e-mail */}
      {showAddUserModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowAddUserModal(false)}
        >
          <div
            className="card max-w-md w-full p-6 animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-theme-primary">
                  Adicionar ou Promover Usuário
                </h2>
                <p className="text-xs text-theme-secondary mt-0.5">
                  Cadastre uma nova conta ou informe um e-mail existente para
                  promovê-lo a Admin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrPromoteUser} className="space-y-4">
              <div>
                <label className="field-label">Nome completo</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex.: Dr. João Zootecnista"
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label">E-mail</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="usuario@fazenda.com"
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label">
                  Senha (mín. 6 caracteres para novos usuários)
                </label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Deixe em branco se já tiver conta"
                  className="field-input"
                />
              </div>

              <div>
                <label className="field-label">Nível de permissão</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewUserRole('ADMIN')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      newUserRole === 'ADMIN'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
                        : 'bg-theme-surface-2 text-theme-secondary border-theme'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Administrador
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewUserRole('USER')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                      newUserRole === 'USER'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                        : 'bg-theme-surface-2 text-theme-secondary border-theme'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Operador Comum
                  </button>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="btn-secondary flex-1 py-2.5 text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="btn-primary flex-1 py-2.5 text-xs"
                >
                  {savingUser ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>Salvar Permissão</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox para inspeção rápida das fotos do animal selecionado */}
      {previewAnimal && (previewAnimal.photos?.length ?? 0) > 0 && (
        <PhotoLightbox
          photos={previewAnimal.photos}
          initialIndex={0}
          onClose={() => setPreviewAnimal(null)}
        />
      )}

      <MobileNav isAdmin={true} />
    </div>
  );
}
