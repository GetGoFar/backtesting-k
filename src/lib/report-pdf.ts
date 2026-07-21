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
import type { BacktestResponse, BacktestResult, BenchmarkComparison, AssetMetrics, CorrelationMatrix } from "./types";
import type { ReportConfig, ReportSectionId } from "./report-types";
import { FULL_BACKTEST_ORDER } from "./report-types";
import { LOGO_WHITE_PNG, LOGO_DARK_PNG, LOGO_ASPECT, KMARK_RED_PNG, KMARK_ASPECT } from "./report-logo";
import { computePortfolioScore, computeBenchmarkScore, type PortfolioScore, type ScoreDetail } from "./report-scoring";
import { computeTaxOnGain, type TaxMode } from "./tax-utils";

// -----------------------------------------------------------------------------
// COLORES (RGB para jsPDF)
// -----------------------------------------------------------------------------

// Paleta editorial de El Proyecto K: papel cálido + tinta carbón + grises
// cálidos del skill proyectok-pdf, PERO con el ROJO DE LA WEB #C81E2E (el
// mismo CTA de elproyectok.com) como único acento, para el toque minimalista.
const RGB = {
  beige: [245, 240, 232] as [number, number, number],
  page: [247, 244, 238] as [number, number, number],      // papel cálido #F7F4EE
  red: [200, 30, 46] as [number, number, number],          // ROJO web El Proyecto K #C81E2E
  redDark: [158, 22, 36] as [number, number, number],
  dark: [42, 39, 36] as [number, number, number],          // tinta carbón #2A2724
  cream: [242, 237, 227] as [number, number, number],      // texto sobre oscuro #F2EDE3
  gray: [138, 131, 120] as [number, number, number],       // gris cálido #8A8378
  grayD: [110, 103, 92] as [number, number, number],       // gris cálido oscuro #6E675C
  lightGray: [216, 210, 198] as [number, number, number],  // filete #D8D2C6
  white: [255, 255, 255] as [number, number, number],
  rowLight: [247, 244, 238] as [number, number, number],   // filas: papel
  rowAlt: [242, 236, 225] as [number, number, number],     // fila alterna #F2ECE1
  card: [239, 234, 223] as [number, number, number],       // caja clara sutil #EFEADF
  green: [60, 122, 80] as [number, number, number],        // verde corporativo #3C7A50
  redNeg: [200, 30, 46] as [number, number, number],       // negativo = rojo web #C81E2E
  darkBg: [42, 39, 36] as [number, number, number],        // carbón (cabeceras de tabla)
  gold: [192, 137, 46] as [number, number, number],        // oro corporativo #C0892E
  // Benchmark = oro corporativo (identidad de gráficos del skill).
  purple: [147, 51, 234] as [number, number, number],
  purpleLight: [168, 85, 247] as [number, number, number],
  // Cartera A = azul marino corporativo #3A4A5A, Cartera B = rojo corporativo.
  blueA: [58, 74, 90] as [number, number, number],
  blueAbg: [236, 239, 242] as [number, number, number],
  roseB: [200, 30, 46] as [number, number, number],
  roseBbg: [250, 233, 235] as [number, number, number],
};

// Tipografía editorial (estilo Consultoría K): serif para títulos y cifras,
// monoespaciada para etiquetas/eyebrows/cabeceras, sans para el cuerpo.
// jsPDF trae estas tres familias de serie (no hay que embeber TTF):
const F_SERIF = "times";       // ~Georgia (display, sub-headings, números KPI)
const F_MONO = "courier";      // ~Consolas (etiquetas, eyebrows, cabecera/pie)
const F_SANS = "helvetica";    // ~Segoe UI (cuerpo)

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

/** Dibuja el fondo blanco limpio de la página actual */
function drawBackground(pdf: jsPDF) {
  pdf.setFillColor(...RGB.page);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
}

/** Dibuja el logotipo oficial "El Proyecto k" (wordmark con la k caligráfica).
 *  white=true → versión blanca (para fondos oscuros / banda roja). */
function drawLogo(pdf: jsPDF, x: number, y: number, w: number, white = false) {
  const h = w / LOGO_ASPECT;
  // El alias hace que jsPDF embeba la imagen UNA sola vez aunque se pinte en
  // cada página (si no, el logo de la cabecera multiplicaría el peso del PDF).
  pdf.addImage(white ? LOGO_WHITE_PNG : LOGO_DARK_PNG, "PNG", x, y, w, h, white ? "epk-logo-white" : "epk-logo-dark", "FAST");
}

/** Dibuja el icono oficial "K" de El Proyecto K (k.svg de la web) en rojo.
 *  Se le pasa la ALTURA; devuelve el ancho resultante. */
function drawKMark(pdf: jsPDF, x: number, y: number, h: number): number {
  const w = h * KMARK_ASPECT;
  pdf.addImage(KMARK_RED_PNG, "PNG", x, y, w, h, "epk-kmark-red", "FAST");
  return w;
}

