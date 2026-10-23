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
  Activity,
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
      {/* Header Glassmorphic Compacto */}
      <header className="glass-header sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-12 sm:h-14 flex items-center justify-between gap-1 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-md bg-emerald-600 flex items-center justify-center text-white shrink-0">
              <ScanLine className="w-4 h-4 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm sm:text-base tracking-tight text-theme-primary truncate block">
                Cattle<span className="text-emerald-600 dark:text-emerald-400">Capture</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                v3.0 · Real-Time AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <ThemeToggle className="p-1.5 sm:p-2" />
            <Link href="/login" className="btn-ghost text-xs sm:text-sm px-2.5 py-1.5">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary text-xs sm:text-sm px-3 py-1.5">
              <span className="xs:hidden">Criar</span>
              <span className="hidden xs:inline">Criar conta</span>
              <ArrowRight className="w-3.5 h-3.5 hidden sm:inline" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative overflow-hidden pt-10 pb-14 sm:pt-20 sm:pb-24 px-4 sm:px-6">
          <div className="relative max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider mb-5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              Visão Computacional em Tempo Real · Dataset ICC / BCS
            </div>

            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-theme-primary leading-[1.15] mb-5">
              Captura inteligente para{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Avaliação Corporal Bovina
              </span>
            </h1>

            <p className="text-sm sm:text-base text-theme-secondary leading-relaxed max-w-2xl mx-auto mb-8">
              Colete imagens anatômicas da região posterior do rebanho com mira guiada,
              avaliação de confiança em tempo real no visor da câmera e diagnóstico por IA
              antes do upload.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/register"
                className="btn-primary w-full sm:w-auto px-6 py-3 text-sm shadow-sm"
              >
                Começar Coleta em Campo
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="btn-secondary w-full sm:w-auto px-6 py-3 text-sm"
              >
                Acessar Painel / Admin
              </Link>
            </div>

            {/* Destaques Técnicos */}
            <div className="mt-10 pt-6 border-t border-theme grid grid-cols-2 sm:grid-cols-4 gap-3 text-left max-w-3xl mx-auto">
              {[
                { label: "Confiança em Tempo Real", desc: "Análise na mira ao vivo + pré-upload" },
                { label: "Validação YOLO ONNX", desc: "Detecção automática de traseira" },
                { label: "PWA & Offline Sync", desc: "Instalável no celular + fila IndexedDB" },
                { label: "Exportação Científica", desc: "Pacote ZIP + JSON + Planilha CSV" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-theme-surface border border-theme rounded-lg p-3 shadow-2xs"
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
                  title: "Confiança IA Antes do Upload",
                  desc: "Acompanhe a confiança em tempo real no visor da câmera e veja a nota de validação da IA imediatamente após bater ou escolher a foto.",
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
                  className="card p-5 flex flex-col justify-between hover:border-emerald-500/50 transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        {card.icon}
                      </div>
                      <span className="font-mono-tag text-[11px] font-bold text-theme-muted bg-theme-surface-2 px-2 py-0.5 rounded-md">
                        ETAPA {card.step}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-theme-primary mb-1.5">{card.title}</h3>
                    <p className="text-xs text-theme-secondary leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-12 sm:py-16 px-4 sm:px-6">
          <div className="max-w-4xl mx-auto rounded-lg bg-slate-900 border border-slate-800 text-white p-6 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-md">
            <div className="max-w-lg text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Database className="w-3.5 h-3.5" />
                Pronto para Produção na Vercel & Mobile PWA
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                Construa seu dataset bovino hoje
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Acesse com sua conta de operador de campo ou utilize as credenciais administrativas configuradas.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto shrink-0">
              <Link
                href="/login"
                className="btn-primary px-6 py-3 text-xs sm:text-sm whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                Entrar no Sistema
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Compacto */}
      <footer className="border-t border-theme py-4 px-4 text-center text-xs text-theme-muted">
        CattleCapture v3.0 · Sistema de Coleta e Visão Computacional para Condição Corporal Bovina (ICC)
      </footer>
    </div>
  );
}
