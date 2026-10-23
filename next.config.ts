import type { NextConfig } from "next";

/**
 * Configuração do Next.js otimizada para deploy Serverless na Vercel.
 * - `serverExternalPackages`: impede que o bundler tente empacotar binários C++ nativos
 *   (`sharp` e `onnxruntime-node`), garantindo resolução nativa no runtime Node.js da Vercel.
 * - `outputFileTracingIncludes`: garante que o modelo `identifier.onnx` seja incluído
 *   estritamente nas funções serverless de fotos e gestão que executam a inferência IA.
 * - `outputFileTracingExcludes`: remove binários de desenvolvimento, compiladores e caches
 *   pesados dos bundles das funções serverless para mantê-las enxutas (< 50 MB) e
 *   respeitar o limite de 10 GB de Deployment Storage da Vercel.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.5", "127.0.0.1", "localhost"],
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/photos/[[...slug]]": ["./identifier.onnx"],
    "/api/admin/[[...slug]]": ["./identifier.onnx"],
    "/api/animals/[[...slug]]": ["./identifier.onnx"],
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@swc/core-win32-x64-msvc",
      "node_modules/@esbuild",
      "node_modules/typescript",
      "node_modules/terser",
      "node_modules/webpack",
      ".next/cache/**",
      "storage/uploads/**",
      "*.md",
    ],
  },
  async rewrites() {
    return [
      { source: "/api/upload", destination: "/api/photos/upload" },
      { source: "/api/ai/score", destination: "/api/photos/score" },
      { source: "/api/export", destination: "/api/admin/export" },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
