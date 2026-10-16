import type { NextConfig } from "next";

/**
 * Configuração do Next.js otimizada para deploy Serverless na Vercel.
 * - `serverExternalPackages`: impede que o bundler tente empacotar binários C++ nativos
 *   (`sharp` e `onnxruntime-node`), garantindo resolução nativa no runtime Node.js da Vercel.
 * - `outputFileTracingIncludes`: garante que o modelo `identifier.onnx` seja incluído
 *   na função serverless de upload caso o runtime ONNX seja acionado.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.5", "127.0.0.1", "localhost"],
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  outputFileTracingIncludes: {
    "/api/photos/[[...slug]]": ["./identifier.onnx"],
    "/api/admin/[[...slug]]": ["./identifier.onnx"],
    "/api/animals/[[...slug]]": ["./identifier.onnx"],
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

