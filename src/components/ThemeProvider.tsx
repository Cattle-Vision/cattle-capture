"use client";

/**
 * Gerenciador de Tema Claro / Escuro e Registro PWA (`src/components/ThemeProvider.tsx`).
 *
 * Responsabilidades:
 * - Sincronizar o tema (`light` | `dark`) com a classe `.dark` no elemento `<html>`
 *   e persistir a escolha do usuário em `localStorage` (`cattle-theme`).
 * - Registrar o Service Worker (`/sw.js`) para habilitar instalação PWA no celular.
 */
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem("cattle-theme") as Theme | null;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";

    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");

    // Registro do Service Worker para PWA Mobile
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("cattle-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
