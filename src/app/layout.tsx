import type { Metadata, Viewport } from "next";
import { SyncManager } from "./SyncManager";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  // Permite zoom de acessibilidade mas previne zoom involuntário em inputs
  // (o fix real do zoom está no globals.css com font-size: 16px nos inputs)
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "CattleCapture",
  description: "Sistema de captura fotográfica de gado para dataset de IA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CattleCapture",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <ToastProvider>
          {children}
          <SyncManager />
        </ToastProvider>
      </body>
    </html>
  );
}
