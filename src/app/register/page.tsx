"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, User, Mail, Lock, Eye, EyeOff, AlertTriangle, Check } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { register } = useAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await register(name, email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Não foi possível concluir o cadastro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex bg-theme-bg text-theme-primary">
      <div
        className="hidden lg:flex w-[420px] xl:w-[460px] flex-col justify-between p-10 text-white relative overflow-hidden"
        style={{ backgroundColor: "#123829" }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 400 600"
          className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none"
          preserveAspectRatio="none"
        >
          <path d="M-40 120 Q140 60 440 180" fill="none" stroke="#FFFFFF" strokeWidth="2" />
          <path d="M-40 220 Q180 140 440 280" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <path d="M-40 340 Q160 250 440 390" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          <path d="M-40 460 Q200 380 440 500" fill="none" stroke="#FFFFFF" strokeWidth="2" />
        </svg>

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <BrandMark className="w-9 h-9" />
            <span className="font-bold text-xl tracking-tight">
              Cattle<span className="text-emerald-300">Capture</span>
            </span>
          </Link>

          <div className="mt-16">
            <span className="text-xs font-semibold text-emerald-300/90 block mb-3">
              Novo cadastro
            </span>
            <h1 className="text-2xl xl:text-3xl font-bold leading-tight tracking-tight">
              Comece a organizar e capturar o seu dataset hoje.
            </h1>
            <p className="mt-4 text-sm text-emerald-100/80 leading-relaxed">
              Crie sua conta para cadastrar animais, capturar fotos guiadas em campo e manter o
              acervo fotográfico de todo o lote.
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-2.5 pt-6 border-t border-white/15 text-xs text-emerald-100/80">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>Cadastro por apelido, brinco e localização</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>IA embarcada para validação de enquadramento</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>Compartilhamento de fichas com a equipe</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center p-5 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-secondary hover:text-theme-primary"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Início</span>
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="lg:hidden flex items-center gap-2">
                <BrandMark className="w-7 h-7" />
                <span className="font-bold text-sm text-theme-primary">CattleCapture</span>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-theme-primary tracking-tight">
              Criar conta
            </h2>
            <p className="text-xs sm:text-sm text-theme-secondary mt-1">
              Preencha seus dados para acessar o painel de manejo.
            </p>
          </div>

          {error && (
            <div className="error-banner flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="field-label" htmlFor="reg-name">
                Nome completo
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                <Mail className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                <Lock className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary p-1"
                  tabIndex={-1}
                  aria-label="Mostrar ou ocultar senha"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm sm:text-base">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? "Criando conta…" : "Criar conta"}</span>
            </button>
          </form>

          <p className="text-sm text-theme-secondary pt-4 border-t border-theme text-center">
            Já possui conta?{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Entrar agora
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
