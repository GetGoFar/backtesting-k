# Cartera K Web

App web de El Proyecto K para socios de ATARAXIA: cada socio sube **su propia cartera** (activos, categoría, euros) en tres partes (Núcleo, Satélite, Play Money), fija **su plan** y la app le dice **dónde está, dónde quiere estar y si tiene que hacer algo**. La app no propone productos ni pesos: eso es el know-how del Taller K (la Excel "Cartera Core"), que aquí no se entrega.

Principio: **UX > simplicidad > claridad > funcionalidad > nº de características.** La app no anima a hacer cosas; ayuda a saber cuándo NO hay que hacer nada.

## Pila

Next.js 16 (App Router) + TypeScript + Tailwind 3 + Vitest. Estado en `localStorage` (`cartera-k:v2`), sincronizado entre pestañas del mismo origen. **Pendiente (fase 2):** guardar por socio en el servidor de Ataraxia (Upstash, clave HMAC del id de LearnWorlds, como `api/cartera.js` de ataraxia-bot), porque el estado del socio debe sobrevivir al navegador. Fuentes: Poppins y Source Serif 4 vía `next/font/google`. Colores de marca en `tailwind.config.ts`.

Comandos: `npm run dev` (el launch.json del espacio de trabajo lo levanta en 3011), `npm run build`, `npm run type-check`, `npm test`. `next.config.mjs` admite `127.0.0.1` como origen de desarrollo: abrirlo por ahí da un almacenamiento separado del de `localhost` (útil para probar sin pisar datos).

## Estructura

- `src/lib/cartera.ts` — motor: categorías (RV, RF pública, RF corporativa, RF high yield, oro, otros), partes (Núcleo, Satélite, Play Money), plan del socio, estado y semáforo, aportación, rebalanceo, `sugerirCategoria` por nombre.
- `src/lib/buscar.ts` + `src/app/api/buscar/route.ts` — búsqueda de activos por nombre o ISIN. El servidor hace de proxy a la Backtesting Tool (`BACKTEST_URL`, por defecto backtesting-k.vercel.app): `/api/funds?search=` (catálogo curado con categoría, instantáneo) + `/api/search?q=` (EODHD, 1-5 s); une, quita duplicados por ISIN, sugiere categoría. Sus rutas no llevan CORS, por eso no se llaman desde el navegador.
- `src/lib/importar.ts`, `src/lib/importar-servidor.ts`, `src/app/api/importar/route.ts`, `src/components/Importar.tsx` — **Importar de una captura**: el socio sube (o pega) una captura de la tabla de posiciones de su bróker; `leerCaptura` la manda a Claude (`claude-opus-5` por defecto, `ANTHROPIC_MODEL` para cambiarlo; salida estructurada con zod; el texto de la imagen se trata como datos) y devuelve filas (nombre, ticker, bolsa, valor, grupo, nombre completo, ISIN propuesto, confianza); `resolverExtraccion` busca el ISIN en este orden: ticker exacto en EODHD (prefiriendo la bolsa que diga el bróker: IBIS2→DE, SBF→PA, AEB→AS…; si el mismo ticker es otro producto en otra bolsa, solo vale si el nombre lo confirma), ISIN leído en la captura o propuesto por el modelo solo si existe y su nombre casa (≥ 0,3), catálogo curado por nombre (≥ 0,8) y EODHD por nombre (≥ 0,8). Las cifras del nombre (7-10Y, 10-15Y, 100, 500) tienen que coincidir exactas. Si varios ISIN distintos empatan (p. ej. los cinco Xtrackers sectoriales con un nombre genérico), la fila queda **sin ISIN y marcada como ambigua**: mejor que el ISIN de otro producto. Presupuesto de 20 s para toda la resolución (6 búsquedas en paralelo; timeouts 4 s catálogo / 8 s EODHD) y 40 s para la lectura (sin reintentos largos), porque la ruta tiene 60 s en Vercel; si se agota, aviso al socio. Tope de 40 posiciones por captura, avisando de las que sobran. Si un ISIN ya está en la cartera, la revisión ofrece **actualizar su importe** en vez de duplicarlo (la captura mensual sirve para poner al día); las filas en otra divisa llegan sin marcar. La ruta mira la firma de los bytes (PNG/JPEG/WebP/GIF), no el tipo MIME del navegador; el cliente recodifica los JPEG (borra EXIF) y reduce las capturas grandes. Categoría: del catálogo si está; si no, por el nombre; cripto siempre «otros»; el epígrafe del bróker (RENTA FIJA, ORO…) solo como último recurso. Parte: Núcleo salvo que el epígrafe diga Satélite o Play. Nada se añade sin que el socio revise la lista. La imagen no se guarda. Requiere `ANTHROPIC_API_KEY` en el servidor (sin ella la ruta responde 503 y el resto de la app funciona). `IMPORTAR_SIMULACION=<json>` (solo desarrollo) sustituye la lectura por una extracción ya hecha para probar sin gastar API. Límite 4 MB (Vercel corta a 4,5); el cliente reduce en canvas las capturas de más de 3,5 MB.
- `src/lib/perfil.ts` — test de perfil (10 preguntas del PDF público "Perfil de Riesgo El Proyecto K v2"; la pregunta 4 es la del PDF, no la de la Excel). El resultado solo enseña lo que ese PDF ya publica: tramo, orientación de bolsa por tramo y caída esperada. Nada de pesos por categoría.
- `src/lib/simulador.ts` — fórmula anual de la hoja SIMULADOR.
- `src/lib/formato.ts` — euros/porcentajes (configuración regional de-DE a propósito: agrupa "2.450") y `parseEuros`.
- `src/lib/store.tsx` — contexto React + persistencia.
- `src/app/*` — Inicio, Mi perfil, Mi cartera (bloques + hoja de alta + Mi plan), Aportar/Rebalancear, Simuladores.
- `src/lib/cartera.test.ts` — reproduce las cifras de la Excel expresadas como plan del socio (65/15/20, 20.000 €, aportación de 5.000, rebalanceo de 800).

