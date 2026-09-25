import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Adicionado para permitir acesso HMR do seu celular via rede local */
  allowedDevOrigins: [
    "192.168.1.5", 
    "http://192.168.1.5", 
    "https://192.168.1.5",
    "http://192.168.1.5:3000"
  ],
};

export default nextConfig;
