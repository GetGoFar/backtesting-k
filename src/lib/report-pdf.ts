// =============================================================================
// REPORT PDF — Generación client-side con jsPDF
// =============================================================================
//
// Usamos jsPDF directamente en el navegador para:
//   - Evitar serverless function limits y problemas con @react-pdf/renderer
//   - Generar el PDF instantáneamente sin round-trip al servidor
//   - Reducir el bundle del backend
//
// Estilo: marca "El Proyecto K" — fondo beige cálido, acentos rojos,
//          tipografía Helvetica (built-in en jsPDF).
//
// =============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { BacktestResponse, BacktestResult, BenchmarkComparison } from "./types";
import type { ReportConfig, ReportSectionId } from "./report-types";
import { computePortfolioScore, computeBenchmarkScore, type PortfolioScore, type ScoreDetail } from "./report-scoring";
import { computeTaxOnGain, type TaxMode } from "./tax-utils";

// -----------------------------------------------------------------------------
// COLORES (RGB para jsPDF)
// -----------------------------------------------------------------------------

const RGB = {
  beige: [245, 240, 232] as [number, number, number],
  red: [192, 57, 43] as [number, number, number],
  dark: [44, 44, 44] as [number, number, number],
  gray: [107, 107, 107] as [number, number, number],
  lightGray: [213, 206, 189] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  rowLight: [250, 247, 242] as [number, number, number],
  rowAlt: [240, 235, 225] as [number, number, number],
  green: [46, 125, 50] as [number, number, number],
  redNeg: [198, 40, 40] as [number, number, number],
  darkBg: [44, 62, 80] as [number, number, number],
  gold: [212, 160, 23] as [number, number, number],
  // Identidad visual del benchmark (coherente con la app): púrpura #9333ea
  purple: [147, 51, 234] as [number, number, number],
  // Púrpura claro para rellenos/áreas del benchmark (#a855f7)
  purpleLight: [168, 85, 247] as [number, number, number],
};

// -----------------------------------------------------------------------------
// CONFIG DE PÁGINA (A4)
// -----------------------------------------------------------------------------

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 18; // margin left
const MR = 18;
const MT = 18;
const MB = 18;
const CW = PAGE_W - ML - MR;

// -----------------------------------------------------------------------------
// HELPERS DE FORMATO
// -----------------------------------------------------------------------------

function fmtEUR(v: number): string {
  return Math.round(v).toLocaleString("es-ES").replace(/,/g, ".") + " €";
}

function fmtPct(v: number, decimals = 1): string {
  const n = v.toFixed(decimals).replace(".", ",");
  return `${v >= 0 ? "+" : ""}${n}%`;
}

function scoreRGB(score: number): [number, number, number] {
  if (score >= 8.5) return [5, 150, 105];
  if (score >= 7) return [37, 99, 235];
  if (score >= 5.5) return [8, 145, 178];
  if (score >= 4) return [217, 119, 6];
  if (score >= 2.5) return [220, 38, 38];
  return [153, 27, 27];
}

// -----------------------------------------------------------------------------
// CONTEXTO DE RENDERIZADO
// -----------------------------------------------------------------------------

interface RenderCtx {
  pdf: jsPDF;
  pageNum: number;
  totalPages: number;
  y: number;
  subtitle: string;
}

/** Dibuja el fondo beige completo de la página actual */
function drawBackground(pdf: jsPDF) {
  pdf.setFillColor(...RGB.beige);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
}

/** Dibuja el header (solo para páginas de contenido, no portada) */
function drawHeader(pdf: jsPDF, subtitle: string) {
  // "El Proyecto K" (izquierda) + subtítulo (derecha)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...RGB.dark);
  pdf.text("El Proyecto K", ML, 12);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...RGB.gray);
  pdf.text(subtitle, PAGE_W - MR, 12, { align: "right" });

  // Línea roja debajo
  pdf.setDrawColor(...RGB.red);
  pdf.setLineWidth(0.4);
  pdf.line(ML, 14, PAGE_W - MR, 14);
}

/** Dibuja el footer */
function drawFooter(pdf: jsPDF, pageNum: number) {
  // Línea gris encima
  pdf.setDrawColor(...RGB.lightGray);
  pdf.setLineWidth(0.2);
  pdf.line(ML, PAGE_H - 14, PAGE_W - MR, PAGE_H - 14);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...RGB.gray);
  pdf.text("www.elproyectok.com", ML, PAGE_H - 10);
  pdf.text(String(pageNum), PAGE_W - MR, PAGE_H - 10, { align: "right" });
}

/** Inicia una nueva página de contenido (con header y footer) */
function newContentPage(ctx: RenderCtx): RenderCtx {
  ctx.pdf.addPage();
  ctx.pageNum++;
  drawBackground(ctx.pdf);
  drawHeader(ctx.pdf, ctx.subtitle);
  drawFooter(ctx.pdf, ctx.pageNum);
  ctx.y = MT + 8;
  return ctx;
}

/** Asegura espacio vertical disponible, salta de página si no hay */
function ensureSpace(ctx: RenderCtx, needed: number): RenderCtx {
  if (ctx.y + needed > PAGE_H - MB - 8) {
    newContentPage(ctx);
  }
  return ctx;
}

