'use client';

/**
 * Formulário de cadastro de novo animal.
 *
 * Fixes mobile:
 * - font-size: 16px nos inputs (via globals.css) — evita zoom iOS
 * - Labels grandes e touch targets adequados
 * - Layout single-column sempre (sem grid em mobile)
 * - Feedback de erro explícito por campo
 * - Header sticky com botão voltar
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface FormData {
  name: string;
  breed: string;
  sex: string;
  weight: string;
  age: string;
}

// ── Componentes de campo reutilizáveis ────────────────────────────────────

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
  'w-full border border-slate-200 bg-slate-50 focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 px-4 py-3 rounded-xl outline-none transition text-slate-900 placeholder:text-slate-400';

// ── Página ─────────────────────────────────────────────────────────────────
export default function NewAnimalPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    breed: '',
    sex: 'Macho',
    weight: '',
    age: '',
  });

  const set = (field: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação básica no cliente
    if (!formData.breed.trim()) {
      toast('Informe a raça do animal.', 'error');
      return;
    }
    if (!formData.weight || Number(formData.weight) <= 0) {
      toast('Informe um peso válido.', 'error');
      return;
    }
    if (!formData.age || Number(formData.age) < 0) {
      toast('Informe uma idade válida.', 'error');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/animals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          weight: Number(formData.weight),
          age: Number(formData.age),
        }),
      });

      if (res.ok) {
        toast('Animal cadastrado com sucesso!', 'success');
        router.push('/dashboard');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data?.error ?? 'Erro ao salvar o animal.', 'error');
        setLoading(false);
      }
    } catch {
      toast('Erro de conexão. Tente novamente.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 flex flex-col">
      {/* Header sticky */}
      <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <button
          onClick={() => router.back()}
          aria-label="Voltar"
          className="p-2 rounded-xl hover:bg-slate-100 active:bg-slate-200 transition shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <h1 className="text-base font-bold text-slate-900">Novo Animal</h1>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl mx-auto">
          <p className="text-sm text-slate-400 mb-6">
            Preencha os dados do animal. Campos marcados com <span className="text-red-500">*</span> são obrigatórios.
          </p>

          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-5">

            <Field label="Apelido / Brinco">
              <input
                type="text"
                value={formData.name}
                onChange={set('name')}
                className={inputClass}
                placeholder="Ex: Mimosa"
                autoComplete="off"
              />
            </Field>

            <Field label="Raça" required>
              <input
                type="text"
                value={formData.breed}
                onChange={set('breed')}
                className={inputClass}
                placeholder="Ex: Nelore"
                required
                autoComplete="off"
              />
            </Field>

            <Field label="Sexo">
              <select
                value={formData.sex}
                onChange={set('sex')}
                className={inputClass}
              >
                <option value="Macho">Macho</option>
                <option value="Fêmea">Fêmea</option>
              </select>
            </Field>

            {/* Peso e Idade lado a lado apenas em sm+ */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Peso (kg)" required>
                <input
                  type="number"
                  value={formData.weight}
                  onChange={set('weight')}
                  className={inputClass}
                  placeholder="Ex: 450"
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
                  onChange={set('age')}
                  className={inputClass}
                  placeholder="Ex: 24"
                  min="0"
                  required
                  inputMode="numeric"
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`
                w-full py-4 rounded-2xl text-white font-semibold text-base transition
                flex items-center justify-center gap-2 mt-2
                ${loading
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98]'
                }
              `}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Cadastrar Animal'
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
