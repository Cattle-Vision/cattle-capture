"use client";

/**
 * Gerenciador de Tema Claro / Escuro e Registro PWA (`src/components/ThemeProvider.tsx`).
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
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const initial: Theme =
      stored === "dark" || stored === "light"
        ? stored
        : mediaQuery.matches
        ? "dark"
        : "light";

    setThemeState(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");

    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      const currentStored = localStorage.getItem("cattle-theme");
      if (!currentStored) {
        const next = e.matches ? "dark" : "light";
        setThemeState(next);
        document.documentElement.classList.toggle("dark", next === "dark");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    // Registro do Service Worker para PWA Mobile
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    localStorage.setItem("cattle-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  const toggleTheme = () => {
    const isCurrentlyDark = document.documentElement.classList.contains("dark");
    setTheme(isCurrentlyDark ? "light" : "dark");
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
