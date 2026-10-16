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
    "/api/upload": ["./identifier.onnx"],
    "/api/ai/score": ["./identifier.onnx"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

