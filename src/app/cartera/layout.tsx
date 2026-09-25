import type { Metadata } from "next";

// Título de la pestaña del navegador para esta sección del Laboratorio K (las páginas son de cliente y no
// pueden exportar metadata; el layout raíz sigue diciendo "Backtesting Tool" para el resto de la app).
export const metadata: Metadata = { title: "Mi cartera · Laboratorio K", robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
