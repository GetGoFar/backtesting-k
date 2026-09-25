import { describe, expect, it } from "vitest";
import { calcularEstado, carteraVacia, planDefinido, planificarAportacion, planificarRebalanceo, sugerirCategoria, type Cartera, type MetodoRebalanceo } from "./cartera";

const pos = (id: string, categoria: Cartera["posiciones"][number]["categoria"], valor: number, parte: Cartera["posiciones"][number]["parte"] = "nucleo") => ({
  id,
  nombre: id,
  isin: `IE00${id}`,
  categoria,
  parte,
  valor,
});

const BANDAS_EXCEL: MetodoRebalanceo = { metodo: "bandas", tipo: "relativa", banda: 0.25 };

// Cartera de un alumno del Taller que copia su Excel: perfil 7 (65/15/20), 20.000 € en el Núcleo.
const base: Cartera = {
  aportado: 20000,
  plan: { objetivo: { rv: 0.65, "rf-gob": 0.15, oro: 0.2 }, topeSatelite: 0.1, topePlay: 0.05, rebalanceo: BANDAS_EXCEL },
  posiciones: [pos("acwi", "rv", 13000), pos("gob", "rf-gob", 3000), pos("oro", "oro", 4000)],
};
const desviada: Cartera = { ...base, posiciones: [pos("acwi", "rv", 13800), pos("gob", "rf-gob", 2200), pos("oro", "oro", 4000)] };

describe("plan", () => {
  it("un plan vacío no está definido; 65/15/20 sí", () => {
    expect(planDefinido({ objetivo: {} })).toBe(false);
    expect(planDefinido(base.plan)).toBe(true);
    expect(planDefinido({ objetivo: { rv: 0.6, oro: 0.2 } })).toBe(false);
  });
  it("sin plan la cartera no pinta semáforo y lo dice", () => {
    const e = calcularEstado({ ...base, plan: { objetivo: {} } });
    expect(e.sinPlan).toBe(true);
    expect(e.semaforo).toBe("verde");
  });
});

describe("bandas relativas (hoja GEO - ETFs, perfil 7, 20.000 €)", () => {
  it("en objetivo: verde y nada que mover", () => {
    const e = calcularEstado(base);
    expect(e.total).toBe(20000);
    expect(e.nucleo).toBe(20000);
    expect(e.semaforo).toBe("verde");
    expect(e.lineas.every((l) => Math.abs(l.diferencia) < 1)).toBe(true);
  });
  it("RF al 11 % (−27 % relativo) → rojo; al 12,5 % (−17 %) → ámbar", () => {
    expect(calcularEstado(desviada).categorias.find((c) => c.categoria === "rf-gob")?.semaforo).toBe("rojo");
    const ambar = { ...base, posiciones: [pos("acwi", "rv", 13500), pos("gob", "rf-gob", 2500), pos("oro", "oro", 4000)] };
    expect(calcularEstado(ambar).categorias.find((c) => c.categoria === "rf-gob")?.semaforo).toBe("ambar");
  });
  it("el rango relativo del 15 % con banda 25 % es 11,25-18,75", () => {
    const rf = calcularEstado(base).categorias.find((c) => c.categoria === "rf-gob")!;
    expect(rf.rango.min).toBeCloseTo(0.1125, 6);
    expect(rf.rango.max).toBeCloseTo(0.1875, 6);
  });
});

describe("bandas absolutas", () => {
  const abs: Cartera = { ...desviada, plan: { ...base.plan, rebalanceo: { metodo: "bandas", tipo: "absoluta", banda: 0.05 } } };
  it("RF al 11 % con objetivo 15 % (4 puntos) → ámbar con banda de 5 puntos; con banda de 3 → rojo", () => {
    expect(calcularEstado(abs).categorias.find((c) => c.categoria === "rf-gob")?.semaforo).toBe("ambar");
    const estrecha: Cartera = { ...abs, plan: { ...abs.plan, rebalanceo: { metodo: "bandas", tipo: "absoluta", banda: 0.03 } } };
    expect(calcularEstado(estrecha).categorias.find((c) => c.categoria === "rf-gob")?.semaforo).toBe("rojo");
  });
  it("el rango absoluto del 15 % con 5 puntos es 10-20", () => {
    const rf = calcularEstado(abs).categorias.find((c) => c.categoria === "rf-gob")!;
    expect(rf.rango.min).toBeCloseTo(0.1, 6);
    expect(rf.rango.max).toBeCloseTo(0.2, 6);
  });
});

