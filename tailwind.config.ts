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
          bg: "#F9FAFB",
          "bg-warm": "#f4f3ef",
          // Bordes sutiles
          border: "hsla(0, 0%, 7%, 0.11)",
        },
      },
      borderRadius: {
        "pill": "35px",
      },
    },
  },
  plugins: [],
};

export default config;