/** Dibuja cabecera de sección: número rojo + título + línea separadora */
function drawSectionHeader(ctx: RenderCtx, num: string, title: string) {
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(11);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text(num, ML, ctx.y);
  ctx.y += 6;

  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(20);
  ctx.pdf.setTextColor(...RGB.dark);
  ctx.pdf.text(title, ML, ctx.y);
  ctx.y += 7;

  // Línea separadora roja
  ctx.pdf.setDrawColor(...RGB.red);
  ctx.pdf.setLineWidth(0.3);
  ctx.pdf.line(ML, ctx.y, PAGE_W - MR, ctx.y);
  ctx.y += 6;
}

/** Dibuja un párrafo justificado con wrap automático */
function drawBody(
  ctx: RenderCtx,
  text: string,
  options: { size?: number; color?: [number, number, number]; bold?: boolean; italic?: boolean } = {}
) {
  const size = options.size ?? 10;
  const color = options.color ?? RGB.dark;
  const style = options.bold && options.italic ? "bolditalic" : options.bold ? "bold" : options.italic ? "italic" : "normal";
  ctx.pdf.setFont("helvetica", style);
  ctx.pdf.setFontSize(size);
  ctx.pdf.setTextColor(...color);
  const lines = ctx.pdf.splitTextToSize(text, CW) as string[];
  const lineHeight = size * 0.45;
  for (const line of lines) {
    ensureSpace(ctx, lineHeight + 2);
    ctx.pdf.text(line, ML, ctx.y);
    ctx.y += lineHeight + 1;
  }
  ctx.y += 2;
}

/** Caja CTA con borde rojo a la izquierda */
function drawCTABox(ctx: RenderCtx, title: string, body: string) {
  const boxH = 24 + (Math.ceil(body.length / 90)) * 5;
  ensureSpace(ctx, boxH + 6);
  // Fondo
  ctx.pdf.setFillColor(...RGB.rowAlt);
  ctx.pdf.rect(ML + 1, ctx.y, CW - 1, boxH, "F");
  // Borde izquierdo rojo
  ctx.pdf.setFillColor(...RGB.red);
  ctx.pdf.rect(ML, ctx.y, 1.2, boxH, "F");

  // Título
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(11);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text(title, ML + 5, ctx.y + 6);
  // Cuerpo
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(10);
  ctx.pdf.setTextColor(...RGB.dark);
  const lines = ctx.pdf.splitTextToSize(body, CW - 8) as string[];
  let yLine = ctx.y + 11;
  for (const line of lines) {
    ctx.pdf.text(line, ML + 5, yLine);
    yLine += 4.5;
  }
  ctx.y += boxH + 5;
}

// -----------------------------------------------------------------------------
// SECCIONES
// -----------------------------------------------------------------------------

function renderCover(pdf: jsPDF, result: BacktestResult, config: ReportConfig, otherName?: string, benchName?: string) {
  drawBackground(pdf);

  // Línea roja superior
  pdf.setFillColor(...RGB.red);
  pdf.rect(ML, 50, 28, 0.8, "F");

  // Título
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(32);
  pdf.setTextColor(...RGB.dark);
  pdf.text("Informe de Cartera", ML, 65);

  // Subtítulo
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(13);
  pdf.setTextColor(...RGB.gray);
  pdf.text("Análisis personalizado de tu inversión", ML, 73);

  // Nombre de la cartera
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(...RGB.dark);
  pdf.text(result.portfolioName, ML, 95);

  // Datos
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(...RGB.gray);
  let coverY = 103;
  if (config.clientName) {
    pdf.text(`Preparado para: ${config.clientName}`, ML, coverY);
    coverY += 6;
  }
  const start = result.timeSeries[0]?.date ?? "";
  const end = result.timeSeries[result.timeSeries.length - 1]?.date ?? "";
  pdf.text(`Periodo analizado: ${start} – ${end}`, ML, coverY);
  coverY += 6;

  // Comparativa
  if (otherName || benchName) {
    coverY += 6;
    pdf.setFontSize(10);
    pdf.text("Comparativa con:", ML, coverY);
    coverY += 5;
    if (otherName) {
      pdf.setTextColor(...RGB.dark);
      pdf.text(`  · ${otherName}`, ML, coverY);
      coverY += 5;
    }
    if (benchName) {
      pdf.setTextColor(...RGB.dark);
      pdf.text(`  · ${benchName} (índice de referencia)`, ML, coverY);
    }
  }

  // Footer cover
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(...RGB.red);
  pdf.text("El Proyecto K", ML, PAGE_H - 35);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(...RGB.gray);
  pdf.text("Inversión indexada de bajo coste", ML, PAGE_H - 29);
  pdf.text("www.elproyectok.com", ML, PAGE_H - 24);

  const today = config.reportDate ?? new Date().toLocaleDateString("es-ES",
    { year: "numeric", month: "long", day: "numeric" });
  pdf.setFontSize(8);
  pdf.text(today, ML, PAGE_H - 19);
}

