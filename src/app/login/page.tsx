"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="min-h-[100dvh] flex">
      {/* Painel lateral — visível só em telas grandes */}
      <div
        className="hidden lg:flex w-80 xl:w-96 flex-col justify-between p-10"
        style={{ background: "var(--color-brand)", color: "#fff" }}
      >
        <div>
          <span className="text-3xl">🐄</span>
          <h1 className="mt-6 text-2xl font-bold leading-snug">CattleCapture</h1>
          <p className="mt-3 text-sm opacity-75 leading-relaxed">
            Coleta de imagens da traseira bovina para construção do dataset de
            índice de condição corporal (ICC).
          </p>
        </div>
        <p className="text-xs opacity-50">v2 · Dataset · ICC</p>
      </div>

      {/* Formulário */}
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{ background: "var(--color-bg)" }}
      >
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden mb-8 flex items-center gap-2">
            <span className="text-2xl">🐄</span>
            <span className="font-bold text-lg" style={{ color: "var(--color-text-primary)" }}>
              CattleCapture
            </span>
          </div>

          <h2
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-text-primary)" }}
          >
            Entrar
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>
            Acesse sua conta para continuar
          </p>

          {state?.error && (
            <div className="error-banner mb-6">{state.error}</div>
          )}

          <form action={formAction} className="flex flex-col gap-5">
            <div>
              <label className="field-label" htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="field-input"
                placeholder="seu@email.com"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="field-input"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full mt-1 py-3.5"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <p className="mt-6 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
            Não tem conta?{" "}
            <Link
              href="/register"
              className="font-semibold"
              style={{ color: "var(--color-brand)" }}
            >
              Cadastre-se
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