describe("por periodo", () => {
  const periodo: Cartera = { ...desviada, plan: { ...base.plan, rebalanceo: { metodo: "periodo", meses: 12 } }, ultimoRebalanceo: "2026-03-10T12:00:00.000Z" };
  it("antes de la fecha la desviación no pinta: verde y próxima revisión en marzo de 2027", () => {
    const e = calcularEstado(periodo, { hoy: new Date("2026-09-25T12:00:00Z") });
    expect(e.semaforo).toBe("verde");
    expect(e.revision?.pendiente).toBe(false);
    expect(e.revision?.proxima.slice(0, 7)).toBe("2027-03");
    expect(planificarRebalanceo(periodo, new Date("2026-09-25T12:00:00Z")).necesario).toBe(false);
  });
  it("llegada la fecha: ámbar, revisión pendiente y rebalanceo necesario", () => {
    const e = calcularEstado(periodo, { hoy: new Date("2027-03-15T12:00:00Z") });
    expect(e.semaforo).toBe("ambar");
    expect(e.revision?.pendiente).toBe(true);
    expect(planificarRebalanceo(periodo, new Date("2027-03-15T12:00:00Z")).necesario).toBe(true);
  });
  it("cada dos años cuenta 24 meses", () => {
    const c: Cartera = { ...periodo, plan: { ...periodo.plan, rebalanceo: { metodo: "periodo", meses: 24 } } };
    expect(calcularEstado(c, { hoy: new Date("2027-06-01T12:00:00Z") }).revision?.pendiente).toBe(false);
    expect(calcularEstado(c, { hoy: new Date("2028-03-11T12:00:00Z") }).revision?.pendiente).toBe(true);
  });
});

describe("partes y categorías", () => {
  it("Satélite y Play Money no entran en el semáforo del Núcleo, pero avisan si pasan del tope", () => {
    const c = { ...base, posiciones: [...base.posiciones, pos("tema", "rv", 1000, "satelite"), pos("juego", "otros", 3000, "play")] };
    const e = calcularEstado(c);
    expect(e.nucleo).toBe(20000);
    expect(e.total).toBe(24000);
    expect(e.categorias.find((x) => x.categoria === "rv")?.valor).toBe(13000);
    expect(e.partes.find((p) => p.parte === "satelite")?.excedido).toBe(false);
    expect(e.partes.find((p) => p.parte === "play")?.excedido).toBe(true); // 12,5 % > 5 %
    expect(e.semaforo).toBe("ambar");
  });
  it("dinero en una categoría que no está en el plan → ámbar y aviso", () => {
    const c = { ...base, posiciones: [...base.posiciones, pos("banco", "otros", 2000)] };
    const e = calcularEstado(c);
    const otros = e.categorias.find((x) => x.categoria === "otros");
    expect(otros?.fueraDePlan).toBe(true);
    expect(otros?.semaforo).toBe("ambar");
  });
  it("dos fondos en la misma categoría se reparten el objetivo en proporción a lo que tienen", () => {
    const c = { ...base, posiciones: [pos("world", "rv", 10000), pos("em", "rv", 3000), pos("gob", "rf-gob", 3000), pos("oro", "oro", 4000)] };
    const e = calcularEstado(c);
    const world = e.lineas.find((l) => l.posicion.id === "world")!;
    const em = e.lineas.find((l) => l.posicion.id === "em")!;
    expect(world.valorObjetivo).toBeCloseTo(13000 * (10 / 13), 6);
    expect(em.valorObjetivo).toBeCloseTo(13000 * (3 / 13), 6);
  });
});