/** Header editorial: LOGO real "El Proyecto k" a la izq, subtítulo mono a la der. */
function drawHeader(pdf: jsPDF, subtitle: string) {
  drawLogo(pdf, ML, 6.5, 30, false);
  pdf.setFont(F_MONO, "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(...RGB.gray);
  pdf.text(subtitle.toUpperCase(), PAGE_W - MR, 11.5, { align: "right", charSpace: 0.3 });
}

/** Footer editorial: icono K real (rojo) + marca mono + nº de página de dos dígitos. */
function drawFooter(pdf: jsPDF, pageNum: number) {
  const kW = drawKMark(pdf, ML, PAGE_H - 12.4, 4.6);
  pdf.setFont(F_MONO, "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...RGB.gray);
  pdf.text("EL PROYECTO K · INVIERTE EN LO QUE NO CAMBIA", ML + kW + 2.5, PAGE_H - 9.3, { charSpace: 0.3 });
  pdf.text(String(pageNum).padStart(2, "0"), PAGE_W - MR, PAGE_H - 9.3, { align: "right", charSpace: 0.5 });
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

/** Cabecera de sección EDITORIAL: número mono rojo + eyebrow mono, título serif grande. */
function drawSectionHeader(ctx: RenderCtx, num: string, title: string) {
  ctx.y += 3;
  // Eyebrow: "NN  TÍTULO EN MAYÚSCULAS" en mono
  ctx.pdf.setFont(F_MONO, "bold");
  ctx.pdf.setFontSize(10);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text(num, ML, ctx.y, { charSpace: 0.5 });
  ctx.pdf.setFont(F_MONO, "normal");
  ctx.pdf.setFontSize(9.5);
  ctx.pdf.setTextColor(...RGB.gray);
  ctx.pdf.text(title.toUpperCase(), ML + 10, ctx.y, { charSpace: 0.5 });
  ctx.y += 9;
  // Título grande en serif, con AJUSTE para que nunca se salga del margen:
  // primero se encoge la fuente hasta caber en una línea; si aun así no cabe
  // (títulos muy largos), se reparte en varias líneas.
  ctx.pdf.setFont(F_SERIF, "normal");
  ctx.pdf.setTextColor(...RGB.dark);
  let tSize = 31;
  ctx.pdf.setFontSize(tSize);
  while (ctx.pdf.getTextWidth(title) > CW && tSize > 21) {
    tSize -= 0.5;
    ctx.pdf.setFontSize(tSize);
  }
  const tLines = ctx.pdf.getTextWidth(title) > CW
    ? (ctx.pdf.splitTextToSize(title, CW) as string[])
    : [title];
  const tLineH = tSize * 0.4;
  for (const ln of tLines) {
    ctx.pdf.text(ln, ML, ctx.y);
    ctx.y += tLineH;
  }
  ctx.y += 1;
}

/** Dibuja un párrafo justificado con wrap automático */
function drawBody(
  ctx: RenderCtx,
  text: string,
  options: { size?: number; color?: [number, number, number]; bold?: boolean; italic?: boolean } = {}
) {
  const size = options.size ?? 11;
  const color = options.color ?? RGB.dark;
  const style = options.bold && options.italic ? "bolditalic" : options.bold ? "bold" : options.italic ? "italic" : "normal";
  ctx.pdf.setFont("helvetica", style);
  ctx.pdf.setFontSize(size);
  ctx.pdf.setTextColor(...color);
  const lines = ctx.pdf.splitTextToSize(text, CW) as string[];
  const lineHeight = size * 0.46;
  for (const line of lines) {
    ensureSpace(ctx, lineHeight + 2);
    ctx.pdf.text(line, ML, ctx.y);
    ctx.y += lineHeight + 1;
  }
  ctx.y += 2;
}

/** Caja de comentario editorial: tarjeta clara con barra roja, eyebrow mono rojo. */
function drawCTABox(ctx: RenderCtx, title: string, body: string) {
  ctx.pdf.setFont(F_SANS, "normal");
  ctx.pdf.setFontSize(10.5);
  const lines = ctx.pdf.splitTextToSize(body, CW - 14) as string[];
  const boxH = 14 + lines.length * 5.1 + 3;
  ensureSpace(ctx, boxH + 6);
  ctx.pdf.setFillColor(...RGB.card);
  ctx.pdf.rect(ML, ctx.y, CW, boxH, "F");
  ctx.pdf.setFillColor(...RGB.red);
  ctx.pdf.rect(ML, ctx.y, 1.6, boxH, "F");
  // Eyebrow mono rojo
  ctx.pdf.setFont(F_MONO, "bold");
  ctx.pdf.setFontSize(9);
  ctx.pdf.setTextColor(...RGB.red);
  ctx.pdf.text(title.toUpperCase(), ML + 6, ctx.y + 8.5, { charSpace: 0.3 });
  // Cuerpo sans
  ctx.pdf.setFont(F_SANS, "normal");
  ctx.pdf.setFontSize(10.5);
  ctx.pdf.setTextColor(...RGB.dark);
  let yLine = ctx.y + 15;
  for (const line of lines) {
    ctx.pdf.text(line, ML + 6, yLine);
    yLine += 5.1;
  }
  ctx.y += boxH + 6;
}

/** Fila de tarjetas KPI editorial: número SERIF grande + etiqueta MONO + subtítulo. */
function drawStatCards(
  ctx: RenderCtx,
  cards: Array<{ label: string; value: string; sub?: string; color?: [number, number, number]; bg?: [number, number, number] }>
) {
  const n = cards.length;
  const gap = 4;
  const cw = (CW - gap * (n - 1)) / n;
  const ch = 30;
  ensureSpace(ctx, ch + 4);
  cards.forEach((c, i) => {
    const x = ML + i * (cw + gap);
    ctx.pdf.setFillColor(...(c.bg ?? RGB.card));
    ctx.pdf.rect(x, ctx.y, cw, ch, "F");
    // valor grande SERIF
    ctx.pdf.setFont(F_SERIF, "normal");
    ctx.pdf.setFontSize(22);
    ctx.pdf.setTextColor(...(c.color ?? RGB.dark));
    ctx.pdf.text(c.value, x + 4, ctx.y + 12);
    // etiqueta MONO
    ctx.pdf.setFont(F_MONO, "normal");
    ctx.pdf.setFontSize(7.2);
    ctx.pdf.setTextColor(...RGB.gray);
    ctx.pdf.text(c.label.toUpperCase(), x + 4, ctx.y + 19.5, { charSpace: 0.2 });
    // subtítulo sans
    if (c.sub) {
      ctx.pdf.setFont(F_SANS, "normal");
      ctx.pdf.setFontSize(7.4);
      ctx.pdf.setTextColor(...RGB.gray);
      ctx.pdf.text(c.sub, x + 4, ctx.y + 25);
    }
  });
  ctx.y += ch + 6;
}

// -----------------------------------------------------------------------------
// SECCIONES
// -----------------------------------------------------------------------------

/** Portada EDITORIAL: fondo carbón oscuro, logo blanco, eyebrow mono, título
 *  serif enorme en crema, meta mono+serif abajo. Estilo Consultoría K. */
function drawDarkCover(pdf: jsPDF, opts: {
  topRight: string[];
  eyebrow: string;
  title: string;
  subtitle: string;
  extraLines?: Array<{ tag: string; text: string; color: [number, number, number] }>;
  metaL: { label: string; value: string };
  metaR: { label: string; value: string };
}) {
  pdf.setFillColor(...RGB.dark);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");
  // Logo blanco arriba-izquierda
  drawLogo(pdf, ML, 18, 44, true);
  // Meta mono arriba-derecha
  pdf.setFont(F_MONO, "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(...RGB.gray);
  let ty = 21;
  for (const line of opts.topRight) { pdf.text(line.toUpperCase(), PAGE_W - MR, ty, { align: "right", charSpace: 0.4 }); ty += 5.5; }

  // Eyebrow con filete rojo corto
  const eyeY = 150;
  pdf.setDrawColor(...RGB.red); pdf.setLineWidth(0.7);
  pdf.line(ML, eyeY - 2.4, ML + 11, eyeY - 2.4);
  pdf.setFont(F_MONO, "normal"); pdf.setFontSize(9); pdf.setTextColor(...RGB.gray);
  pdf.text(opts.eyebrow.toUpperCase(), ML + 15, eyeY, { charSpace: 0.5 });

  // Título serif enorme (crema)
  pdf.setFont(F_SERIF, "normal"); pdf.setFontSize(44); pdf.setTextColor(...RGB.cream);
  const tlines = pdf.splitTextToSize(opts.title, CW) as string[];
  let yy = eyeY + 20;
  for (const l of tlines) { pdf.text(l, ML, yy); yy += 17; }

  // Subtítulo sans
  pdf.setFont(F_SANS, "normal"); pdf.setFontSize(11); pdf.setTextColor(...RGB.gray);
  const slines = pdf.splitTextToSize(opts.subtitle, CW - 25) as string[];
  yy += 3;
  for (const l of slines) { pdf.text(l, ML, yy); yy += 6; }

  // Líneas extra (p.ej. A · cartera, B · cartera)
  if (opts.extraLines) {
    yy += 5;
    for (const e of opts.extraLines) {
      pdf.setFont(F_MONO, "bold"); pdf.setFontSize(10); pdf.setTextColor(...e.color);
      pdf.text(e.tag, ML, yy);
      pdf.setFont(F_SERIF, "normal"); pdf.setFontSize(14); pdf.setTextColor(...RGB.cream);
      pdf.text(e.text.length > 48 ? e.text.substring(0, 47) + "…" : e.text, ML + 8, yy);
      yy += 8.5;
    }
  }

  // Hairline + meta abajo
  const hairY = PAGE_H - 52;
  pdf.setDrawColor(...RGB.grayD); pdf.setLineWidth(0.3);
  pdf.line(ML, hairY, PAGE_W - MR, hairY);
  const my = hairY + 13;
  pdf.setFont(F_MONO, "normal"); pdf.setFontSize(7.5); pdf.setTextColor(...RGB.gray);
  pdf.text(opts.metaL.label.toUpperCase(), ML, my, { charSpace: 0.4 });
  pdf.text(opts.metaR.label.toUpperCase(), PAGE_W - MR, my, { align: "right", charSpace: 0.4 });
  pdf.setFont(F_SERIF, "normal"); pdf.setFontSize(16); pdf.setTextColor(...RGB.cream);
  pdf.text(opts.metaL.value, ML, my + 9);
  pdf.text(opts.metaR.value, PAGE_W - MR, my + 9, { align: "right" });
}

function renderCover(pdf: jsPDF, result: BacktestResult, config: ReportConfig, otherName?: string, benchName?: string) {
  const start = result.timeSeries[0]?.date ?? "";
  const end = result.timeSeries[result.timeSeries.length - 1]?.date ?? "";
  const today = config.reportDate ?? new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
  drawDarkCover(pdf, {
    topRight: ["Anexo al informe", "Backtest de cartera", today],
    eyebrow: `Backtest de cartera${benchName ? ` · vs ${benchName}` : ""}`,
    title: "Backtest de tu cartera",
    subtitle: `Comportamiento histórico de ${result.portfolioName}${otherName ? `, comparada con ${otherName}` : ""}, con datos reales de cada activo.`,
    metaL: { label: "Preparado para", value: config.clientName || result.portfolioName },
    metaR: { label: "Periodo analizado", value: `${start} – ${end}` },
  });
}

function renderScore(ctx: RenderCtx, score: PortfolioScore, benchScore?: PortfolioScore | null, benchName?: string) {
  drawSectionHeader(ctx, "01", "Tu cartera de 0 a 10");
  const bmName = benchName ?? "Benchmark";

  drawBody(ctx,
    "Esta es la valoración global de tu cartera. La nota se calcula sobre las " +
    "métricas antes de impuestos, porque la calidad intrínseca de la cartera " +
    "no depende de tu situación fiscal personal.",
    { size: 11 }
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
    { size: 11 }
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
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
    columnStyles: { 0: { font: F_SANS }, 1: { halign: "right", fontStyle: "bold" } },
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
      theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
      bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
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
  // Si la cartera no tributa pero la comparada sí, mostramos el pendiente
  // HIPOTÉTICO (régimen heredado) — igual que TaxImpactCard en la web — y lo
  // marcamos como tal en la tabla. Las métricas principales del informe NO
  // usan esta herencia (allí taxMode "none" = cero impuestos siempre).
  let pendingEsHipotetico = false;
  if (ownMode === "none" && otherResult) {
    const otherMode = (otherResult.fees.taxMode ?? "none") as TaxMode;
    const otherRate = otherResult.fees.taxRate ?? 0;
    if (otherMode !== "none") {
      pending = computeTaxOnGain(result.fees.unrealizedGain ?? 0, otherMode, otherRate);
      pendingEsHipotetico = pending > 0;
    }
  }

  // Bruto exacto del motor (contrafactual sin salidas fiscales, con el
  // compuesto incluido); fallback al nominal final+pagados.
  const valBruto = result.grossFinalValue ?? (result.finalValue + paid);
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
  const liquidarLabel = pendingEsHipotetico
    ? `3. Neta al liquidar (hipotético)\nSi tributaras como la cartera comparada`
    : `3. Neta al liquidar\nLo que de verdad te llevas al bolsillo`;
  const body = hasBmTax
    ? [
        [`1. Bruta (en el papel)\nAntes de cualquier impuesto`, fmtEUR(valBruto), fmtEUR(bmBruto)],
        [`2. Neta del camino\nLo que ves hoy en tu cuenta`, fmtEUR(valCamino), fmtEUR(bmCamino)],
        [liquidarLabel, fmtEUR(valLiquidar), fmtEUR(bmLiquidar)],
      ]
    : [
        [`1. Bruta (en el papel)\nAntes de cualquier impuesto`, fmtEUR(valBruto)],
        [`2. Neta del camino\nLo que ves hoy en tu cuenta`, fmtEUR(valCamino)],
        [liquidarLabel, fmtEUR(valLiquidar)],
      ];

  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head,
    body,
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { fontSize: 9, textColor: RGB.dark, valign: "middle" },
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
      { size: 10 }
    );
  } else if (paid === 0 && pending > 0) {
    drawBody(ctx,
      `No has pagado impuestos durante el camino (típico de fondos con traspaso fiscal), ` +
      `pero al liquidar tributarías hipotéticamente unos ${fmtEUR(pending)}. Esta cifra ` +
      `es la única forma justa de comparar tu cartera con otra que sí tributa por el camino.`,
      { size: 10 }
    );
  }
}

function renderRecommendation(ctx: RenderCtx, score: PortfolioScore) {
  drawSectionHeader(ctx, "16", "Conclusiones");

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
    drawBody(ctx, item, { size: 10 });
  }

  ctx.y += 4;
  drawBody(ctx,
    "El Proyecto K no es una entidad de asesoramiento financiero regulada por la CNMV.",
    { size: 10, bold: true }
  );
}

// =============================================================================
// SECCIONES DEL BACKTEST COMPLETO (reproducen la pantalla de resultados)
// Comentario AUTO-generado en la voz de El Proyecto K: directo, anti-banca con
// datos, cercano pero riguroso, sin prescribir.
// =============================================================================

/** Cierra una tabla autoTable y avanza el cursor vertical. */
function tableEnd(ctx: RenderCtx) {
  ctx.y = (ctx.pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
}

/** Tabla estándar con la estética del informe. */
function drawTable(
  ctx: RenderCtx,
  head: string[],
  body: (string | number)[][],
  columnStyles?: Record<number, { halign?: "left" | "center" | "right"; fontStyle?: "bold"; cellWidth?: number }>
) {
  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head: [head],
    body: body.map((r) => r.map((c) => String(c))),
    theme: "plain",
    headStyles: {
      font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray,
      cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 },
      lineColor: RGB.dark, lineWidth: { bottom: 0.3 },
    },
    bodyStyles: {
      font: F_MONO, fontSize: 9.5, textColor: RGB.dark,
      cellPadding: { top: 2.6, right: 2, bottom: 2.6, left: 2 },
      lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 },
    },
    // Columna 0 = etiquetas en sans; resto (cifras) en mono.
    columnStyles: { 0: { font: F_SANS, halign: "left" }, ...(columnStyles as Record<number, object>) },
  });
  tableEnd(ctx);
}

