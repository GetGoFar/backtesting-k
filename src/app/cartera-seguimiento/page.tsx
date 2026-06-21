"use client";

// =============================================================================
// /cartera-seguimiento — Panel del alumno, pestaña SEGUIMIENTO (Fase 3, v1)
// =============================================================================
// Cartera SIMULADA: el alumno registra sus compras (fecha · títulos · precio) y
// aportaciones; valoramos a diario con el último NAV (EODHD); mostramos cuánto
// vale, cuánto ha ganado (TIR / money-weighted), y si se ha desviado de su
// objetivo (la cartera que definió en Composición) con alertas por banda.
// Conectado con Mi Disciplina. v1: datos en el navegador (localStorage).
// Persistencia en servidor = siguiente fase (cuenta del alumno).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";

const ROJO = "#C81E2E";
const BEIGE = "#F5F0EB";
const TINTA = "#202020";
const SUAVE = "#6B6B6B";
const VERDE = "#15633F";
const AMBAR = "#B7791F";

const CAMPUS = "https://elproyectok.com/campus";
const LS_KEY = "ck-seguimiento";

interface Tx { id: string; isin: string; date: string; units: number; price: number }
interface PriceInfo { price: number; date: string; name: string }

const fmtEUR = (v: number) =>
  (Math.round(v) || 0).toLocaleString("es-ES") + " €";
const fmtPct = (d: number, signed = false) =>
  `${signed && d >= 0 ? "+" : ""}${(d * 100).toFixed(1).replace(".", ",")}%`;

function readJSON<T>(key: string, fallback: T): T {
  try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) as T) : fallback; } catch { return fallback; }
}
function readTarget(): { isin: string; weight: number }[] {
  const o = readJSON<{ holdings?: { isin: string; weight: number }[] }>("ck-cartera-holdings", {});
  return Array.isArray(o.holdings) ? o.holdings.filter((h) => h.isin && +h.weight > 0) : [];
}
function readRachaSinMirar(): number {
  const disc = readJSON<{ diasNoMire?: Record<string, boolean> }>("ck-disciplina", {});
  const dias = disc.diasNoMire || {};
  const d = new Date();
  let racha = 0;
  for (let i = 0; i < 366; i++) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (dias[iso]) { racha++; d.setDate(d.getDate() - 1); } else break;
  }
  return racha;
}

// TIR (money-weighted) con fechas irregulares — Newton + bisección de respaldo.
function xirr(flows: { date: Date; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = flows[0]!.date.getTime();
  const yrs = (d: Date) => (d.getTime() - t0) / (365.25 * 24 * 3600 * 1000);
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, yrs(f.date)), 0);
  // Newton
  let r = 0.1;
  for (let i = 0; i < 80; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-7) return r;
    const d = (npv(r + 1e-6) - f) / 1e-6;
    if (!isFinite(d) || d === 0) break;
    let nr = r - f / d;
    if (!isFinite(nr)) break;
    if (nr <= -0.9999) nr = -0.9999;
    if (Math.abs(nr - r) < 1e-9) return nr;
    r = nr;
  }
  // Bisección de respaldo en [-0.99, 10]
  let lo = -0.99, hi = 10, flo = npv(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2; const fm = npv(mid);
    if (Math.abs(fm) < 1e-6) return mid;
    if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return null;
}

