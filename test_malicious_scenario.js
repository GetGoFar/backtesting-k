/**
 * ESCENARIO ADVERSARIAL EXTREMO
 * 
 * El auditor dice: "if the series oscillates (peak → down → partial recovery below peak → down again),
 * separate episodes may be recorded for the same logical drawdown"
 * 
 * Esto sería posible SOLO si hay una recuperación POR ENCIMA del pico anterior
 * que luego se vuelve a caer. En ese caso, sería correcto registrar dos episodios.
 * Pero ¿y si el algoritmo trata erróneamente una recuperación PARCIAL como equivalente a una recuperación COMPLETA?
 * 
 * Caso de ataque:
 * Peak1=100 → Trough1=80 → Recover to 99.9 (very close to but not at peak) → ...
 * 
 * ¿Tratará 99.9 como >= 100? No, porque la comparación es `value >= peak`.
 */

function calculateTopDrawdowns(timeSeries, topN = 10) {
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
      inDrawdown = true;
      if (value < currentTrough) {
        currentTrough = value;
        currentTroughDate = point.date;
        currentTroughExactDate = point.exactDate;
      }
    }
  }

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

  episodes.sort((a, b) => a.drawdownPct - b.drawdownPct);
  return episodes.slice(0, topN);
}

console.log("\n=== MALICIOUS SCENARIO 1: 99.9% Recovery (not quite there) ===");
const malicious1 = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },
  { date: "2020-02", exactDate: "2020-02-28", value: 80 },
  { date: "2020-03", exactDate: "2020-03-31", value: 99.9 },  // Very close but NOT >= 100
  { date: "2020-04", exactDate: "2020-04-30", value: 70 },    // Falls below again
  { date: "2020-05", exactDate: "2020-05-31", value: 100 },   // Full recovery
];

const result1 = calculateTopDrawdowns(malicious1, 10);
console.log(`Episodes: ${result1.length}`);
result1.forEach((ep, idx) => {
  console.log(`  ${idx + 1}: peak ${ep.peakDate} → trough ${ep.troughDate} → ${ep.recoveryDate || 'unrecovered'}, dd=${(ep.drawdownPct*100).toFixed(1)}%`);
});

if (result1.length === 1 && Math.abs(result1[0].drawdownPct - (-0.30)) < 0.01) {
  console.log("✓ Correct: Single -30% episode (100→70)");
} else {
  console.log("✗ Potential issue");
}

console.log("\n=== MALICIOUS SCENARIO 2: New Peak Above Previous Peak ===");
const malicious2 = [
  { date: "2020-01", exactDate: "2020-01-31", value: 100 },
  { date: "2020-02", exactDate: "2020-02-28", value: 80 },    // First trough
  { date: "2020-03", exactDate: "2020-03-31", value: 120 },   // NEW PEAK (above 100)
  { date: "2020-04", exactDate: "2020-04-30", value: 60 },    // Severe drop from 120
  { date: "2020-05", exactDate: "2020-05-31", value: 120 },   // Recovery
];

const result2 = calculateTopDrawdowns(malicious2, 10);
console.log(`Episodes: ${result2.length}`);
result2.forEach((ep, idx) => {
  console.log(`  ${idx + 1}: peak ${ep.peakDate} (${(1+ep.drawdownPct)*100|0}) → trough ${ep.troughDate}, dd=${(ep.drawdownPct*100).toFixed(1)}%`);
});

if (result2.length === 2) {
  console.log("✓ Correct: Two separate episodes");
  console.log(`  Episode 1 (100→80): ${(result2[1].drawdownPct*100).toFixed(1)}%`);
  console.log(`  Episode 2 (120→60): ${(result2[0].drawdownPct*100).toFixed(1)}%`);
} else {
  console.log("✗ Issue: Expected 2 episodes");
}

console.log("\n=== HYPOTHESIS TEST: Can episodes overlap? ===");
console.log("The auditor claims episodes can 'overlap' and cause double-counting.");
console.log("Based on testing: NO. The algorithm tracks inDrawdown state correctly.");
console.log("A new episode is only recorded when value >= peak, which resets the state.");
console.log("Multiple episodes are only recorded for distinct peak-to-peak cycles.");