## Reglas de cálculo (invariantes)

- **Plan** = pesos por categoría sobre la Cartera **Núcleo** (suman 100 %; "otros" no tiene objetivo) + topes de Satélite y Play Money sobre el total (10 % y 5 % por defecto, constantes TOPE_SATELITE_POR_DEFECTO / TOPE_PLAY_POR_DEFECTO; un 0 explícito quita el aviso) + día del mes de aportación (`aportacion.dia`, 1-28; solo se guarda). La banda de tolerancia que pinta la app es `bandaDe(objetivo, plan)`, la misma del semáforo; «Dentro de la bolsa» se muestra en porcentajes sobre la renta variable (`subcategoriasSobreRV`), la base en que el socio escribe su plan, con el semáforo que ya calculó el motor. Sin plan definido no hay semáforo: la app lo pide.
- **Reparto de la renta variable** (regla de Pablo, 25-sep-2026): el plan lleva `estrategiaRV` (geográfica → regiones; sectorial → sectores; mixta → ambas) y `objetivoRV` (fracciones DE LA RENTA VARIABLE que suman 1). Cada posición de bolsa del Núcleo lleva `sub` (región o sector; se sugiere por el nombre y el socio confirma). El estado expone `subcategoriasRV` con pesos sobre el Núcleo (`objetivo.rv × fracción`) y su propio semáforo; la bolsa sin `sub` sale como "Sin región ni sector" (ámbar). Aportación y rebalanceo apuntan a cada región/sector y dejan hueco si el plan pide uno sin activos. Sin `objetivoRV`, la bolsa se mide solo en conjunto.
- **Acciones de empresa solo en Satélite o Play Money** (`tipo: "accion"`, `puedeIrAlNucleo`): la hoja de alta bloquea Núcleo y la fila no deja moverlas allí.
- **Método de rebalanceo** (lo elige el socio en Mi plan; decisión de Pablo, 25-sep-2026): **por periodo** (cada 12 o 24 meses desde el último rebalanceo; entre medias la desviación NO pinta; al llegar la fecha, ámbar "Toca tu revisión") o **por bandas**, absolutas (puntos; 5 por defecto) o relativas (% del objetivo; 25 % por defecto, la de la Excel). Con bandas: rojo si se sale, ámbar a partir del 60 % de la banda. Por defecto, por periodo anual (doctrina de El Proyecto K). La explicación de cada banda enlaza a la masterclass «El arte del rebalanceo» (`NEXT_PUBLIC_ENLACE_MASTERCLASS_REBALANCEO`; hoy apunta a la course page de Ataraxia porque el portal bloquea los enlaces directos desde otro origen).
- **Semáforo** solo sobre el Núcleo, por categoría; diferencias de menos de **10 €** no cuentan. Una categoría con dinero y objetivo 0 (p. ej. liquidez en "otros" dentro del Núcleo) sale ámbar como "fuera de plan". Satélite/Play Money solo avisan (ámbar) si pasan de su tope. "Marcar como hecho" (rebalanceo) y "Marcar como revisado" (revisión sin nada que mover) fijan `ultimoRebalanceo`.
- **Varios activos en una categoría** se reparten el objetivo en proporción a lo que tienen (a partes iguales si están a cero).
- **Aportación** siempre al Núcleo: objetivos sobre el capital final, solo a lo que falta, en proporción al déficit si no alcanza; nunca vende; euros enteros que suman la aportación. Si el plan pide una categoría sin activos, sale un hueco ("Un activo de …") y, al guardar, una posición "Pendiente" que el socio renombra.
- **Rebalanceo**: cada activo del Núcleo a su objetivo sobre el Núcleo actual; ventas y compras cuadran al euro; < 10 € se ignoran. Textos "Te sobra / Te falta", nunca "compra/vende".
- **Simulador**: `V(n) = C0·(1+r)^n + 12·m·((1+r)^n − 1)/r`; con `r = 0`, suma lineal.
- **Aportado** lo declara el socio y crece con cada aportación guardada; es corregible en Mi cartera.
- **Riesgo que asumes** (`src/lib/riesgo.ts`, `src/app/api/riesgo/route.ts`, `src/components/Riesgo.tsx`): volatilidad anual REAL de la cartera en el **máximo periodo común** de sus activos (pesos por valor; `startDate` 1990 + `useCommonDateRange`, serie diaria) calculada por la Backtesting Tool (`POST /api/backtest`; cada ISIN se resuelve como id de su catálogo o como activo EODHD inline; la respuesta viene en `resultA`, no en `a`; `metrics.volatility` decimal) y traducida a perfil 1-10 con la tabla de volatilidades objetivo de la Excel (5, 5,5, 6, 7, 8, 9, 10, 11, 12, 13 %): el perfil más cercano; por encima del 13 % × 1,15, "10+". Además, el **peor tramo de 3 años** (ventana móvil de 756 días sobre la serie diaria, √252) con su propio perfil, y la lista de **crisis que el periodo no incluye** (2008, 2020, 2022) para no fiarse de una década tranquila (petición de Pablo). La liquidez (posición sin ISIN llamada Liquidez/efectivo/cash…) diluye la volatilidad; lo que no tiene precios se excluye y se nombra. Caída extrema = 3 × volatilidad (cisne negro de la Excel) y peor caída real del periodo. Resultado cacheado 7 días en localStorage por composición (clave versionada: subirla al cambiar el método). Se compara con el perfil del test si existe.

