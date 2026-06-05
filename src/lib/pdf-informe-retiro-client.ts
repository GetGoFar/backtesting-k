// =============================================================================
// PDF Informe Jubilación — Branding El Proyecto K (paleta beige/coral)
// =============================================================================
//
// Replica el sistema visual de elproyectok.com (basado en references/brand_guide.md
// del skill proyectok-pdf):
//   - Fondo beige #F5F0E8 en toda la página
//   - Acentos coral #C0392B (líneas, números de sección, headers de tabla)
//   - Tipografía Helvetica (built-in jsPDF, idéntica a la del skill ReportLab)
//   - Cover page + content pages con header/footer marca
//   - Tablas con header rojo, filas alternadas beige/cream, grid sutil
//   - KPI boxes y callouts coherentes con la marca
//
// Se ejecuta client-side: jsPDF en navegador, sin dependencias pesadas en server.
// =============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ParametricConfig,
  ParametricResult,
} from "./retirement-parametric";

// -----------------------------------------------------------------------------
// Paleta El Proyecto K (extraída del brand guide oficial)
// -----------------------------------------------------------------------------

const C = {
  beige: [245, 240, 232] as [number, number, number], // BG_BEIGE — fondo
  red: [192, 57, 43] as [number, number, number], // RED_ACCENT — marca
  dark: [44, 44, 44] as [number, number, number], // DARK_TEXT
  gray: [107, 107, 107] as [number, number, number], // GRAY_TEXT
  rowLight: [250, 247, 242] as [number, number, number], // TABLE_ROW_LIGHT
  rowAlt: [240, 235, 225] as [number, number, number], // TABLE_ROW_ALT (CTA bg)
  border: [213, 206, 189] as [number, number, number], // TABLE_BORDER
  green: [46, 125, 50] as [number, number, number], // GREEN_POS
  redNeg: [198, 40, 40] as [number, number, number], // RED_NEG
  darkBg: [44, 62, 80] as [number, number, number], // DARK_BG
  white: [255, 255, 255] as [number, number, number],
};

// -----------------------------------------------------------------------------
// Layout A4 en mm (jsPDF usa mm como unidad)
// -----------------------------------------------------------------------------

const PAGE_W = 210;
const PAGE_H = 297;
const ML = 19; // ~55pt margin izquierdo
const MR = 19; // ~55pt margin derecho
const CW = PAGE_W - ML - MR; // ancho útil ~172mm
const HEADER_Y = 13;
const FOOTER_Y = PAGE_H - 12;
const CONTENT_TOP = 22; // espacio para header
const CONTENT_BOTTOM = PAGE_H - 17; // espacio para footer

// -----------------------------------------------------------------------------
// Formatters
// -----------------------------------------------------------------------------

const fmtEUR0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

export function generateInformePdf(args: {
  subscriberName?: string;
  config: ParametricConfig;
  results: ParametricResult;
}): jsPDF {
  const { subscriberName, config, results } = args;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // === Página 1: Cover ===
  applyPageBackground(doc);
  drawCover(doc, subscriberName);

  // === Página 2+: Contenido ===
  doc.addPage();
  applyPageBackground(doc);
  let y = CONTENT_TOP;

  // Veredicto destacado
  y = drawVerdict(doc, y, results, subscriberName);

  // 01 — Resumen ejecutivo
  y = ensureSpace(doc, y + 8, 70);
  y = drawSectionTitle(doc, y, "01", "Resumen ejecutivo");
  y = drawKpis(doc, y, results, config);

  // 02 — Tu configuración
  y = ensureSpace(doc, y + 8, 80);
  y = drawSectionTitle(doc, y, "02", "Tu configuración");
  y = drawConfigTable(doc, y, config);

  // 03 — Objetivos (si hay)
  if (config.goals && config.goals.length > 0) {
    y = ensureSpace(doc, y + 8, 60);
    y = drawSectionTitle(doc, y, "03", "Tus objetivos financieros");
    y = drawGoalsTable(doc, y, config);
  }

  // 04 — SWR
  if (results.withdrawalRates?.scenarios?.length > 0) {
    y = ensureSpace(doc, y + 8, 90);
    y = drawSectionTitle(doc, y, "04", "Cuánto puedes retirar al jubilarte");
    y = drawCapitalNote(doc, y, results);

    // Comparación retiro planificado vs SWR Bengen
    const retiroPlanificado = calcRetiroPlanificado(config, results);
    if (retiroPlanificado > 0) {
      y = drawRetiroComparison(doc, y, results, retiroPlanificado);
    }

    y = drawSwrTable(doc, y, results);

    // 05 — PWR perpetua (solo si el plan tiene posibilidades reales)
    if (
      results.withdrawalRates.pwrPerpetual &&
      results.successProbability >= 50
    ) {
      y = ensureSpace(doc, y + 8, 75);
      y = drawSectionTitle(
        doc,
        y,
        "05",
        "PWR — Tasa perpetua para preservar capital"
      );
      y = drawPwrBoxes(doc, y, results);
      y = drawPwrExplanation(doc, y);
    }
  }

  // 06 — Riesgo de secuencia
  y = ensureSpace(doc, y + 8, 75);
  y = drawSectionTitle(doc, y, "06", "Riesgo de secuencia");
  y = drawSequenceRisk(doc, y, results);

  // 07 — CTA final
  y = ensureSpace(doc, y + 8, 70);
  y = drawCta(doc, y);

  // Header/footer en todas las páginas de contenido
  drawHeadersFooters(doc);

  return doc;
}

