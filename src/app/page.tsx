/**
 * Landing Page ("Agro Precisão" · `src/app/page.tsx`).
 */
import Link from "next/link";
import { ArrowRight, Check, ChevronRight, ScanLine, WifiOff, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { LandingAuthCheck } from "@/components/LandingAuthCheck";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { BrandMark } from "@/components/BrandMark";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-theme-bg text-theme-primary selection:bg-[#184E3A] selection:text-white">
      <LandingAuthCheck />

      <header className="glass-header sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <BrandMark className="w-8 h-8 sm:w-9 sm:h-9" />
            <div className="min-w-0">
              <span className="font-bold text-base sm:text-[17px] tracking-tight text-theme-primary block leading-none">
                Cattle<span style={{ color: "var(--color-brand-light)" }}>Capture</span>
              </span>
              <span className="text-[11px] font-medium text-theme-muted hidden sm:block mt-0.5">
                Captura e Curadoria de Dataset Bovino
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <PwaInstallPrompt variant="button" className="hidden sm:inline-flex" />
            <ThemeToggle />
            <Link href="/login" className="btn-ghost text-xs sm:text-sm px-3">
              Entrar
            </Link>
            <Link href="/register" className="btn-primary !min-h-[38px] text-xs sm:text-sm px-4">
              <span>Criar conta</span>
              <ArrowRight className="w-3.5 h-3.5 hidden xs:inline" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Editorial */}
        <section className="pt-12 pb-14 sm:pt-20 sm:pb-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-brand-soft mb-5">
                Captura de dataset e prontuário zootécnico
              </span>

              <h1 className="text-3xl sm:text-4xl lg:text-[46px] font-bold tracking-tight text-theme-primary leading-[1.1] mb-5">
                Padronize capturas do rebanho e organize o dataset, do tronco ao escritório.
              </h1>

              <p className="text-sm sm:text-base text-theme-secondary leading-relaxed max-w-lg mb-8">
                Identifique cada bovino em segundos, registre fotos anatômicas guiadas por IA de
                enquadramento e mantenha um banco de dados completo com histórico sanitário e de lotes.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md">
                <Link href="/register" className="btn-primary py-3 px-6 text-sm sm:text-base justify-center">
                  <span>Começar agora</span>
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <Link href="/login" className="btn-secondary py-3 px-6 text-sm sm:text-base justify-center">
                  <span>Já tenho conta</span>
                </Link>
              </div>

              <div className="mt-3 sm:hidden">
                <PwaInstallPrompt variant="button" className="w-full justify-center" />
              </div>

              <div className="mt-8 pt-6 border-t border-theme flex flex-wrap gap-x-6 gap-y-2.5 text-xs font-medium text-theme-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-brand" />
                  IA de enquadramento embarcada
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-brand" />
                  Funciona sem internet
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-brand" />
                  Leitor de brinco Bluetooth
                </span>
              </div>
            </div>

            {/* Prévia visual realista do prontuário e captura de dataset */}
            <div className="lg:col-span-6">
              <div className="card p-5 sm:p-6 space-y-5 shadow-md">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-theme">
                  <div>
                    <span className="text-[11px] font-semibold text-theme-muted block">
                      Exemplo de Ficha
                    </span>
                    <h2 className="text-lg font-bold text-theme-primary mt-0.5">
                      Vaca Holandesa — Lote 04
                    </h2>
                    <p className="text-xs text-theme-secondary mt-0.5">
                      Fêmea, 560 kg, 48 meses — Piquete Norte
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-[8px] text-xs font-bold bg-brand text-white shrink-0">
                    Enquadramento 92%
                  </span>
                </div>

                {/* Régua de Qualidade de Captura */}
                <div className="card-subtle p-4 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-semibold text-theme-secondary">
                      Qualidade de Captura Anatômica (IA)
                    </span>
                    <span className="text-xs font-bold text-theme-primary">
                      Padrão ouro (Dataset)
                    </span>
                  </div>

                  <div className="relative h-2.5 rounded-full bg-theme-surface border border-theme">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: "100%",
                        background:
                          "linear-gradient(90deg, #B45309 0%, #D97706 40%, #184E3A 100%)",
                        opacity: 0.85,
                      }}
                    />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-[2.5px] shadow-sm"
                      style={{ left: "92%", borderColor: "#184E3A" }}
                    />
                  </div>

                  <div className="flex justify-between text-[10px] font-medium text-theme-muted tabular-nums">
                    <span>0% Fora de ângulo</span>
                    <span>40% Mínimo</span>
                    <span>100% Enquadrado</span>
                  </div>
                </div>

                {/* Métricas em linha divisória única */}
                <div className="grid grid-cols-3 divide-x divide-[var(--border-subtle)] pt-1 text-center">
                  <div className="px-2">
                    <p className="text-[11px] text-theme-muted">Capturas</p>
                    <p className="text-base font-bold text-theme-primary tabular-nums mt-0.5">10</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[11px] text-theme-muted">Qualidade média</p>
                    <p className="text-base font-bold text-theme-primary tabular-nums mt-0.5">92%</p>
                  </div>
                  <div className="px-2">
                    <p className="text-[11px] text-theme-muted">Saúde</p>
                    <p className="text-base font-bold text-brand mt-0.5">Em dia</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pilares em faixa limpa */}
        <section className="py-12 sm:py-16 px-4 sm:px-6 bg-theme-surface border-t border-theme">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 md:divide-x md:divide-[var(--border-subtle)]">
            <div className="md:pr-6 space-y-2">
              <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center">
                <WifiOff className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-theme-primary">
                Trabalho contínuo no pasto
              </h3>
              <p className="text-xs sm:text-sm text-theme-secondary leading-relaxed">
                Fotos, movimentações e cadastros funcionam sem cobertura de rede e sincronizam ao
                retornar à sede.
              </p>
            </div>

            <div className="md:px-6 space-y-2">
              <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center">
                <ScanLine className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-theme-primary">
                Busca por apelido ou leitor
              </h3>
              <p className="text-xs sm:text-sm text-theme-secondary leading-relaxed">
                Localize o animal instantaneamente digitando o apelido, brinco ou aproximando um
                leitor eletrônico Bluetooth.
              </p>
            </div>

            <div className="md:pl-6 space-y-2">
              <div className="w-9 h-9 rounded-[10px] bg-brand-soft flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-sm text-theme-primary">
                Equipe e guarda compartilhada
              </h3>
              <p className="text-xs sm:text-sm text-theme-secondary leading-relaxed">
                Compartilhe fichas específicas com veterinários e colaboradores mantendo a
                propriedade e o histórico organizados.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-theme py-6 px-4 sm:px-6 bg-theme-bg text-xs text-theme-muted">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-semibold text-theme-primary">CattleCapture</span>
          <p>© {new Date().getFullYear()} CattleCapture · Captura e Curadoria de Dataset Bovino</p>
        </div>
      </footer>
    </div>
  );
}
