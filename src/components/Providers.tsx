"use client";

import React from "react";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