const MONTHS_ES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Color verde→rojo según signo e intensidad (para heatmaps de rentabilidad). */
function heatColor(v: number, maxAbs: number): [number, number, number] {
  const t = maxAbs > 0 ? Math.max(0, Math.min(1, Math.abs(v) / maxAbs)) : 0;
  if (v >= 0) {
    return [Math.round(255 - t * (255 - 46)), Math.round(255 - t * (255 - 125)), Math.round(255 - t * (255 - 50))];
  }
  return [Math.round(255 - t * (255 - 198)), Math.round(255 - t * (255 - 40)), Math.round(255 - t * (255 - 40))];
}

/** Color para correlaciones: +1 rojo (se mueven juntos), 0 neutro, -1 verde. */
function corrColor(c: number): [number, number, number] {
  if (c >= 0) {
    const t = Math.max(0, Math.min(1, c));
    return [Math.round(245 - t * (245 - 198)), Math.round(240 - t * (240 - 60)), Math.round(232 - t * (232 - 50))];
  }
  const t = Math.max(0, Math.min(1, -c));
  return [Math.round(245 - t * (245 - 46)), Math.round(240 - t * (240 - 125)), Math.round(232 - t * (232 - 50))];
}

// 03b — Todas las métricas
function renderMetricsFull(ctx: RenderCtx, result: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "03", "Todas las métricas");
  drawBody(ctx,
    "El cuadro de mando completo. No te obsesiones con un solo número: una cartera buena " +
    "no es la que más sube, es la que te deja dormir mientras compone a largo plazo."
  );
  const m = result.metrics;
  const bm = benchmark?.benchmarkMetrics;
  const hasBm = !!bm;
  const bmName = benchmark?.benchmarkName ?? "Referencia";
  const rows: (string | number)[][] = [
    ["Rentabilidad total", fmtPct(m.totalReturn * 100), hasBm ? fmtPct(bm!.totalReturn * 100) : "—"],
    ["CAGR (anualizada)", fmtPct(m.cagr * 100), hasBm ? fmtPct(bm!.cagr * 100) : "—"],
    ["Volatilidad anual", fmtPct(m.volatility * 100), hasBm ? fmtPct(bm!.volatility * 100) : "—"],
    ["Ratio de Sharpe", m.sharpe.toFixed(2), hasBm ? bm!.sharpe.toFixed(2) : "—"],
    ["Ratio de Sortino", m.sortino.toFixed(2), hasBm ? bm!.sortino.toFixed(2) : "—"],
    ["Ratio de Calmar", m.calmar.toFixed(2), hasBm ? bm!.calmar.toFixed(2) : "—"],
    ["Máximo drawdown", fmtPct(m.maxDrawdown * 100), hasBm ? fmtPct(bm!.maxDrawdown * 100) : "—"],
    ["Mejor mes", fmtPct(m.bestMonth * 100), hasBm ? fmtPct(bm!.bestMonth * 100) : "—"],
    ["Peor mes", fmtPct(m.worstMonth * 100), hasBm ? fmtPct(bm!.worstMonth * 100) : "—"],
    ["% meses positivos", fmtPct(m.positiveMonthsRatio * 100), hasBm ? fmtPct(bm!.positiveMonthsRatio * 100) : "—"],
    ["VaR histórico (mensual)", fmtPct(m.varHistorical * 100), hasBm ? fmtPct(bm!.varHistorical * 100) : "—"],
    ["CVaR (mensual)", fmtPct(m.cvar * 100), hasBm ? fmtPct(bm!.cvar * 100) : "—"],
    ["Asimetría", m.skewness.toFixed(2), hasBm ? bm!.skewness.toFixed(2) : "—"],
    ["Exceso de curtosis", m.excessKurtosis.toFixed(2), hasBm ? bm!.excessKurtosis.toFixed(2) : "—"],
  ];
  const head = hasBm ? ["Métrica", "Tu cartera", bmName] : ["Métrica", "Tu cartera", ""];
  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head: [head],
    body: rows.map((r) => r.map((c) => String(c))),
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
    columnStyles: { 0: { font: F_SANS }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && hasBm) {
        data.cell.styles.textColor = RGB.purple;
      }
    },
  });
  tableEnd(ctx);
  drawBody(ctx,
    "Sharpe y Sortino miden cuánta rentabilidad sacas por cada unidad de riesgo: por encima " +
    "de 1 es notable; por debajo de 0,5 estás asumiendo sustos que no te pagan. El Sortino " +
    "solo castiga las caídas (que es lo que de verdad duele).",
    { size: 10, color: RGB.gray }
  );
}

// 03c — Rentabilidad año a año
function renderAnnualReturns(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "04", "Rentabilidad año a año");
  drawBody(ctx,
    "Ningún año se parece al anterior. Lo importante no es acertar el bueno, sino aguantar el " +
    "malo sin vender. Aquí ves en verde los años que ganaste y en rojo los que perdiste."
  );
  const ar = result.annualReturns;
  if (ar.length === 0) { drawBody(ctx, "No hay años completos en el periodo analizado.", { italic: true }); return; }
  const maxAbs = Math.max(...ar.map((a) => Math.abs(a.returnPct)), 1);
  // mini barras horizontales
  ensureSpace(ctx, ar.length * 7 + 6);
  const labelW = 16;
  const barX = ML + labelW;
  const barMaxW = CW - labelW - 28;
  const mid = barX + barMaxW / 2;
  ctx.pdf.setFontSize(8);
  for (const a of ar) {
    const rowY = ctx.y;
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setTextColor(...RGB.dark);
    ctx.pdf.text(String(a.year), ML, rowY + 3);
    const w = (Math.abs(a.returnPct) / maxAbs) * (barMaxW / 2);
    if (a.returnPct >= 0) {
      ctx.pdf.setFillColor(...RGB.green);
      ctx.pdf.rect(mid, rowY, w, 4.5, "F");
    } else {
      ctx.pdf.setFillColor(...RGB.redNeg);
      ctx.pdf.rect(mid - w, rowY, w, 4.5, "F");
    }
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setTextColor(...(a.returnPct >= 0 ? RGB.green : RGB.redNeg));
    ctx.pdf.text(fmtPct(a.returnPct), barX + barMaxW + 2, rowY + 3);
    ctx.y += 7;
  }
  // eje cero
  ctx.pdf.setDrawColor(...RGB.lightGray);
  ctx.pdf.setLineWidth(0.2);
  ctx.y += 1;
}

