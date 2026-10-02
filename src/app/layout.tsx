import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { SyncManager } from "./SyncManager";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const metadata: Metadata = {
  title: "CattleCapture",
  description: "Captura da traseira do gado para dataset de índice de condição corporal",
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