export default function CarteraSeguimientoPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [target, setTarget] = useState<{ isin: string; weight: number }[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo | null>>({});
  const [banda, setBanda] = useState<number>(0.25); // banda relativa (regla 5/25)
  const [racha, setRacha] = useState(0);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  // formulario de movimiento
  const [fIsin, setFIsin] = useState("");
  const [fDate, setFDate] = useState("");
  const [fUnits, setFUnits] = useState("");
  const [fPrice, setFPrice] = useState("");

  useEffect(() => {
    const saved = readJSON<{ transactions?: Tx[]; banda?: number }>(LS_KEY, {});
    setTxs(Array.isArray(saved.transactions) ? saved.transactions : []);
    if (typeof saved.banda === "number") setBanda(saved.banda);
    setTarget(readTarget());
    setRacha(readRachaSinMirar());
    setReady(true);
  }, []);

  const persist = (next: Tx[], b = banda) => {
    setTxs(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify({ transactions: next, banda: b })); } catch {}
  };

  // ISINs a valorar: objetivo + los que tenga en movimientos
  const allIsins = useMemo(() => {
    const s = new Set<string>();
    target.forEach((t) => s.add(t.isin));
    txs.forEach((t) => s.add(t.isin));
    return [...s];
  }, [target, txs]);

  const fetchPrices = useCallback(async () => {
    if (allIsins.length === 0) { setPrices({}); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/campus/precios", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isins: allIsins }),
      });
      const json = await res.json();
      setPrices(json.prices || {});
    } catch { /* deja precios como estén */ }
    finally { setLoading(false); }
  }, [allIsins]);

  useEffect(() => { if (ready) fetchPrices(); }, [ready, fetchPrices]);

  // --- Cálculos ---
  const posiciones = useMemo(() => {
    const byIsin = new Map<string, { units: number; invested: number }>();
    for (const t of txs) {
      const cur = byIsin.get(t.isin) || { units: 0, invested: 0 };
      cur.units += +t.units; cur.invested += +t.units * +t.price;
      byIsin.set(t.isin, cur);
    }
    return [...byIsin.entries()].map(([isin, p]) => {
      const pr = prices[isin];
      const value = pr ? p.units * pr.price : null;
      return {
        isin,
        name: pr?.name || isin,
        units: p.units,
        invested: p.invested,
        avgPrice: p.units ? p.invested / p.units : 0,
        price: pr?.price ?? null,
        value,
        pl: value !== null ? value - p.invested : null,
        plPct: value !== null && p.invested > 0 ? value / p.invested - 1 : null,
      };
    }).filter((p) => p.units > 0);
  }, [txs, prices]);

  const totalValue = posiciones.reduce((s, p) => s + (p.value ?? 0), 0);
  const totalInvested = posiciones.reduce((s, p) => s + p.invested, 0);
  const totalPL = totalValue - totalInvested;
  const sinPrecio = posiciones.some((p) => p.value === null);

  const tir = useMemo(() => {
    if (totalValue <= 0 || txs.length === 0) return null;
    const flows = txs
      .filter((t) => t.date)
      .map((t) => ({ date: new Date(t.date), amount: -(+t.units * +t.price) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    flows.push({ date: new Date(), amount: totalValue });
    return xirr(flows);
  }, [txs, totalValue]);

  // Rebalanceo: objetivo (cartera definida) vs actual (valor de mercado)
  const targetSum = target.reduce((s, t) => s + +t.weight, 0) || 1;
  const rebal = target.map((t) => {
    const objetivo = +t.weight / targetSum;
    const pos = posiciones.find((p) => p.isin === t.isin);
    const actual = totalValue > 0 && pos?.value ? pos.value / totalValue : 0;
    const drift = actual - objetivo;
    // Regla 5/25: fuera si |drift| supera el menor de 5pp absolutos o 25% relativo
    const umbral = Math.min(0.05, objetivo * banda);
    const fuera = Math.abs(drift) > umbral && objetivo > 0;
    const accion = (objetivo - actual) * totalValue; // + comprar, - vender
    return { isin: t.isin, name: pos?.name || prices[t.isin]?.name || t.isin, objetivo, actual, drift, fuera, accion };
  });
  const algunaFuera = rebal.some((r) => r.fuera);

  const addTx = () => {
    const units = parseFloat(fUnits); const price = parseFloat(fPrice);
    if (!fIsin || !fDate || !(units > 0) || !(price > 0)) return;
    const id = `${fIsin}-${fDate}-${Math.round(units * price * 100)}-${txs.length}`;
    persist([...txs, { id, isin: fIsin, date: fDate, units, price }]);
    setFUnits(""); setFPrice("");
  };
  const delTx = (id: string) => persist(txs.filter((t) => t.id !== id));

  // opciones del desplegable = instrumentos de tu cartera objetivo
  const opciones = target.map((t) => ({ isin: t.isin, name: prices[t.isin]?.name || t.isin }));

  return (
    <div style={{ background: BEIGE, minHeight: "100vh", color: TINTA, padding: "22px 18px 48px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.9rem", margin: "0 0 4px", color: ROJO }}>
          Seguimiento de tu cartera
        </h1>
        <p style={{ color: SUAVE, margin: "0 0 18px", fontSize: ".95rem" }}>
          Registra tus compras y aportaciones; valoramos tu cartera cada día y te avisamos si te desvías de tu plan.
          Cartera simulada con fines educativos.
        </p>

        {target.length === 0 ? (
          <div style={card}>
            <p style={{ margin: 0 }}>
              Primero define tu cartera en <a href={`${CAMPUS}/cartera/`} target="_top" style={{ color: ROJO, fontWeight: 600 }}>Composición</a>.
              Aquí podrás registrar tus compras de esos instrumentos y seguir su evolución.
            </p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
              <Kpi label="Valor actual" value={fmtEUR(totalValue)} tip="Lo que vale hoy tu cartera (títulos × último precio)." />
              <Kpi label="Aportado" value={fmtEUR(totalInvested)} tip="Todo lo que has metido (suma de tus compras)." />
              <Kpi label="Ganancia" value={fmtEUR(totalPL)} color={totalPL >= 0 ? VERDE : ROJO} tip="Valor actual menos lo aportado." />
              <Kpi label="Tu rentabilidad (TIR)" value={tir === null ? "—" : fmtPct(tir, true)} color={tir !== null && tir >= 0 ? VERDE : ROJO}
                tip="Lo que has ganado tú de verdad al año, teniendo en cuenta cuándo metiste cada euro (money-weighted)." />
            </div>
            {sinPrecio && (
              <div style={{ ...avisoAmbar, marginBottom: 16 }}>
                Algún instrumento no tiene precio disponible ahora mismo; su valor no se incluye en el total.
              </div>
            )}

            {/* Rebalanceo / alertas */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <h2 style={h2}>Rebalanceo vs tu plan</h2>
                <label style={{ fontSize: ".8rem", color: SUAVE }}>
                  Banda&nbsp;
                  <select value={banda} onChange={(e) => { const b = Number(e.target.value); setBanda(b); persist(txs, b); }} style={sel}>
                    <option value={0.2}>±20% relativo</option>
                    <option value={0.25}>±25% relativo (5/25)</option>
                    <option value={0.33}>±33% relativo</option>
                  </select>
                </label>
              </div>
              {algunaFuera ? (
                <div style={{ ...avisoAmbar, marginBottom: 12 }}>
                  ⚠ Algún activo se ha salido de tu banda objetivo. Esto es información educativa: tú decides si rebalanceas. Recuerda que rebalancear de más también tiene costes.
                </div>
              ) : totalValue > 0 ? (
                <div style={{ background: "#EAF4EE", border: "1px solid #cfe6d6", color: VERDE, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: ".85rem" }}>
                  ✓ Tu cartera está dentro de las bandas de tu plan. Lo mejor que puedes hacer: nada.
                </div>
              ) : null}
              <div style={{ overflowX: "auto" }}>
                <table style={tbl}>
                  <thead><tr>
                    <th style={thL}>Instrumento</th><th style={thR}>Objetivo</th><th style={thR}>Actual</th>
                    <th style={thR}>Desviación</th><th style={thR}>Acción</th>
                  </tr></thead>
                  <tbody>
                    {rebal.map((r) => (
                      <tr key={r.isin} style={{ borderTop: "1px solid #efe8dc" }}>
                        <td style={tdL}>{r.name}</td>
                        <td style={tdR}>{fmtPct(r.objetivo)}</td>
                        <td style={tdR}>{totalValue > 0 ? fmtPct(r.actual) : "—"}</td>
                        <td style={{ ...tdR, color: r.fuera ? ROJO : SUAVE, fontWeight: r.fuera ? 700 : 400 }}>{totalValue > 0 ? fmtPct(r.drift, true) : "—"}</td>
                        <td style={{ ...tdR, color: Math.abs(r.accion) < 1 ? SUAVE : r.accion > 0 ? VERDE : ROJO }}>
                          {totalValue > 0 ? (Math.abs(r.accion) < 1 ? "—" : `${r.accion > 0 ? "Comprar" : "Vender"} ${fmtEUR(Math.abs(r.accion))}`) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Posiciones */}
            {posiciones.length > 0 && (
              <div style={card}>
                <h2 style={h2}>Tus posiciones</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={tbl}>
                    <thead><tr>
                      <th style={thL}>Instrumento</th><th style={thR}>Títulos</th><th style={thR}>Precio medio</th>
                      <th style={thR}>Valor actual</th><th style={thR}>Ganancia</th>
                    </tr></thead>
                    <tbody>
                      {posiciones.map((p) => (
                        <tr key={p.isin} style={{ borderTop: "1px solid #efe8dc" }}>
                          <td style={tdL}>{p.name}</td>
                          <td style={tdR}>{p.units.toLocaleString("es-ES", { maximumFractionDigits: 4 })}</td>
                          <td style={tdR}>{p.avgPrice.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €</td>
                          <td style={tdR}>{p.value !== null ? fmtEUR(p.value) : "—"}</td>
                          <td style={{ ...tdR, color: (p.pl ?? 0) >= 0 ? VERDE : ROJO }}>
                            {p.pl !== null ? `${fmtEUR(p.pl)} (${fmtPct(p.plPct ?? 0, true)})` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Registrar movimiento */}
            <div style={card}>
              <h2 style={h2}>Registrar compra / aportación</h2>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <Field label="Instrumento">
                  <select value={fIsin} onChange={(e) => setFIsin(e.target.value)} style={{ ...sel, minWidth: 220 }}>
                    <option value="">Elige…</option>
                    {opciones.map((o) => <option key={o.isin} value={o.isin}>{o.name}</option>)}
                  </select>
                </Field>
                <Field label="Fecha"><input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} style={sel} /></Field>
                <Field label="Nº títulos"><input type="number" step="any" min="0" value={fUnits} onChange={(e) => setFUnits(e.target.value)} style={{ ...sel, width: 110 }} /></Field>
                <Field label="Precio (€)"><input type="number" step="any" min="0" value={fPrice} onChange={(e) => setFPrice(e.target.value)} style={{ ...sel, width: 110 }} /></Field>
                <button onClick={addTx} style={{ ...btn, opacity: fIsin && fDate && +fUnits > 0 && +fPrice > 0 ? 1 : 0.5 }}>Añadir</button>
              </div>

              {txs.length > 0 && (
                <div style={{ overflowX: "auto", marginTop: 14 }}>
                  <table style={tbl}>
                    <thead><tr>
                      <th style={thL}>Fecha</th><th style={thL}>Instrumento</th><th style={thR}>Títulos</th>
                      <th style={thR}>Precio</th><th style={thR}>Importe</th><th style={thR}></th>
                    </tr></thead>
                    <tbody>
                      {[...txs].sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) => (
                        <tr key={t.id} style={{ borderTop: "1px solid #efe8dc" }}>
                          <td style={tdL}>{t.date}</td>
                          <td style={tdL}>{prices[t.isin]?.name || t.isin}</td>
                          <td style={tdR}>{t.units.toLocaleString("es-ES", { maximumFractionDigits: 4 })}</td>
                          <td style={tdR}>{t.price.toLocaleString("es-ES", { maximumFractionDigits: 2 })} €</td>
                          <td style={tdR}>{fmtEUR(t.units * t.price)}</td>
                          <td style={tdR}><button onClick={() => delTx(t.id)} style={btnGhost}>Borrar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Conexión con Mi Disciplina */}
            <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.1rem", color: TINTA }}>
                  {racha > 0
                    ? `🧘 Llevas ${racha} ${racha === 1 ? "día" : "días"} sin mirar tu cartera`
                    : "🧘 La disciplina es tu mejor activo"}
                </div>
                <div style={{ color: SUAVE, fontSize: ".86rem", marginTop: 4 }}>
                  {algunaFuera
                    ? "Tu cartera se ha desviado, pero no hace falta correr: rebalancear con cabeza, no por impulso."
                    : "Tu plan funciona si no lo saboteas. Registrar y no tocar es ganar."}
                </div>
              </div>
              <a href={`${CAMPUS}/disciplina/`} target="_top" style={btn}>Ir a Mi Disciplina</a>
            </div>

            <p style={{ fontSize: ".76rem", color: SUAVE, marginTop: 16, lineHeight: 1.5 }}>
              Cartera simulada con fines educativos. No es asesoramiento financiero ni una recomendación personalizada.
              Los precios (EOD vía EODHD) pueden ir con un día de retraso. {loading && "Actualizando precios…"}
              <br />Tus datos se guardan solo en este navegador; pronto quedarán ligados a tu cuenta.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, color, tip }: { label: string; value: string; color?: string; tip?: string }) {
  return (
    <div title={tip} style={{ background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "16px 18px", boxShadow: "0 1px 3px rgba(32,32,32,.04)", cursor: tip ? "help" : "default" }}>
      <div style={{ fontSize: ".74rem", textTransform: "uppercase", letterSpacing: ".4px", color: SUAVE, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.7rem", fontWeight: 700, lineHeight: 1, color: color || TINTA }}>{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".78rem", fontWeight: 600, color: SUAVE }}>
      {label}{children}
    </label>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e7ddcf", borderRadius: 14, padding: "18px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(32,32,32,.04)" };
const h2: React.CSSProperties = { fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "1.15rem", margin: "0 0 12px", color: TINTA };
const sel: React.CSSProperties = { fontFamily: "inherit", fontSize: ".9rem", padding: "8px 10px", border: "1px solid #e0d7c8", borderRadius: 8, background: "#fff", color: TINTA };
const btn: React.CSSProperties = { fontFamily: "inherit", fontSize: ".88rem", fontWeight: 600, padding: "9px 18px", border: "none", borderRadius: 999, background: ROJO, color: "#fff", cursor: "pointer", textDecoration: "none", display: "inline-block" };
const btnGhost: React.CSSProperties = { fontFamily: "inherit", fontSize: ".8rem", fontWeight: 600, padding: "5px 12px", border: "1px solid #e0d7c8", borderRadius: 999, background: "#fff", color: SUAVE, cursor: "pointer" };
const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: ".9rem" };
const thL: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: ".78rem", color: SUAVE, fontWeight: 600, borderBottom: "2px solid #C81E2E" };
const thR: React.CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: ".78rem", color: SUAVE, fontWeight: 600, borderBottom: "2px solid #C81E2E" };
const tdL: React.CSSProperties = { textAlign: "left", padding: "9px 10px", fontWeight: 600 };
const tdR: React.CSSProperties = { textAlign: "right", padding: "9px 10px", fontVariantNumeric: "tabular-nums" };
const avisoAmbar: React.CSSProperties = { background: "#FFF7E6", border: "1px solid #ecdca6", color: AMBAR, borderRadius: 10, padding: "10px 14px", fontSize: ".85rem" };