function renderScore(ctx: RenderCtx, score: PortfolioScore, benchScore?: PortfolioScore | null, benchName?: string) {
  drawSectionHeader(ctx, "01", "Tu cartera de 0 a 10");
  const bmName = benchName ?? "Benchmark";

  drawBody(ctx,
    "Esta es la valoración global de tu cartera. La nota se calcula sobre las " +
    "métricas antes de impuestos, porque la calidad intrínseca de la cartera " +
    "no depende de tu situación fiscal personal.",
    { size: 10 }
  );

  ensureSpace(ctx, 50);
  // Caja de nota global
  ctx.pdf.setFillColor(...RGB.rowAlt);
  ctx.pdf.rect(ML, ctx.y, CW, 40, "F");
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(...RGB.gray);
  ctx.pdf.text("NOTA GLOBAL", PAGE_W / 2, ctx.y + 7, { align: "center" });

  const [r, g, b] = scoreRGB(score.global);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(38);
  ctx.pdf.setTextColor(r, g, b);
  ctx.pdf.text(score.global.toFixed(1).replace(".", ","), PAGE_W / 2, ctx.y + 23, { align: "center" });

  ctx.pdf.setFont("helvetica", "bolditalic");
  ctx.pdf.setFontSize(13);
  ctx.pdf.setTextColor(r, g, b);
  ctx.pdf.text(score.adjective, PAGE_W / 2, ctx.y + 33, { align: "center" });

  // Nota global del benchmark (referencia), en púrpura dentro de la misma caja.
  if (benchScore) {
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(8);
    ctx.pdf.setTextColor(...RGB.purple);
    ctx.pdf.text(
      `${bmName} (referencia): ${benchScore.global.toFixed(1).replace(".", ",")}`,
      PAGE_W / 2,
      ctx.y + 38,
      { align: "center" }
    );
  }

  ctx.y += 46;

  // Sub-notas con barras. La 3ª columna (nota del benchmark) solo aparece si
  // benchScore existe; se pinta como marcador púrpura sobre la misma barra.
  const bars: Array<[string, ScoreDetail, ScoreDetail | undefined]> = [
    ["Rentabilidad", score.rentabilidad, benchScore?.rentabilidad],
    ["Eficiencia", score.eficiencia, benchScore?.eficiencia],
    ["Resistencia", score.resistencia, benchScore?.resistencia],
    ["Estabilidad", score.estabilidad, benchScore?.estabilidad],
    ["Coste", score.coste, benchScore?.coste],
    ["Diversificación", score.diversificacion, benchScore?.diversificacion],
  ];

  // Si hay benchmark, reservamos un hueco a la derecha para su nota púrpura.
  const valueCol = PAGE_W - MR;
  const bmValueCol = benchScore ? valueCol - 12 : valueCol;

  for (const [name, detail, bmDetail] of bars) {
    ensureSpace(ctx, 14);
    const [cr, cg, cb] = scoreRGB(detail.value);

    // Nombre
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(10);
    ctx.pdf.setTextColor(...RGB.dark);
    ctx.pdf.text(name, ML, ctx.y + 3);

    // Barra fondo (gris)
    const barX = ML + 35;
    const barW = CW - 35 - (benchScore ? 28 : 16);
    ctx.pdf.setFillColor(...RGB.rowAlt);
    ctx.pdf.rect(barX, ctx.y, barW, 4, "F");
    // Barra valor (color)
    const fillW = (detail.value / 10) * barW;
    ctx.pdf.setFillColor(cr, cg, cb);
    ctx.pdf.rect(barX, ctx.y, fillW, 4, "F");

    // Marcador del benchmark sobre la barra (línea vertical púrpura discontinua)
    if (bmDetail) {
      const bmX = barX + (bmDetail.value / 10) * barW;
      ctx.pdf.setDrawColor(...RGB.purple);
      ctx.pdf.setLineWidth(0.7);
      ctx.pdf.setLineDashPattern([0.8, 0.6], 0);
      ctx.pdf.line(bmX, ctx.y - 1, bmX, ctx.y + 5);
      ctx.pdf.setLineDashPattern([], 0);
    }

    // Valor numérico de la cartera
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(11);
    ctx.pdf.setTextColor(cr, cg, cb);
    ctx.pdf.text(detail.value.toFixed(1).replace(".", ","), bmValueCol, ctx.y + 3, { align: "right" });

    // Valor numérico del benchmark (púrpura), a la derecha del de la cartera
    if (bmDetail) {
      ctx.pdf.setFont("helvetica", "bold");
      ctx.pdf.setFontSize(11);
      ctx.pdf.setTextColor(...RGB.purple);
      ctx.pdf.text(bmDetail.value.toFixed(1).replace(".", ","), valueCol, ctx.y + 3, { align: "right" });
    }

    // Métrica explicativa pequeña debajo
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(7.5);
    ctx.pdf.setTextColor(...RGB.gray);
    ctx.pdf.text(detail.metric, barX, ctx.y + 8);

    ctx.y += 11;
  }

  // Leyenda de la columna del benchmark
  if (benchScore) {
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(7);
    ctx.pdf.setTextColor(...RGB.purple);
    ctx.pdf.text(`Cifra púrpura / marca = nota de ${bmName} (referencia)`, ML, ctx.y + 2);
    ctx.y += 4;
  }

  ctx.y += 4;
  drawBody(ctx,
    "La nota global es una media ponderada: rentabilidad (25%), eficiencia (20%), " +
    "resistencia (20%), estabilidad (15%), coste (15%) y diversificación (5%).",
    { size: 8, color: RGB.gray, italic: true }
  );
}

