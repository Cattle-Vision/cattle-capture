"use client";

/**
 * Página de Identificação Rápida por Brinco (`src/app/identify/page.tsx`).
 *
 * Funcionalidades:
 * - Busca rápida pelo identificador/brinco do animal.
 * - Se encontrado, abre a ficha ou permite fotografar imediatamente.
 * - Se não encontrado, redireciona para `/animal/new?tag=...` com o brinco já preenchido.
 * - Lista os animais recentes abaixo para seleção em 1 toque no curral.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ArrowLeft, Loader2, Camera, Plus, ChevronRight } from "lucide-react";
import { normalizeTag } from "@/lib/animal";
import { Animal } from "@/lib/types";

export default function IdentifyPage() {
  const [tag, setTag] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recentAnimals, setRecentAnimals] = useState<Animal[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/animals")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (Array.isArray(d)) setRecentAnimals(d.slice(0, 6));
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTag(tag);
    if (!normalized) {
      setError("Digite o código do brinco do animal.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/animals?tag=${encodeURIComponent(normalized)}`);
      if (res.ok) {
        const animal = await res.json();
        router.push(`/animal/${animal.id}`);
        return;
      }
      if (res.status === 404) {
        router.push(`/animal/new?tag=${encodeURIComponent(normalized)}`);
        return;
      }
      setError("Não foi possível consultar o animal.");
    } catch {
      setError("Erro de conexão. Verifique sua internet.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-4 h-15 flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            aria-label="Voltar"
            className="p-2 rounded-xl text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-base font-extrabold text-slate-900">Identificar por Brinco</h1>
            <p className="text-xs text-slate-500">Busca rápida ou cadastro automático</p>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl mx-auto flex flex-col gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-extrabold text-slate-900 mb-1">
              Digite o código do brinco
            </h2>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Se o animal já estiver registrado, abriremos a ficha dele. Caso ainda não exista,
              você será levado ao formulário com o brinco preenchido.
            </p>

            {error && <div className="error-banner mb-4">{error}</div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="field-label" htmlFor="tag-input">
                  Código do Brinco
                </label>
                <input
                  id="tag-input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  className="field-input font-mono-tag font-bold text-lg tracking-wider uppercase"
                  placeholder="Ex: NEL-0142"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {loading ? "Localizando…" : "Localizar ou Cadastrar"}
              </button>
            </form>
          </div>

          {/* Animais Recentes para 1-Click */}
          {recentAnimals.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Acessados Recentemente
                </h3>
                <Link
                  href="/animal/new"
                  className="text-xs font-bold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo cadastro
                </Link>
              </div>
              <div className="flex flex-col gap-2.5">
                {recentAnimals.map((a) => {
                  const label = a.name || a.tag;
                  return (
                    <div
                      key={a.id}
                      className="card p-3.5 flex items-center justify-between gap-3 hover:border-emerald-300 transition"
                    >
                      <Link href={`/animal/${a.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                        <span className="font-mono-tag text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-white shrink-0">
                          {a.tag}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {a.name || a.breed}
                          </p>
                          <p className="text-xs text-slate-500">
                            {a.breed} · {a.sex} · {a.photos?.length ?? 0} fotos
                          </p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Link
                          href={`/camera?animalId=${a.id}&animalName=${encodeURIComponent(label)}`}
                          className="btn-primary py-2 px-3 text-xs"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Foto
                        </Link>
                        <Link
                          href={`/animal/${a.id}`}
                          className="p-2 text-slate-400 hover:text-slate-700"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
