// =============================================================================
// PDF Informe Jubilación — Generador CLIENT-SIDE con jsPDF
// =============================================================================
//
// Se ejecuta en el navegador tras la suscripción exitosa a Beehiiv. Toma la
// config y los resultados de la simulación y genera un PDF descargable con
// el plan completo (KPIs, configuración, objetivos, SWR/PWR, riesgo secuencia).
//
// Por qué client-side: evita dependencias pesadas en el servidor
// (@react-pdf/renderer da problemas TS con React 18 + Next 16) y aprovecha que
// jsPDF ya está instalado en el proyecto.
// =============================================================================

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ParametricConfig,
  ParametricResult,
} from "./retirement-parametric";

// Paleta EPK
const C = {
  navy: [15, 23, 42] as [number, number, number],
  coral: [225, 29, 72] as [number, number, number],
  text: [30, 41, 59] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  bgSoft: [248, 250, 252] as [number, number, number],
  emerald: [4, 120, 87] as [number, number, number],
  amber: [180, 83, 9] as [number, number, number],
  red: [185, 28, 28] as [number, number, number],
};

const fmtEUR0 = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const fmtEUR = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export function generateInformePdf(args: {
  subscriberName?: string;
  config: ParametricConfig;
  results: ParametricResult;
}): jsPDF {
  const { subscriberName, config, results } = args;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 18;

  let y = drawHeader(doc, pageW, margin, subscriberName);

  // ---------- Resumen ejecutivo (KPIs) ----------
  y = drawSectionTitle(doc, "Resumen ejecutivo", margin, y + 4);
  y = drawKpis(doc, pageW, margin, y + 2, results);

  // ---------- Tu configuración ----------
  y = drawSectionTitle(doc, "Tu configuración", margin, y + 6);
  drawConfigTable(doc, margin, y, config);
  y = getY(doc, y + 10);

  // ---------- Objetivos financieros ----------
  if (config.goals && config.goals.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = drawSectionTitle(doc, "Tus objetivos financieros", margin, y + 4);
    drawGoalsTable(doc, margin, y, config);
    y = getY(doc, y + 10);
  }

  // ---------- Tasas de retirada SWR/PWR ----------
  if (results.withdrawalRates?.scenarios?.length > 0) {
    y = checkPageBreak(doc, y, 60);
    y = drawSectionTitle(
      doc,
      "Cuánto puedes retirar al jubilarte",
      margin,
      y + 6
    );
    doc.setFontSize(9);
    doc.setTextColor(...C.muted);
    doc.text(
      `Basado en un capital de ${fmtEUR0.format(results.withdrawalRates.capitalAtRetirementReal)} en la jubilación (€ reales de hoy).`,
      margin,
      y
    );
    y += 3;
    drawWithdrawalTable(doc, margin, y, results);
    y = getY(doc, y + 10);
    y += 3;
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(
      "SWR: Safe Withdrawal Rate — agotar el capital al final del horizonte.",
      margin,
      y
    );
    y += 4;
    doc.text(
      "PWR: Perpetual Withdrawal Rate — mantener el capital intacto en términos reales.",
      margin,
      y
    );
    y += 3;
  }

  // ---------- Riesgo de secuencia ----------
  y = checkPageBreak(doc, y, 50);
  y = drawSectionTitle(doc, "Riesgo de secuencia (sequence risk)", margin, y + 6);
  y = drawSequenceRisk(doc, pageW, margin, y + 2, results);

  // ---------- CTA final ----------
  y = checkPageBreak(doc, y, 50);
  drawCta(doc, pageW, margin, y + 6);

  // Pie de página en todas las páginas
  drawFooters(doc, pageW);

  return doc;
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function drawHeader(
  doc: jsPDF,
  pageW: number,
  margin: number,
  subscriberName?: string
): number {
  // Banda navy
  doc.setFillColor(...C.navy);
  doc.rect(0, 0, pageW, 28, "F");
  // Cuadrado coral con K
  doc.setFillColor(...C.coral);
  doc.rect(margin, 8, 12, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("K", margin + 6, 16.5, { align: "center", baseline: "middle" });

  // Título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Tu plan de jubilación", margin + 18, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 200, 220);
  const fecha = new Date().toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const subtitleParts = [
    "Simulación paramétrica · El Proyecto K",
    subscriberName ? `Para ${subscriberName}` : null,
    fecha,
  ].filter(Boolean);
  doc.text(subtitleParts.join(" · "), margin + 18, 19);

  doc.setTextColor(...C.text);
  return 32;
}

// -----------------------------------------------------------------------------
// Section title
// -----------------------------------------------------------------------------

function drawSectionTitle(
  doc: jsPDF,
  text: string,
  x: number,
  y: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...C.navy);
  doc.text(text, x, y);
  // Subrayado coral
  doc.setDrawColor(...C.coral);
  doc.setLineWidth(0.8);
  doc.line(x, y + 1.5, x + 22, y + 1.5);
  doc.setTextColor(...C.text);
  return y + 6;
}

// -----------------------------------------------------------------------------
// KPIs
// -----------------------------------------------------------------------------

function drawKpis(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  r: ParametricResult
): number {
  const usableW = pageW - margin * 2;
  const boxW = (usableW - 6) / 3;
  const boxH = 22;

  const kpis: Array<{ label: string; value: string; color: [number, number, number] }> = [
    {
      label: "Probabilidad de éxito",
      value: `${r.successProbability.toFixed(0)}%`,
      color: probColor(r.successProbability),
    },
    {
      label: "Valor final mediano (real)",
      value: fmtEUR0.format(Math.max(0, r.medianFinalValueReal)),
      color: C.navy,
    },
    {
      label:
        r.medianDepletionAge !== undefined
          ? "Edad mediana de agotamiento"
          : "% paths agotados",
      value:
        r.medianDepletionAge !== undefined
          ? `${r.medianDepletionAge.toFixed(0)} años`
          : `${r.depletionProbability.toFixed(0)}%`,
      color: r.medianDepletionAge !== undefined ? C.amber : C.red,
    },
  ];

  kpis.forEach((k, i) => {
    const x = margin + i * (boxW + 3);
    // Borde y fondo
    doc.setFillColor(...C.bgSoft);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, boxW, boxH, 2, 2, "FD");
    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.muted);
    doc.text(k.label, x + 3, y + 6);
    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...k.color);
    doc.text(k.value, x + 3, y + 16);
  });

  doc.setTextColor(...C.text);
  return y + boxH + 4;
}

