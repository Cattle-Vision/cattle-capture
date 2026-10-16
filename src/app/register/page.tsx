"use client";

/**
 * Página de Cadastro de Operador (`src/app/register/page.tsx`).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, User, Mail, Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (res.ok) {
        const signInRes = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (signInRes?.error) {
          setError("Conta criada! Faça login para continuar.");
          setLoading(false);
          router.push("/login");
        } else {
          router.push("/dashboard");
          router.refresh();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível concluir o cadastro.");
        setLoading(false);
      }
    } catch {
      setError("Erro de conexão ao servidor. Verifique sua internet.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex bg-slate-50">
      {/* Painel lateral */}
      <div className="hidden lg:flex w-[420px] xl:w-[460px] flex-col justify-between p-10 bg-slate-900 text-white relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl"
        />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-xl shadow-md">
              🐄
            </div>
            <span className="font-extrabold text-xl tracking-tight">
              Cattle<span className="text-emerald-400">Capture</span>
            </span>
          </Link>

          <div className="mt-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              Novo Operador
            </span>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
              Comece a catalogar seu rebanho em segundos.
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Cadastre animais por brinco, registre o histórico fotográfico padronizado
              e contribua para o dataset de condição corporal bovina.
            </p>
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          CattleCapture v2.5 · Sincronização Cloud & Offline
        </p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Início
            </Link>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-sm text-white">
                🐄
              </div>
              <span className="font-extrabold text-sm text-slate-900">
                Cattle<span className="text-emerald-600">Capture</span>
              </span>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-1">
              Criar conta de operador
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Preencha seus dados para iniciar a coleta de imagens.
            </p>

            {error && (
              <div className="error-banner mb-5 flex items-center gap-2">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleRegister} className="flex flex-col gap-5">
              <div>
                <label className="field-label" htmlFor="reg-name">
                  Nome completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="field-input pl-10"
                    placeholder="João da Silva"
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="reg-email">
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="field-input pl-10"
                    placeholder="seu@email.com"
                    inputMode="email"
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="reg-password">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field-input pl-10 pr-10"
                    placeholder="Mínimo de 6 caracteres"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3.5 text-base mt-1"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Criando conta…" : "Concluir Cadastro"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <p className="text-sm text-slate-500">
                Já possui uma conta?{" "}
                <Link
                  href="/login"
                  className="font-bold text-emerald-600 hover:text-emerald-700"
                >
                  Fazer login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
