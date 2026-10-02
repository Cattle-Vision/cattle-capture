"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ArrowLeft, Loader2 } from "lucide-react";
import { normalizeTag } from "@/lib/animal";

export default function IdentifyPage() {
  const [tag, setTag] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeTag(tag);
    if (!normalized) {
      setError("Digite o nome ou brinco do animal.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/animals?tag=${encodeURIComponent(normalized)}`);
      if (res.ok) {
        const animal = await res.json();
        // Animal encontrado → vai pro perfil dele
        router.push(`/animal/${animal.id}`);
        return;
      }
      if (res.status === 404) {
        // Não existe → cadastro com tag pré-preenchida
        router.push(`/animal/new?tag=${encodeURIComponent(normalized)}`);
        return;
      }
      setError("Não foi possível consultar o animal.");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        className="border-b px-4 py-3 flex items-center gap-3"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          aria-label="Voltar"
          className="p-2 rounded-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
          Identificar animal
        </h1>
      </header>

      <main className="flex-1 p-4 flex items-start justify-center">
        <div className="w-full max-w-md mt-8">
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-text-primary)" }}>
              Buscar por brinco
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
              Se o animal já estiver cadastrado, você será redirecionado para o perfil.
              Caso contrário, o cadastro abrirá com o brinco pré-preenchido.
            </p>

            {error && <div className="error-banner mb-5">{error}</div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="field-label" htmlFor="tag-input">Brinco / nome</label>
                <input
                  id="tag-input"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  className="field-input"
                  placeholder="Ex: MIMOSA ou NEL-0142"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {loading ? "Buscando…" : "Buscar"}
              </button>
            </form>
          </div>

          <p className="mt-4 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            Prefere cadastrar direto?{" "}
            <Link href="/animal/new" className="font-semibold" style={{ color: "var(--color-brand)" }}>
              Novo animal
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
