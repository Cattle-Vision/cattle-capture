"use client";

/**
 * Página de Cadastro de Novo Animal (`src/app/animal/new/page.tsx`).
 *
 * Melhorias de UX:
 * - Seletor visual de raça por chips interativos.
 * - Seletor visual de sexo (Fêmea / Macho).
 * - Botão duplo: "Cadastrar e Fotografar Agora" (vai direto para `/camera`) ou
 *   "Salvar e Abrir Ficha" (vai para `/animal/[id]`).
 * - Suporte completo a Tema Claro/Escuro (`ThemeToggle`) e barra inferior Mobile PWA (`MobileNav`).
 */
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Camera, Check, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BREEDS, SEX_OPTIONS, isValidTag, normalizeTag } from "@/lib/animal";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";

interface AnimalFormState {
  tag: string;
  name: string;
  breed: string;
  sex: string;
  weight: string;
  age: string;
}

function NewAnimalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [goToCamera, setGoToCamera] = useState(true);
  const [formData, setFormData] = useState<AnimalFormState>({
    tag: (searchParams.get("tag") ?? "").toUpperCase(),
    name: "",
    breed: "Nelore",
    sex: "Fêmea",
    weight: "",
    age: "",
  });

  const setField = (field: keyof AnimalFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const generateSampleTag = () => {
    const prefix = formData.breed.slice(0, 3).toUpperCase() || "BOV";
    const num = String(Math.floor(1000 + Math.random() * 9000));
    setField("tag", `${prefix}-${num}`);
  };

  const handleSubmit = async (e: React.FormEvent, openCameraAfter: boolean) => {
    e.preventDefault();
    const tag = normalizeTag(formData.tag);

    if (!isValidTag(tag)) {
      toast("Informe um brinco válido (mínimo 2 caracteres), ex: NEL-0142.", "error");
      return;
    }
    if (!formData.breed.trim()) {
      toast("Selecione a raça do animal.", "error");
      return;
    }
    if (!formData.weight || Number(formData.weight) <= 0) {
      toast("Informe um peso válido em kg.", "error");
      return;
    }
    if (formData.age === "" || Number(formData.age) < 0) {
      toast("Informe a idade em meses.", "error");
      return;
    }

    setLoading(true);
    setGoToCamera(openCameraAfter);

    try {
      const res = await fetch("/api/animals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          tag,
          weight: Number(formData.weight),
          age: Number(formData.age),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        toast("Animal cadastrado com sucesso!", "success");
        const label = data.name || data.tag || tag;
        if (openCameraAfter) {
          router.push(`/camera?animalId=${data.id}&animalName=${encodeURIComponent(label)}`);
        } else {
          router.push(`/animal/${data.id}`);
        }
        return;
      }

      if (res.status === 409 && data.id) {
        toast("Brinco já existente. Abrindo ficha do animal.", "info");
        router.push(`/animal/${data.id}`);
        return;
      }

      toast(data?.error ?? "Erro ao cadastrar o animal.", "error");
      setLoading(false);
    } catch {
      toast("Erro de conexão. Verifique sua internet.", "error");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-theme-bg text-theme-primary pb-24 sm:pb-8">
      <header className="glass-header sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Voltar"
              className="p-2 rounded-xl text-theme-secondary hover:bg-theme-surface-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-extrabold text-theme-primary">Novo Animal</h1>
              <p className="text-xs text-theme-secondary">
                Cadastro no dataset de condição corporal
              </p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <form
            onSubmit={(e) => handleSubmit(e, true)}
            className="card p-5 sm:p-7 flex flex-col gap-6"
          >
            {/* Brinco & Apelido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="field-label !mb-0" htmlFor="tag-field">
                    Brinco / Identificador <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateSampleTag}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    <Sparkles className="w-3 h-3" />
                    Gerar código
                  </button>
                </div>
                <input
                  id="tag-field"
                  type="text"
                  value={formData.tag}
                  onChange={(e) => setField("tag", e.target.value.toUpperCase())}
                  className="field-input font-mono-tag font-bold tracking-wider uppercase"
                  placeholder="Ex: NEL-0142"
                  required
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="name-field">
                  Apelido / Nome (Opcional)
                </label>
                <input
                  id="name-field"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setField("name", e.target.value)}
                  className="field-input"
                  placeholder="Ex: Mimosa, Estrela"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Seleção Visual de Raça */}
            <div>
              <label className="field-label">
                Raça <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {BREEDS.map((breed) => {
                  const active = formData.breed === breed;
                  return (
                    <button
                      key={breed}
                      type="button"
                      onClick={() => setField("breed", breed)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition ${
                        active
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                          : "bg-theme-surface-2 text-theme-secondary border-theme hover:text-theme-primary"
                      }`}
                    >
                      {breed}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Seleção Visual de Sexo */}
            <div>
              <label className="field-label">
                Sexo <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SEX_OPTIONS.map((opt) => {
                  const active = formData.sex === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("sex", opt.value)}
                      className={`p-3.5 rounded-xl border text-left transition flex items-center justify-between ${
                        active
                          ? "bg-emerald-500/10 border-emerald-500 text-theme-primary ring-2 ring-emerald-500/20"
                          : "bg-theme-surface-2 border-theme text-theme-secondary hover:text-theme-primary"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-extrabold text-theme-primary">{opt.value}</p>
                        <p className="text-xs text-theme-secondary mt-0.5">{opt.label}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          active
                            ? "bg-emerald-600 text-white"
                            : "border border-theme"
                        }`}
                      >
                        {active && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Peso e Idade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label" htmlFor="weight-field">
                  Peso estimado (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  id="weight-field"
                  type="number"
                  value={formData.weight}
                  onChange={(e) => setField("weight", e.target.value)}
                  className="field-input"
                  placeholder="Ex: 450"
                  min="1"
                  step="0.1"
                  required
                  inputMode="decimal"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="age-field">
                  Idade (meses) <span className="text-red-500">*</span>
                </label>
                <input
                  id="age-field"
                  type="number"
                  value={formData.age}
                  onChange={(e) => setField("age", e.target.value)}
                  className="field-input"
                  placeholder="Ex: 24"
                  min="0"
                  required
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex-1 py-4 text-sm"
              >
                {loading && goToCamera ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                Cadastrar e Fotografar Agora
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={(e) => handleSubmit(e, false)}
                className="btn-secondary py-4 px-5 text-sm"
              >
                {loading && !goToCamera ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                Salvar e Abrir Ficha
              </button>
            </div>
          </form>
        </div>
      </main>

      <MobileNav />
    </div>
  );
}

export default function NewAnimalPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-theme-bg" />}>
      <NewAnimalForm />
    </Suspense>
  );
}
