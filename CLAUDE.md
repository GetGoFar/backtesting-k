# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Comentarios y textos de UI en **español** (público objetivo español). El código sigue esa convención.

## Qué es

App web de **El Proyecto K** para educación financiera en inversión indexada. Empezó como un comparador de carteras (backtesting fondos indexados vs. gestión activa bancaria) y ha crecido a un conjunto de herramientas que comparten motor de datos, tema de marca y despliegue. En producción: **backtesting-k.vercel.app**.

## Comandos

```bash
npm run dev            # servidor de desarrollo (next dev)
npm run build          # build de producción
npm run lint           # next lint
npm run type-check     # tsc --noEmit  (strict, noUncheckedIndexedAccess)
npm test               # vitest run (toda la suite)
npm run test:watch     # vitest en watch

# Un solo test:
npx vitest run src/lib/backtest-engine.test.ts        # un fichero
npx vitest run -t "nombre del test"                    # por nombre
```

Tests con Vitest, colocados junto al código (`src/lib/*.test.ts`): `backtest-engine`, `liga-engine`, `liga-classify`. Config en `vitest.config.ts`.

### ⚠️ Entorno del agente Claude (Windows) — importante

- **El repo vive dentro de OneDrive** (`C:\Users\goovi\OneDrive\Documentos\Claude\backtesting-k`). OneDrive **trunca ficheros fuente** (los corta a media línea → errores de sintaxis que rompen todo el build) y provoca `Error UNKNOWN: read` (errno -4094) al arrancar `next dev`. **Si un backtest "no compila" o "no sale nada", sospechar corrupción PRIMERO**: `git diff <fichero-con-error>` normalmente muestra solo cola truncada → recuperar con `git checkout HEAD -- <fichero>`. (Recomendación abierta: mover el repo a `C:\dev\backtesting-k`, fuera de OneDrive.)
- **No hay `node`/`npm` en el PATH del agente** ni el preview puede arrancarlos (`spawn npm ENOENT`). Para type-check usar el node de Adobe:
  `& "C:\Program Files\Adobe\Adobe Creative Cloud Experience\libs\node.exe" node_modules\typescript\bin\tsc --noEmit`

## Despliegue

- Git remoto `origin = github.com/GetGoFar/backtesting-k`, rama **`master`**.
- **Push a `master` → Vercel despliega producción automáticamente.** Ramas → deploy previews.
- Confirma o haz push **solo cuando el usuario lo pida**; si estás en `master`, crea rama antes.
- `vercel.json` define un **cron** mensual que llama a `/api/liga/refresh` (día 1, 06:00) para recomputar la "Liga de fondos".
- Distintos deploys pueden usar distinta fuente de datos vía env var (ver `DATA_PROVIDER` abajo) sin tocar código.

## Arquitectura

Next.js 16 (App Router, Turbopack) · React 18 · TypeScript strict · Tailwind · Recharts · sin BBDD (datos en memoria + caché Redis).

**Patrón general:** cada herramienta = una página en `src/app/<tool>/page.tsx` + una o varias rutas en `src/app/api/<tool>/route.ts` + un motor puro en `src/lib/<tool>-engine.ts`. Los motores son funciones puras testeables; las rutas solo orquestan (validan input, cargan precios, llaman al motor). La UI principal (comparador de carteras) es `src/app/page.tsx`.

Herramientas (page + engine):
- **Backtest / comparador** — `page.tsx` → `lib/backtest-engine.ts` (`runBacktest`)
- **Momentum** — `momentum/` → `momentum-engine.ts`
- **Kray** — `kray/` → `kray-engine.ts`
- **Liga de fondos** — clasificación de fondos activos vs. índice → `liga-engine.ts` + `liga-classify.ts` + `liga-storage.ts` (persistida; refrescada por cron)
- **Jubilación / simulador de retiro** — `jubilacion/`, `simulador-retiro/` → `retirement-engine.ts` + `retirement-parametric.ts`
- **Equivalente** — `equivalente/` → `equivalente-engine.ts` + `equivalente-historical.ts`
- **Perfil por bandas** — `perfil-bandas-engine.ts`
- **Quiz Carteras K**, **cartera-analisis/backtest/seguimiento**, **kray**, **equivalente**: variantes de UI sobre estos motores.

**Access gate:** varias rutas y páginas van tras un muro de acceso (`acceso/`, `components/AccessGate.tsx`, `lib/access-codes.ts`, `lib/access-log.ts`). Rutas `api/campus/*` sirven a la versión embebida en el campus del alumno.

**Generación de informes:** PDF cliente con jsPDF (`lib/report-pdf.ts`, `report-scoring.ts`, `report-types.ts`, `components/ReportGeneratorModal.tsx`). Para informes con marca completa fuera de la app se usa el skill `proyectok-pdf` (ReportLab), no este código.

