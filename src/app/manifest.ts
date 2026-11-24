import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CattleCapture · Dataset Bovino",
    short_name: "CattleCapture",
    description:
      "Plataforma de coleta fotográfica anatômica padronizada e curadoria de dataset bovino com IA de identificação.",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0D110F",
    theme_color: "#184E3A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
