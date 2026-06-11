/**
 * Prueba: Reproduce el escenario reportado por el auditor
 * Peak at 100 (Jan) → Trough1 at 90 (Feb) → Dip to 88 (Mar, new trough!) → Recovery to 100 (Jun)
 * 
 * El auditor alegaba que si oscilamos (peak → down → partial recovery below peak → down again),
 * pueden registrarse episodios separados para el mismo drawdown lógico.
 */

function calculateTopDrawdowns(
  timeSeries,
  topN = 10
) {
  if (timeSeries.length < 2) return [];

  const monthsBetween = (start, end) => {
    const s = new Date(start.length === 7 ? `${start}-01` : start);
    const e = new Date(end.length === 7 ? `${end}-01` : end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return (
      (e.getFullYear() - s.getFullYear()) * 12 +
      (e.getMonth() - s.getMonth())
    );
  };

  const episodes = [];
  const first = timeSeries[0];
  let peak = first.value;
  let peakDate = first.date;
  let peakExactDate = first.exactDate;
  let currentTrough = peak;
  let currentTroughDate = peakDate;
  let currentTroughExactDate = peakExactDate;
  let inDrawdown = false;

  for (let i = 1; i < timeSeries.length; i++) {
    const point = timeSeries[i];
    const value = point.value;

    if (value >= peak) {
      // Recuperación o nuevo pico
      if (inDrawdown) {
        const ddPct = peak > 0 ? (currentTrough - peak) / peak : 0;
        episodes.push({
          peakDate,
          peakExactDate,
          troughDate: currentTroughDate,
          troughExactDate: currentTroughExactDate,
          recoveryDate: point.date,
          recoveryExactDate: point.exactDate,
          drawdownPct: ddPct,
          lengthMonths: monthsBetween(peakDate, currentTroughDate),
          recoveryMonths: monthsBetween(currentTroughDate, point.date),
          underwaterMonths: monthsBetween(peakDate, point.date),
        });
        inDrawdown = false;
      }
      peak = value;
      peakDate = point.date;
      peakExactDate = point.exactDate;
      currentTrough = value;
      currentTroughDate = point.date;
      currentTroughExactDate = point.exactDate;
    } else {
      // En drawdown — actualizar valle si profundizamos
      inDrawdown = true;
      if (value < currentTrough) {
        currentTrough = value;
        currentTroughDate = point.date;
        currentTroughExactDate = point.exactDate;
      }
    }
  }

  // Si la serie termina en drawdown, registrar como "no recuperado"
  if (inDrawdown) {
    const ddPct = peak > 0 ? (currentTrough - peak) / peak : 0;
    const lastPoint = timeSeries[timeSeries.length - 1];
    episodes.push({
      peakDate,
      peakExactDate,
      troughDate: currentTroughDate,
      troughExactDate: currentTroughExactDate,
      recoveryDate: null,
      recoveryExactDate: undefined,
      drawdownPct: ddPct,
      lengthMonths: monthsBetween(peakDate, currentTroughDate),
      recoveryMonths: null,
      underwaterMonths: monthsBetween(peakDate, lastPoint.date),
    });
  }

  // Ordenar por magnitud (más negativo primero) y devolver top N
  episodes.sort((a, b) => a.drawdownPct - b.drawdownPct);
  return episodes.slice(0, topN);
}

// ESCENARIO 1: Auditor claim — Peak → Trough → Dip → Recovery
// ¿Se crean dos episodios para el mismo drawdown lógico?
console.log("\n=== ESCENARIO 1: Auditor Claim ===");
console.log("Peak at 100 (Jan) → Trough1 at 90 (Feb) → Dip to 88 (Mar, new trough!) → Recovery to 100 (Jun)");

const scenario1 = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },  // Peak
  { date: "2020-02", exactDate: "2020-02-28", value: 90 },   // Trough1
  { date: "2020-03", exactDate: "2020-03-31", value: 88 },   // Dip to new trough
  { date: "2020-04", exactDate: "2020-04-30", value: 85 },   // Still in drawdown, more trough
  { date: "2020-05", exactDate: "2020-05-31", value: 95 },   // Partial recovery but still below peak
  { date: "2020-06", exactDate: "2020-06-30", value: 100 },  // Full recovery to peak
];

