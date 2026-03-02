import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Backtesting Tool — El Proyecto K | Comparador de Carteras",
  description:
    "Herramienta de backtesting para comparar carteras de inversión indexada frente a fondos de gestión activa de la banca española. Analiza rentabilidades históricas, volatilidad, ratios Sharpe y Sortino, y el impacto real de las comisiones en tu patrimonio a largo plazo.",
  keywords: [
    "backtesting",
    "inversión indexada",
    "fondos indexados",
    "gestión pasiva",
    "El Proyecto K",
    "comparador fondos",
    "TER",
    "comisiones fondos",
    "Vanguard",
    "iShares",
    "fondos bancarios España",
    "FIRE",
    "independencia financiera",
    "cartera Bogleheads",
    "simulador inversión",
    "rentabilidad histórica",
  ],
  authors: [{ name: "El Proyecto K" }],
  creator: "El Proyecto K",
  publisher: "El Proyecto K",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "Backtesting Tool — El Proyecto K",
    description:
      "Compara carteras de inversión indexada vs gestión activa bancaria con datos históricos reales. Descubre cuánto te cuestan las comisiones.",
    type: "website",
    locale: "es_ES",
    siteName: "El Proyecto K",
  },
  twitter: {
    card: "summary_large_image",
    title: "Backtesting Tool — El Proyecto K",
    description:
      "Compara carteras indexadas vs fondos bancarios. Visualiza el impacto de las comisiones.",
  },
  alternates: {
    canonical: "/",
  },
  category: "finance",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={poppins.variable} suppressHydrationWarning>
      <body
        className={`${poppins.className} min-h-screen bg-brand-bg antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
