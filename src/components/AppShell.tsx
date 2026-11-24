"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  LayoutGrid,
  ScanLine,
  PlusCircle,
  ShieldCheck,
  User as UserIcon,
  WifiOff,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/components/ThemeProvider";
import { BrandMark } from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

export interface AppShellProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
}

export function AppShell({
  title,
  subtitle,
  showBack = false,
  backHref,
  onBack,
  actions,
  children,
  maxWidth = "xl",
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAdmin, isAuthenticated } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [offline, setOffline] = React.useState(false);

  React.useEffect(() => {
    const sync = () => setOffline(typeof navigator !== "undefined" ? !navigator.onLine : false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const handleBack = () => {
    if (onBack) onBack();
    else if (backHref) router.push(backHref);
    else router.back();
  };

  const navItems = [
    {
      href: "/dashboard",
      label: "Rebanho",
      icon: LayoutGrid,
      active: pathname === "/dashboard",
    },
    {
      href: "/identify",
      label: "Identificar",
      icon: ScanLine,
      active: pathname.startsWith("/identify"),
    },
    {
      href: "/animal/new",
      label: "Cadastrar",
      icon: PlusCircle,
      active: pathname === "/animal/new",
    },
    ...(isAdmin
      ? [
          {
            href: "/admin",
            label: "Gestão",
            icon: ShieldCheck,
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ];

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Operador";
  const initials = (user?.name || "OP")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");

  const maxWClass =
    maxWidth === "sm"
      ? "max-w-xl"
      : maxWidth === "md"
        ? "max-w-3xl"
        : maxWidth === "lg"
          ? "max-w-5xl"
          : maxWidth === "full"
            ? "max-w-none"
            : "max-w-6xl";

  return (
    <div className="min-h-[100dvh] flex bg-theme-bg text-theme-primary">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 bg-theme-surface border-r border-theme z-30">
        <div className="h-16 px-5 flex items-center gap-2.5 border-b border-theme">
          <Link href="/dashboard" className="inline-flex items-center gap-2.5 group">
            <BrandMark className="w-8 h-8 transition-transform group-hover:scale-95" />
            <div>
              <span className="font-bold text-[16px] tracking-tight text-theme-primary block leading-none">
                Cattle<span style={{ color: "var(--color-brand-light)" }}>Capture</span>
              </span>
              <span className="text-[10px] font-medium text-theme-muted block mt-1">
                Dataset Bovino
              </span>
            </div>
          </Link>
        </div>

        <nav aria-label="Menu principal" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-semibold transition ${
                  item.active
                    ? "bg-brand text-white shadow-xs"
                    : "text-theme-secondary hover:text-theme-primary hover:bg-theme-surface-2"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-theme space-y-2">
          {offline && (
            <div className="px-3 py-2 rounded-[10px] bg-amber-500/12 border border-amber-500/25 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Sem conexão</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] text-xs font-semibold text-theme-secondary hover:text-theme-primary hover:bg-theme-surface-2 transition"
          >
            <span>{theme === "dark" ? "Modo escuro" : "Modo claro"}</span>
            {theme === "dark" ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
          </button>

          <Link
            href="/profile"
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] border transition ${
              pathname.startsWith("/profile")
                ? "border-emerald-700/40 bg-theme-surface-2"
                : "border-transparent hover:bg-theme-surface-2"
            }`}
          >
            <span
              className="w-8 h-8 rounded-[8px] text-white text-xs font-bold flex items-center justify-center shrink-0"
              style={{ backgroundColor: "var(--color-brand)" }}
            >
              {initials || <UserIcon className="w-4 h-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-theme-primary truncate">{user?.name || firstName}</p>
              <p className="text-[10px] text-theme-muted truncate">
                {isAdmin ? "Administrador" : "Operador"}
              </p>
            </div>
          </Link>
        </div>
      </aside>

      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="glass-header sticky top-0 z-20">
          <div className={`${maxWClass} mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3`}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {showBack ? (
                <button
                  type="button"
                  onClick={handleBack}
                  aria-label="Voltar"
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center text-theme-primary bg-theme-surface hover:bg-theme-surface-2 border border-theme active:scale-95 transition shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              ) : (
                <Link
                  href="/dashboard"
                  className="lg:hidden inline-flex items-center shrink-0"
                  aria-label="Painel"
                >
                  <BrandMark className="w-8 h-8" />
                </Link>
              )}

              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-theme-primary truncate tracking-tight leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-[11px] sm:text-xs text-theme-secondary truncate mt-0.5 leading-tight">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {actions}

              <div className="lg:hidden flex items-center gap-1.5">
                <ThemeToggle />
                <Link
                  href="/profile"
                  aria-label="Perfil"
                  className={`w-9 h-9 rounded-[10px] border flex items-center justify-center text-xs font-bold transition ${
                    pathname.startsWith("/profile")
                      ? "border-emerald-700/40 bg-theme-surface-2"
                      : "border-theme bg-theme-surface hover:bg-theme-surface-2"
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-[6px] text-white text-[10px] font-bold flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-brand)" }}
                  >
                    {initials || <UserIcon className="w-3.5 h-3.5" />}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </header>

        <main className={`flex-1 ${maxWClass} mx-auto w-full px-3 sm:px-6 py-5 pb-24 lg:pb-10`}>
          {children}
        </main>
      </div>

      {isAuthenticated && (
        <nav
          aria-label="Navegação inferior"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-theme bg-theme-surface/95 backdrop-blur-md px-2 pt-1.5 flex items-center justify-center"
          style={{ paddingBottom: "max(0.55rem, env(safe-area-inset-bottom))" }}
        >
          <div className="w-full max-w-lg flex items-center justify-around gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 min-h-[48px] flex flex-col items-center justify-center py-1 px-1 rounded-[10px] transition active:scale-95 ${
                    item.active
                      ? "bg-brand-soft font-bold"
                      : "text-theme-secondary hover:text-theme-primary font-medium"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] mt-1 leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default AppShell;
