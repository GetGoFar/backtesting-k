/** @type {import('next').NextConfig} */
const nextConfig = {
  // Carpeta de build. Por defecto ".next". Se puede sobreescribir con
  // NEXT_DIST_DIR para correr una segunda instancia de dev (p.ej. el proveedor
  // financialdata en otra carpeta/puerto) sin chocar con el lock de la primera.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        // Permitir embeber /simulador-retiro como iframe en elproyectok.com
        // (y dominios relacionados). Sin esto, X-Frame-Options por defecto
        // o políticas de embedder de Vercel pueden bloquear el iframe.
        source: "/simulador-retiro",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://elproyectok.com https://*.elproyectok.com;",
          },
          // X-Frame-Options no soporta múltiples orígenes — lo dejamos sin
          // setear para que CSP frame-ancestors mande. CSP tiene prioridad
          // en navegadores modernos.
        ],
      },
    ];
  },
};

export default nextConfig;