// 04b — Mapa de calor mensual
function renderMonthlyHeatmap(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "05", "Mapa de calor mensual");
  drawBody(ctx,
    "La textura real del camino, mes a mes. Casi todos los meses no pasa casi nada; el dinero " +
    "se hace aguantando los pocos meses extraordinarios, que llegan sin avisar."
  );
  const ts = result.timeSeries;
  const cells = new Map<string, number>();
  for (let i = 1; i < ts.length; i++) {
    const prev = ts[i - 1]!.value;
    const cur = ts[i]!.value;
    if (prev > 0) cells.set(ts[i]!.date.substring(0, 7), cur / prev - 1);
  }
  const years = Array.from(new Set(ts.map((p) => p.date.substring(0, 4)))).sort();
  if (cells.size === 0) { drawBody(ctx, "Sin datos mensuales suficientes.", { italic: true }); return; }
  const maxAbs = Math.max(...Array.from(cells.values()).map((v) => Math.abs(v)), 0.01);
  const yearW = 12;
  const cellW = (CW - yearW) / 12;
  const cellH = 6;
  ensureSpace(ctx, (years.length + 1) * cellH + 8);
  // cabecera meses
  ctx.pdf.setFontSize(6.5);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setTextColor(...RGB.gray);
  for (let m = 0; m < 12; m++) {
    ctx.pdf.text(MONTHS_ES[m]!, ML + yearW + m * cellW + cellW / 2, ctx.y + 3, { align: "center" });
  }
  ctx.y += cellH;
  for (const y of years) {
    ensureSpace(ctx, cellH + 2);
    ctx.pdf.setFont("helvetica", "bold");
    ctx.pdf.setFontSize(6.5);
    ctx.pdf.setTextColor(...RGB.dark);
    ctx.pdf.text(y, ML, ctx.y + 4);
    for (let m = 0; m < 12; m++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      const x = ML + yearW + m * cellW;
      if (cells.has(key)) {
        const v = cells.get(key)!;
        ctx.pdf.setFillColor(...heatColor(v, maxAbs));
        ctx.pdf.rect(x, ctx.y, cellW - 0.5, cellH - 0.5, "F");
        ctx.pdf.setFontSize(5);
        ctx.pdf.setFont("helvetica", "normal");
        ctx.pdf.setTextColor(...(Math.abs(v) / maxAbs > 0.55 ? RGB.white : RGB.dark));
        ctx.pdf.text((v * 100).toFixed(0), x + cellW / 2, ctx.y + cellH / 2 + 1, { align: "center" });
      } else {
        ctx.pdf.setFillColor(...RGB.rowAlt);
        ctx.pdf.rect(x, ctx.y, cellW - 0.5, cellH - 0.5, "F");
      }
    }
    ctx.y += cellH;
  }
  ctx.y += 4;
}

// 04c — Las peores caídas
function renderTopDrawdowns(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "06", "Las peores caídas");
  drawBody(ctx,
    "El examen de verdad de una cartera no es cuánto sube, es cuánto cae y cuánto tarda en " +
    "recuperarse. El que vende en el fondo convierte una caída temporal en una pérdida permanente."
  );
  const dd = result.topDrawdowns.slice(0, 5);
  if (dd.length === 0) { drawBody(ctx, "No se registraron caídas significativas.", { italic: true }); return; }
  const body = dd.map((d, i) => [
    `#${i + 1}`,
    fmtPct(d.drawdownPct * 100),
    (d.peakExactDate ?? d.peakDate).substring(0, 7),
    (d.troughExactDate ?? d.troughDate).substring(0, 7),
    d.recoveryDate ? (d.recoveryExactDate ?? d.recoveryDate).substring(0, 7) : "Sin recuperar",
    d.recoveryMonths != null ? `${d.recoveryMonths} m` : "—",
  ]);
  drawTable(ctx, ["#", "Caída", "Desde", "Fondo", "Recuperación", "Tardó"], body, {
    1: { halign: "right", fontStyle: "bold" },
  });
}

// 06b — Rentabilidad en ventanas móviles
function renderRolling(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "07", "Rentabilidad en ventanas móviles");
  drawBody(ctx,
    "Esto es el mejor antídoto contra el 'lo invierto cuando baje'. Mira qué rentabilidad " +
    "anualizada habrías obtenido según el mes en que entraste, a 1, 3 y 5 años. Cuanto más " +
    "larga la ventana, más se estrecha el abanico: el tiempo es tu mejor aliado."
  );
  const rs = result.rollingStats;
  const body = [rs.oneYear, rs.threeYear, rs.fiveYear, rs.tenYear]
    .filter((b) => b.count > 0)
    .map((b) => [
      b.label,
      String(b.count),
      fmtPct(b.bestCagr * 100),
      fmtPct(b.avgCagr * 100),
      fmtPct(b.worstCagr * 100),
      `${(b.positiveRatio * 100).toFixed(0)}%`,
    ]);
  if (body.length === 0) { drawBody(ctx, "El periodo es demasiado corto para ventanas móviles.", { italic: true }); return; }
  drawTable(ctx, ["Ventana", "Nº", "Mejor", "Media", "Peor", "% positivas"], body, {
    2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "right" }, 5: { halign: "right" },
  });
  const fiveY = rs.fiveYear;
  if (fiveY.count > 0 && fiveY.worstCagr >= 0) {
    drawBody(ctx,
      `Dato para enmarcar: en TODAS las ventanas de 5 años del periodo, hasta la peor terminó en ` +
      `positivo (${fmtPct(fiveY.worstCagr * 100)} anual). Esto es exactamente por lo que el largo plazo perdona.`,
      { size: 10, color: RGB.green, bold: true }
    );
  }
}

// 07b — Distribución de rentabilidades (histograma)
function renderHistogram(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "08", "Distribución de rentabilidades");
  const h = result.returnsHistogram;
  drawBody(ctx,
    `Con qué frecuencia se repiten los meses buenos y malos (${h.periodLabel.toLowerCase()}). ` +
    "La mayoría se agolpa cerca del centro: el día a día es aburrido. Lo que mueve la aguja son las colas."
  );
  if (h.bins.length === 0) { drawBody(ctx, "Sin datos suficientes para la distribución.", { italic: true }); return; }
  const maxCount = Math.max(...h.bins.map((b) => b.count), 1);
  ensureSpace(ctx, 62);
  const chartX = ML + 4;
  const chartY = ctx.y;
  const chartW = CW - 8;
  const chartH = 48;
  const bw = chartW / h.bins.length;
  for (let i = 0; i < h.bins.length; i++) {
    const b = h.bins[i]!;
    const barH = (b.count / maxCount) * chartH;
    const x = chartX + i * bw;
    ctx.pdf.setFillColor(...(b.binMid >= 0 ? RGB.green : RGB.redNeg));
    ctx.pdf.rect(x + 0.4, chartY + chartH - barH, bw - 0.8, barH, "F");
  }
  // eje X
  ctx.pdf.setDrawColor(...RGB.lightGray);
  ctx.pdf.setLineWidth(0.3);
  ctx.pdf.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  ctx.pdf.setFontSize(5.5);
  ctx.pdf.setFont("helvetica", "normal");
  ctx.pdf.setTextColor(...RGB.gray);
  for (let i = 0; i < h.bins.length; i += Math.ceil(h.bins.length / 8)) {
    const b = h.bins[i]!;
    ctx.pdf.text(`${(b.binMid * 100).toFixed(0)}%`, chartX + i * bw + bw / 2, chartY + chartH + 4, { align: "center" });
  }
  ctx.y += chartH + 8;
  drawBody(ctx,
    `Media mensual ${fmtPct(h.mean * 100, 2)}, con una desviación de ${(h.stdDev * 100).toFixed(2)}%. ` +
    "Cuanto más a la derecha esté el grueso y más cortas las colas rojas, mejor duermes.",
    { size: 10, color: RGB.gray }
  );
}

// 08b — De qué está hecha tu cartera (composición)
function renderComposition(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "09", "De qué está hecha tu cartera");
  drawBody(ctx,
    "Lo que de verdad determina tu resultado no es qué fondo concreto eliges, sino el reparto " +
    "entre tipos de activo. Aquí está esa foto."
  );
  const a = result.allocation;
  const drawSlices = (title: string, slices: { label: string; weight: number }[]) => {
    if (!slices || slices.length === 0) return;
    drawBody(ctx, title, { bold: true, size: 10 });
    const body = slices
      .slice()
      .sort((x, y) => y.weight - x.weight)
      .map((s) => [s.label, fmtPct(s.weight * 100).replace("+", "")]);
    drawTable(ctx, ["Categoría", "Peso"], body, { 1: { halign: "right", fontStyle: "bold" } });
  };
  drawSlices("Por clase de activo (RV / RF / Oro / Alternativos)", a.byAssetClass);
  drawSlices("Por estilo de gestión (indexado vs activo)", a.byManagement);
}

