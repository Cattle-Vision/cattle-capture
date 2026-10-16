/**
 * Landing Page Principal (`src/app/page.tsx`).
 *
 * Responsabilidades:
 * - Redirecionar usuários já autenticados diretamente para `/dashboard`.
 * - Apresentar a plataforma CattleCapture (Visão Computacional & Dataset ICC Bovino)
 *   com suporte completo a Tema Claro e Escuro (`ThemeToggle`) e instalação PWA.
 */
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
import ThemeToggle from "@/components/ThemeToggle";
import { LandingAuthCheck } from "@/components/LandingAuthCheck";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-theme-bg text-theme-primary selection:bg-emerald-500 selection:text-white">
      <LandingAuthCheck />
      {/* Header Glassmorphic */}
      <header className="glass-header sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-1 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white shadow-xs shrink-0">
              <span className="text-base sm:text-lg">🐄</span>
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-theme-primary truncate block">
                Cattle<span className="text-emerald-600 dark:text-emerald-400">Capture</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                v3.0 · Real-Time AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <ThemeToggle className="p-1.5 sm:p-2.5" />
            <Link href="/login" className="btn-ghost text-xs sm:text-sm px-2 sm:px-3.5 py-1.5 sm:py-2">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary text-xs sm:text-sm px-2.5 sm:px-4 py-1.5 sm:py-2.5">
              <span className="xs:hidden">Criar</span>
              <span className="hidden xs:inline">Criar conta</span>
              <ArrowRight className="w-4 h-4 hidden sm:inline" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-12 pb-16 sm:pt-24 sm:pb-28 px-4 sm:px-6">
          {/* Glow decorativo de fundo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[720px] max-w-full h-[380px] rounded-full bg-gradient-to-tr from-emerald-400/20 via-teal-300/15 to-transparent blur-3xl"
          />

          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              Visão Computacional em Tempo Real · Dataset ICC / BCS
            </div>

            <h1 className="text-3xl sm:text-6xl font-extrabold tracking-tight text-theme-primary leading-[1.1] mb-6">
              Captura inteligente para{" "}
              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                Avaliação Corporal Bovina
              </span>
            </h1>

            <p className="text-sm sm:text-lg text-theme-secondary leading-relaxed max-w-2xl mx-auto mb-10">
              Colete imagens anatômicas da região posterior do rebanho com mira guiada,
              score de enquadramento em tempo real no visor da câmera e avaliação por IA
              antes do upload.
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
            <div className="mt-12 pt-8 border-t border-theme grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-left max-w-3xl mx-auto">
              {[
                { label: "Score em Tempo Real", desc: "Análise ao vivo no visor + pré-upload" },
                { label: "Validação YOLO ONNX", desc: "Detecção automática de traseira" },
                { label: "PWA & Offline Sync", desc: "Instalável no celular + fila IndexedDB" },
                { label: "Exportação Científica", desc: "Pacote ZIP + JSON + Planilha CSV" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-theme-surface border border-theme rounded-xl p-3.5 shadow-2xs"
                >
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {item.label}
                  </div>
                  <p className="text-xs text-theme-secondary leading-snug">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Arquitetura do Fluxo de Coleta */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-theme-surface border-y border-theme">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-theme-primary tracking-tight">
                Fluxo desenhado para operação no curral
              </h2>
              <p className="text-sm sm:text-base text-theme-secondary mt-2">
                Interface ergonômica com tema Claro/Escuro adaptável ao sol intenso ou galpão.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: <ScanLine className="w-6 h-6 text-emerald-500" />,
                  step: "01",
                  title: "Identificação por Brinco",
                  desc: "Busque rapidamente pelo brinco oficial (ex: NEL-0142) ou apelido. Caso o animal ainda não exista, o formulário já abre preenchido.",
                },
                {
                  icon: <Camera className="w-6 h-6 text-emerald-500" />,
                  step: "02",
                  title: "Score IA Antes do Upload",
                  desc: "Acompanhe o score em tempo real no visor da câmera e veja a nota de confiança da IA imediatamente após bater ou escolher a foto.",
                },
                {
                  icon: <FileArchive className="w-6 h-6 text-emerald-500" />,
                  step: "03",
                  title: "Gestão Admin & Exportação",
                  desc: "Promova operadores a administradores com 1 clique, audite todas as fotos do rebanho e exporte o dataset completo em ZIP.",
                },
              ].map((card) => (
                <div
                  key={card.step}
                  className="card p-6 flex flex-col justify-between hover:border-emerald-500/50 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-5">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        {card.icon}
                      </div>
                      <span className="font-mono-tag text-xs font-bold text-theme-muted bg-theme-surface-2 px-2.5 py-1 rounded-md">
                        ETAPA {card.step}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-theme-primary mb-2">{card.title}</h3>
                    <p className="text-sm text-theme-secondary leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-16 sm:py-20 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto rounded-3xl bg-slate-900 dark:bg-slate-900/90 border border-slate-800 text-white p-8 sm:p-12 flex flex-col sm:flex-row items-center justify-between gap-8 shadow-xl">
            <div className="max-w-lg text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Database className="w-3.5 h-3.5" />
                Pronto para Produção na Vercel & Mobile PWA
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                Construa seu dataset bovino hoje
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Acesse com sua conta de operador de campo ou utilize as credenciais administrativas configuradas.
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
      <footer className="border-t border-theme py-6 px-4 text-center text-xs text-theme-muted">
        CattleCapture v3.0 · Sistema de Coleta e Visão Computacional para Condição Corporal Bovina (ICC)
      </footer>
    </div>
  );
}