// -----------------------------------------------------------------------------
// Background y helpers de página
// -----------------------------------------------------------------------------

function applyPageBackground(doc: jsPDF): void {
  doc.setFillColor(C.beige[0], C.beige[1], C.beige[2]);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
}

/** Si no cabe el bloque `needed` mm en la página, salta a la siguiente. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > CONTENT_BOTTOM) {
    doc.addPage();
    applyPageBackground(doc);
    return CONTENT_TOP;
  }
  return y;
}

// -----------------------------------------------------------------------------
// Cover page
// -----------------------------------------------------------------------------

function drawCover(doc: jsPDF, subscriberName?: string): void {
  const titleY = 115;

  // Línea roja corta a la izquierda (acento característico ProyectoK)
  doc.setDrawColor(C.red[0], C.red[1], C.red[2]);
  doc.setLineWidth(1);
  doc.line(ML, titleY - 12, ML + 28, titleY - 12);

  // Título grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  doc.text("Tu plan de jubilación", ML, titleY);

  // Subtítulo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
  doc.text("Simulación paramétrica · Monte Carlo log-normal", ML, titleY + 10);

  // Personalización
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const personalParts = [];
  if (subscriberName) personalParts.push(`Para ${subscriberName}`);
  personalParts.push(fecha);
  doc.setFontSize(11);
  doc.text(personalParts.join(" · "), ML, titleY + 18);

  // Bloque marca abajo
  const brandY = PAGE_H - 55;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  doc.text("El Proyecto K", ML, brandY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
  doc.text(
    "Tu camino hacia la independencia financiera con inversión indexada",
    ML,
    brandY + 5
  );
  doc.text("www.elproyectok.com", ML, brandY + 10);
}

// -----------------------------------------------------------------------------
// Section title (patrón ProyectoK: "01" rojo + título grande + línea roja)
// -----------------------------------------------------------------------------

function drawSectionTitle(
  doc: jsPDF,
  y: number,
  num: string,
  title: string
): number {
  // Número de sección rojo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  doc.text(num, ML, y);

  // Título grande
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  doc.text(title, ML, y + 7);

  // Línea separadora roja full-width
  doc.setDrawColor(C.red[0], C.red[1], C.red[2]);
  doc.setLineWidth(0.4);
  doc.line(ML, y + 11, ML + CW, y + 11);

  return y + 16;
}

// -----------------------------------------------------------------------------
// Veredicto (callout con línea izquierda al estilo CTA ProyectoK)
// -----------------------------------------------------------------------------

interface VerdictCopy {
  tone: "great" | "ok" | "tight" | "bad";
  badge: string;
  title: string;
  body: string;
}

function pickVerdict(
  probPct: number,
  subscriberName?: string
): VerdictCopy {
  const nameTag = subscriberName ? `${subscriberName}, ` : "";
  if (probPct >= 90) {
    return {
      tone: "great",
      badge: "Plan sólido",
      title: `${nameTag}vas a poder permitirte ese crucero (y el siguiente)`,
      body: `Tu cartera aguanta en el ${probPct.toFixed(0)}% de los escenarios simulados. Si mantienes la disciplina (aportar lo previsto, no tocar el capital en mercados malos, evitar productos bancarios con comisiones que te roben el alfa), llegas a la jubilación con margen para vivir y dejar herencia. Lo difícil ahora no es el plan; es no salirse de él.`,
    };
  }
  if (probPct >= 75) {
    return {
      tone: "ok",
      badge: "Plan razonable",
      title: `${nameTag}vas bien encaminado — el plan funciona, con asterisco`,
      body: `Aguantas en el ${probPct.toFixed(0)}% de escenarios. No está mal, pero ese resto (donde el plan se queda corto) suele ser por sequence risk en los primeros años de jubilación. Considera: un pequeño extra mensual de aportación, retrasar 1-2 años la jubilación, o reducir el retiro en años con bolsa fea. Pequeños ajustes ahora = mucha tranquilidad luego.`,
    };
  }
  if (probPct >= 50) {
    return {
      tone: "tight",
      badge: "Plan ajustado",
      title: `${nameTag}el plan respira con dificultad`,
      body: `Solo el ${probPct.toFixed(0)}% de escenarios simulados sobreviven hasta el final. Eso es echar una moneda al aire para tu jubilación — no es una posición cómoda. Las palancas que te quedan: aportar más, retrasar la jubilación, o ajustar a la baja la retirada mensual prevista. La cartera está bien; el problema son las cuentas. Toca renegociar contigo mismo.`,
    };
  }
  return {
    tone: "bad",
    badge: "Plan frágil",
    title: `${nameTag}¿te paso el teléfono de Glovo? Buscan repartidores...`,
    body: `Mira, te lo digo con cariño: solo el ${probPct.toFixed(0)}% de los escenarios llegan al final del plan. Eso significa que la cuenta NO sale con la configuración actual. No te asustes — para eso hemos hecho la simulación, para verlo AHORA y no a los 70. Los números mandan: o aportar mucho más, o jubilarte más tarde, o vivir con bastante menos. Cuanto antes ajustes el plan, menos doloroso es el cambio.`,
  };
}

function drawVerdict(
  doc: jsPDF,
  y: number,
  results: ParametricResult,
  subscriberName?: string
): number {
  const v = pickVerdict(results.successProbability, subscriberName);

  const padding = 6;
  const barW = 3;
  const innerLeft = ML + barW + padding;
  const innerW = CW - barW - padding * 2;

  // Calcular altura
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const badgeH = 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  const titleLines = doc.splitTextToSize(v.title, innerW);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const bodyLines = doc.splitTextToSize(v.body, innerW);

  const boxH =
    padding +
    badgeH +
    4 +
    titleLines.length * 5.5 +
    4 +
    bodyLines.length * 4.6 +
    padding;

  // Fondo crema (TABLE_ROW_ALT — coherente con el callout ProyectoK)
  doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
  doc.rect(ML, y, CW, boxH, "F");

  // Barra lateral roja (estilo CTA brand)
  doc.setFillColor(C.red[0], C.red[1], C.red[2]);
  doc.rect(ML, y, barW, boxH, "F");

  // Badge en mayúsculas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  doc.text(v.badge.toUpperCase(), innerLeft, y + padding + 2);

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  let cursorY = y + padding + 9;
  for (const line of titleLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 5.5;
  }

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  cursorY += 2;
  for (const line of bodyLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 4.6;
  }

  return y + boxH;
}

// -----------------------------------------------------------------------------
// KPIs (3 boxes con número grande + label + sub-metric)
// -----------------------------------------------------------------------------

function drawKpis(
  doc: jsPDF,
  y: number,
  r: ParametricResult,
  config: ParametricConfig
): number {
  const boxW = (CW - 6) / 3;
  const boxH = 28;

  const probColor = probColorFor(r.successProbability);

  const kpis: Array<{
    label: string;
    value: string;
    sub: string;
    color: [number, number, number];
  }> = [
    {
      label: "Probabilidad de éxito",
      value: `${r.successProbability.toFixed(1)}%`,
      sub:
        r.successProbability >= 90
          ? "Plan sólido"
          : r.successProbability >= 70
            ? "Margen ajustado"
            : "Plan frágil",
      color: probColor,
    },
    {
      label: "Patrimonio final mediano",
      value: fmtEUR0.format(Math.max(0, r.medianFinalValueReal)),
      sub: `A los ${config.endAge} años (€ reales)`,
      color: C.dark,
    },
    {
      label:
        r.medianDepletionAge !== undefined
          ? "Edad mediana agotamiento"
          : "Paths agotados",
      value:
        r.medianDepletionAge !== undefined
          ? `${r.medianDepletionAge.toFixed(0)} años`
          : `${r.depletionProbability.toFixed(0)}%`,
      sub:
        r.medianDepletionAge !== undefined
          ? `Entre el ${r.depletionProbability.toFixed(1)}% que se agota`
          : "Plan no llega al final",
      color: r.depletionProbability < 5 ? C.green : C.redNeg,
    },
  ];

  kpis.forEach((k, i) => {
    const x = ML + i * (boxW + 3);
    // Fondo TABLE_ROW_ALT — coherente con KPI boxes ProyectoK
    doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
    doc.rect(x, y, boxW, boxH, "F");
    // Borde sutil
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.rect(x, y, boxW, boxH, "S");

    // Número grande (top)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.text(k.value, x + boxW / 2, y + 11, { align: "center" });

    // Label en mayúsculas pequeño
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
    doc.text(k.label.toUpperCase(), x + boxW / 2, y + 17, { align: "center" });

    // Sub-metric pequeño bold colored
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(k.color[0], k.color[1], k.color[2]);
    doc.text(k.sub, x + boxW / 2, y + 23, { align: "center" });
  });

  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  return y + boxH;
}

function probColorFor(prob: number): [number, number, number] {
  if (prob >= 80) return C.green;
  if (prob >= 60) return [180, 83, 9];
  return C.redNeg;
}

// -----------------------------------------------------------------------------
// Config table
// -----------------------------------------------------------------------------

function drawConfigTable(
  doc: jsPDF,
  y: number,
  c: ParametricConfig
): number {
  const rows: Array<[string, string]> = [
    ["Edad actual", `${c.currentAge} años`],
    ["Edad de jubilación", `${c.retirementAge} años`],
    ["Horizonte del plan", `Hasta los ${c.endAge} años`],
    ["Capital inicial", fmtEUR0.format(c.initialCapital)],
    [
      "Cartera acumulación",
      `${c.accumulationReturn.toFixed(1)}% retorno · ${c.accumulationVol.toFixed(1)}% volatilidad`,
    ],
    [
      "Cartera distribución",
      `${c.distributionReturn.toFixed(1)}% retorno · ${c.distributionVol.toFixed(1)}% volatilidad`,
    ],
    [
      "Glide path",
      c.glidePathYears > 0
        ? `${c.glidePathYears} años de transición A a B`
        : "Cambio instantáneo en la jubilación",
    ],
    ["Inflación", `${c.inflationAnnualPct.toFixed(1)}% anual`],
    [
      "Simulaciones Monte Carlo",
      `${c.numPaths.toLocaleString("es-ES")} paths`,
    ],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [["Parámetro", "Valor"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: C.red,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
    },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
      textColor: C.dark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    bodyStyles: { fillColor: C.rowLight },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 65 },
    },
  });

  return getAutoTableY(doc, y + 40) + 2;
}

// -----------------------------------------------------------------------------
// Goals table
// -----------------------------------------------------------------------------

function drawGoalsTable(
  doc: jsPDF,
  y: number,
  c: ParametricConfig
): number {
  const rows = c.goals.map((g) => {
    const tipo =
      g.type === "contribution"
        ? "Aportación"
        : g.type === "fixedWithdrawal"
          ? "Retirada fija"
          : "Retirada %";
    const cuando =
      g.start === "immediately"
        ? "Desde ahora"
        : g.start === "atRetirement"
          ? "Al jubilarte"
          : `En ${g.startYearsFromNow ?? 0} años`;
    const importe =
      g.type === "percentageWithdrawal"
        ? `${(g.percentagePct ?? 0).toFixed(1)}% anual`
        : `${fmtEUR0.format(g.amount ?? 0)}/mes`;
    const periodicidad =
      g.durationType === "untilEnd"
        ? "Hasta el final del plan"
        : g.durationType === "untilRetirement"
          ? "Hasta la jubilación"
          : `Durante ${g.durationYears ?? 0} años`;
    return [g.purpose || tipo, tipo, cuando, importe, periodicidad];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [["Objetivo", "Tipo", "Cuándo", "Importe", "Duración"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: C.red,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
    },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: C.dark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    bodyStyles: { fillColor: C.rowLight },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      0: { fontStyle: "bold" },
    },
  });

  return getAutoTableY(doc, y + 30) + 2;
}

// -----------------------------------------------------------------------------
// Capital note + SWR table
// -----------------------------------------------------------------------------

function drawCapitalNote(
  doc: jsPDF,
  y: number,
  r: ParametricResult
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
  doc.text(
    `Capital real mediano al jubilarte: ${fmtEUR0.format(r.withdrawalRates.capitalAtRetirementReal)}. SWR = tasa máxima que aguanta sin agotar capital hasta el final del horizonte.`,
    ML,
    y,
    { maxWidth: CW }
  );
  return y + 7;
}

function drawSwrTable(
  doc: jsPDF,
  y: number,
  r: ParametricResult
): number {
  const rows = r.withdrawalRates.scenarios.map((s) => [
    s.label,
    `${s.successRatePct}%`,
    fmtEUR0.format(s.swr.eurPerMonth),
    `${s.swr.pctAnnual.toFixed(2)}%`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [["Escenario", "% éxito", "€/mes", "% anual"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: C.red,
      textColor: C.white,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
      halign: "center",
    },
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      cellPadding: { top: 4, right: 6, bottom: 4, left: 6 },
      textColor: C.dark,
      lineColor: C.border,
      lineWidth: 0.2,
    },
    bodyStyles: { fillColor: C.rowLight },
    alternateRowStyles: { fillColor: C.rowAlt },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { halign: "center" },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
    },
  });

  return getAutoTableY(doc, y + 40) + 2;
}

// -----------------------------------------------------------------------------
// PWR perpetua — 3 KPI boxes con destacado central
// -----------------------------------------------------------------------------

function drawPwrBoxes(
  doc: jsPDF,
  y: number,
  r: ParametricResult
): number {
  const pwr = r.withdrawalRates.pwrPerpetual;
  if (!pwr) return y;

  const boxW = (CW - 6) / 3;
  const boxH = 32;

  const items: Array<{
    label: string;
    eur: number;
    pct: number;
    highlight: boolean;
  }> = [
    {
      label: "Conservador (p25)",
      eur: pwr.eurPerMonthP25,
      pct: pwr.pctAnnualP25,
      highlight: false,
    },
    {
      label: "Mediana (p50)",
      eur: pwr.eurPerMonthMedian,
      pct: pwr.pctAnnualMedian,
      highlight: true,
    },
    {
      label: "Optimista (p75)",
      eur: pwr.eurPerMonthP75,
      pct: pwr.pctAnnualP75,
      highlight: false,
    },
  ];

  items.forEach((it, i) => {
    const x = ML + i * (boxW + 3);

    if (it.highlight) {
      // Box destacado — fondo rojo (header color) con texto blanco
      doc.setFillColor(C.red[0], C.red[1], C.red[2]);
      doc.rect(x, y, boxW, boxH, "F");
    } else {
      doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
      doc.rect(x, y, boxW, boxH, "F");
      doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
      doc.setLineWidth(0.2);
      doc.rect(x, y, boxW, boxH, "S");
    }

    const labelColor = it.highlight ? C.white : C.gray;
    const valueColor = it.highlight ? C.white : C.dark;
    const subColor = it.highlight ? C.white : C.red;

    // Label superior
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(labelColor[0], labelColor[1], labelColor[2]);
    doc.text(it.label.toUpperCase(), x + boxW / 2, y + 6, { align: "center" });

    // €/mes
    doc.setFont("helvetica", "bold");
    doc.setFontSize(it.highlight ? 17 : 15);
    doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
    doc.text(`${fmtEUR0.format(it.eur)}/mes`, x + boxW / 2, y + 17, {
      align: "center",
    });

    // % real anual
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(subColor[0], subColor[1], subColor[2]);
    doc.text(`${it.pct.toFixed(2)}% real anual`, x + boxW / 2, y + 25, {
      align: "center",
    });
  });

  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  return y + boxH + 3;
}

function drawPwrExplanation(doc: jsPDF, y: number): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
  const note = doc.splitTextToSize(
    "Tasa que mantiene capital real constante si la cartera rinde a su CAGR real geométrico. Depende solo de la cartera de distribución (rentabilidad esperada y volatilidad), NO del capital ni de las aportaciones. La mediana representa 'si tu cartera rinde como se espera'; el rango p25–p75 cubre la mitad central de escenarios.",
    CW
  );
  doc.text(note, ML, y + 2);
  return y + 2 + note.length * 3.5 + 2;
}

// -----------------------------------------------------------------------------
// Sequence risk — callout con línea izquierda roja (estilo CTA)
// -----------------------------------------------------------------------------

function drawSequenceRisk(
  doc: jsPDF,
  y: number,
  r: ParametricResult
): number {
  const padding = 6;
  const barW = 3;
  const innerLeft = ML + barW + padding;
  const innerW = CW - barW - padding * 2;

  // worstWindowCumulativeReturn YA viene como porcentaje del motor (-22.4)
  const dropPct = Math.abs(r.sequenceRisk.worstWindowCumulativeReturn);
  const yearsWindow = r.sequenceRisk.windowMonths / 12;
  const title = `Caída del ${dropPct.toFixed(1)}% en los primeros ${yearsWindow.toFixed(0)} años post-jubilación`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const titleLines = doc.splitTextToSize(title, innerW);

  const bodyText =
    "Simulamos cómo se comporta tu plan si justo al jubilarte sufres un mercado muy adverso (peor 1% de escenarios). Es el llamado riesgo de secuencia: una mala racha temprana puede agotar tu capital aunque la rentabilidad media sea buena.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const bodyLines = doc.splitTextToSize(bodyText, innerW);

  const resultadoStr = r.sequenceRisk.success
    ? `Aun así, tu plan sobreviviría hasta los ${r.config.endAge} años con ${fmtEUR0.format(Math.max(0, r.sequenceRisk.finalValueReal))} restantes.`
    : `En ese escenario tu plan se agotaría hacia los ${r.sequenceRisk.depletionAge?.toFixed(0) ?? "—"} años.`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const resultLines = doc.splitTextToSize(resultadoStr, innerW);

  const boxH =
    padding +
    titleLines.length * 5.5 +
    3 +
    bodyLines.length * 4.4 +
    4 +
    resultLines.length * 5 +
    padding;

  // Fondo crema con tinte cálido
  doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
  doc.rect(ML, y, CW, boxH, "F");

  // Barra izquierda roja
  doc.setFillColor(C.red[0], C.red[1], C.red[2]);
  doc.rect(ML, y, barW, boxH, "F");

  let cursorY = y + padding + 4;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  for (const line of titleLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 5.5;
  }
  cursorY += 2;

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  for (const line of bodyLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 4.4;
  }
  cursorY += 3;

  // Resultado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const resColor = r.sequenceRisk.success ? C.green : C.redNeg;
  doc.setTextColor(resColor[0], resColor[1], resColor[2]);
  for (const line of resultLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 5;
  }

  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  return y + boxH;
}

// -----------------------------------------------------------------------------
// CTA final (estilo CTA ProyectoK: fondo crema con línea izquierda roja)
// -----------------------------------------------------------------------------

function drawCta(doc: jsPDF, y: number): number {
  const padding = 8;
  const barW = 3;
  const innerLeft = ML + barW + padding;
  const innerW = CW - barW - padding * 2;

  const title = "¿Y ahora qué?";
  const bodyText =
    "Esta simulación te da la base, pero un plan financiero real requiere ajustarlo a tu situación fiscal, tu tolerancia al riesgo y tus objetivos. En El Proyecto K te enseñamos a construirlo paso a paso, sin productos bancarios sobrecargados de comisiones, con inversión indexada de bajo coste.";
  const linkText = "Visita elproyectok.com para empezar.";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const bodyLines = doc.splitTextToSize(bodyText, innerW);

  const boxH = padding + 7 + 4 + bodyLines.length * 4.6 + 4 + 6 + padding;

  doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
  doc.rect(ML, y, CW, boxH, "F");
  doc.setFillColor(C.red[0], C.red[1], C.red[2]);
  doc.rect(ML, y, barW, boxH, "F");

  let cursorY = y + padding + 5;

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  doc.text(title, innerLeft, cursorY);
  cursorY += 8;

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  for (const line of bodyLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 4.6;
  }
  cursorY += 3;

  // Link en rojo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(C.red[0], C.red[1], C.red[2]);
  doc.text(linkText, innerLeft, cursorY);

  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  return y + boxH;
}

// -----------------------------------------------------------------------------
// Header + footer en todas las páginas de contenido (no en cover)
// -----------------------------------------------------------------------------

function drawHeadersFooters(doc: jsPDF): void {
  const total = doc.getNumberOfPages();
  // Saltamos la cover (página 1)
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);

    // --- Header ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
    doc.text("El Proyecto K", ML, HEADER_Y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
    doc.text("Simulador de jubilación", ML + CW, HEADER_Y, {
      align: "right",
    });

    // Línea roja debajo del header
    doc.setDrawColor(C.red[0], C.red[1], C.red[2]);
    doc.setLineWidth(0.5);
    doc.line(ML, HEADER_Y + 2.5, ML + CW, HEADER_Y + 2.5);

    // --- Footer ---
    // Línea gris fina arriba
    doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
    doc.setLineWidth(0.2);
    doc.line(ML, FOOTER_Y - 4, ML + CW, FOOTER_Y - 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
    doc.text("www.elproyectok.com", ML, FOOTER_Y);
    doc.text(`${i - 1} / ${total - 1}`, ML + CW, FOOTER_Y, {
      align: "right",
    });
  }
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function getAutoTableY(doc: jsPDF, fallback: number): number {
  type DocWithAutoTable = jsPDF & {
    lastAutoTable?: { finalY?: number };
  };
  const d = doc as DocWithAutoTable;
  return d.lastAutoTable?.finalY ?? fallback;
}

// -----------------------------------------------------------------------------
// Retiro planificado vs SWR Bengen (contexto para los escenarios)
// -----------------------------------------------------------------------------

function calcRetiroPlanificado(
  config: ParametricConfig,
  results: ParametricResult
): number {
  const K = results.withdrawalRates.capitalAtRetirementReal;
  let total = 0;
  for (const g of config.goals) {
    if (g.type === "contribution") continue;
    const activoEnJub =
      g.start === "atRetirement" ||
      g.start === "immediately" ||
      (g.start === "yearsFromNow" &&
        (g.startYearsFromNow ?? 0) <=
          config.retirementAge - config.currentAge);
    if (!activoEnJub) continue;
    if (g.type === "fixedWithdrawal") {
      total += g.amount ?? 0;
    } else if (g.type === "percentageWithdrawal") {
      total += (K * (g.percentagePct ?? 0)) / 100 / 12;
    }
  }
  return total;
}

function drawRetiroComparison(
  doc: jsPDF,
  y: number,
  results: ParametricResult,
  retiroPlanificado: number
): number {
  const swrBengen =
    results.withdrawalRates.scenarios.find((s) => s.key === "bengen")?.swr
      .eurPerMonth ?? 0;
  if (swrBengen <= 0) return y;
  const overdraw = retiroPlanificado > swrBengen;
  const padding = 5;
  const barW = 3;
  const innerLeft = ML + barW + padding;
  const innerW = CW - barW - padding * 2;

  const titulo = overdraw
    ? "Tu retiro planificado supera lo sostenible"
    : "Tu retiro planificado está dentro de lo sostenible";
  const cuerpo = overdraw
    ? `Estás planeando retirar ${fmtEUR0.format(retiroPlanificado)}/mes pero tu cartera solo sostiene con seguridad (Bengen 99%) hasta ${fmtEUR0.format(swrBengen)}/mes. Por eso ves esa probabilidad de éxito. Para que aguante: bájalo, aporta más, o retrasa la jubilación.`
    : `Estás planeando retirar ${fmtEUR0.format(retiroPlanificado)}/mes y tu cartera sostiene con seguridad (Bengen 99%) hasta ${fmtEUR0.format(swrBengen)}/mes. Tienes margen.`;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const cuerpoLines = doc.splitTextToSize(cuerpo, innerW);
  const boxH = padding + 5 + 3 + cuerpoLines.length * 4.4 + padding;

  // Fondo crema con tono según overdraw
  doc.setFillColor(C.rowAlt[0], C.rowAlt[1], C.rowAlt[2]);
  doc.rect(ML, y, CW, boxH, "F");
  // Barra izquierda — roja si overdraw, verde si OK
  const barColor = overdraw ? C.red : C.green;
  doc.setFillColor(barColor[0], barColor[1], barColor[2]);
  doc.rect(ML, y, barW, boxH, "F");

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(barColor[0], barColor[1], barColor[2]);
  doc.text(titulo, innerLeft, y + padding + 4);

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(C.dark[0], C.dark[1], C.dark[2]);
  let cursorY = y + padding + 11;
  for (const line of cuerpoLines) {
    doc.text(line, innerLeft, cursorY);
    cursorY += 4.4;
  }

  return y + boxH + 3;
}
