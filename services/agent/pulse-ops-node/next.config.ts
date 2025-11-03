import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // En Next.js 16, instrumentation.ts se carga automáticamente
  // No necesitas configuración adicional
  
  // Output standalone para Docker (cuando lo necesites)
  // output: "standalone",
};

export default nextConfig;