function renderSummary(ctx: RenderCtx, result: BacktestResult, score: PortfolioScore) {
  drawSectionHeader(ctx, "02", "Resumen en 30 segundos");
  drawBody(ctx,
    "Lo más importante de tu cartera resumido en tres cifras y un párrafo. " +
    "Si solo tienes 30 segundos, esto es lo que necesitas saber.",
    { size: 10 }
  );

  // 3 KPI boxes
  ensureSpace(ctx, 32);
  const boxW = (CW - 8) / 3;
  const profit = result.finalValue - result.totalContributions;
  const [r1, g1, b1] = scoreRGB(score.global);

  const kpis: Array<{ value: string; label: string; sub: string; color: [number, number, number] }> = [
    {
      value: score.global.toFixed(1).replace(".", ","),
      label: "Nota global",
      sub: score.adjective,
      color: [r1, g1, b1],
    },
    {
      value: fmtEUR(result.finalValue),
      label: "Valor final",
      sub: `${fmtEUR(profit)} de ganancia`,
      color: profit >= 0 ? RGB.green : RGB.redNeg,
    },
    {
      value: fmtPct(result.metrics.cagr * 100, 1),
      label: "Crecimiento medio anual",
      sub: "antes de impuestos",
      color: RGB.dark,
    },
  ];

  for (let i = 0; i < kpis.length; i++) {
    const k = kpis[i]!;
    const x = ML + i * (boxW + 4);
    ctx.pdf.setFillColor(...RGB.rowAlt);
    ctx.pdf.rect(x, ctx.y, boxW, 30, "F");

    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(15);
    ctx.pdf.setTextColor(...k.color);
    ctx.pdf.text(k.value, x + boxW / 2, ctx.y + 10, { align: "center" });

    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(8);
    ctx.pdf.setTextColor(...RGB.gray);
    ctx.pdf.text(k.label, x + boxW / 2, ctx.y + 18, { align: "center" });

    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(8.5);
    ctx.pdf.setTextColor(...k.color);
    ctx.pdf.text(k.sub, x + boxW / 2, ctx.y + 24, { align: "center" });
  }
  ctx.y += 36;

  // CTA con resumen
  const cagr = result.metrics.cagr * 100;
  const ctaText =
    `Tu cartera obtiene una nota de ${score.global.toFixed(1).replace(".", ",")} sobre 10 (${score.adjective.toLowerCase()}). ` +
    `Tu dinero ha crecido a un ritmo de ${fmtPct(cagr, 1)} al año de media, ` +
    `transformando los ${fmtEUR(result.totalContributions)} que aportaste en ${fmtEUR(result.finalValue)}. ` +
    (profit > 0
      ? `Eso es una ganancia bruta de ${fmtEUR(profit)}.`
      : `Eso supone una pérdida de ${fmtEUR(Math.abs(profit))}.`);

  drawCTABox(ctx, "Lo que esto significa", ctaText);
}

