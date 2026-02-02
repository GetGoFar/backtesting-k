# Backtesting Tool — El Proyecto K

## Descripción del Proyecto

Herramienta web de backtesting para comparar carteras de fondos de inversión europeos.
Enfocada en demostrar la superioridad de la inversión indexada de bajo coste frente
a los fondos de gestión activa de la banca española.

Público objetivo: inversores españoles de 30-60 años que asisten a los talleres de
El Proyecto K (educación financiera, inversión indexada).

## Stack Tecnológico

- Frontend: Next.js 14+ (App Router) con TypeScript y Tailwind CSS
- Gráficos: Recharts
- Datos: Yahoo Finance API (vía servidor) + CSVs locales para fondos españoles
- Sin base de datos — datos en memoria + caché en disco (JSON)
- Despliegue: Vercel

## Arquitectura

```
backtesting-k/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx            # Página principal
│   │   ├── layout.tsx          # Layout global
│   │   └── api/
│   │       ├── funds/route.ts          # Lista de fondos disponibles
│   │       ├── prices/route.ts         # Precios históricos
│   │       └── backtest/route.ts       # Motor de backtesting
│   ├── components/
│   │   ├── PortfolioBuilder.tsx        # Selector de fondos + pesos
│   │   ├── BacktestConfig.tsx          # Parámetros (fechas, rebalanceo, etc.)
│   │   ├── PerformanceChart.tsx        # Gráfico evolución patrimonio
│   │   ├── MetricsTable.tsx            # Tabla de métricas comparativas
│   │   ├── AnnualReturnsChart.tsx      # Gráfico rentabilidades anuales
│   │   ├── DrawdownChart.tsx           # Gráfico de drawdowns
│   │   ├── FeeImpactCard.tsx           # Callout impacto comisiones
│   │   └── FundSearch.tsx              # Buscador de fondos por nombre/ISIN
│   ├── lib/
│   │   ├── backtest-engine.ts          # Motor de cálculo
│   │   ├── metrics.ts                  # Cálculo de métricas (Sharpe, Sortino, etc.)
│   │   ├── data-fetcher.ts             # Yahoo Finance + CSV loader
│   │   ├── fund-database.ts            # Base de datos de fondos
│   │   ├── portfolio-presets.ts        # Carteras predefinidas
│   │   ├── types.ts                    # Tipos TypeScript
│   │   └── cache.ts                    # Caché de datos en disco
│   └── data/
│       └── spanish-funds.csv           # NAVs de fondos españoles
```

## Base de Datos de Fondos

### ETFs/Fondos Indexados (datos de Yahoo Finance)

| Nombre | ISIN | Yahoo Ticker | TER% | Categoría |
|--------|------|-------------|------|-----------|
| Vanguard Global Stock Index Fund | IE00B03HCZ61 | 0P0000YXJO.L | 0.18 | RV Global |
| iShares Core MSCI World UCITS ETF | IE00B4L5Y983 | IWDA.AS | 0.20 | RV Global |
| Vanguard S&P 500 UCITS ETF | IE00B3XXRP09 | VUSA.AS | 0.07 | RV EEUU |
| Amundi MSCI Emerging Markets | LU1681045370 | AEEM.PA | 0.20 | RV Emergentes |
| Vanguard EUR Government Bond | IE00B04GQQ17 | 0P0000K0JN.L | 0.12 | RF EUR Gov |
| Vanguard EUR Eurozone Gov Bond | IE00BH04GL39 | VGEA.AS | 0.10 | RF EUR Gov |
| iShares Core Euro Govt Bond | IE00B4WXJJ64 | IEGA.AS | 0.09 | RF EUR Gov |
| Amundi Index MSCI Europe | LU0389811885 | CEUE.PA | 0.15 | RV Europa |

### Fondos de Gestión Activa Bancaria (datos manuales CSV)

