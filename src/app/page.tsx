/**
 * Landing Page Principal (`src/app/page.tsx`).
 *
 * Responsabilidades:
 * - Redirecionar usuários já autenticados diretamente para `/dashboard`.
 * - Apresentar a plataforma CattleCapture (Visão Computacional & Dataset ICC Bovino)
 *   com estética AgTech de alto padrão.
 */
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Link from "next/link";
import {
  Camera,
  Sparkles,
  FileArchive,
  ShieldCheck,
  ArrowRight,
  ScanLine,
  Database,
  CheckCircle2,
} from "lucide-react";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50 text-slate-900 selection:bg-emerald-500 selection:text-white">
      {/* Header Glassmorphic */}
      <header className="glass-header sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-sm">
              <span className="text-lg">🐄</span>
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900">
                Cattle<span className="text-emerald-600">Capture</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                v2.5 · ICC AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/login" className="btn-ghost text-sm px-4 py-2">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary text-sm px-4 py-2.5">
              Criar conta
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-14 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6">
          {/* Glow decorativo de fundo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[720px] h-[380px] rounded-full bg-gradient-to-tr from-emerald-400/20 via-teal-300/15 to-transparent blur-3xl"
          />

          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Visão Computacional Pecuária · Dataset ICC / BCS
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.08] mb-6">
              Captura padronizada para{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Avaliação Corporal Bovina
              </span>
            </h1>

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-10">
              Colete imagens anatômicas da região posterior do rebanho com mira guiada,
              validação automática por rede neural YOLO e exportação estruturada para
              treinamento de modelos de Índice de Condição Corporal (ICC).
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Link
                href="/register"
                className="btn-primary w-full sm:w-auto px-8 py-4 text-base shadow-lg shadow-emerald-600/20"
              >
                Começar Coleta em Campo
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="btn-secondary w-full sm:w-auto px-8 py-4 text-base"
              >
                Acessar Painel / Admin
              </Link>
            </div>

            {/* Destaques Técnicos */}
            <div className="mt-12 pt-8 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-left max-w-3xl mx-auto">
              {[
                { label: "Compressão Inteligente", desc: "Upload < 300KB imune a falhas 4G" },
                { label: "Validação YOLO ONNX", desc: "Detecção automática de traseira" },
                { label: "Cloud & Offline Sync", desc: "Vercel Blob + IndexedDB Queue" },
                { label: "Exportação Científica", desc: "Pacote ZIP + JSON + Planilha CSV" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white/80 border border-slate-200/70 rounded-xl p-3.5 shadow-2xs"
                >
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {item.label}
                  </div>
                  <p className="text-xs text-slate-500 leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Arquitetura do Fluxo de Coleta */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white border-y border-slate-200/80">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Fluxo desenhado para operação no curral
              </h2>
              <p className="text-sm sm:text-base text-slate-500 mt-2">
                Interface ergonômica de alto contraste pensada para uso rápido no celular ou desktop.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <ScanLine className="w-6 h-6 text-emerald-600" />,
                  step: "01",
                  title: "Identificação por Brinco",
                  desc: "Busque rapidamente pelo brinco oficial (ex: NEL-0142) ou apelido. Caso o animal ainda não exista, o formulário já abre preenchido.",
                },
                {
                  icon: <Camera className="w-6 h-6 text-emerald-600" />,
                  step: "02",
                  title: "Enquadramento Guiado + IA",
                  desc: "Utilize o viewfinder com guia anatômico de garupa e ísquios ou envie fotos da galeria com compressão automática instantânea.",
                },
                {
                  icon: <FileArchive className="w-6 h-6 text-emerald-600" />,
                  step: "03",
                  title: "Curadoria Admin & Exportação",
                  desc: "O administrador audita todas as capturas do rebanho, visualiza o score de confiança da IA e baixa o dataset completo em ZIP.",
                },
              ].map((card) => (
                <div
                  key={card.step}
                  className="card p-6 flex flex-col justify-between hover:border-emerald-300 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                        {card.icon}
                      </div>
                      <span className="font-mono-tag text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">
                        ETAPA {card.step}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{card.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-16 sm:py-20 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto rounded-3xl bg-slate-900 text-white p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-8 shadow-xl">
            <div className="max-w-lg text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Database className="w-3.5 h-3.5" />
                Pronto para Produção na Vercel
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                Construa seu dataset bovino hoje
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Acesse com sua conta de operador de campo ou utilize as credenciais administrativas configuradas no ambiente.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
              <Link
                href="/login"
                className="btn-primary px-7 py-3.5 text-sm whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                Entrar no Sistema
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 py-6 px-4 text-center text-xs text-slate-500">
        CattleCapture v2.5 · Sistema de Coleta e Visão Computacional para Condição Corporal Bovina (ICC)
      </footer>
    </div>
  );
}