function renderEvolution(ctx: RenderCtx, result: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "03", "Cómo crece tu dinero");
  drawBody(ctx,
    "Así ha evolucionado el valor de tu cartera durante el periodo analizado. " +
    "Las subidas y bajadas son normales — lo importante es la tendencia a largo plazo.",
  );

  // Serie del benchmark (3ª línea púrpura discontinua), solo si existe.
  const bmTs = benchmark?.benchmarkTimeSeries;
  const hasBm = !!bmTs && bmTs.length >= 2;
  const bmName = benchmark?.benchmarkName ?? "Benchmark";

  // Gráfico de líneas
  const ts = result.timeSeries;
  if (ts.length >= 2) {
    ensureSpace(ctx, 75);
    const chartX = ML + 22;
    const chartY = ctx.y;
    const chartW = CW - 22;
    const chartH = 60;

    const values = ts.map((p) => p.value);
    // El rango del eje incluye también la serie del benchmark para no recortarla.
    const allValues = hasBm ? values.concat(bmTs!.map((p) => p.value)) : values;
    const minV = Math.min(...allValues);
    const maxV = Math.max(...allValues);
    const rangeV = maxV - minV || 1;

    // Eje Y - 4 labels
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(6);
    ctx.pdf.setTextColor(...RGB.gray);
    for (let i = 0; i < 5; i++) {
      const v = maxV - (i / 4) * rangeV;
      const y = chartY + (i / 4) * chartH;
      ctx.pdf.text(fmtEUR(v), chartX - 1, y + 1, { align: "right" });
      ctx.pdf.setDrawColor(...RGB.lightGray);
      ctx.pdf.setLineWidth(0.1);
      ctx.pdf.line(chartX, y, chartX + chartW, y);
    }

    // Ejes
    ctx.pdf.setDrawColor(...RGB.lightGray);
    ctx.pdf.setLineWidth(0.3);
    ctx.pdf.line(chartX, chartY, chartX, chartY + chartH);
    ctx.pdf.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);

    // Línea del benchmark (púrpura discontinua), debajo de la de la cartera.
    if (hasBm) {
      ctx.pdf.setDrawColor(...RGB.purple);
      ctx.pdf.setLineWidth(0.5);
      ctx.pdf.setLineDashPattern([1.5, 1], 0);
      let bPrevX: number | null = null;
      let bPrevY: number | null = null;
      for (let i = 0; i < bmTs!.length; i++) {
        const v = bmTs![i]!.value;
        const x = chartX + (i / (bmTs!.length - 1)) * chartW;
        const y = chartY + chartH - ((v - minV) / rangeV) * chartH;
        if (bPrevX !== null && bPrevY !== null) {
          ctx.pdf.line(bPrevX, bPrevY, x, y);
        }
        bPrevX = x;
        bPrevY = y;
      }
      ctx.pdf.setLineDashPattern([], 0); // restaurar línea sólida
    }

    // Línea de datos
    ctx.pdf.setDrawColor(...RGB.red);
    ctx.pdf.setLineWidth(0.6);
    let prevX: number | null = null;
    let prevY: number | null = null;
    for (let i = 0; i < ts.length; i++) {
      const v = ts[i]!.value;
      const x = chartX + (i / (ts.length - 1)) * chartW;
      const y = chartY + chartH - ((v - minV) / rangeV) * chartH;
      if (prevX !== null && prevY !== null) {
        ctx.pdf.line(prevX, prevY, x, y);
      }
      prevX = x;
      prevY = y;
    }

    // Leyenda (cartera + benchmark) solo cuando hay benchmark
    if (hasBm) {
      const legendY = chartY + chartH + 8;
      // Cartera (rojo, línea sólida)
      ctx.pdf.setDrawColor(...RGB.red);
      ctx.pdf.setLineWidth(0.6);
      ctx.pdf.line(chartX, legendY, chartX + 8, legendY);
      ctx.pdf.setFont("helvetica", "normal");
      ctx.pdf.setFontSize(7);
      ctx.pdf.setTextColor(...RGB.dark);
      ctx.pdf.text(result.portfolioName, chartX + 10, legendY + 1);
      const portfolioLabelW = ctx.pdf.getTextWidth(result.portfolioName);
      // Benchmark (púrpura, discontinua)
      const bmLegendX = chartX + 10 + portfolioLabelW + 8;
      ctx.pdf.setDrawColor(...RGB.purple);
      ctx.pdf.setLineWidth(0.5);
      ctx.pdf.setLineDashPattern([1.5, 1], 0);
      ctx.pdf.line(bmLegendX, legendY, bmLegendX + 8, legendY);
      ctx.pdf.setLineDashPattern([], 0);
      ctx.pdf.setTextColor(...RGB.purple);
      ctx.pdf.text(`${bmName} (referencia)`, bmLegendX + 10, legendY + 1);
      ctx.y += 6; // espacio extra para la leyenda
    }

    // Etiquetas X (años)
    ctx.pdf.setFontSize(6);
    ctx.pdf.setTextColor(...RGB.gray);
    const seenYears = new Set<string>();
    ts.forEach((p, i) => {
      const year = p.date.substring(0, 4);
      if (!seenYears.has(year)) {
        seenYears.add(year);
        const x = chartX + (i / (ts.length - 1)) * chartW;
        ctx.pdf.text(year, x, chartY + chartH + 4, { align: "center" });
      }
    });

    ctx.y += chartH + 10;
  }

  // Tabla
  const profit = result.finalValue - result.totalContributions;
  const tableBody: string[][] = [
    ["Capital inicial aportado", fmtEUR(ts[0]?.value ?? 0)],
    ["Total aportado en el periodo", fmtEUR(result.totalContributions)],
    ["Valor final", fmtEUR(result.finalValue)],
    ["Ganancia bruta", fmtEUR(profit)],
  ];
  // Fila del benchmark (valor final de referencia), solo si está disponible.
  const bmFinal = benchmark?.benchmarkFinalValue;
  if (bmFinal != null) {
    tableBody.push([`Valor final ${bmName} (referencia)`, fmtEUR(bmFinal)]);
  }
  const bmRowIdx = bmFinal != null ? tableBody.length - 1 : -1;
  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head: [["Concepto", "Importe"]],
    body: tableBody,
    headStyles: { fillColor: RGB.red, textColor: RGB.white, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: RGB.dark },
    alternateRowStyles: { fillColor: RGB.rowAlt },
    styles: { cellPadding: 2.5, lineColor: RGB.lightGray, lineWidth: 0.1 },
    columnStyles: { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      // Pintar la fila del benchmark en púrpura para mantener la identidad visual.
      if (data.section === "body" && bmRowIdx >= 0 && data.row.index === bmRowIdx) {
        data.cell.styles.textColor = RGB.purple;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  ctx.y = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

function renderCrisis(ctx: RenderCtx, result: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "04", "¿Cuánto sufrirías en una crisis?");
  drawBody(ctx,
    "Las inversiones no van siempre hacia arriba. Conviene saber a qué te enfrentas " +
    "en los malos momentos para no vender en pánico cuando llegue una crisis."
  );

  const maxDD = result.metrics.maxDrawdown * 100;
  const worstMonth = result.metrics.worstMonth * 100;
  const vol = result.metrics.volatility * 100;
  const peak = 100000;
  const trough = peak * (1 + maxDD / 100);

  ensureSpace(ctx, 12);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(12);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text("La peor caída", ML, ctx.y);
  ctx.y += 6;
  drawBody(ctx,
    `Tu cartera ha sufrido en algún momento una bajada del ${maxDD.toFixed(1).replace(".", ",")}% ` +
    `desde su valor más alto. Para entenderlo en euros: si hubieras invertido ${fmtEUR(peak)} ` +
    `justo antes del peor momento, llegaste a ver ${fmtEUR(trough)} en tu cuenta ` +
    `antes de que se recuperara.`
  );

  ensureSpace(ctx, 12);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(12);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text("El peor periodo corto", ML, ctx.y);
  ctx.y += 6;
  drawBody(ctx,
    `El peor mes (o trimestre) fue del ${worstMonth.toFixed(1).replace(".", ",")}%. ` +
    `Cifras así pueden generar mucha angustia mientras suceden, pero forman parte ` +
    `del recorrido normal de cualquier inversión.`
  );

  ensureSpace(ctx, 12);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(12);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text("Cuán movida es habitualmente", ML, ctx.y);
  ctx.y += 6;
  drawBody(ctx,
    `La cartera oscila típicamente con una intensidad del ${vol.toFixed(1).replace(".", ",")}% al año. ` +
    `Cuanto más baja sea esta cifra, más tranquilo es el camino. Por contexto: un fondo "agresivo" ` +
    `típico tiene entre un 15% y un 22%; uno "conservador" entre un 5% y un 8%.`
  );

  // Tabla comparativa de riesgo vs benchmark (3ª columna), solo si hay métricas.
  const bmMetrics = benchmark?.benchmarkMetrics;
  if (bmMetrics) {
    const bmName = benchmark?.benchmarkName ?? "Benchmark";
    ctx.y += 2;
    autoTable(ctx.pdf, {
      startY: ctx.y,
      margin: { left: ML, right: MR },
      head: [["Indicador de riesgo", result.portfolioName, bmName]],
      body: [
        ["Peor caída (max drawdown)", fmtPct(maxDD), fmtPct(bmMetrics.maxDrawdown * 100)],
        ["Peor mes", fmtPct(worstMonth), fmtPct(bmMetrics.worstMonth * 100)],
        ["Cuán movida (volatilidad anual)", fmtPct(vol), fmtPct(bmMetrics.volatility * 100)],
      ],
      headStyles: { fillColor: RGB.red, textColor: RGB.white, fontStyle: "bold", fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: RGB.dark },
      alternateRowStyles: { fillColor: RGB.rowAlt },
      styles: { cellPadding: 2.5, lineColor: RGB.lightGray, lineWidth: 0.1 },
      columnStyles: {
        1: { halign: "right", fontStyle: "bold" },
        2: { halign: "right", fontStyle: "bold", textColor: RGB.purple },
      },
      didParseCell: (data) => {
        // Cabecera de la columna del benchmark en púrpura.
        if (data.section === "head" && data.column.index === 2) {
          data.cell.styles.textColor = RGB.purple;
        }
      },
    });
    ctx.y = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  drawCTABox(ctx, "La regla de oro",
    "Las caídas son parte del juego — el inversor que aguanta sin vender en pánico recupera " +
    "lo perdido y sigue compuesto. Los datos de tu cartera muestran que en los peores momentos " +
    "sufrirías, pero también que históricamente todo se recupera y supera los máximos anteriores. " +
    "La clave es no mirar la cartera todos los días."
  );
}

function renderTaxes(ctx: RenderCtx, result: BacktestResult, otherResult?: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "05", "Cómo afectan los impuestos");
  drawBody(ctx,
    "Hay tres rentabilidades que conviene distinguir. Cada una responde a una pregunta " +
    "distinta — no son intercambiables."
  );

  const paid = result.fees.totalTaxesPaid ?? 0;
  const ownMode = (result.fees.taxMode ?? "none") as TaxMode;
  let pending = result.fees.pendingTaxes ?? 0;
  if (ownMode === "none" && otherResult) {
    const otherMode = (otherResult.fees.taxMode ?? "none") as TaxMode;
    const otherRate = otherResult.fees.taxRate ?? 0;
    if (otherMode !== "none") {
      pending = computeTaxOnGain(result.fees.unrealizedGain ?? 0, otherMode, otherRate);
    }
  }

  const valBruto = result.finalValue + paid;
  const valCamino = result.finalValue;
  const valLiquidar = result.finalValue - pending;

  // Columna del benchmark (3ª columna) si tiene comisiones y valor final.
  const bmFees = benchmark?.benchmarkFees;
  const bmFinal = benchmark?.benchmarkFinalValue;
  const hasBmTax = !!bmFees && bmFinal != null;
  const bmName = benchmark?.benchmarkName ?? "Benchmark";
  let bmBruto = 0;
  let bmCamino = 0;
  let bmLiquidar = 0;
  if (hasBmTax) {
    const bmPaid = bmFees!.totalTaxesPaid ?? 0;
    const bmPending = bmFees!.pendingTaxes ?? 0;
    bmBruto = bmFinal! + bmPaid;
    bmCamino = bmFinal!;
    bmLiquidar = bmFinal! - bmPending;
  }

  const head = hasBmTax
    ? [["Escenario", "Tu cartera", `${bmName} (referencia)`]]
    : [["Escenario", "Valor final"]];
  const body = hasBmTax
    ? [
        [`1. Bruta (en el papel)\nAntes de cualquier impuesto`, fmtEUR(valBruto), fmtEUR(bmBruto)],
        [`2. Neta del camino\nLo que ves hoy en tu cuenta`, fmtEUR(valCamino), fmtEUR(bmCamino)],
        [`3. Neta al liquidar\nLo que de verdad te llevas al bolsillo`, fmtEUR(valLiquidar), fmtEUR(bmLiquidar)],
      ]
    : [
        [`1. Bruta (en el papel)\nAntes de cualquier impuesto`, fmtEUR(valBruto)],
        [`2. Neta del camino\nLo que ves hoy en tu cuenta`, fmtEUR(valCamino)],
        [`3. Neta al liquidar\nLo que de verdad te llevas al bolsillo`, fmtEUR(valLiquidar)],
      ];

  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head,
    body,
    headStyles: { fillColor: RGB.red, textColor: RGB.white, fontStyle: "bold", fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: RGB.dark, valign: "middle" },
    alternateRowStyles: { fillColor: RGB.rowAlt },
    styles: { cellPadding: 3, lineColor: RGB.lightGray, lineWidth: 0.1 },
    columnStyles: hasBmTax
      ? {
          1: { halign: "right", fontStyle: "bold" },
          2: { halign: "right", fontStyle: "bold", textColor: RGB.purple },
        }
      : { 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      // Destacar fila 3 (liquidar) en rojo, pero respetar el púrpura del benchmark.
      if (data.section === "body" && data.row.index === 2) {
        if (hasBmTax && data.column.index === 2) {
          data.cell.styles.fillColor = RGB.purple;
          data.cell.styles.textColor = RGB.white;
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.fillColor = RGB.red;
          data.cell.styles.textColor = RGB.white;
          data.cell.styles.fontStyle = "bold";
        }
      }
      // Cabecera de la columna del benchmark en púrpura.
      if (data.section === "head" && hasBmTax && data.column.index === 2) {
        data.cell.styles.textColor = RGB.purple;
      }
    },
  });
  ctx.y = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  drawCTABox(ctx, "Idea clave",
    "La rentabilidad bruta es la que aparece en los folletos de los productos. " +
    "La neta al liquidar es la única cifra que de verdad mide cuánto dinero acabará " +
    "en tu bolsillo. Si solo miras la bruta, te estás engañando a ti mismo."
  );

  if (paid > 0) {
    drawBody(ctx,
      `Durante el periodo has pagado ${fmtEUR(paid)} en impuestos por los rebalanceos. ` +
      `Y aún tienes ${fmtEUR(pending)} pendientes que pagarías si liquidaras hoy.`,
      { size: 9 }
    );
  } else if (paid === 0 && pending > 0) {
    drawBody(ctx,
      `No has pagado impuestos durante el camino (típico de fondos con traspaso fiscal), ` +
      `pero al liquidar tributarías hipotéticamente unos ${fmtEUR(pending)}. Esta cifra ` +
      `es la única forma justa de comparar tu cartera con otra que sí tributa por el camino.`,
      { size: 9 }
    );
  }
}

