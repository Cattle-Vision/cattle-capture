import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { SyncManager } from "./SyncManager";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "CattleCapture · Visão Computacional & Dataset ICC Bovino",
  description:
    "Plataforma de captura padronizada e validação por IA da condição corporal bovina (ICC/BCS).",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cattle Capture",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Providers>
          <ToastProvider>
            {children}
            <SyncManager />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