describe("aportación", () => {
  it("va solo a lo que falta, nunca vende, y cuadra al euro", () => {
    const plan = planificarAportacion(desviada, 5000);
    expect(plan.compras.reduce((s, x) => s + x.importe, 0)).toBe(5000);
    // objetivos sobre 25.000: 16.250 / 3.750 / 5.000 → faltan 2.450 / 1.550 / 1.000
    expect(plan.compras.find((x) => x.posicionId === "acwi")?.importe).toBe(2450);
    expect(plan.compras.find((x) => x.posicionId === "gob")?.importe).toBe(1550);
    expect(plan.compras.find((x) => x.posicionId === "oro")?.importe).toBe(1000);
    expect(plan.corrige).toBe(true);
  });
  it("si el plan pide una categoría sin activos, la aportación deja un hueco con nombre", () => {
    const c: Cartera = { ...base, posiciones: [pos("acwi", "rv", 13000), pos("oro", "oro", 4000)] };
    const plan = planificarAportacion(c, 3000);
    const hueco = plan.compras.find((x) => x.posicionId === null);
    expect(hueco?.categoria).toBe("rf-gob");
    expect(hueco!.importe).toBe(3000);
  });
  it("una aportación pequeña se reparte en proporción al déficit", () => {
    const plan = planificarAportacion(desviada, 1000);
    expect(plan.compras.reduce((s, x) => s + x.importe, 0)).toBe(1000);
    // Sobre 21.000: RV objetivo 13.650 < 13.800 → nada; faltan 950 (RF) y 200 (oro) → proporcional
    expect(plan.compras.some((x) => x.posicionId === "acwi")).toBe(false);
    expect(plan.compras.find((x) => x.posicionId === "gob")?.importe).toBe(826);
    expect(plan.compras.find((x) => x.posicionId === "oro")?.importe).toBe(174);
    expect(plan.corrige).toBe(true);
  });
  it("la Satélite no recibe aportaciones", () => {
    const c = { ...base, posiciones: [...base.posiciones, pos("tema", "rv", 100, "satelite")] };
    const plan = planificarAportacion(c, 1000);
    expect(plan.compras.some((x) => x.posicionId === "tema")).toBe(false);
  });
  it("una cartera con plan y sin activos reparte la primera aportación por el plan", () => {
    const c: Cartera = { ...carteraVacia(), plan: base.plan };
    const plan = planificarAportacion(c, 10000);
    expect(plan.compras.reduce((s, x) => s + x.importe, 0)).toBe(10000);
    expect(plan.compras.find((x) => x.categoria === "rv")?.importe).toBe(6500);
  });
});

describe("rebalanceo", () => {
  it("cuadra ventas y compras y deja el Núcleo en verde", () => {
    const plan = planificarRebalanceo(desviada);
    expect(plan.necesario).toBe(true);
    expect(plan.ventas.find((v) => v.posicionId === "acwi")?.importe).toBe(800);
    expect(plan.compras.find((v) => v.posicionId === "gob")?.importe).toBe(800);
    expect(plan.despues.semaforo).toBe("verde");
  });
});

describe("sugerirCategoria", () => {
  it("reconoce por el nombre", () => {
    expect(sugerirCategoria("Invesco Physical Gold A")).toBe("oro");
    expect(sugerirCategoria("iShares EUR High Yield Corporate Bond ESG UCITS ETF")).toBe("rf-hy");
    expect(sugerirCategoria("Vanguard EUR Corporate Bond UCITS ETF")).toBe("rf-corp");
    expect(sugerirCategoria("Xtrackers II Global Government Bond UCITS ETF 1C EUR Hedged")).toBe("rf-gob");
    expect(sugerirCategoria("Vanguard Emerging Markets Bond Fund")).toBe("rf-hy");
    expect(sugerirCategoria("SPDR MSCI ACWI UCITS ETF")).toBe("rv");
    expect(sugerirCategoria("Fidelity MSCI World Index Fund P-ACC-EUR")).toBe("rv");
    expect(sugerirCategoria("Plan de pensiones del banco")).toBe("otros");
  });
});