| Nombre | ISIN | TER% | Categoría | Banco |
|--------|------|------|-----------|-------|
| CaixaBank Bolsa Selección Global | ES0114768030 | 1.79 | RV Global | CaixaBank |
| Santander Acciones Españolas | ES0175279036 | 1.68 | RV España | Santander |
| BBVA Bolsa Desarrollo Sostenible | ES0113536034 | 1.45 | RV Global | BBVA |
| Santander Renta Fija Privada | ES0138883035 | 0.82 | RF EUR | Santander |
| CaixaBank RF Flexible | ES0164803033 | 0.98 | RF Flexible | CaixaBank |
| Bankinter Bolsa España | ES0114105036 | 1.37 | RV España | Bankinter |

## Motor de Backtesting — Requisitos

### Inputs
- Lista de fondos con pesos (%) — dos carteras para comparar
- Fecha inicio y fin (mínimo 2010 si hay datos)
- Inversión inicial en EUR
- Frecuencia de rebalanceo: mensual, trimestral, anual, sin rebalanceo
- Aportaciones periódicas opcionales (mensual)

### Cálculos
- Rentabilidad acumulada con rebalanceo periódico
- Descuento de TER real de cada fondo (aplicado mensualmente: TER/12)
- Comisiones totales pagadas en EUR por cada cartera

### Métricas de salida
- Valor final del patrimonio (EUR)
- Rentabilidad total (%)
- CAGR — Tasa de crecimiento anual compuesto (%)
- Volatilidad anualizada (desviación estándar de retornos mensuales × √12)
- Ratio de Sharpe (usando tasa libre de riesgo del 1%)
- Ratio de Sortino (usando downside deviation)
- Máximo Drawdown (%)
- Mejor y peor mes (%)
- Porcentaje de meses positivos
- Rentabilidades anuales desglosadas
- Rolling returns a 1, 3 y 5 años

### Visualizaciones
1. Evolución del patrimonio (líneas, dos carteras superpuestas)
2. Drawdown desde máximos (área, dos carteras)
3. Rentabilidades anuales (barras agrupadas)
4. Rolling returns (líneas)
5. Callout destacado con impacto de comisiones en EUR

## Carteras Predefinidas (Presets)

- **Cartera K Conservadora**: 30% RV Global Indexada + 70% RF EUR Indexada
- **Cartera K Moderada**: 60% RV Global Indexada + 40% RF EUR Indexada
- **Cartera K Agresiva**: 80% RV Global Indexada + 10% RV EEUU Indexada + 10% RF EUR Indexada
- **Cartera K 100% RV**: 70% RV Global + 20% RV EEUU + 10% RV Emergentes
- **Cartera Banco Conservadora**: 30% CaixaBank Global + 70% Santander RF
- **Cartera Banco Moderada**: 50% CaixaBank Global + 20% Santander España + 30% Santander RF
- **Cartera Banco Agresiva**: 60% CaixaBank Global + 25% Santander España + 15% BBVA Sostenible

## Diseño UI

- Estilo profesional, limpio, financiero
- Colores: Azul (#1d4ed8) para carteras indexadas, Rojo/Rosa (#e11d48) para carteras bancarias
- Verde (#059669) para métricas positivas, Rojo (#dc2626) para negativas
- Fondos claros, bordes sutiles, sombras suaves
- Responsive (funcionar bien en móvil para presentaciones en talleres)
- Logo: Letra "K" en gradiente azul-índigo como favicon/marca
- Tooltip informativo en cada métrica explicando qué significa

## Reglas de Código

- TypeScript estricto
- Componentes funcionales React con hooks
- Manejo de errores robusto en las API routes
- Loading states en todos los componentes que esperan datos
- Datos cacheados en disco para no abusar de Yahoo Finance
- Comentarios en español en el código
- Tests unitarios para el motor de backtesting

## Disclaimer Legal

Mostrar siempre al pie:
"Esta herramienta tiene fines exclusivamente educativos. Las rentabilidades pasadas
no garantizan resultados futuros. Los datos de fondos bancarios pueden no reflejar
valores liquidativos exactos. Consulta siempre el folleto informativo de cada fondo.
El Proyecto K no es una entidad de asesoramiento financiero regulada."