function probColor(prob: number): [number, number, number] {
  if (prob >= 80) return C.emerald;
  if (prob >= 60) return C.amber;
  return C.red;
}

// -----------------------------------------------------------------------------
// Tablas
// -----------------------------------------------------------------------------

function drawConfigTable(
  doc: jsPDF,
  margin: number,
  y: number,
  c: ParametricConfig
): void {
  const rows: Array<[string, string]> = [
    ["Edad actual", `${c.currentAge} años`],
    ["Edad de jubilación", `${c.retirementAge} años`],
    ["Horizonte del plan", `Hasta los ${c.endAge} años`],
    ["Capital inicial", fmtEUR0.format(c.initialCapital)],
    [
      "Cartera acumulación",
      `Rtb. esperada ${c.accumulationReturn.toFixed(1)}% · Volatilidad ${c.accumulationVol.toFixed(1)}%`,
    ],
    [
      "Cartera distribución",
      `Rtb. esperada ${c.distributionReturn.toFixed(1)}% · Volatilidad ${c.distributionVol.toFixed(1)}%`,
    ],
    [
      "Glide path",
      c.glidePathYears > 0
        ? `${c.glidePathYears} años de transición A→B`
        : "Cambio instantáneo en la jubilación",
    ],
    ["Inflación", `${c.inflationAnnualPct.toFixed(1)}% anual`],
    ["Simulaciones Monte Carlo", `${c.numPaths.toLocaleString("es-ES")} paths`],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [],
    body: rows,
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      textColor: C.text,
    },
    columnStyles: {
      0: { fontStyle: "bold", textColor: C.muted, cellWidth: 55 },
      1: { textColor: C.text },
    },
    didDrawCell: (data) => {
      // Línea separadora
      if (data.section === "body" && data.column.index === 0) {
        doc.setDrawColor(...C.border);
        doc.setLineWidth(0.1);
        doc.line(
          data.cell.x,
          data.cell.y + data.cell.height,
          data.cell.x + data.cell.width * 2,
          data.cell.y + data.cell.height
        );
      }
    },
  });
}

function drawGoalsTable(
  doc: jsPDF,
  margin: number,
  y: number,
  c: ParametricConfig
): void {
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
    margin: { left: margin, right: margin },
    head: [["Objetivo", "Tipo", "Cuándo", "Importe", "Duración"]],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: C.navy,
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 2,
      textColor: C.text,
    },
    alternateRowStyles: { fillColor: C.bgSoft },
  });
}

