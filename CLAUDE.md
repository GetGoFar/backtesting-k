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
- **Los previews necesitan `EODHD_API_TOKEN` en el ámbito Preview.** Las
  variables de Vercel se dan por entorno; si la clave está solo en Production,
  cada deploy de rama sale mudo: la búsqueda devuelve `[]` y los precios
  también, así que parece un problema de datos. Desde sep-2026 la app lo dice
  en alto (`lib/eodhd-config.ts` → aviso en `/api/search`, `/api/data-range` y
  `/api/backtest`) en vez de fallar en silencio.
- **¿Está una ruta de API en producción?** `curl -s -o /dev/null -w "%{http_code}"
  -X POST https://backtesting-k.vercel.app/api/<ruta> -d '{}'`: **404** = no está
  desplegada; **400/405** = sí está (validó el body). Es la forma rápida de
  descartar "no funciona" cuando en realidad es "no se ha subido" — pasó en
  sep-2026 con `/api/ter`. En los **previews de rama** esto NO sirve: la
  protección de despliegue de Vercel devuelve **401** a cualquier petición
  anónima (la página da 302 hacia el muro de acceso). El preview hay que abrirlo
  en un navegador con sesión de Vercel.
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

**Modo campus:** `isCampusMode()` (`lib/campus-client.ts`) se activa con
`?campus=1` o dentro de un iframe, y **se recuerda en `sessionStorage`** durante
toda la sesión del navegador (ojo al probar: una visita con `?campus=1` deja el
resto de pestañas en modo campus hasta cerrar). Ahí se ocultan los presets de
consultoría, el botón de informe PDF y —desde sep-2026— la granularidad
**Diario**: al alumno solo se le ofrece mensual y trimestral.

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
- **Primer mes completo (sep-2026):** el análisis NUNCA empieza en un mes a
  medias. Si el primer dato de un activo se pierde más de 3 días hábiles del
  mes (`primerMesCompletoDesde` en `date-utils.ts`), ese mes se descarta y se
  arranca el día 1 del siguiente. Motivo: el activo joven estrenaba con cuatro
  días mientras el otro contaba el mes entero (junio 2016: L&G Gold Mining
  +22,7 % contra +2,0 % del Schroder ISF Global Gold, que salió el día 29). Se
  aplica en los DOS sitios que fijan el inicio —
  `findCommonDateRangeForPortfolios` (rango común) y `findCommonDailyDateRange`
  (por cartera, también con el rango común desactivado)— para que lo hereden
  cabecera, patrimonio, horizontes, métricas por activo, mapas de calor,
  drawdowns y rolling. Deja un aviso `type: "partial_month"` que la pantalla
  pinta bajo el rango efectivo, en "Información sobre los datos" y en el PDF.
- **La correlación es SIEMPRE mensual**, sea cual sea `displayGranularity`:
  cabecera, matriz, correlación promedio y la del benchmark. En diario, un
  fondo y un ETF del mismo subyacente salen artificialmente descorrelacionados
  (0,44 frente a 0,95) porque no fijan precio a la misma hora. Para eso
  `BacktestResult` lleva `monthlyTimeSeries` además de `timeSeries`. Beta,
  tracking error y capture ratios SÍ siguen la granularidad elegida.
- **Los dos Max DD se etiquetan con su base:** "Max Drawdown (cierres
  mensuales)" en la cabecera y en la tabla de drawdowns (la etiqueta sigue a la
  granularidad), "Max DD (diario)" en Métricas por activo. Sin la etiqueta,
  −41,8 % en un sitio y −47,1 % en otro parece un error de la app.
- **La diversificación se mide por RIESGO, no contando activos.** La nota del
  informe usa `BacktestResult.diversification`: cuánto baja la volatilidad de la
  cartera respecto a la media ponderada de las de sus activos
  (`removed = 1 − σ_cartera / Σ(wᵢ·σᵢ)`). Contar activos, clases o categorías
  medía variedad de etiquetas, no diversificación: VWCE + IWDA al 50 % son "dos
  activos" y eliminan el 0,2 % del riesgo, mientras que un 60/40 de dos fondos
  elimina el 17,2 %. Un solo activo da 0 por definición. Escala: 0 % → 0 y 50 %
  → 10 (medidas sep-2026: K3 Inbestme 44,1 %, K3 Sectorial USA 36,8 %).
  Se calcula SIEMPRE en base mensual, como la correlación, porque la
  diversificación depende del horizonte (el mismo 60/40 daba 30,5 % en diario y
  17,2 % en mensual) y una nota no puede cambiar al tocar un desplegable. Con
  pesos de la cartera, no con `AssetMetrics.weight`, que deduplica entre A y B.
