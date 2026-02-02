import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
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
    <html lang="es" className={dmSans.variable}>
      <body
        className={`${dmSans.className} min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
