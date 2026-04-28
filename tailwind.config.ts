import type { Config } from "tailwindcss";

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
      },
      colors: {
        brand: {
          // Color principal CTA (coral/rojo del sitio web)
          coral: "#E24E42",
          "coral-dark": "#c93d32",
          "coral-light": "#f06b62",
          // Navy oscuro para textos y headers
          navy: "#101828",
          "navy-light": "#1D2939",
          // Textos secundarios
          secondary: "#475467",
          tertiary: "#98A2B3",
          // Links
          link: "#444CE7",
          // Fondos
          bg: "#FAFBFC",
          "bg-warm": "#f4f3ef",
          // Bordes sutiles
          border: "hsla(0, 0%, 7%, 0.08)",
        },
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