- **El TER que se enseña son GASTOS CORRIENTES (OCF), no el coste total.** La
  fuente automática es EODHD y, si no tiene el fondo, el "Ongoing charge" de
  FT. Eso NO incluye los costes de transacción, así que Morningstar y el DFI
  publican un "coste total PRIIPS" mayor: Unicaja RV USA A (ES0181407000) da
  1,58 % de gastos corrientes frente a 2,21 % de coste PRIIPS. No es un fallo de
  parseo (verificado sep-2026: FT dice literalmente 1.58 % para ese ISIN). El
  coste PRIIPS no se puede automatizar hoy — Morningstar renderiza en cliente y
  EODHD no tiene fondos españoles —, así que la caja lo explica en su tooltip y
  se puede corregir a mano. Ojo: el TER NO afecta a la rentabilidad del
  backtest (los NAV ya lo llevan descontado); solo alimenta el coste
  informativo, la nota de Coste y el Índice de Saqueo.
- **La nota del informe avisa si el periodo es corto o tranquilo**
  (`avisoPeriodo` en `report-pdf.ts`): si el tramo dura menos de 7 años o no
  cubre ninguna de las crisis de referencia del motor, se pinta una caja
  "Cuidado con el periodo". Sin ella, dos carteras cualesquiera sacan 9,2 y 9,4
  en 2023-2026 y el informe parece decir que son excelentes.
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

## Divisa de los resultados (`displayCurrency`, sep-2026)

El comparador puede calcular todo en **EUR, USD, GBP, CHF, JPY, oro (XAU,
onzas) o "native"** (cada activo en su divisa de cotización, sin convertir; es
el comportamiento histórico y el default de la API cuando el campo no viene:
campus, copiloto y clientes antiguos no cambian). La UI arranca en EUR.

- **Cómo:** `lib/fx-convert.ts`. Cada activo se convierte desde la divisa de su
  cotización con el tipo de cambio de cada día, como un fondo al calcular su
  NAV: `precio_B = precio_A × usdPor(A) / usdPor(B)`. Pivote USD. Tipos de
  cambio de EODHD `XXX.FOREX` (= unidades de XXX por 1 USD; EUR desde 1975 con
  ECU sintético antes de 1999, JPY/CHF/CAD desde 1971, **GBP solo desde 2000**)
  y `XAUUSD.FOREX` (USD por onza, desde 1979). Días sin tipo de cambio
  disponible se descartan (la serie empieza más tarde) y se avisa.
- **Dónde:** la divisa objetivo viaja en el `RequestContext`
  (`displayCurrency`); el motor carga precios con `getDailyPricesIn` /
  `getMonthlyPricesIn` (holdings, rango efectivo, métricas por activo,
  benchmark). Momentum, Kray, Equivalente y Jubilación siguen en nativo.
  Las conversiones dejan notas (`fxNotes`) que `/api/backtest` vuelca en avisos
  `type: "currency"`.
- **Reglas:** un par de divisas (`EURUSD.FOREX`, categoría "Divisas") NUNCA se
  convierte (la serie ES el tipo de cambio). Los metales spot sí (oro en EUR =
  XAUUSD / EURUSD). GBX/GBp (peniques, LSE) se divide por 100.
- **`Fund.currency` es la divisa de la COTIZACIÓN descargada** (la del
  listing: `IS3S.DE` cotiza en EUR aunque el fondo sea USD), no la divisa base
  del fondo. Auditada contra EODHD en sep-2026 (`scripts` no; fue ad hoc): al
  añadir un fondo, comprobar el `Currency` del listing en `/search`.
- **Cifras en la UI:** `formatEUR` (nombre histórico) formatea en la divisa
  activa vía `setDisplayCurrency` (estado de módulo que fija `page.tsx` al
  recibir resultados); en oro imprime "12,5 oz". Los literales "€" sueltos de
  algunos componentes/PDF no se han tocado.
- **Validado (sep-2026):** SPY→EUR y SPY→XAU coinciden punto a punto con el
  cálculo directo sobre las series crudas; SPY en EUR da CAGR 14,02 % vs 13,84 %
  del iShares S&P 500 UCITS EUR (2015-2026; la diferencia es TER + retención
  de dividendos); oro spot en EUR 12,09 % vs 11,88 % del Invesco Physical Gold.
- ✅ **Los cinco ISIN BBVA cruzados ya están corregidos** (commit 2215db2).
  Reauditados en sep-2026 contra `/search/{ISIN}`: `bbvac-amundi-eur-liquidity`
  LU0568620560, `bbvar-vontobel-us-equity` LU0035765741, `bbvar-amundi-us-equity`
  LU1883859230, `bbvar-gs-japan-equity` LU0234695293 y `bbvaa-bnp-euro-govt`
  LU0111548326 devuelven hoy el fondo que dice el catálogo.

## Auditoría de ISIN del catálogo (sep-2026)

Los 259 fondos de `fund-database.ts` pasados por `/search/{ISIN}` de EODHD, y
además —los que tienen ticker— por el cruce inverso `/search/{ticker}` → ISIN,
que es la prueba fuerte: si EODHD asocia otro ISIN a ese ticker, uno de los dos
está mal. Guion de la auditoría: ad hoc, no quedó en `scripts/`.