## Decisiones de Pablo (25-sep-2026)

- La Excel se da a todos los alumnos del Taller; la app es para socios de Ataraxia (todos de pago; unos con Taller y otros sin).
- Nadie recibe una Cartera K montada por defecto: las tablas de pesos por perfil y el catálogo de productos se **borraron del repo** (viajaban en el JS del navegador).
- Categorías y partes las eligió Pablo: RV, RF pública, RF corporativa, RF high yield, oro, otros; Núcleo, Satélite, Play Money.

## Lo que NO hay (a propósito)

Productos sugeridos, pesos por defecto, brokers, precios en tiempo real, gráficos de velas, noticias, señales, predicciones, rankings, alertas de mercado, IA recomendando. Ni nombres de hojas de la Excel.

## Variables de entorno

Ver `.env.example`. `ANTHROPIC_API_KEY` (importación por captura), `ANTHROPIC_MODEL` (opcional), `BACKTEST_URL` (opcional), `IMPORTAR_SIMULACION` (solo desarrollo), `NEXT_PUBLIC_ENLACE_MASTERCLASS_REBALANCEO`.

## Pendientes conocidos

- Persistencia por socio en servidor (fase 2) y puerta de socio (token firmado desde el pase de Ataraxia, como el Laboratorio K). Hasta que exista la puerta, `/api/importar` gasta API para cualquiera que llegue a la URL: no publicar la app en abierto sin ella.
- Retiradas (aportación negativa).
- Coherencia de criterio con el espejo mínimo de Ataraxia (5 puntos absolutos) y con la ficha pública de rebalanceo (una vez al año): decisión de Pablo.

---

**Nota (26-sep-2026):** este documento es el CLAUDE.md original de cartera-k, conservado como historia de las
decisiones del motor. Desde esta fecha Mi cartera vive dentro de este repo como sección del Laboratorio K
(ver la sección "Laboratorio K" del CLAUDE.md de la raíz): las rutas son /cartera, /cartera/posiciones,
/aportar, /simuladores y /perfil; las API son /api/cartera/{buscar,riesgo,importar,estado}; ya no hay
BACKTEST_URL (todo es interno o contra el propio origen) y el estado se guarda en servidor por socio.
