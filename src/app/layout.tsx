import type { Metadata } from "next";
import "./globals.css";

import { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

export const metadata: Metadata = {
  title: "CattleCapture - Análise Bovina",
  description: "Sistema de captura e avaliação de bovinos para determinar o momento ideal de abate.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}