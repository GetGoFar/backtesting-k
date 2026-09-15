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

- **El repo YA NO está en OneDrive**: vive en `C:\dev\backtesting-k` (mudado
  jul-2026). La copia antigua en `OneDrive\Documentos\Claude\backtesting-k` está
  obsoleta — no editarla. Lo de abajo se conserva por si alguien vuelve a
  trabajar sobre una copia sincronizada.
- **`npm` no funciona a secas**: la política de ejecución de PowerShell bloquea
  `npm.ps1`. Usar **`npm.cmd`**. Node vive en `C:\Program Files\nodejs` y puede
  no estar en el PATH del agente: `$env:PATH = "C:\Program Files\nodejs;$env:PATH"`
  antes de instalar (los scripts de post-instalación de esbuild/sharp llaman a
  `node` y fallan sin eso).
- **La API NO está tras el muro de acceso, la UI sí.** Para verificar cálculos,
  `POST http://localhost:3007/api/backtest` directamente — es la única forma de
  ejercitar el motor sin código de acceso. `GET /api/funds` lista fondos válidos.
- **Verificar un despliegue**: NO usar `curl` contra backtesting-k.vercel.app
  (devuelve ~14 bytes, no la página → falso negativo silencioso). Usar el
  navegador y comprobar que el **CSS global** contiene una clase nueva del
  cambio (Tailwind solo emite las que se usan). Estado real de los deploys:
  Vercel vía `claude-in-chrome`, vercel.com/consultoria-9043s-projects/backtesting-k.
- **El repo vivía dentro de OneDrive** (`C:\Users\goovi\OneDrive\Documentos\Claude\backtesting-k`). OneDrive **trunca ficheros fuente** (los corta a media línea → errores de sintaxis que rompen todo el build) y provoca `Error UNKNOWN: read` (errno -4094) al arrancar `next dev`. **Si un backtest "no compila" o "no sale nada", sospechar corrupción PRIMERO**: `git diff <fichero-con-error>` normalmente muestra solo cola truncada → recuperar con `git checkout HEAD -- <fichero>`. (Recomendación abierta: mover el repo a `C:\dev\backtesting-k`, fuera de OneDrive.)
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

## ✅ Resuelto (jul-2026): el estilo de aportación contaminaba 6 métricas

**La hipótesis original era falsa y quedó descartada por test.** Se creía que los
días previos a la primera aportación entraban como retornos del **0 %**. No es
así: el guard `previousTotalValue > 0` de `simulatePortfolioDaily` ya los omite
(test *"no registra retornos de días sin capital invertido"*). La causa real era
otra.

**Causa real: el retorno del día de aportación se diluía.** La aportación se
aplica DESPUÉS del crecimiento del día, pero el retorno se calculaba como
`valorFinal / (valorPrevio + aportación)`. Sumar el capital nuevo al denominador
encoge el retorno por un factor `P/(P+C)`: con poco capital acumulado lo aplasta
casi a cero (medido: 0,000875 donde tocaba 0,001769, **la mitad**). Cada mes
inyectaba así una observación falsa en la serie time-weighted.

**Arreglo:** restar el capital nuevo del NUMERADOR, no sumarlo al denominador —
`(valorFinal − aportaciónHoy) / valorPrevio`. Es el tratamiento TWR estándar de
un flujo de caja a cierre y conserva el coste fiscal del rebalanceo del día.

**Segundo defecto, del mismo origen:** el filtro de "días limpios" de
`volatilityReturns` indexaba `dailyTimeSeries` con el índice de `dailyReturns`.
Como `dailyReturns` es más corto en cuanto se omite un día sin capital, las dos
series se desalineaban y el filtro comparaba contra la fecha equivocada en toda
cartera que empezara desde cero. Ahora el día previo se busca por **fecha**.

Verificado contra la API con VWCE 2019-2024 (mismo fondo, solo cambia el estilo).
Con las ventanas de exposición **alineadas**, la convergencia es exacta:

| | divergencia antes | divergencia después |
|---|---|---|
| Volatilidad | −0,039 pp | **0,0000 pp** |
| Skewness | +0,695 pp | **0,0000 pp** |
| Max Drawdown TWR | −0,114 pp | **0,0000 pp** |

**Matiz que queda abierto (decisión de producto, no bug):** una cartera que
empieza con 0 € anualiza su CAGR sobre la ventana completa, incluidos los días
previos a su primera aportación, en los que no existía. Con VWCE eso deja ~7 días
muertos y un residuo de **−0,045 pp de CAGR** (y el Sharpe/Sortino que derivan de
él). Corregirlo obligaría a anualizar A y B sobre ventanas distintas, lo que rompe
la comparabilidad que buscan las fechas comunes. Sin decidir.