function renderRecommendation(ctx: RenderCtx, score: PortfolioScore) {
  drawSectionHeader(ctx, "06", "Recomendación y siguientes pasos");

  let veredicto: string;
  let acciones: string[];
  if (score.global >= 8.5) {
    veredicto = `Tu cartera es excelente. Tiene un equilibrio muy difícil de mejorar entre rentabilidad, riesgo y coste. El consejo principal aquí es: no la toques sin un motivo de peso.`;
    acciones = [
      "Mantén el rumbo. La disciplina suele ser más rentable que los cambios constantes.",
      "Revisa una vez al año que los pesos siguen alineados con tu objetivo a largo plazo.",
      "Si haces aportaciones, considera dirigirlas a los activos rezagados para rebalancear sin coste fiscal.",
    ];
  } else if (score.global >= 7) {
    veredicto = `Buena cartera. Cumple con los criterios de una inversión sólida a largo plazo, aunque hay margen de mejora en algunas dimensiones específicas.`;
    acciones = [
      "Identifica la sub-nota más baja: ahí está tu mayor oportunidad de mejora.",
      "Si la nota baja es el coste, busca alternativas indexadas con menor TER.",
      "Si la baja es la diversificación, considera añadir alguna clase de activo no correlacionada.",
    ];
  } else if (score.global >= 5.5) {
    veredicto = `Cartera correcta pero con varias áreas a mejorar. Probablemente podrías obtener una rentabilidad similar con menos riesgo, o más rentabilidad con el mismo riesgo, optimizando la composición.`;
    acciones = [
      "Revisa el coste: si pagas más de un 0,5% en TER+gestión, hay alternativas más eficientes.",
      "Valora si la diversificación actual encaja con tu horizonte temporal.",
      "Asiste al Taller K para entender qué cambiar y cómo hacerlo sin penalización fiscal.",
    ];
  } else {
    veredicto = `Tu cartera tiene problemas serios. Las cifras sugieren que estás pagando demasiado, o asumiendo demasiado riesgo, o ambos. Conviene revisarla con calma — pero con criterio, sin precipitarse.`;
    acciones = [
      "No tomes decisiones bruscas en caliente. Una mala migración puede ser peor que la cartera actual.",
      "Aprende los principios básicos antes de cambiar: la inversión indexada de bajo coste es la opción más estudiada y probada.",
      "Asiste al Taller K. La formación es la mejor inversión cuando la cartera no funciona.",
    ];
  }

  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(14);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text("Veredicto", ML, ctx.y);
  ctx.y += 6;
  drawBody(ctx, veredicto);

  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setFontSize(14);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text("Próximas acciones recomendadas", ML, ctx.y);
  ctx.y += 6;

  for (let i = 0; i < acciones.length; i++) {
    ensureSpace(ctx, 12);
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(10);
    ctx.pdf.setTextColor(...RGB.red);
    ctx.pdf.text(`${i + 1}.`, ML, ctx.y);

    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(10);
    ctx.pdf.setTextColor(...RGB.dark);
    const lines = ctx.pdf.splitTextToSize(acciones[i]!, CW - 6) as string[];
    for (let li = 0; li < lines.length; li++) {
      ctx.pdf.text(lines[li]!, ML + 6, ctx.y);
      ctx.y += 4.5;
    }
    ctx.y += 1;
  }

  ctx.y += 4;
  drawCTABox(ctx, "¿Quieres aprender a invertir con criterio?",
    "El Taller K es una formación práctica en inversión indexada de bajo coste. " +
    "Sin productos a vender, sin comisiones que cobrar. Solo conocimiento aplicable " +
    "desde el primer día. → www.elproyectok.com"
  );
}

