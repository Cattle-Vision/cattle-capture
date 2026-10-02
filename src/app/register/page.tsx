"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

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
        setError("Conta criada, mas ocorreu um erro ao entrar automaticamente.");
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao cadastrar.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex">
      {/* Painel lateral */}
      <div
        className="hidden lg:flex w-80 xl:w-96 flex-col justify-between p-10"
        style={{ background: "var(--color-brand)", color: "#fff" }}
      >
        <div>
          <span className="text-3xl">🐄</span>
          <h1 className="mt-6 text-2xl font-bold leading-snug">CattleCapture</h1>
          <p className="mt-3 text-sm opacity-75 leading-relaxed">
            Crie sua conta para começar a fotografar e construir o dataset de ICC bovino.
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
            Criar conta
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--color-text-muted)" }}>
            Preencha os dados para se cadastrar
          </p>

          {error && <div className="error-banner mb-6">{error}</div>}

          <form onSubmit={handleRegister} className="flex flex-col gap-5">
            <div>
              <label className="field-label" htmlFor="reg-name">Nome</label>
              <input
                id="reg-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="field-input"
                placeholder="João da Silva"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="reg-email">E-mail</label>
              <input
                id="reg-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field-input"
                placeholder="seu@email.com"
                inputMode="email"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="reg-password">Senha</label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field-input"
                placeholder="mínimo 6 caracteres"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-1 py-3.5"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Cadastrando…" : "Criar conta"}
            </button>
          </form>

          <p className="mt-6 text-sm text-center" style={{ color: "var(--color-text-muted)" }}>
            Já tem conta?{" "}
            <Link href="/login" className="font-semibold" style={{ color: "var(--color-brand)" }}>
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