const episodes1 = calculateTopDrawdowns(scenario1, 10);
console.log(`Episodes found: ${episodes1.length}`);
episodes1.forEach((ep, idx) => {
  console.log(`  Episode ${idx + 1}:`);
  console.log(`    Peak: ${ep.peakDate} (value 100) → Trough: ${ep.troughDate} (value ~${Math.round((1 + ep.drawdownPct) * 100)})`);
  console.log(`    Drawdown: ${(ep.drawdownPct * 100).toFixed(1)}%`);
  console.log(`    Recovery: ${ep.recoveryDate || "Not recovered"}`);
});

// ESCENARIO 2: Oscilación compleja
// Peak → Small dip → Partial recovery (but still below peak) → Deeper dip → Recovery
console.log("\n=== ESCENARIO 2: Oscilación Compleja ===");
console.log("Peak → Small dip 95 → Partial recovery 97 (still below 100) → Deeper dip 85 → Recovery");

const scenario2 = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },
  { date: "2020-02", exactDate: "2020-02-28", value: 95 },   // First dip
  { date: "2020-03", exactDate: "2020-03-31", value: 97 },   // Partial recovery
  { date: "2020-04", exactDate: "2020-04-30", value: 85 },   // Deeper dip
  { date: "2020-05", exactDate: "2020-05-31", value: 100 },  // Recovery
];

const episodes2 = calculateTopDrawdowns(scenario2, 10);
console.log(`Episodes found: ${episodes2.length}`);
episodes2.forEach((ep, idx) => {
  console.log(`  Episode ${idx + 1}:`);
  console.log(`    Peak: ${ep.peakDate} → Trough: ${ep.troughDate}`);
  console.log(`    Drawdown: ${(ep.drawdownPct * 100).toFixed(1)}%`);
  console.log(`    Length: ${ep.lengthMonths} months, Recovery: ${ep.recoveryMonths} months`);
});

// ESCENARIO 3: Múltiples ciclos separados
// Peak1 → Trough1 → Recovery to new Peak2 → Trough2 → Recovery
// Cada ciclo debe ser episodio separado (correcto)
console.log("\n=== ESCENARIO 3: Ciclos Separados (Control) ===");
console.log("Peak1 → Trough1 → Recovery → Peak2 → Trough2 → Recovery");

const scenario3 = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },
  { date: "2020-02", exactDate: "2020-02-28", value: 80 },   // Trough1
  { date: "2020-03", exactDate: "2020-03-31", value: 100 },  // Recovery + New Peak
  { date: "2020-04", exactDate: "2020-04-30", value: 70 },   // Trough2
  { date: "2020-05", exactDate: "2020-05-31", value: 100 },  // Recovery
];

const episodes3 = calculateTopDrawdowns(scenario3, 10);
console.log(`Episodes found: ${episodes3.length}`);
episodes3.forEach((ep, idx) => {
  console.log(`  Episode ${idx + 1}:`);
  console.log(`    Peak: ${ep.peakDate} → Trough: ${ep.troughDate}`);
  console.log(`    Drawdown: ${(ep.drawdownPct * 100).toFixed(1)}%`);
});

// ANÁLISIS CRÍTICO DEL AUDITOR
console.log("\n=== ANÁLISIS CRÍTICO ===");
console.log(`Escenario 1: ¿Episodios duplicados o solapados? ${episodes1.length} episodios`);
console.log("  → Si hay 1 episodio: algoritmo CORRECTO (actualiza el trough)");
console.log("  → Si hay 2+ episodios: algoritmo INCORRECTO (solapamiento)");

if (episodes1.length === 1) {
  console.log("  ✓ PASS: Escenario 1 produce UN SOLO episodio (trough actualizado a -12%)");
  console.log(`    Drawdown: ${(episodes1[0].drawdownPct * 100).toFixed(1)}%`);
} else {
  console.log("  ✗ FAIL: Escenario 1 produce múltiples episodios (solapamiento detectado)");
}

if (episodes2.length === 1) {
  console.log("  ✓ PASS: Escenario 2 produce UN SOLO episodio (trough actualizado a -15%)");
} else {
  console.log("  ✗ FAIL: Escenario 2 produce múltiples episodios");
}

if (episodes3.length === 2) {
  console.log("  ✓ PASS: Escenario 3 produce DOS episodios (ciclos separados)");
} else {
  console.log("  ✗ FAIL: Escenario 3 debería producir 2 episodios, produce " + episodes3.length);
}
