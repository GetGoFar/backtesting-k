/**
 * Edge case más delicado:
 * Peak at 100 → Trough at 80 → Recovery to 85 (below peak, above trough) → Dip to 75 → Recovery
 * 
 * El algoritmo debería reconocer esto como UN SOLO drawdown desde 100 a 75.
 * Pero si la recuperación a 85 se trata como una "salida del drawdown", 
 * podría registrar episodios separados.
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

  console.log(`[TRACE] Starting with peak=${peak}, peakDate=${peakDate}`);

  for (let i = 1; i < timeSeries.length; i++) {
    const point = timeSeries[i];
    const value = point.value;

    console.log(`[TRACE] i=${i}, date=${point.date}, value=${value}, inDrawdown=${inDrawdown}, peak=${peak}, currentTrough=${currentTrough}`);

    if (value >= peak) {
      console.log(`[TRACE]   → value >= peak: RECOVERY/NEW PEAK`);
      // Recuperación o nuevo pico
      if (inDrawdown) {
        const ddPct = peak > 0 ? (currentTrough - peak) / peak : 0;
        console.log(`[TRACE]     Recording episode: peak=${peakDate}(${peak}) → trough=${currentTroughDate}(${currentTrough}) → recovery=${point.date}(${value}), dd=${(ddPct*100).toFixed(1)}%`);
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
      console.log(`[TRACE]   → value < peak: IN DRAWDOWN`);
      // En drawdown — actualizar valle si profundizamos
      inDrawdown = true;
      if (value < currentTrough) {
        console.log(`[TRACE]     Updating trough: ${currentTrough} → ${value}`);
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
    console.log(`[TRACE] Series ends in drawdown. Recording unrecovered episode: dd=${(ddPct*100).toFixed(1)}%`);
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

console.log("\n=== EDGE CASE: Partial recovery within drawdown ===");
console.log("Peak 100 → Trough 80 → Recovery 85 (still below peak) → Dip 75 → Recovery 100");
console.log("Expected: 1 episode (peak 100 → trough 75)");

const edgeCaseData = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },  // Peak
  { date: "2020-02", exactDate: "2020-02-28", value: 80 },   // First trough
  { date: "2020-03", exactDate: "2020-03-31", value: 85 },   // Partial recovery (< peak)
  { date: "2020-04", exactDate: "2020-04-30", value: 75 },   // Deeper dip (new trough)
  { date: "2020-05", exactDate: "2020-05-31", value: 100 },  // Full recovery
];

const episodes = calculateTopDrawdowns(edgeCaseData, 10);
console.log(`\nResult: ${episodes.length} episode(s)`);
episodes.forEach((ep, idx) => {
  console.log(`Episode ${idx + 1}:`);
  console.log(`  Peak: ${ep.peakDate}, Trough: ${ep.troughDate}, Recovery: ${ep.recoveryDate}`);
  console.log(`  Drawdown: ${(ep.drawdownPct * 100).toFixed(1)}%`);
});

if (episodes.length === 1 && Math.abs(episodes[0].drawdownPct - (-0.25)) < 0.01) {
  console.log("\n✓ CORRECT: Single episode from 100 to 75 (-25%)");
} else {
  console.log("\n✗ ISSUE: Expected 1 episode with -25% drawdown");
}