// 09b — Correlación entre activos
function renderCorrelations(ctx: RenderCtx, matrix?: CorrelationMatrix) {
  drawSectionHeader(ctx, "10", "Correlación entre activos");
  drawBody(ctx,
    "Diversificar no es tener muchos fondos: es tener fondos que NO se muevan a la vez. Dos " +
    "fondos con correlación 0,95 son, a efectos prácticos, el mismo fondo cobrándote dos comisiones. " +
    "Verde = se diversifican; rojo = van de la mano."
  );
  if (!matrix || matrix.fundIds.length < 2) {
    drawBody(ctx, "Se necesitan al menos dos activos con histórico común para calcular correlaciones.", { italic: true });
    return;
  }
  const n = matrix.fundIds.length;
  const names = matrix.fundNames;
  const labelW = 30;
  const cellW = Math.min(12, (CW - labelW) / n);
  const cellH = 7;
  ensureSpace(ctx, (n + 1) * cellH + 6);
  // cabecera: índices
  ctx.pdf.setFontSize(6);
  ctx.pdf.setFont("helvetica", "bold");
  ctx.pdf.setTextColor(...RGB.gray);
  for (let j = 0; j < n; j++) {
    ctx.pdf.text(String(j + 1), ML + labelW + j * cellW + cellW / 2, ctx.y + 4, { align: "center" });
  }
  ctx.y += cellH;
  for (let i = 0; i < n; i++) {
    ensureSpace(ctx, cellH + 2);
    ctx.pdf.setFont("helvetica", "normal");
    ctx.pdf.setFontSize(6.5);
    ctx.pdf.setTextColor(...RGB.dark);
    const label = `${i + 1}. ${names[i] ?? matrix.fundIds[i]}`;
    ctx.pdf.text(label.length > 26 ? label.substring(0, 25) + "…" : label, ML, ctx.y + 4.5);
    for (let j = 0; j < n; j++) {
      const c = matrix.matrix[i]?.[j] ?? 0;
      const x = ML + labelW + j * cellW;
      ctx.pdf.setFillColor(...corrColor(c));
      ctx.pdf.rect(x, ctx.y, cellW - 0.5, cellH - 0.5, "F");
      ctx.pdf.setFontSize(5.5);
      ctx.pdf.setTextColor(...RGB.dark);
      ctx.pdf.text(c.toFixed(2), x + cellW / 2, ctx.y + cellH / 2 + 1, { align: "center" });
    }
    ctx.y += cellH;
  }
  ctx.y += 4;
}

// 10b — Métricas por activo
function renderAssetMetricsSection(ctx: RenderCtx, assets?: AssetMetrics[]) {
  drawSectionHeader(ctx, "11", "Métricas por activo");
  drawBody(ctx,
    "Qué aporta cada pieza por separado. Mira con lupa los fondos de gestión activa: si uno " +
    "se mueve igual que un índice pero cobra cinco veces más de comisión, ya sabes qué sobra."
  );
  if (!assets || assets.length === 0) {
    drawBody(ctx, "No hay métricas por activo disponibles para esta cartera.", { italic: true });
    return;
  }
  const body = assets
    .slice()
    .sort((a, b) => b.cagr - a.cagr)
    .map((a) => [
      a.name.length > 28 ? a.name.substring(0, 27) + "…" : a.name,
      `${a.ter.toFixed(2)}%`,
      fmtPct(a.cagr * 100),
      fmtPct(a.volatility * 100).replace("+", ""),
      fmtPct(a.maxDrawdown * 100),
      a.sharpe.toFixed(2),
    ]);
  drawTable(ctx, ["Activo", "TER", "CAGR", "Volat.", "Máx DD", "Sharpe"], body, {
    1: { halign: "right" }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "right" },
    4: { halign: "right" }, 5: { halign: "right" },
  });
}

// 11b — Resistencia en crisis históricas
function renderStress(ctx: RenderCtx, result: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "12", "Resistencia en crisis históricas");
  drawBody(ctx,
    "Las crisis no se avisan, pero sí se repiten. Así se habría comportado tu cartera en los " +
    "episodios que de verdad ponen a prueba el estómago de un inversor."
  );
  const sp = result.stressPeriods.filter((s) => s.hasFullData);
  if (sp.length === 0) {
    drawBody(ctx, "El periodo analizado no cubre crisis históricas completas (2008, COVID 2020, 2022).", { italic: true });
    return;
  }
  const bmMap = new Map((benchmark?.benchmarkStressPeriods ?? []).map((s) => [s.id, s]));
  const hasBm = bmMap.size > 0;
  const body = sp.map((s) => {
    const row: (string | number)[] = [
      s.name,
      s.totalReturn != null ? fmtPct(s.totalReturn * 100) : "—",
      s.maxDrawdown != null ? fmtPct(s.maxDrawdown * 100) : "—",
    ];
    if (hasBm) {
      const b = bmMap.get(s.id);
      row.push(b && b.totalReturn != null ? fmtPct(b.totalReturn * 100) : "—");
    }
    return row;
  });
  const head = hasBm
    ? ["Episodio", "Rentab.", "Peor caída", benchmark?.benchmarkName ?? "Ref."]
    : ["Episodio", "Rentabilidad", "Peor caída"];
  drawTable(ctx, head, body, { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" }, 3: { halign: "right" } });
}

// 12b — Comparativa con el benchmark
function renderComparison(ctx: RenderCtx, result: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "13", "Comparativa con la referencia");
  if (!benchmark) {
    drawBody(ctx, "No seleccionaste un benchmark de referencia para esta comparación.", { italic: true });
    return;
  }
  drawBody(ctx,
    `Frente a ${benchmark.benchmarkName}. La pregunta honesta no es solo si bates al índice, sino ` +
    "si el extra que sacas (o dejas de sacar) compensa el riesgo y el coste que asumes."
  );
  const body: (string | number)[][] = [
    ["Alfa de Jensen (anual)", fmtPct(benchmark.alpha * 100)],
    ["Beta", benchmark.beta.toFixed(2)],
    ["Correlación", benchmark.correlation.toFixed(2)],
    ["R²", benchmark.rSquared.toFixed(2)],
    ["Tracking error", fmtPct(benchmark.trackingError * 100).replace("+", "")],
    ["Information ratio", benchmark.informationRatio.toFixed(2)],
    ["Captura de subidas", `${(benchmark.upCapture * 100).toFixed(0)}%`],
    ["Captura de bajadas", `${(benchmark.downCapture * 100).toFixed(0)}%`],
  ];
  drawTable(ctx, ["Métrica vs referencia", "Valor"], body, { 1: { halign: "right", fontStyle: "bold" } });
  drawBody(ctx,
    "Capturar el 100% de las subidas y menos del 100% de las bajadas es el santo grial. Si capturas " +
    "más bajada que subida, el fondo te está saliendo caro en el peor momento.",
    { size: 10, color: RGB.gray }
  );
}

// 13b — El poder de las aportaciones
function renderContributions(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "14", "El poder de las aportaciones");
  const aportado = result.totalContributions;
  const inicial = result.timeSeries[0]?.value ?? 0;
  const aportadoPeriodico = Math.max(0, aportado - inicial);
  const valorFinal = result.finalValue;
  const crecimiento = valorFinal - aportado;
  drawBody(ctx,
    "Cuánto de tu patrimonio final viene de aportar con disciplina y cuánto del crecimiento " +
    "compuesto. Aportar cada mes pase lo que pase es, sin glamour, la decisión que más mueve la aguja."
  );
  const body: (string | number)[][] = [
    ["Capital inicial", fmtEUR(inicial)],
    ["Aportado durante el periodo", fmtEUR(aportadoPeriodico)],
    ["Total de tu bolsillo", fmtEUR(aportado)],
    ["Generado por el mercado", fmtEUR(crecimiento)],
    ["Valor final", fmtEUR(valorFinal)],
  ];
  drawTable(ctx, ["Concepto", "Importe"], body, { 1: { halign: "right", fontStyle: "bold" } });
  if (aportado > 0) {
    const pctCrec = (crecimiento / valorFinal) * 100;
    drawBody(ctx,
      `De cada 100 € de tu patrimonio final, ${(100 - pctCrec).toFixed(0)} € los pusiste tú y ` +
      `${pctCrec.toFixed(0)} € los puso el interés compuesto. Esa segunda cifra crece sola con el tiempo.`,
      { size: 10, color: RGB.green, bold: true }
    );
  }
}