describe("reparto de la renta variable por región/sector", () => {
  const posSub = (id: string, sub: import("./cartera").SubRV, valor: number): Cartera["posiciones"][number] => ({ id, nombre: id, isin: `IE00${id}`, categoria: "rv", parte: "nucleo", valor, sub });
  // Excel GEO - Fondos, perfil 4: RV 35 % = Global 93 % + Emergente 7 % → 32,55 % y 2,45 %
  const geo: Cartera = {
    aportado: 10000,
    plan: { objetivo: { rv: 0.35, "rf-gob": 0.35, "rf-corp": 0.09, "rf-hy": 0.06, oro: 0.15 }, estrategiaRV: "geografica", objetivoRV: { global: 0.93, emergentes: 0.07 }, rebalanceo: BANDAS_EXCEL },
    posiciones: [posSub("world", "global", 3255), posSub("em", "emergentes", 245), pos("gob", "rf-gob", 3500), pos("corp", "rf-corp", 900), pos("hy", "rf-hy", 600), pos("oro", "oro", 1500)],
  };
  it("reproduce los pesos por región de la Excel y queda en verde", () => {
    const e = calcularEstado(geo);
    const g = e.subcategoriasRV.find((s) => s.sub === "global")!;
    const em = e.subcategoriasRV.find((s) => s.sub === "emergentes")!;
    expect(g.pesoObjetivo).toBeCloseTo(0.3255, 6);
    expect(em.pesoObjetivo).toBeCloseTo(0.0245, 6);
    expect(e.semaforo).toBe("verde");
  });
  it("una región fuera de banda pinta aunque la renta variable total esté bien", () => {
    const c: Cartera = { ...geo, posiciones: [posSub("world", "global", 3000), posSub("em", "emergentes", 500), pos("gob", "rf-gob", 3500), pos("corp", "rf-corp", 900), pos("hy", "rf-hy", 600), pos("oro", "oro", 1500)] };
    const e = calcularEstado(c);
    expect(e.categorias.find((x) => x.categoria === "rv")?.semaforo).toBe("verde");
    expect(e.subcategoriasRV.find((s) => s.sub === "emergentes")?.semaforo).toBe("rojo"); // 5 % vs 2,45 %
    expect(e.semaforo).toBe("rojo");
    const plan = planificarRebalanceo(c);
    expect(plan.ventas.find((v) => v.posicionId === "em")?.importe).toBe(255);
    expect(plan.compras.find((v) => v.posicionId === "world")?.importe).toBe(255);
  });
  it("sectorial: Excel SECTOR perfil 6 (RV 60 %: 25/25/25/12,5/12,5)", () => {
    const c: Cartera = {
      aportado: 0,
      plan: { objetivo: { rv: 0.6, "rf-gob": 0.2, oro: 0.2 }, estrategiaRV: "sectorial", objetivoRV: { staples: 0.25, salud: 0.25, tecnologia: 0.25, energia: 0.125, inmobiliario: 0.125 }, rebalanceo: BANDAS_EXCEL },
      posiciones: [posSub("st", "staples", 2500), posSub("sa", "salud", 2000), posSub("te", "tecnologia", 1000), posSub("en", "energia", 1000), posSub("in", "inmobiliario", 1000), pos("gob", "rf-gob", 0), pos("oro", "oro", 2000)],
    };
    const e = calcularEstado(c, { capitalFinalNucleo: 10500 });
    const d = Object.fromEntries(e.lineas.map((l) => [l.posicion.id, l.diferencia]));
    expect(d["st"]).toBeCloseTo(-925, 6);
    expect(d["sa"]).toBeCloseTo(-425, 6);
    expect(d["te"]).toBeCloseTo(575, 6);
    expect(d["en"]).toBeCloseTo(-212.5, 6);
    expect(d["in"]).toBeCloseTo(-212.5, 6);
    expect(d["oro"]).toBeCloseTo(100, 6);
    expect(e.subcategoriasRV.find((s) => s.sub === "staples")?.pesoObjetivo).toBeCloseTo(0.15, 6);
  });
  it("una región del plan sin activos deja un hueco con nombre en la aportación", () => {
    const c: Cartera = { ...geo, posiciones: geo.posiciones.filter((p) => p.id !== "em") };
    const plan = planificarAportacion(c, 300);
    const hueco = plan.compras.find((x) => x.posicionId === null);
    expect(hueco?.sub).toBe("emergentes");
    expect(hueco?.categoria).toBe("rv");
  });
  it("bolsa sin región asignada se señala como sin clasificar", () => {
    const c: Cartera = { ...geo, posiciones: [...geo.posiciones, pos("x", "rv", 1000)] };
    const e = calcularEstado(c);
    expect(e.subcategoriasRV.some((s) => s.sub === "sin-clasificar")).toBe(true);
    expect(e.semaforo).not.toBe("verde");
  });
  it("sin reparto definido, la renta variable se mide solo en conjunto", () => {
    const c: Cartera = { ...geo, plan: { ...geo.plan, objetivoRV: undefined } };
    expect(calcularEstado(c).subcategoriasRV).toEqual([]);
  });
});

describe("reglas de activos", () => {
  it("las acciones de empresa no pueden ir al Núcleo", async () => {
    const { puedeIrAlNucleo, sugerirSubRV } = await import("./cartera");
    expect(puedeIrAlNucleo("accion")).toBe(false);
    expect(puedeIrAlNucleo("etf")).toBe(true);
    expect(sugerirSubRV("Xtrackers MSCI World Health Care UCITS ETF", "sectorial")).toBe("salud");
    expect(sugerirSubRV("Xtrackers MSCI World Health Care UCITS ETF", "geografica")).toBe("global");
    expect(sugerirSubRV("iShares Core MSCI Emerging Markets IMI", "geografica")).toBe("emergentes");
    expect(sugerirSubRV("Vanguard S&P 500 UCITS ETF", "mixta")).toBe("eeuu");
  });
});
