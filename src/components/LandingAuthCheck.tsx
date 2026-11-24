"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Redireciona usuários autenticados da landing page diretamente para o dashboard.
 */
export function LandingAuthCheck() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, loading, router]);

  return null;
}