**Verificar así** (sin pasar por el muro de acceso, que bloquea la UI pero NO la
API): `npm run dev -- -p 3007` y `POST /api/backtest` con dos carteras del mismo
fondo, una con `initialAmount: 0` + `monthlyContribution`, otra con capital
inicial. Ojo: `effectiveDateRange` recorta `startDate` a la vida del fondo (VWCE
empieza en 2019-07-25), así que para comparar ventanas hay que mirar ese campo,
no el `startDate` enviado.

## Invariantes de cálculo (no romper)

- **CAGR TWRR:** el motor calcula CAGR por *time-weighted return*, no punto a punto.
- **Dos Max Drawdown, no uno.** `maxDrawdown` mide el PATRIMONIO (money-weighted):
  con aportaciones el dinero nuevo amortigua la caída y sale artificialmente
  suave (−19,14 % vs −4,37 % para el mismo fondo). `maxDrawdownTWR` mide la
  ESTRATEGIA sobre el crecimiento de 1€ encadenado, y es el comparable entre
  carteras. Ojo al presentarlos juntos: además del money/time-weighted hay una
  **segunda diferencia**, el TWR usa datos DIARIOS y el otro los cierres del
  periodo mostrado (normalmente mensuales), así que el TWR sale más profundo
  incluso sin aportaciones. Está documentado en el tooltip; no decir que
  "coinciden".
- **Retorno diario = time-weighted.** Mide la ESTRATEGIA, no el patrimonio. El
  capital aportado se RESTA del valor final del día; nunca se suma al valor
  inicial (ver sección de arriba: sumarlo diluía el retorno por `P/(P+C)`). Los
  días sin capital invertido no generan observación — no son retornos del 0 %.
- **Aportaciones por cartera:** `Portfolio` admite `initialAmount`,
  `monthlyContribution` y `contributionRebalance` propios; si son `undefined`
  hereda los globales de `BacktestConfig`. Las **fechas son comunes a propósito**
  (con periodos distintos el eje del gráfico y la correlación A-B no significan
  nada). El motor no cambió por dentro: `simulatePortfolioDaily` ya los recibía
  como parámetros.
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

## Enlace profundo desde el Kopiloto de ATARAXIA (`/?k=…`)

El copiloto de la membresía (repo `ataraxia-bot`, `lib/backtest.js`) traduce
peticiones en lenguaje natural ("compara 60 % MSCI World y 40 % bonos euro con
el All-World, 10.000 € y 300 €/mes") a carteras del comparador y enlaza aquí.

- **Contrato:** `/?k=<base64url(JSON)>`, versión `v: 1`, definido y validado en
  `src/lib/kopiloto-link.ts` (tests en `kopiloto-link.test.ts`). Cada cartera
  (`a`/`b`) es o un `preset` (id de `portfolio-presets`) o `holdings`
  `[{fundId, weight}]`; además `initial`, `monthly`, `start`/`end` (`YYYY-MM`),
  `benchmark` (`bm:<id>` | `preset:<id>`) y `run` (lanza el backtest al cargar).
  Todo lo que no valide se descarta con aviso, nunca rompe.
- **Carga:** `page.tsx` lo lee en un `useEffect` al montar y lo inyecta en los
  `PortfolioBuilder` por la misma vía que "Copiar a A/B" (`importData` + `nonce`,
  con `keepName` para no añadir "(copia)"). Auto-run solo cuando los builders
  reportan EXACTAMENTE los holdings importados (no los restaurados del
  localStorage). Después limpia el parámetro de la URL con `replaceState`.
- **Muro de acceso:** `middleware.ts` conserva el query string en `?next=`
  (antes se perdía y el código de acceso devolvía a `/` a secas); `/acceso`
  solo acepta destinos relativos.
- **Catálogo para el copiloto:** `GET /api/kopiloto/catalogo` (público) devuelve
  fondos (universo del campus + todo indexado sin banco, sin `stock-*`),
  presets visibles en el campus y benchmarks, ordenado por id para que el
  prompt del bot se cachee. El bot lo descarga en caliente y guarda una copia
  (`lib/catalogo.snapshot.json`, se refresca con `scripts/actualizar-catalogo.js`).
  Si añades fondos o presets, el copiloto los ve solo.
