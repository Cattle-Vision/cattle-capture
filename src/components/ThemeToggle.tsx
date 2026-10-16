"use client";

/**
 * Botão Alternador de Tema Claro / Escuro (`src/components/ThemeToggle.tsx`).
 */
import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      title={isDark ? "Modo Claro" : "Modo Escuro"}
      className={`p-2 sm:p-2.5 rounded-xl border border-theme bg-theme-surface hover:bg-theme-surface-2 text-theme-secondary hover:text-theme-primary transition active:scale-95 shrink-0 inline-flex items-center justify-center ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}

export default ThemeToggle;
