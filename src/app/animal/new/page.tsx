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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 px-4 py-3 rounded-xl outline-none transition text-slate-900 placeholder:text-slate-400";

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

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const tag = normalizeTag(formData.tag);

    if (!isValidTag(tag)) {
      toast("Informe um brinco válido, ex: NEL-0142.", "error");
      return;
    }
    if (!formData.breed.trim()) {
      toast("Informe a raça do animal.", "error");
      return;
    }
    if (!formData.weight || Number(formData.weight) <= 0) {
      toast("Informe um peso válido.", "error");
      return;
    }
    if (!formData.age || Number(formData.age) < 0) {
      toast("Informe uma idade válida.", "error");
      return;
    }

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
        toast("Animal cadastrado. Agora fotografe a traseira.", "success");
        router.push(`/camera?animalId=${data.id}&animalName=${encodeURIComponent(data.name || data.tag)}`);
        return;
      }
      if (res.status === 409 && data.id) {
        toast("Esse brinco já existe. Abrindo o animal.", "info");
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
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => router.back()}
          aria-label="Voltar"
          className="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Cadastrar animal</h1>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          <p className="text-sm text-slate-400 mb-6">
            O brinco é o identificador único. Sem ele a foto não entra no dataset de ICC.
          </p>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-5">
            <Field label="Brinco / identificador" required>
              <input
                type="text"
                value={formData.tag}
                onChange={(e) => setFormData((prev) => ({ ...prev, tag: e.target.value.toUpperCase() }))}
                className={`${inputClass} tracking-wider`}
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
                  <option key={breed} value={breed}>
                    {breed}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sexo" required>
              <select value={formData.sex} onChange={set("sex")} className={inputClass}>
                {SEX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
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
              className={`w-full py-4 rounded-2xl text-white font-semibold text-base transition flex items-center justify-center gap-2 mt-2 ${loading ? "bg-slate-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"}`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Cadastrar e abrir câmera"
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function NewAnimalPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-slate-50" />}>
      <NewAnimalForm />
    </Suspense>
  );
}
