/**
 * Manifesto Nativo PWA (`src/app/manifest.ts`).
 *
 * Gera `/manifest.webmanifest` automaticamente no Next.js App Router,
 * permitindo instalação do aplicativo na tela inicial do Android e iOS.
 */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CattleCapture · Dataset ICC Bovino",
    short_name: "CattleCapture",
    description:
      "Plataforma de captura padronizada e validação por IA da condição corporal bovina (ICC/BCS).",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#090D16",
    theme_color: "#059669",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
