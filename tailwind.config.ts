import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "sans-serif"],
        serif: ["var(--font-source-serif)", "Source Serif Pro", "Georgia", "serif"],
      },
      colors: {
        // Paleta extraída en vivo de elproyectok.com (2026-06): fondo beige
        // #F5F0EB, texto #202020, CTA rojo K #C81E2E (píldora), grises cálidos.
        brand: {
          // Color principal CTA — rojo K del sitio web
          coral: "#C81E2E",
          "coral-dark": "#A3182A",
          "coral-light": "#E04250",
          // Texto principal (negro neutro del sitio, antes navy azulado)
          navy: "#202020",
          "navy-light": "#3D3D3D",
          // Textos secundarios (grises cálidos como la nav del sitio)
          secondary: "#5A5A5A",
          tertiary: "#8A8580",
          // Links — el sitio acentúa en rojo K, no en índigo
          link: "#C81E2E",
          // Fondos — beige cálido del sitio
          bg: "#F5F0EB",
          "bg-warm": "#EFE8DF",
          // Bordes sutiles
          border: "hsla(30, 10%, 7%, 0.08)",
        },
        // Los componentes usan slate-* por todas partes (bordes, textos
        // secundarios, fondos de tabla). Remapearlo a la paleta "stone"
        // (gris cálido) hace que TODA la app entone con el beige del sitio
        // sin tocar ni una clase en los componentes.
        slate: colors.stone,
      },
      borderRadius: {
        pill: "35px",
        "2xl": "16px",
        "3xl": "24px",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgba(0, 0, 0, 0.03)",
        md: "0 4px 6px -1px rgba(0, 0, 0, 0.04), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
        lg: "0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)",
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.06), 0 10px 10px -5px rgba(0, 0, 0, 0.02)",
      },
      fontSize: {
        "stat-xl": ["3.5rem", { lineHeight: "1", fontWeight: "700" }],
        "stat-lg": ["2.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        "stat-md": ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};

export default config;
