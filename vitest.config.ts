import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mismo alias que tsconfig ("@/*" → "src/*"), para testar módulos que lo usan.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
