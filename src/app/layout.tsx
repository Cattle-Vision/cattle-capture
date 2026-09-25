import type { Metadata, Viewport } from "next";
import { SyncManager } from "./SyncManager";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#16a34a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "CattleCapture v2",
  description: "Sistema PWA Offline First",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        {children}
        <SyncManager />
      </body>
    </html>
  );
}
