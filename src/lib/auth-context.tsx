"use client";

/**
 * Contexto de Autenticação unificado sobre NextAuth v5 (`src/lib/auth-context.tsx`).
 *
 * Mantém exatamente a mesma interface `useAuth()` das páginas do sistema enquanto usa
 * sessão NextAuth HttpOnly + cache offline local.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { User } from "./types";
import {
  apiFetch,
  clearStoredToken,
  getCachedUser,
  setCachedUser,
  invalidateApiCache,
} from "./api";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  refreshSession: (force?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const [user, setUser] = useState<User | null>(() => getCachedUser());
  const [loading, setLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (force = true) => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = getCachedUser();
      if (cached) {
        setUser(cached);
        setLoading(false);
        return;
      }
    }

    try {
      if (force) {
        await update().catch(() => {});
      }
      const data = await apiFetch<{ user: User }>("/api/auth/me");
      if (data?.user) {
        setUser(data.user);
        setCachedUser(data.user);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        clearStoredToken();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [update]);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && session?.user) {
      const sessionUser: User = {
        id: session.user.id,
        name: session.user.name || "Operador",
        email: session.user.email || "",
        role: session.user.role || "USER",
      };
      setUser((prev) => prev || sessionUser);
      setCachedUser(sessionUser);
      setLoading(false);
      void refreshSession(false);
      return;
    }

    // Sem sessão NextAuth ativa
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = getCachedUser();
      setUser(cached);
    } else {
      clearStoredToken();
      setUser(null);
    }
    setLoading(false);
  }, [session, status, refreshSession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearStoredToken();
      setUser(null);
      setLoading(false);
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const isAuthRoute = path.startsWith("/login") || path.startsWith("/register") || path === "/";
        if (!isAuthRoute) {
          window.location.href = "/login";
        }
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!res || res.error) {
        throw new Error("E-mail ou senha inválidos.");
      }

      invalidateApiCache();
      const me = await apiFetch<{ user: User }>("/api/auth/me");
      if (!me?.user) {
        throw new Error("Não foi possível carregar o perfil após login.");
      }
      setCachedUser(me.user);
      setUser(me.user);
      return me.user;
    } finally {
      setLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string): Promise<User> => {
    setLoading(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: { name, email, password },
      });
      return await login(email, password);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    void signOut({ callbackUrl: "/login" });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        isAdmin: user?.role === "ADMIN",
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser utilizado dentro de um <AuthProvider />");
  }
  return context;
}