// 14b — Historial de movimientos (rebalanceos)
function renderRebalances(ctx: RenderCtx, result: BacktestResult) {
  drawSectionHeader(ctx, "15", "Historial de movimientos");
  drawBody(ctx,
    "Cada rebalanceo vende lo que ha subido y compra lo que ha bajado: disciplina automática " +
    "que te obliga a hacer lo contrario de lo que pide el miedo. Si tributas, también ves aquí el peaje."
  );
  const rb = result.rebalanceLog;
  if (rb.length === 0) { drawBody(ctx, "No hubo rebalanceos en el periodo (cartera sin rebalanceo o un solo activo).", { italic: true }); return; }
  const totalTax = rb.reduce((s, r) => s + r.taxPaid, 0);
  const body = rb.slice(0, 24).map((r) => [
    r.date.substring(0, 7),
    fmtEUR(r.portfolioValueBefore),
    r.totalGain >= 0 ? fmtEUR(r.totalGain) : `-${fmtEUR(-r.totalGain)}`,
    r.taxPaid > 0 ? fmtEUR(r.taxPaid) : "—",
  ]);
  drawTable(ctx, ["Fecha", "Valor cartera", "Plusvalía cristalizada", "Impuesto"], body, {
    1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" },
  });
  if (rb.length > 24) drawBody(ctx, `(Mostrados los primeros 24 de ${rb.length} movimientos.)`, { size: 8, italic: true, color: RGB.gray });
  if (totalTax > 0) {
    drawBody(ctx,
      `Peaje fiscal total por el camino: ${fmtEUR(totalTax)}. Cada euro que adelantas a Hacienda ` +
      "es un euro que deja de componer — por eso la fiscalidad diferida de los fondos traspasables es oro.",
      { size: 10, color: RGB.redNeg }
    );
  }
}

// =============================================================================
// INFORME COMPARATIVO A vs B (cuando hay dos carteras)
// Cartera A en azul, Cartera B en rosa, benchmark en púrpura. Veredicto y
// comentario en voz El Proyecto K.
// =============================================================================

/** Devuelve " (gana A)" / " (gana B)" / "" según quién es mejor (higherBetter). */
function winnerTag(va: number, vb: number, higherBetter: boolean): string {
  if (Math.abs(va - vb) < 1e-9) return " (empate)";
  const aWins = higherBetter ? va > vb : va < vb;
  return aWins ? " — gana A" : " — gana B";
}

function renderCompareCover(pdf: jsPDF, a: BacktestResult, b: BacktestResult, config: ReportConfig, benchName?: string) {
  const start = a.timeSeries[0]?.date ?? "";
  const end = a.timeSeries[a.timeSeries.length - 1]?.date ?? "";
  const today = config.reportDate ?? new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
  drawDarkCover(pdf, {
    topRight: ["Informe comparativo", "Backtest de cartera", today],
    eyebrow: `Comparador de carteras${benchName ? ` · vs ${benchName}` : ""}`,
    title: "Tus carteras, cara a cara",
    subtitle: "Comportamiento histórico de las dos carteras sobre exactamente los mismos datos.",
    extraLines: [
      { tag: "A", text: a.portfolioName, color: RGB.cream },
      { tag: "B", text: b.portfolioName, color: RGB.cream },
    ],
    metaL: { label: "Preparado para", value: config.clientName || "—" },
    metaR: { label: "Periodo analizado", value: `${start} – ${end}` },
  });
}

function renderCompareHero(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "01", "El veredicto en 30 segundos");
  const ma = a.metrics, mb = b.metrics;
  drawBody(ctx,
    "Sin rodeos: las dos carteras enfrentadas en lo que importa. Más rentabilidad casi siempre " +
    "viene con más sustos; la cartera ganadora no es la que más sube, es la que mejor equilibra " +
    "rentabilidad, riesgo y coste para que aguantes invertido."
  );
  // Tarjetas KPI de cabecera
  const diffCagrPts = (ma.cagr - mb.cagr) * 100;
  const ganador = ma.cagr >= mb.cagr ? "A" : "B";
  drawStatCards(ctx, [
    { label: "Valor final · A", value: fmtEUR(a.finalValue), sub: a.portfolioName.substring(0, 18), color: RGB.blueA, bg: RGB.blueAbg },
    { label: "Valor final · B", value: fmtEUR(b.finalValue), sub: b.portfolioName.substring(0, 18), color: RGB.roseB, bg: RGB.roseBbg },
    { label: "Ventaja anual", value: `${diffCagrPts >= 0 ? "+" : ""}${diffCagrPts.toFixed(1)} pts`, sub: `gana ${diffCagrPts >= 0 ? "A" : "B"}`, color: RGB.dark },
    { label: "Más rentable", value: ganador, sub: "en CAGR", color: ganador === "A" ? RGB.blueA : RGB.roseB },
  ]);
  const rows: (string | number)[][] = [
    ["Valor final", fmtEUR(a.finalValue), fmtEUR(b.finalValue), winnerTag(a.finalValue, b.finalValue, true).replace(" — ", "")],
    ["Rentab. anual (CAGR)", fmtPct(ma.cagr * 100), fmtPct(mb.cagr * 100), winnerTag(ma.cagr, mb.cagr, true).replace(" — ", "")],
    ["Volatilidad", fmtPct(ma.volatility * 100), fmtPct(mb.volatility * 100), winnerTag(ma.volatility, mb.volatility, false).replace(" — ", "")],
    ["Peor caída", fmtPct(ma.maxDrawdown * 100), fmtPct(mb.maxDrawdown * 100), winnerTag(ma.maxDrawdown, mb.maxDrawdown, true).replace(" — ", "")],
    ["Sharpe (rent./riesgo)", ma.sharpe.toFixed(2), mb.sharpe.toFixed(2), winnerTag(ma.sharpe, mb.sharpe, true).replace(" — ", "")],
    ["Coste (TER medio)", `${a.fees.weightedTer.toFixed(2)}%`, `${b.fees.weightedTer.toFixed(2)}%`, winnerTag(a.fees.weightedTer, b.fees.weightedTer, false).replace(" — ", "")],
  ];
  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head: [["Métrica", `A · ${a.portfolioName}`, `B · ${b.portfolioName}`, "Mejor"]],
    body: rows.map((r) => r.map((c) => String(c))),
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
    columnStyles: { 0: { font: F_SANS }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "center", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index === 1) data.cell.styles.textColor = RGB.blueA;
      if (data.section === "head" && data.column.index === 2) data.cell.styles.textColor = RGB.roseB;
      if (data.section === "body" && data.column.index === 3) {
        const v = String(data.cell.raw);
        if (v.includes("gana A") || v === "gana A") data.cell.styles.textColor = RGB.blueA;
        else if (v.includes("gana B") || v === "gana B") data.cell.styles.textColor = RGB.roseB;
        else data.cell.styles.textColor = RGB.gray;
      }
    },
  });
  tableEnd(ctx);

  // Veredicto en prosa
  const better = ma.cagr >= mb.cagr ? "A" : "B";
  const safer = ma.maxDrawdown >= mb.maxDrawdown ? "A" : "B"; // maxDD negativo: el menos negativo es más seguro
  const cheaper = a.fees.weightedTer <= b.fees.weightedTer ? "A" : "B";
  const diffCagr = Math.abs(ma.cagr - mb.cagr) * 100;
  let verdict: string;
  if (better === safer) {
    verdict = `Caso claro: la Cartera ${better} gana en rentabilidad (${diffCagr.toFixed(1)} puntos al año de diferencia) ` +
      `y además cae menos en los malos momentos. Cuando una cartera te da más por menos riesgo, no hay mucho que discutir.`;
  } else {
    verdict = `No hay ganador absoluto: la Cartera ${better} renta más (${diffCagr.toFixed(1)} puntos/año), pero la Cartera ${safer} ` +
      `aguanta mejor las caídas. La pregunta de verdad no es cuál sube más, sino cuál podrás mantener sin vender en el peor momento. ` +
      `La más barata es la ${cheaper}, y a largo plazo el coste pesa más de lo que parece.`;
  }
  drawCTABox(ctx, "Lectura rápida", verdict);
}

function renderCompareMetrics(ctx: RenderCtx, a: BacktestResult, b: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "02", "Todas las métricas, cara a cara");
  drawBody(ctx, "El cuadro completo. La columna del índice de referencia te dice si cualquiera de las dos está, al menos, batiendo a lo fácil y barato.");
  const ma = a.metrics, mb = b.metrics;
  const bm = benchmark?.benchmarkMetrics;
  const hasBm = !!bm;
  const bmName = benchmark?.benchmarkName ?? "Ref.";
  const pct = (x: number) => fmtPct(x * 100);
  const rows: (string | number)[][] = [
    ["Rentabilidad total", pct(ma.totalReturn), pct(mb.totalReturn), hasBm ? pct(bm!.totalReturn) : "—"],
    ["CAGR (anualizada)", pct(ma.cagr), pct(mb.cagr), hasBm ? pct(bm!.cagr) : "—"],
    ["Volatilidad anual", pct(ma.volatility), pct(mb.volatility), hasBm ? pct(bm!.volatility) : "—"],
    ["Sharpe", ma.sharpe.toFixed(2), mb.sharpe.toFixed(2), hasBm ? bm!.sharpe.toFixed(2) : "—"],
    ["Sortino", ma.sortino.toFixed(2), mb.sortino.toFixed(2), hasBm ? bm!.sortino.toFixed(2) : "—"],
    ["Máximo drawdown", pct(ma.maxDrawdown), pct(mb.maxDrawdown), hasBm ? pct(bm!.maxDrawdown) : "—"],
    ["Mejor mes", pct(ma.bestMonth), pct(mb.bestMonth), hasBm ? pct(bm!.bestMonth) : "—"],
    ["Peor mes", pct(ma.worstMonth), pct(mb.worstMonth), hasBm ? pct(bm!.worstMonth) : "—"],
    ["% meses positivos", pct(ma.positiveMonthsRatio), pct(mb.positiveMonthsRatio), hasBm ? pct(bm!.positiveMonthsRatio) : "—"],
  ];
  autoTable(ctx.pdf, {
    startY: ctx.y,
    margin: { left: ML, right: MR },
    head: [["Métrica", "A", "B", bmName]],
    body: rows.map((r) => r.map((c) => String(c))),
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
    columnStyles: { 0: { font: F_SANS }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "right" } },
    didParseCell: (data) => {
      if (data.column.index === 1) data.cell.styles.textColor = RGB.blueA;
      if (data.column.index === 2) data.cell.styles.textColor = RGB.roseB;
      if (data.section === "body" && data.column.index === 3 && hasBm) data.cell.styles.textColor = RGB.purple;
    },
  });
  tableEnd(ctx);
}

