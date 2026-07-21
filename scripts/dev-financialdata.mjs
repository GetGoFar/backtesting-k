// =============================================================================
// Dev server con financialdata.net como proveedor de datos.
// =============================================================================
// Uso:  npm run dev:fd            (puerto 3101 por defecto)
//       npm run dev:fd -- 3102    (otro puerto)
//
// Levanta la MISMA app pero con DATA_PROVIDER=financialdata, en otro puerto,
// para poder probarla a la vez que la versión EODHD (npm run dev, puerto 3100)
// sin que se pisen. El proveedor se fija aquí; no se cambia desde la web.
// Necesita FINANCIALDATA_API_TOKEN en .env.local.
// =============================================================================

import { spawn } from "node:child_process";

process.env.DATA_PROVIDER = "financialdata";
// Carpeta de build propia → no choca con el lock de `npm run dev` (EODHD),
// así corren las dos instancias a la vez en puertos distintos.
process.env.NEXT_DIST_DIR = ".next-fd";
const port = process.argv[2] || "3101";

console.log(`\n→ Arrancando con DATA_PROVIDER=financialdata en http://localhost:${port}\n`);

const child = spawn("next", ["dev", "-p", port], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