function renderDisclaimer(ctx: RenderCtx) {
  drawSectionHeader(ctx, "—", "Aviso legal");

  const items = [
    "Esta herramienta y este informe tienen fines exclusivamente educativos.",
    "Las rentabilidades pasadas no garantizan resultados futuros. Los datos históricos muestran cómo se habría comportado la cartera durante el periodo analizado, pero no predicen su comportamiento futuro.",
    "Las notas de 0 a 10 son una valoración cualitativa basada en métricas estadísticas del periodo histórico. No constituyen una recomendación de inversión.",
    "Los datos de fondos de gestión activa pueden no reflejar valores liquidativos exactos. Consulta siempre el folleto informativo de cada fondo antes de invertir.",
    "El cálculo de impuestos pendientes asume liquidación total en la fecha final del periodo bajo el régimen fiscal aplicado. Tu situación fiscal personal puede diferir y debe consultarse con un asesor cualificado.",
  ];
  for (const item of items) {
    drawBody(ctx, item, { size: 9 });
  }

  ctx.y += 4;
  drawBody(ctx,
    "El Proyecto K no es una entidad de asesoramiento financiero regulada por la CNMV.",
    { size: 9, bold: true }
  );
}

// -----------------------------------------------------------------------------
// API PÚBLICA
// -----------------------------------------------------------------------------