**Por qué importa aunque los precios salgan bien:** en `eodhd-fundamentals.ts`
(`getFundComposition`) **el ISIN tiene prioridad sobre el ticker** — prueba
`ISIN.EUFUND` → listings de `/search/{ISIN}` → ticker. Un ISIN equivocado sirve
la ficha de otro producto (TER, composición, sectores) aunque el NAV sea el
correcto. En `data-fetcher.ts`/`providers/eodhd.ts` es al revés: manda el
ticker y el ISIN solo entra como *fallback* si el ticker no devuelve nada.

- ✅ **Corregido:** `vanguard-vfinx` tenía US9229085538, que es VNQ (Vanguard
  Real Estate ETF) → **US9229081081**. Por eso la búsqueda de TER devolvía
  `VNQ.US` con 0,12 % en vez del 0,14 % de VFINX. Los precios nunca se vieron
  afectados (ticker `VFINX`; además US9229085538.EUFUND da 404). Ojo: el ISIN
  que circula como "el bueno" de VFINX, **US9229087286, es en realidad VTSAX**
  (Vanguard Total Stock Market Admiral) — estaba colado en `campus-whitelist.ts`
  y se quitó.
- ⚠️ **Pendiente 1 — fondos SIN ticker cuyo ISIN descarga el NAV de otro fondo**
  (esto sí contamina backtests): `bankinter-espana` ES0114105036 = Bankinter
  EE.UU. Nasdaq 100; `bbvar-bbva-usa-isr` ES0114205034 = BBVA Bonos Corporativos
  Largo Plazo; `bbvar-jpm-us-select` LU0210526637 = JPMorgan China;
  `bbvar-ab-select-us` LU0079474960 = AB American Growth; `bbvaa-pimco-em-bond`
  IE00B11XZ103 = PIMCO Global Bond; `bbvaa-invesco-eur-corp` LU0243957239 =
  Invesco Pan European High Income; `bbvaa-fidelity-eur-hy` LU0261948227 =
  Fidelity Germany; `bbvaa-muzinich-em-sd` IE00B4Z6HC18 = BNY Mellon Global Real
  Return; `bbvaa-lumyna-market-neutral` LU0834815101 = OptoFlex I;
  `jl-yis-3-5-emu-govt-bond-z` LU0335987698 = Eurizon EF Bond EUR Medium Term.
  Hay que sacar el ISIN del folleto de cada uno, no de EODHD.
- ⚠️ **Pendiente 2 — fondos CON ticker cuyo ISIN no es el que EODHD da para ese
  ticker.** Solo estropea la ficha/TER, no los precios. Entre paréntesis, el que
  devuelve EODHD: `vanguard-vgsix` US9229085538 (US9219087031 — el actual es
  VNQ, la clase ETF, no VGSIX), `vanguard-vustx` US9219086547 (US9220315058),
  `vanguard-vfitx` US9219086208 (US9220318029), `vanguard-vfisx` US9219085101
  (US9220317039), `vanguard-vwehx` US9219084153 (US9220312089), `vanguard-vtmgx`
  US9219091257 (US9219438093), `vanguard-veiex` US9220428588 (US9220423043),
  `vanguard-veurx` US9220428406 (US9220422052), `vanguard-vbmfx` US9219371078
  (US9219371088), `vanguard-naesx` US9229087682 (US9229087021), `ishares-ewj`
  US4642868487 (US46434G8226, mismo nombre — puede ser un CUSIP viejo),
  `rf-goehring-rozencwajg-resources` US38035R1095 = clase Retail mientras el
  ticker `GRHIX` es la Institucional (US38035R2085): el nombre o el ticker
  sobran.
- ⚠️ **Pendiente 3 — ISIN con dígito de control inválido** (no existen como
  ISIN, aunque el fondo sí): los de arriba `vanguard-vustx`, `vanguard-vfitx`,
  `vanguard-vfisx`, `vanguard-vwehx`, `vanguard-vtmgx`, `vanguard-vbmfx`, más
  `caixabank-global` ES0114768030, `santander-espana` ES0175279036,
  `bbva-sostenible` ES0113536034, `santander-rf` ES0138883035, `caixabank-rf`
  ES0164803033 y `bbvaa-janus-uk-abs-return` IE00B4P7Q881. Los 11 pseudo-ISIN de
  divisas y oro (`XAUUSD`, `EURUSD`, …) son intencionados y no cuentan.
- **Falsos positivos que NO hay que tocar:** EODHD abrevia nombres
  (`bbvac-ms-short-maturity` → "MRG ST IF-SH MAT EU BD-A", `bbvac-bluebay-ig-absolute`,
  `bbvac-pictet-eur-short-term`, `caixa-smart-rf-inflacion`), y en los listados
  `.EUFUND` publica `ISIN: null` con el ISIN en el campo `Code` — un filtro que
  exija `ISIN` exacto los marca como "sin resultado" sin motivo.
