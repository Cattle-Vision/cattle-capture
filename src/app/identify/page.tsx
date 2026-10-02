"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Plus, Loader2 } from "lucide-react";
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
      setError("Digite o número do brinco.");
      return;
    }
    setLoading(true);
    setError("");

    const res = await fetch(`/api/animals?tag=${encodeURIComponent(normalized)}`);
    if (res.ok) {
      const animal = await res.json();
      router.push(`/camera?animalId=${animal.id}&animalName=${encodeURIComponent(animal.name || animal.tag)}`);
      return;
    }
    if (res.status === 404) {
      const createRes = await fetch("/api/animals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: normalized,
          name: normalized,
          breed: "Nelore",
          sex: "Fêmea",
          weight: 400,
          age: 24,
        }),
      });
      if (createRes.ok) {
        const newAnimal = await createRes.json();
        router.push(`/camera?animalId=${newAnimal.id}&animalName=${encodeURIComponent(newAnimal.name || newAnimal.tag)}`);
        return;
      }
      setError("Falha ao criar registro do animal automaticamente.");
      setLoading(false);
      return;
    }
    setError("Não foi possível consultar o identificador.");
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-slate-900">Identificar animal</h1>
        <Link href="/dashboard" className="text-sm text-emerald-700 font-medium">
          Meus animais
        </Link>
      </header>

      <main className="flex-1 p-4 flex items-start justify-center">
        <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-8">
          <p className="text-sm text-slate-500 mb-5">
            Digite o nome do animal. Se já existir, a câmera abre na hora. Se não, será criado automaticamente.
          </p>
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-3 py-2 rounded-xl mb-4">{error}</div>
          )}
          <label className="text-sm font-semibold text-slate-700">Nome do animal</label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            className="mt-1.5 w-full border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 px-4 py-3 rounded-xl outline-none tracking-wider"
            placeholder="Ex: MIMOSA"
            autoFocus
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Buscar e fotografar
          </button>
          <Link
            href="/animal/new"
            className="mt-3 w-full py-3 rounded-2xl bg-slate-100 text-slate-700 font-medium flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cadastrar sem busca
          </Link>
        </form>
      </main>
    </div>
  );
}