/**
 * Genera el informe PDF y devuelve un Blob descargable.
 */
export function generateReportPDF(
  results: BacktestResponse,
  config: ReportConfig
): Blob {
  const result = config.primaryPortfolio === "a" ? results.resultA : results.resultB;
  const other = config.primaryPortfolio === "a" ? results.resultB : results.resultA;
  if (!result) throw new Error("No hay datos para generar el informe");

  const score = computePortfolioScore(result);
  // El benchmark es global (A y B comparten benchmark). Se obtiene del que lo tenga.
  const benchmark = result.benchmark ?? other?.benchmark;
  const benchScore = computeBenchmarkScore(benchmark);
  const subtitle = `${result.portfolioName} · Informe de cartera`;

  const pdf = new jsPDF({
    format: "a4",
    unit: "mm",
    orientation: "portrait",
  });

  // Orden canónico de secciones
  const ORDER: ReportSectionId[] = [
    "cover", "score", "summary", "evolution", "crisis", "taxes",
    "comparison", "stress", "composition", "contributions",
    "rebalances", "recommendation", "disclaimer",
  ];
  const selected = ORDER.filter((id) => config.sections.includes(id));

  let pageNum = 0;
  let coverDone = false;
  const ctx: RenderCtx = { pdf, pageNum: 0, totalPages: 0, y: MT + 8, subtitle };

  const benchName = benchmark?.benchmarkName;
  const otherName = other?.portfolioName;

  for (const id of selected) {
    if (id === "cover") {
      // Portada en la primera página existente (no addPage)
      renderCover(pdf, result, config, otherName, benchName);
      coverDone = true;
    } else {
      // Para las demás secciones, nueva página
      if (coverDone || pageNum > 0) {
        ctx.pdf.addPage();
        ctx.pageNum++;
        pageNum++;
      } else {
        // Si no hubo portada, usar primera página
        ctx.pageNum++;
        pageNum++;
      }
      drawBackground(pdf);
      drawHeader(pdf, subtitle);
      drawFooter(pdf, ctx.pageNum);
      ctx.y = MT + 8;

      if (id === "score") renderScore(ctx, score, benchScore, benchName);
      else if (id === "summary") renderSummary(ctx, result, score);
      else if (id === "evolution") renderEvolution(ctx, result, benchmark);
      else if (id === "crisis") renderCrisis(ctx, result, benchmark);
      else if (id === "taxes") renderTaxes(ctx, result, other ?? undefined, benchmark);
      else if (id === "recommendation") renderRecommendation(ctx, score);
      else if (id === "disclaimer") renderDisclaimer(ctx);
    }
  }

  return pdf.output("blob");
}
