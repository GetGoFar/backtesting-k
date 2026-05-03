// Smoke test: EODHD coverage para fondos de la Liga + cálculo de alfa real.
// Run (Bash):  set -a && source .env.local && set +a && npx tsx scripts/liga-smoke-test.ts

import { fetchNavsEODHD, calcularAlfa, dineroQuemado } from "../src/lib/liga-engine";

(async () => {
  const token = process.env.EODHD_API_TOKEN || "";
  console.log("EODHD token presente:", !!token);

  const fondosTest = [
    { isin: "ES0174930000", nombre: "Santander GO RV Norteamerica A", refDq10: 81440 },
    { isin: "ES0114277033", nombre: "BBVA Megatendencia Demografia", refDq10: 75946 },
    { isin: "ES0119199000", nombre: "Cobas Internacional C FI", refDq10: -234088 },
    { isin: "ES0146309002", nombre: "Horos Value Internacional FI", refDq10: -153308 },
  ];

  console.log("\n=== Fondos ===");
  const navsFondos = new Map<string, Awaited<ReturnType<typeof fetchNavsEODHD>>>();
  for (const f of fondosTest) {
    const navs = await fetchNavsEODHD(`${f.isin}.EUFUND`, token);
    navsFondos.set(f.isin, navs);
    if (navs.length === 0) {
      console.log(`  ${f.isin} ${f.nombre}: NO DATA`);
    } else {
      const a = navs[0]!;
      const z = navs[navs.length - 1]!;
      console.log(`  ${f.isin} ${f.nombre}: ${navs.length} pts, ${a.date} (${a.nav.toFixed(2)}) -> ${z.date} (${z.nav.toFixed(2)})`);
    }
  }

  console.log("\n=== Benchmarks ===");
  const benchmarks = ["IWDA.AS", "VUSA.AS", "CEUE.PA", "AEEM.PA"];
  const navsBench = new Map<string, Awaited<ReturnType<typeof fetchNavsEODHD>>>();
  for (const b of benchmarks) {
    const navs = await fetchNavsEODHD(b, token);
    navsBench.set(b, navs);
    if (navs.length === 0) {
      console.log(`  ${b}: NO DATA`);
    } else {
      const a = navs[0]!;
      const z = navs[navs.length - 1]!;
      console.log(`  ${b}: ${navs.length} pts, ${a.date} -> ${z.date}`);
    }
  }

  // Cálculo de alfa real para los 4 fondos vs IWDA (todos USA/Global)
  console.log("\n=== Alfa real fondo vs IWDA + dq10 calculado vs publicado ===");
  const benchIWDA = navsBench.get("IWDA.AS") || [];
  for (const f of fondosTest) {
    const navsF = navsFondos.get(f.isin) || [];
    if (navsF.length < 2 || benchIWDA.length < 2) {
      console.log(`  ${f.isin}: skip (sin datos)`);
      continue;
    }
    const a = calcularAlfa(navsF, benchIWDA);
    if (!a) {
      console.log(`  ${f.isin}: alfa null`);
      continue;
    }
    const dq10Calc = dineroQuemado(a.alfaPct, 10);
    const diff = dq10Calc - f.refDq10;
    const diffPct = ((diff / f.refDq10) * 100).toFixed(1);
    console.log(`  ${f.isin}: alfa=${a.alfaPct.toFixed(2)}% (${a.fechaInicio} -> ${a.fechaFin}, ${a.anos.toFixed(1)}y) | dq10 calc=${dq10Calc.toFixed(0)} vs ref=${f.refDq10} (diff=${diff.toFixed(0)} = ${diffPct}%)`);
  }
})();
