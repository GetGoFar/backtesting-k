import type { Metadata } from "next";
import { Poppins, Source_Serif_4 } from "next/font/google";
import Script from "next/script";
import "./globals.css";

// Contenedor GTM de El Proyecto K. Cargar el MISMO contenedor que la web padre
// permite (con la medición cross-domain activada en GA4) recuperar el tiempo de
// interacción real del simulador embebido en iframe y los eventos de embudo.
const GTM_ID = "GTM-T25FZ4G4";
const GTM_ENABLED = process.env.NODE_ENV === "production";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
  variable: "--font-source-serif",
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
    <html lang="es" className={`${poppins.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        {GTM_ENABLED && (
          <Script id="gtm-base" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
          </Script>
        )}
      </head>
      <body
        className={`${poppins.className} min-h-screen bg-brand-bg antialiased`}
      >
        {GTM_ENABLED && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        )}
        {children}
      </body>
    </html>
  );
}