function drawWithdrawalTable(
  doc: jsPDF,
  margin: number,
  y: number,
  r: ParametricResult
): void {
  const rows = r.withdrawalRates.scenarios.map((s) => [
    s.label,
    `${s.successRatePct.toFixed(0)}%`,
    fmtEUR.format(s.swr.eurPerMonth),
    `${s.swr.pctAnnual.toFixed(2)}%`,
    Number.isNaN(s.pwr.eurPerMonth) ? "—" : fmtEUR.format(s.pwr.eurPerMonth),
    Number.isNaN(s.pwr.pctAnnual) ? "—" : `${s.pwr.pctAnnual.toFixed(2)}%`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        "Escenario",
        "% éxito",
        "SWR €/mes",
        "SWR % anual",
        "PWR €/mes",
        "PWR % anual",
      ],
    ],
    body: rows,
    theme: "striped",
    headStyles: {
      fillColor: C.navy,
      textColor: [255, 255, 255],
      fontSize: 9,
    },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 2.5,
      textColor: C.text,
    },
    alternateRowStyles: { fillColor: C.bgSoft },
    columnStyles: {
      0: { fontStyle: "bold" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
    },
  });
}

// -----------------------------------------------------------------------------
// Sequence risk
// -----------------------------------------------------------------------------

function drawSequenceRisk(
  doc: jsPDF,
  pageW: number,
  margin: number,
  y: number,
  r: ParametricResult
): number {
  const usableW = pageW - margin * 2;
  const boxH = 32;
  // Box destacado
  doc.setFillColor(254, 242, 242); // rojo muy suave
  doc.setDrawColor(252, 165, 165);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, y, usableW, boxH, 2, 2, "FD");

  const dropPct = Math.abs(r.sequenceRisk.worstWindowCumulativeReturn) * 100;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.red);
  doc.text(
    `Caída del ${dropPct.toFixed(1)}% en los primeros ${r.sequenceRisk.windowMonths / 12} años post-jubilación`,
    margin + 4,
    y + 7
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...C.text);
  const explainText = doc.splitTextToSize(
    "Simulamos cómo se comporta tu plan si justo al jubilarte sufres un mercado MUY adverso (peor 1% de escenarios). Es el llamado riesgo de secuencia: una mala racha temprana puede agotar tu capital aunque la rentabilidad media sea buena.",
    usableW - 8
  );
  doc.text(explainText, margin + 4, y + 13);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(
    r.sequenceRisk.success ? C.emerald[0] : C.red[0],
    r.sequenceRisk.success ? C.emerald[1] : C.red[1],
    r.sequenceRisk.success ? C.emerald[2] : C.red[2]
  );
  const resultadoStr = r.sequenceRisk.success
    ? `Aun así, tu plan sobreviviría hasta los ${r.config.endAge} años con ${fmtEUR0.format(Math.max(0, r.sequenceRisk.finalValueReal))} restantes.`
    : `En ese escenario tu plan se agotaría hacia los ${r.sequenceRisk.depletionAge?.toFixed(0) ?? "—"} años.`;
  const resultadoText = doc.splitTextToSize(resultadoStr, usableW - 8);
  doc.text(resultadoText, margin + 4, y + boxH - 4);

  doc.setTextColor(...C.text);
  return y + boxH;
}

// -----------------------------------------------------------------------------
// CTA
// -----------------------------------------------------------------------------

function drawCta(doc: jsPDF, pageW: number, margin: number, y: number): void {
  const usableW = pageW - margin * 2;
  doc.setFillColor(...C.navy);
  doc.roundedRect(margin, y, usableW, 32, 3, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("¿Y ahora qué?", margin + 5, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(220, 220, 230);
  const cta = doc.splitTextToSize(
    "Esta simulación te da la base, pero un plan financiero real requiere ajustarlo a tu situación fiscal, tu tolerancia al riesgo y tus objetivos. En El Proyecto K te enseñamos a construirlo paso a paso, sin productos bancarios sobrecargados de comisiones, con inversión indexada de bajo coste.",
    usableW - 10
  );
  doc.text(cta, margin + 5, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...C.coral);
  doc.text("→ elproyectok.com", margin + 5, y + 28);

  doc.setTextColor(...C.text);
}

// -----------------------------------------------------------------------------
// Footers + utilidades
// -----------------------------------------------------------------------------

function drawFooters(doc: jsPDF, pageW: number): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(18, pageH - 12, pageW - 18, pageH - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(
      "El Proyecto K · elproyectok.com · Esta simulación es educativa, no constituye asesoramiento financiero.",
      18,
      pageH - 7
    );
    doc.text(`${i} / ${pages}`, pageW - 18, pageH - 7, { align: "right" });
  }
}

function getY(doc: jsPDF, fallback: number): number {
  type DocWithAutoTable = jsPDF & {
    lastAutoTable?: { finalY?: number };
  };
  const d = doc as DocWithAutoTable;
  return d.lastAutoTable?.finalY ?? fallback;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 18) {
    doc.addPage();
    return 18;
  }
  return y;
}
