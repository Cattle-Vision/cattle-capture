"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BREEDS, SEX_OPTIONS, isValidTag, normalizeTag } from "@/lib/animal";

interface FormData {
  tag: string;
  name: string;
  breed: string;
  sex: string;
  weight: string;
  age: string;
}

const inputClass = "field-input";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="field-label">
        {label}{required && <span style={{ color: "var(--color-error)" }} className="ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function NewAnimalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    tag: (searchParams.get("tag") ?? "").toUpperCase(),
    name: "",
    breed: "Nelore",
    sex: "Fêmea",
    weight: "",
    age: "",
  });

  const set = (field: keyof FormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tag = normalizeTag(formData.tag);

    if (!isValidTag(tag)) {
      toast("Informe um brinco válido (mínimo 2 caracteres), ex: NEL-0142.", "error");
      return;
    }
    if (!formData.breed.trim()) { toast("Informe a raça do animal.", "error"); return; }
    if (!formData.weight || Number(formData.weight) <= 0) { toast("Informe um peso válido.", "error"); return; }
    if (!formData.age || Number(formData.age) < 0) { toast("Informe uma idade válida.", "error"); return; }

    setLoading(true);

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
        toast("Animal cadastrado com sucesso.", "success");
        // Vai para o perfil — o usuário decide quando tirar foto
        router.push(`/animal/${data.id}`);
        return;
      }
      if (res.status === 409 && data.id) {
        toast("Brinco já cadastrado. Abrindo o perfil.", "info");
        router.push(`/animal/${data.id}`);
        return;
      }
      toast(data?.error ?? "Erro ao salvar o animal.", "error");
      setLoading(false);
    } catch {
      toast("Erro de conexão. Tente novamente.", "error");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: "var(--color-bg)" }}>
      <header
        className="border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <button
          onClick={() => router.back()}
          aria-label="Voltar"
          className="p-2 rounded-lg"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
          Cadastrar animal
        </h1>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          <p className="text-sm mb-6" style={{ color: "var(--color-text-muted)" }}>
            O brinco é o identificador único do animal no dataset de ICC.
          </p>

          <form onSubmit={handleSubmit} className="card p-5 flex flex-col gap-5">
            <Field label="Brinco / identificador" required>
              <input
                type="text"
                value={formData.tag}
                onChange={(e) => setFormData((prev) => ({ ...prev, tag: e.target.value.toUpperCase() }))}
                className={`${inputClass} tracking-widest`}
                placeholder="Ex: NEL-0142"
                required
                autoComplete="off"
              />
            </Field>

            <Field label="Apelido (opcional)">
              <input
                type="text"
                value={formData.name}
                onChange={set("name")}
                className={inputClass}
                placeholder="Ex: Mimosa"
                autoComplete="off"
              />
            </Field>

            <Field label="Raça" required>
              <select value={formData.breed} onChange={set("breed")} className={inputClass} required>
                {BREEDS.map((breed) => (
                  <option key={breed} value={breed}>{breed}</option>
                ))}
              </select>
            </Field>

            <Field label="Sexo" required>
              <select value={formData.sex} onChange={set("sex")} className={inputClass}>
                {SEX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Peso (kg)" required>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={set("weight")}
                  className={inputClass}
                  placeholder="450"
                  min="1"
                  step="0.1"
                  required
                  inputMode="decimal"
                />
              </Field>
              <Field label="Idade (meses)" required>
                <input
                  type="number"
                  value={formData.age}
                  onChange={set("age")}
                  className={inputClass}
                  placeholder="24"
                  min="0"
                  required
                  inputMode="numeric"
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-4 mt-1 text-base"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? "Salvando…" : "Cadastrar animal"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function NewAnimalPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh]" style={{ background: "var(--color-bg)" }} />}>
      <NewAnimalForm />
    </Suspense>
  );
}
