"use client";

/**
 * Página de Login (`src/app/login/page.tsx`).
 *
 * Recursos:
 * - Suporta login de usuários comuns e login direto de Administrador configurado no `.env`
 *   (aceitando tanto o e-mail completo `admin@cattlecapture.com` quanto o atalho `admin`).
 * - Suporte completo a Tema Claro/Escuro (`ThemeToggle`).
 */
import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2, Eye, EyeOff, ShieldCheck, ArrowLeft, Lock, Mail, ScanLine, AlertTriangle } from "lucide-react";
import { loginAction } from "./actions";
import ThemeToggle from "@/components/ThemeToggle";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="min-h-[100dvh] flex bg-theme-bg text-theme-primary">
      {/* Painel lateral — Visível em telas grandes */}
      <div className="hidden lg:flex w-[420px] xl:w-[460px] flex-col justify-between p-10 bg-slate-900 text-white relative overflow-hidden border-r border-slate-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-emerald-500/20 blur-3xl"
        />

        <div className="relative z-10">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-md bg-emerald-500 flex items-center justify-center text-white shadow-xs">
              <ScanLine className="w-5 h-5 stroke-[2.2]" />
            </div>
            <span className="font-bold text-xl tracking-tight">
              Cattle<span className="text-emerald-400">Capture</span>
            </span>
          </Link>

          <div className="mt-14">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md mb-4">
              <ShieldCheck className="w-3.5 h-3.5" />
              Dataset para IA de ICS
            </span>
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              Construindo o dataset para a IA de ICS Bovino.
            </h1>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              Ajude a alimentar o banco de dados oficial de imagens traseiras do rebanho para
              viabilizar a primeira IA de predição do Índice de Condição Corporal (ICS / ECC).
            </p>
          </div>
        </div>

        <div className="relative z-10 rounded-lg bg-white/5 border border-white/10 p-4 backdrop-blur-xs">
          <p className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
            Acesso Administrativo (.env)
          </p>
          <p className="text-xs text-slate-300 leading-relaxed">
            Administradores podem autenticar usando o e-mail configurado em{" "}
            <code className="text-white font-mono-tag">ADMIN_EMAIL</code> (ou{" "}
            <code className="text-white font-mono-tag">admin</code>) e a senha definida em{" "}
            <code className="text-white font-mono-tag">ADMIN_PASSWORD</code>.
          </p>
        </div>
      </div>

      {/* Área do Formulário */}
      <div className="flex-1 flex flex-col justify-center items-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          {/* Topo */}
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-theme-secondary hover:text-theme-primary"
            >
              <ArrowLeft className="w-4 h-4" />
              Início
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="lg:hidden flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-emerald-600 flex items-center justify-center text-white">
                  <ScanLine className="w-4 h-4 stroke-[2.2]" />
                </div>
                <span className="font-bold text-sm text-theme-primary">
                  Cattle<span className="text-emerald-600 dark:text-emerald-400">Capture</span>
                </span>
              </div>
              <ThemeToggle />
            </div>
          </div>

          <div className="card p-5 sm:p-7">
            <h2 className="text-xl sm:text-2xl font-bold text-theme-primary tracking-tight mb-1">
              Acessar conta
            </h2>
            <p className="text-xs sm:text-sm text-theme-secondary mb-5">
              Entre com seu e-mail de operador ou credencial de administrador.
            </p>

            {state?.error && (
              <div className="error-banner mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{state.error}</span>
              </div>
            )}

            <form action={formAction} className="flex flex-col gap-5">
              <div>
                <label className="field-label" htmlFor="email">
                  E-mail ou Usuário Admin
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="email"
                    name="email"
                    type="text"
                    required
                    className="field-input pl-10"
                    placeholder="seu@email.com ou admin"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="password">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-theme-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    className="field-input pl-10 pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
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

              <button
                type="submit"
                disabled={pending}
                className="btn-primary w-full py-3.5 text-base mt-1"
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {pending ? "Autenticando…" : "Entrar no Sistema"}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-theme text-center">
              <p className="text-sm text-theme-secondary">
                Ainda não possui conta de operador?{" "}
                <Link
                  href="/register"
                  className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  Criar conta grátis
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
