import { describe, expect, it } from "vitest";
import { lineaDe } from "./linea";
import type { Datos } from "./store";
import type { Cartera } from "./cartera";

const hoy = new Date("2026-09-26T10:00:00Z");
const posicion = { id: "a", nombre: "RV", isin: "IE00B4L5Y983", categoria: "rv" as const, parte: "nucleo" as const, valor: 60000 };
const base = (cartera?: Cartera, movimientos: Datos["movimientos"] = []): Datos => ({ version: 2, movimientos, cartera });

describe("lineaDe", () => {
  it("sin cartera: nada que decir", () => {
    const l = lineaDe(base(), hoy);
    expect(l).toEqual({ revision: null, aportacion: null, hecho: {}, semaforo: null });
  });

  it("por periodo: el mes de la próxima revisión, y el actual si ya venció", () => {
    const cartera: Cartera = { posiciones: [posicion], plan: { objetivo: { rv: 1 }, rebalanceo: { metodo: "periodo", meses: 12 } }, aportado: 0, ultimoRebalanceo: "2026-03-10T00:00:00Z" };
    expect(lineaDe(base(cartera), hoy).revision).toBe("2027-03");
    const vencida = { ...cartera, ultimoRebalanceo: "2025-06-10T00:00:00Z" };
    expect(lineaDe(base(vencida), hoy).revision).toBe("2026-09");
  });

  it("por bandas: solo cuando el semáforo está en rojo", () => {
    const enPlan: Cartera = { posiciones: [posicion, { ...posicion, id: "b", nombre: "Oro", isin: "IE00B579F325", categoria: "oro", valor: 40000 }], plan: { objetivo: { rv: 0.6, oro: 0.4 }, rebalanceo: { metodo: "bandas", tipo: "absoluta", banda: 0.05 } }, aportado: 0 };
    expect(lineaDe(base(enPlan), hoy).revision).toBeNull();
    const desviada: Cartera = { ...enPlan, posiciones: [{ ...posicion, valor: 90000 }, { ...posicion, id: "b", nombre: "Oro", isin: "IE00B579F325", categoria: "oro", valor: 10000 }] };
    const l = lineaDe(base(desviada), hoy);
    expect(l.semaforo).toBe("rojo");
    expect(l.revision).toBe("2026-09");
  });

  it("día de aportación y gestos hechos", () => {
    const cartera: Cartera = { posiciones: [posicion], plan: { objetivo: { rv: 1 }, aportacion: { dia: 5 } }, aportado: 0 };
    const l = lineaDe(base(cartera, [
      { fecha: "2026-08-05T09:00:00Z", tipo: "aportacion", importe: 500, total: 1 },
      { fecha: "2026-09-05T09:00:00Z", tipo: "aportacion", importe: 500, total: 1 },
      { fecha: "2026-07-01T09:00:00Z", tipo: "rebalanceo", total: 1 },
    ]), hoy);
    expect(l.aportacion).toEqual({ dia: 5 });
    expect(l.hecho).toEqual({ aportacion: "2026-09", revision: "2026-07" });
  });
});
