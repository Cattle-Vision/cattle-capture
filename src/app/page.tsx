import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main style={{ background: "var(--color-bg)", minHeight: "100dvh" }}>
      {/* Nav */}
      <nav
        className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto"
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">🐄</span>
          <span
            className="font-bold text-lg"
            style={{ color: "var(--color-text-primary)" }}
          >
            CattleCapture
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Entrar
          </Link>
          <Link href="/register" className="btn-primary px-4 py-2 text-sm">
            Criar conta
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-24 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-8"
          style={{
            background: "var(--color-brand-muted)",
            color: "var(--color-brand-dark)",
            border: "1px solid var(--pink-200)",
          }}
        >
          <span>●</span> Dataset de ICC Bovino
        </div>

        <h1
          className="text-5xl sm:text-6xl font-bold leading-[1.08] mb-6"
          style={{ color: "var(--color-text-primary)", letterSpacing: "-0.03em" }}
        >
          Fotografe traseiras.
          <br />
          <span style={{ color: "var(--color-brand)" }}>Construa o dataset.</span>
        </h1>

        <p
          className="text-lg leading-relaxed mb-10 max-w-xl mx-auto"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Capture imagens padronizadas da traseira do gado para treinamento de
          modelos de inteligência artificial de condição corporal (ICC).
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/register" className="btn-primary px-8 py-4 text-base">
            Começar agora
          </Link>
          <Link href="/login" className="btn-secondary px-8 py-4 text-base">
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section
        className="border-t py-20 px-6"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            {
              icon: "📸",
              title: "Captura padronizada",
              desc: "Câmera guiada por overlay para garantir o enquadramento correto da garupa e pinças.",
            },
            {
              icon: "🤖",
              title: "Validação por IA",
              desc: "Modelo YOLO verifica se a imagem é uma traseira bovina antes de aceitar no dataset.",
            },
            {
              icon: "📦",
              title: "Export em ZIP",
              desc: "Baixe todas as imagens com manifesto JSON para usar direto no seu pipeline de treino.",
            },
          ].map((f) => (
            <div key={f.title} className="flex flex-col gap-3">
              <span className="text-3xl">{f.icon}</span>
              <h3
                className="font-bold text-base"
                style={{ color: "var(--color-text-primary)" }}
              >
                {f.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <div
          className="max-w-xl mx-auto card p-10"
          style={{ background: "var(--color-brand)", borderColor: "var(--color-brand-dark)" }}
        >
          <h2
            className="text-2xl font-bold mb-3"
            style={{ color: "#fff", letterSpacing: "-0.02em" }}
          >
            Pronto para começar?
          </h2>
          <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.75)" }}>
            Crie sua conta gratuitamente e comece a fotografar hoje.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-sm"
            style={{ background: "#fff", color: "var(--color-brand)" }}
          >
            Criar conta grátis
          </Link>
        </div>
      </section>
    </main>
  );
}
