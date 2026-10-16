"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Componente leve para redirecionar usuários autenticados da landing page para o dashboard
 * mantendo a landing page como página 100% estática (SSG), economizando slots de Serverless Functions.
 */
export function LandingAuthCheck() {
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session?.user) {
      router.replace("/dashboard");
    }
  }, [session, router]);

  return null;
}
