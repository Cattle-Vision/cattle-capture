import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cattle Capture",
  description: "Sistema de captura e avaliação de bovinos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