function renderCompareEvolution(ctx: RenderCtx, a: BacktestResult, b: BacktestResult, benchmark?: BenchmarkComparison) {
  drawSectionHeader(ctx, "03", "Cómo crece tu dinero (A vs B)");
  drawBody(ctx, "Las dos curvas, mismo punto de partida. No te fijes solo en dónde acaban: fíjate en cómo de baches es el camino de cada una.");
  const tsA = a.timeSeries, tsB = b.timeSeries;
  const bmTs = benchmark?.benchmarkTimeSeries;
  const hasBm = !!bmTs && bmTs.length >= 2;
  if (tsA.length < 2 || tsB.length < 2) { drawBody(ctx, "Series insuficientes para el gráfico.", { italic: true }); return; }
  ensureSpace(ctx, 78);
  const chartX = ML + 22, chartY = ctx.y, chartW = CW - 22, chartH = 58;
  const allV = tsA.map((p) => p.value).concat(tsB.map((p) => p.value)).concat(hasBm ? bmTs!.map((p) => p.value) : []);
  const minV = Math.min(...allV), maxV = Math.max(...allV), rangeV = (maxV - minV) || 1;
  ctx.pdf.setFontSize(6); ctx.pdf.setTextColor(...RGB.gray); ctx.pdf.setFont("helvetica", "normal");
  for (let i = 0; i < 5; i++) {
    const v = maxV - (i / 4) * rangeV, yy = chartY + (i / 4) * chartH;
    ctx.pdf.text(fmtEUR(v), chartX - 1, yy + 1, { align: "right" });
    ctx.pdf.setDrawColor(...RGB.lightGray); ctx.pdf.setLineWidth(0.1); ctx.pdf.line(chartX, yy, chartX + chartW, yy);
  }
  ctx.pdf.setDrawColor(...RGB.lightGray); ctx.pdf.setLineWidth(0.3);
  ctx.pdf.line(chartX, chartY, chartX, chartY + chartH); ctx.pdf.line(chartX, chartY + chartH, chartX + chartW, chartY + chartH);
  const drawLine = (ts: { value: number }[], color: [number, number, number], dashed: boolean, w: number) => {
    ctx.pdf.setDrawColor(...color); ctx.pdf.setLineWidth(w);
    if (dashed) ctx.pdf.setLineDashPattern([1.5, 1], 0);
    let px: number | null = null, py: number | null = null;
    for (let i = 0; i < ts.length; i++) {
      const x = chartX + (i / (ts.length - 1)) * chartW;
      const y = chartY + chartH - ((ts[i]!.value - minV) / rangeV) * chartH;
      if (px !== null && py !== null) ctx.pdf.line(px, py, x, y);
      px = x; py = y;
    }
    if (dashed) ctx.pdf.setLineDashPattern([], 0);
  };
  if (hasBm) drawLine(bmTs!, RGB.purple, true, 0.5);
  drawLine(tsA, RGB.blueA, false, 0.7);
  drawLine(tsB, RGB.roseB, false, 0.7);
  // años
  ctx.pdf.setFontSize(6); ctx.pdf.setTextColor(...RGB.gray);
  const seen = new Set<string>();
  tsA.forEach((p, i) => { const yr = p.date.substring(0, 4); if (!seen.has(yr)) { seen.add(yr); ctx.pdf.text(yr, chartX + (i / (tsA.length - 1)) * chartW, chartY + chartH + 4, { align: "center" }); } });
  ctx.y += chartH + 7;
  // leyenda
  const lg = (x: number, color: [number, number, number], label: string, dashed: boolean) => {
    ctx.pdf.setDrawColor(...color); ctx.pdf.setLineWidth(0.7);
    if (dashed) ctx.pdf.setLineDashPattern([1.5, 1], 0);
    ctx.pdf.line(x, ctx.y, x + 7, ctx.y); ctx.pdf.setLineDashPattern([], 0);
    ctx.pdf.setFont("helvetica", "normal"); ctx.pdf.setFontSize(7); ctx.pdf.setTextColor(...color);
    ctx.pdf.text(label, x + 9, ctx.y + 1);
    return x + 9 + ctx.pdf.getTextWidth(label) + 6;
  };
  let lx = lg(chartX, RGB.blueA, `A · ${a.portfolioName}`.substring(0, 22), false);
  lx = lg(lx, RGB.roseB, `B · ${b.portfolioName}`.substring(0, 22), false);
  if (hasBm) lg(lx, RGB.purple, benchmark!.benchmarkName, true);
  ctx.y += 8;
  drawTable(ctx, ["", "Cartera A", "Cartera B"], [
    ["Valor final", fmtEUR(a.finalValue), fmtEUR(b.finalValue)],
    ["Aportado", fmtEUR(a.totalContributions), fmtEUR(b.totalContributions)],
    ["Ganancia", fmtEUR(a.finalValue - a.totalContributions), fmtEUR(b.finalValue - b.totalContributions)],
  ], { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" } });
}

function renderCompareAnnual(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "04", "Rentabilidad año a año (A vs B)");
  drawBody(ctx, "El año a año desnuda el carácter de cada cartera: cuál sufre más en los años malos y cuál aprovecha mejor los buenos.");
  const byYear = new Map<number, { a?: number; b?: number }>();
  for (const r of a.annualReturns) byYear.set(r.year, { ...(byYear.get(r.year) ?? {}), a: r.returnPct });
  for (const r of b.annualReturns) byYear.set(r.year, { ...(byYear.get(r.year) ?? {}), b: r.returnPct });
  const years = Array.from(byYear.keys()).sort();
  if (years.length === 0) { drawBody(ctx, "No hay años completos en el periodo.", { italic: true }); return; }
  const body = years.map((y) => {
    const v = byYear.get(y)!;
    return [String(y), v.a != null ? fmtPct(v.a) : "—", v.b != null ? fmtPct(v.b) : "—",
      v.a != null && v.b != null ? (v.a >= v.b ? "A" : "B") : "—"];
  });
  autoTable(ctx.pdf, {
    startY: ctx.y, margin: { left: ML, right: MR },
    head: [["Año", "Cartera A", "Cartera B", "Mejor"]],
    body: body.map((r) => r.map((c) => String(c))),
    theme: "plain",
    headStyles: { font: F_MONO, fontStyle: "bold", fontSize: 8, textColor: RGB.gray, cellPadding: { top: 1, right: 2, bottom: 2.6, left: 2 }, lineColor: RGB.dark, lineWidth: { bottom: 0.3 } },
    bodyStyles: { font: F_MONO, fontSize: 9.5, textColor: RGB.dark, cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 }, lineColor: RGB.lightGray, lineWidth: { bottom: 0.1 } },
    columnStyles: { 0: { font: F_SANS }, 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "center" } },
    didParseCell: (data) => {
      if (data.column.index === 1) data.cell.styles.textColor = RGB.blueA;
      if (data.column.index === 2) data.cell.styles.textColor = RGB.roseB;
      if (data.section === "body" && data.column.index === 3) {
        data.cell.styles.textColor = String(data.cell.raw) === "A" ? RGB.blueA : String(data.cell.raw) === "B" ? RGB.roseB : RGB.gray;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  tableEnd(ctx);
}

function renderCompareDrawdown(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "05", "Quién aguanta mejor las caídas");
  drawBody(ctx,
    "Aquí se separan los inversores de los que dicen que lo son. La cartera que menos cae es la que " +
    "más fácil te resulta mantener sin vender en el peor momento — y vender en el fondo es lo único " +
    "que convierte una caída temporal en una pérdida para siempre."
  );
  const ddA = a.topDrawdowns[0], ddB = b.topDrawdowns[0];
  drawTable(ctx, ["", "Cartera A", "Cartera B"], [
    ["Peor caída (máx drawdown)", fmtPct(a.metrics.maxDrawdown * 100), fmtPct(b.metrics.maxDrawdown * 100)],
    ["Mayor caída — duración", ddA ? `${ddA.lengthMonths} meses` : "—", ddB ? `${ddB.lengthMonths} meses` : "—"],
    ["Mayor caída — recuperación", ddA?.recoveryMonths != null ? `${ddA.recoveryMonths} meses` : "sin recuperar", ddB?.recoveryMonths != null ? `${ddB.recoveryMonths} meses` : "sin recuperar"],
    ["Peor mes", fmtPct(a.metrics.worstMonth * 100), fmtPct(b.metrics.worstMonth * 100)],
  ], { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" } });
}

function renderCompareRolling(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "06", "Rentabilidad sostenida (ventanas móviles)");
  drawBody(ctx, "La rentabilidad media a 1, 3 y 5 años según cuándo entraste, y con qué frecuencia cada cartera terminó en positivo. Cuanto más alto el % positivo, menos depende tu resultado de tener suerte con el timing.");
  const win = (la: typeof a.rollingStats.oneYear, lb: typeof b.rollingStats.oneYear, label: string) =>
    (la.count > 0 || lb.count > 0)
      ? [label,
         la.count > 0 ? fmtPct(la.avgCagr * 100) : "—",
         lb.count > 0 ? fmtPct(lb.avgCagr * 100) : "—",
         la.count > 0 ? `${(la.positiveRatio * 100).toFixed(0)}%` : "—",
         lb.count > 0 ? `${(lb.positiveRatio * 100).toFixed(0)}%` : "—"]
      : null;
  const body = [
    win(a.rollingStats.oneYear, b.rollingStats.oneYear, "1 año"),
    win(a.rollingStats.threeYear, b.rollingStats.threeYear, "3 años"),
    win(a.rollingStats.fiveYear, b.rollingStats.fiveYear, "5 años"),
  ].filter((r): r is string[] => r !== null);
  if (body.length === 0) { drawBody(ctx, "Periodo demasiado corto para ventanas móviles.", { italic: true }); return; }
  drawTable(ctx, ["Ventana", "A media", "B media", "A % pos.", "B % pos."], body, {
    1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "right" }, 4: { halign: "right" },
  });
}

function renderCompareCosts(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "07", "El coste, que nunca se ve pero siempre se paga");
  drawBody(ctx,
    "Las comisiones son el único factor que conoces de antemano con certeza absoluta. Un punto más " +
    "de coste al año, compuesto durante décadas, se come una porción enorme de tu patrimonio final. " +
    "La banca lo sabe; por eso no te lo pone fácil de ver."
  );
  drawTable(ctx, ["", "Cartera A", "Cartera B"], [
    ["TER medio ponderado", `${a.fees.weightedTer.toFixed(2)}%`, `${b.fees.weightedTer.toFixed(2)}%`],
    ["Comisiones pagadas (periodo)", fmtEUR(a.fees.totalFees), fmtEUR(b.fees.totalFees)],
    ["Coste sobre patrimonio final", fmtPct(a.fees.feesAsPercentage).replace("+", ""), fmtPct(b.fees.feesAsPercentage).replace("+", "")],
  ], { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" } });
  const cheaper = a.fees.weightedTer <= b.fees.weightedTer ? "A" : "B";
  const diff = Math.abs(a.fees.weightedTer - b.fees.weightedTer);
  if (diff > 0.05) {
    drawBody(ctx,
      `La Cartera ${cheaper} es ${diff.toFixed(2)} puntos más barata al año. Parece poco, pero esa diferencia ` +
      "no se suma: se compone, año tras año, a tu favor.",
      { size: 10, color: RGB.green, bold: true }
    );
  }
}

function renderCompareConclusion(ctx: RenderCtx, a: BacktestResult, b: BacktestResult) {
  drawSectionHeader(ctx, "08", "Conclusiones");
  const ma = a.metrics, mb = b.metrics;
  const better = ma.cagr >= mb.cagr ? a : b;
  const safer = ma.maxDrawdown >= mb.maxDrawdown ? a : b;
  const cheaper = a.fees.weightedTer <= b.fees.weightedTer ? a : b;
  drawBody(ctx, `Resumiendo sin paños calientes:`, { bold: true });
  drawBody(ctx, `· Más rentabilidad histórica: ${better.portfolioName} (${fmtPct(better.metrics.cagr * 100)} anual).`);
  drawBody(ctx, `· Más estable en las caídas: ${safer.portfolioName} (peor caída ${fmtPct(safer.metrics.maxDrawdown * 100)}).`);
  drawBody(ctx, `· Más barata: ${cheaper.portfolioName} (${cheaper.fees.weightedTer.toFixed(2)}% de TER).`);
  ctx.y += 2;
  drawBody(ctx,
    "Recuerda: rentabilidades pasadas no garantizan nada del futuro. La mejor cartera no es la que " +
    "habría ganado más mirando por el retrovisor, sino la que encaja con tu horizonte, tu estómago y " +
    "tus costes — y que por eso vas a poder mantener cuando vengan mal dadas, que vendrán."
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

  // -------------------------------------------------------------------------
  // INFORME COMPARATIVO A vs B (cuando hay dos carteras y se pidió comparar)
  // -------------------------------------------------------------------------
  if (config.comparative && results.resultA && results.resultB) {
    const a = results.resultA;
    const b = results.resultB;
    const bm = a.benchmark ?? b.benchmark;
    const compSubtitle = "Comparativa de carteras · El Proyecto K";
    const cctx: RenderCtx = { pdf, pageNum: 0, totalPages: 0, y: MT + 8, subtitle: compSubtitle };

    renderCompareCover(pdf, a, b, config, bm?.benchmarkName);

    const compTaxes =
      (a.fees.taxMode != null && a.fees.taxMode !== "none") ||
      (b.fees.taxMode != null && b.fees.taxMode !== "none");

    const compSections: Array<(c: RenderCtx) => void> = [
      (c) => renderCompareHero(c, a, b),
      (c) => renderCompareMetrics(c, a, b, bm),
      (c) => renderCompareEvolution(c, a, b, bm),
      (c) => renderCompareAnnual(c, a, b),
      (c) => renderCompareDrawdown(c, a, b),
      (c) => renderCompareRolling(c, a, b),
      (c) => renderCompareCosts(c, a, b),
      ...(compTaxes ? [(c: RenderCtx) => renderTaxes(c, a, b, bm)] : []),
      (c) => renderCompareConclusion(c, a, b),
      (c) => renderDisclaimer(c),
    ];

    for (const render of compSections) {
      pdf.addPage();
      cctx.pageNum++;
      drawBackground(pdf);
      drawHeader(pdf, compSubtitle);
      drawFooter(pdf, cctx.pageNum);
      cctx.y = MT + 8;
      render(cctx);
    }
    return pdf.output("blob");
  }

  // Orden canónico de secciones = orden de la pantalla de resultados.
  let selected = FULL_BACKTEST_ORDER.filter((id) => config.sections.includes(id));

  // Si NINGUNA cartera del informe tiene impuestos configurados, omitimos la
  // sección de impuestos: sin tributación, las tres rentabilidades (bruta, neta
  // del camino y neta al liquidar) salen idénticas y la sección no aporta nada.
  // (Se mantiene si la cartera de contraste sí tributa, porque la comparación
  // fondo-sin-impuestos vs ETF-con-impuestos sí es informativa.)
  const ownTaxMode = result.fees.taxMode;
  const otherTaxMode = other?.fees.taxMode;
  const anyTaxes =
    (ownTaxMode != null && ownTaxMode !== "none") ||
    (otherTaxMode != null && otherTaxMode !== "none");
  if (!anyTaxes) {
    selected = selected.filter((id) => id !== "taxes");
  }

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
      else if (id === "metricsFull") renderMetricsFull(ctx, result, benchmark);
      else if (id === "evolution") renderEvolution(ctx, result, benchmark);
      else if (id === "annualReturns") renderAnnualReturns(ctx, result);
      else if (id === "monthlyHeatmap") renderMonthlyHeatmap(ctx, result);
      else if (id === "crisis") renderCrisis(ctx, result, benchmark);
      else if (id === "topDrawdowns") renderTopDrawdowns(ctx, result);
      else if (id === "rolling") renderRolling(ctx, result);
      else if (id === "histogram") renderHistogram(ctx, result);
      else if (id === "taxes") renderTaxes(ctx, result, other ?? undefined, benchmark);
      else if (id === "comparison") renderComparison(ctx, result, benchmark);
      else if (id === "stress") renderStress(ctx, result, benchmark);
      else if (id === "composition") renderComposition(ctx, result);
      else if (id === "correlations") renderCorrelations(ctx, results.correlationMatrix);
      else if (id === "assetMetrics") renderAssetMetricsSection(ctx, results.assetMetrics);
      else if (id === "contributions") renderContributions(ctx, result);
      else if (id === "rebalances") renderRebalances(ctx, result);
      else if (id === "recommendation") renderRecommendation(ctx, score);
      else if (id === "disclaimer") renderDisclaimer(ctx);
    }
  }

  return pdf.output("blob");
}
