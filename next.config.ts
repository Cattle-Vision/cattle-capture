import type { NextConfig } from "next";

/**
 * Configuração do Next.js para o CattleCapture (Monolito Next.js + Prisma + ONNX).
 * Inclui cache imutável para modelos Edge AI locais (`/models/*`, `/ort/*`) e
 * tracing dos modelos ONNX nas Serverless Functions de API.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.5", "127.0.0.1", "localhost"],
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  outputFileTracingIncludes: {
    "/api/photos/[[...slug]]": ["./identifier.onnx", "./models/*.onnx"],
    "/api/admin/[[...slug]]": ["./identifier.onnx", "./models/*.onnx"],
    "/api/animals/[[...slug]]": ["./identifier.onnx", "./models/*.onnx"],
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
      ".venv/**",
      "*.md",
    ],
  },
  async headers() {
    return [
      {
        source: "/models/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/ort/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
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