### Motor de datos (precios)

- **Fuente por defecto: EODHD.** El toggle Yahoo/EODHD se eliminó — `lib/data-source.ts` es hoy solo un wrapper de `fetch` por compatibilidad.
- **Abstracción de proveedor:** `lib/providers/` (`eodhd`, `twelvedata`, `financialdata`) con `getProvider()` seleccionado por env var **`DATA_PROVIDER`** (default `eodhd`); id desconocido cae a EODHD. Así otro deploy usa otra fuente + su API key sin tocar motor ni UI.
- **Carga y caché:** `lib/data-fetcher.ts` (`getMonthlyPrices`) → caché **memoria → Redis (Upstash)** vía `lib/kv-cache.ts`, con key segmentada por fuente (`<fundId>::eodhd`). No abusar del proveedor: siempre pasar por el data-fetcher.
- **Fondos:** catálogo en `lib/fund-database.ts`; NAVs de fondos españoles sin ticker en `src/data/spanish-funds.csv`. La Liga usa `src/data/liga-fondos.csv` y los CSV de ex-miembros del S&P en la raíz.
- **Contexto de request:** `lib/request-context.ts` (`runWithContext`) propaga la fuente de datos por la petición.

## Invariantes de cálculo (no romper)

- **CAGR TWRR:** el motor calcula CAGR por *time-weighted return*, no punto a punto.
- **Modos de valoración (`ValueMode`): `bruto` / `camino` (neta del camino) / `liquidar`.** El selector de la UI reescala la serie de patrimonio y las métricas. La serie por modo se construye en `lib/value-mode-series.ts` (`buildScaledSeries`), extraída de `PerformanceChart` para reutilizarla.
- **⚠️ CAGR por modo duplicado — mantener en sync:** la lógica `cagrByMode` vive en **`components/MetricsTable.tsx`** (KPI de cabecera "CAGR al liquidar") y está **replicada** en `lib/value-mode-series.ts` (`cagrByMode`, usada por `HorizonReturnsTable` fila "Desde inicio"). Ambas deben coincidir: ancla en `metrics.cagr`, escala por `scaleFactor`, anualiza sobre años exactos (días/365.25). Si cambias una, cambia la otra, o "Desde inicio" dejará de cuadrar con el KPI.
- **Rebalanceo por bandas:** la UI pasa el ancho de banda en % (p.ej. 50) y `page.tsx` lo convierte a decimal (`/100 → 0.5`) antes del motor. `checkBandsBreached` usa banda **relativa** (`|drift|/target > banda`).
- **Impuestos (IRPF):** `lib/tax-utils.ts` (`computeTaxOnGain`); impuesto diferido "pendiente" solo afecta al modo `liquidar`. Una cartera sin régimen fiscal hereda el de la cartera comparada para no "ganar" artificialmente al liquidar.

## Convenciones de código

- **TypeScript strict con `noUncheckedIndexedAccess`**: todo acceso por índice (`arr[0]`, `map[i]`) es `T | undefined` → hay que guardar/desestructurar con comprobación. Es el error de tipos más frecuente al añadir código.
- Alias de imports **`@/*` → `src/*`**.
- Componentes funcionales con hooks; `LoadingSpinner` / loading states en todo lo que espera datos.
- **Tema de marca elproyectok.com** (la app debe parecer parte de la web): fondo beige `#F5F0EB`, texto `#202020`, CTA rojo K `#C81E2E` en píldora, headings Source Serif + body Poppins. En `tailwind.config.ts` los grises `slate` están remapeados a `stone` (cálidos); usa tokens `brand-*`.
- **Colores SEMÁNTICOS de datos (no cambiar):** Azul `#1d4ed8` = cartera indexada/A · Rojo/Rosa `#e11d48` = cartera bancaria/B · Púrpura `#9333ea` = benchmark · Verde `#059669` positivo · Rojo `#dc2626` negativo.
- Cada métrica lleva `components/Tooltip.tsx` explicando qué significa. `Disclaimer.tsx` obligatorio al pie.
- La navegación lateral (`SidebarNav.tsx`, y variantes `KraySidebarNav`/`MomentumSidebarNav`) enumera secciones por `id`; al añadir una sección de resultados hay que registrar su `id` allí.

## Disclaimer (siempre visible)

"Esta herramienta tiene fines exclusivamente educativos. Las rentabilidades pasadas no garantizan resultados futuros. Los datos de fondos bancarios pueden no reflejar valores liquidativos exactos. Consulta siempre el folleto informativo de cada fondo. El Proyecto K no es una entidad de asesoramiento financiero regulada."
