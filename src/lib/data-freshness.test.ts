// =============================================================================
// TESTS — frescura de datos (detección de fondos fusionados / cerrados)
// =============================================================================
// Todas las fechas son FIJAS y la referencia se pasa explícita: sin `new Date()`
// implícito, los tests no cambian de resultado según el día en que se ejecuten.

import { describe, it, expect } from "vitest";
import { evaluarFrescura, DIAS_DATOS_OBSOLETOS } from "./data-freshness";

const REF = new Date("2026-08-19T00:00:00Z");

describe("evaluarFrescura", () => {
  it("una serie al día no genera aviso", () => {
    const r = evaluarFrescura("2026-08-14", REF); // 5 días
    expect(r.obsoleto).toBe(false);
    expect(r.aviso).toBeNull();
    expect(r.diasSinActualizar).toBe(5);
  });

  it("detecta un fondo que dejó de publicar NAV hace meses", () => {
    const r = evaluarFrescura("2026-05-28", REF); // 83 días
    expect(r.obsoleto).toBe(true);
    expect(r.diasSinActualizar).toBe(83);
    expect(r.aviso).toContain("28/05/2026");
    expect(r.aviso).toContain("3 meses");
  });

  it("justo en el umbral todavía se considera al día", () => {
    const fecha = new Date(REF.getTime() - DIAS_DATOS_OBSOLETOS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const r = evaluarFrescura(fecha, REF);
    expect(r.diasSinActualizar).toBe(DIAS_DATOS_OBSOLETOS);
    expect(r.obsoleto).toBe(false);
  });

  it("un día por encima del umbral ya marca", () => {
    const fecha = new Date(REF.getTime() - (DIAS_DATOS_OBSOLETOS + 1) * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    const r = evaluarFrescura(fecha, REF);
    expect(r.obsoleto).toBe(true);
  });

  it("sin fecha no inventa un aviso", () => {
    for (const v of [null, undefined, ""]) {
      const r = evaluarFrescura(v, REF);
      expect(r.obsoleto).toBe(false);
      expect(r.aviso).toBeNull();
    }
  });

  it("una fecha futura no produce días negativos", () => {
    const r = evaluarFrescura("2026-09-30", REF);
    expect(r.diasSinActualizar).toBe(0);
    expect(r.obsoleto).toBe(false);
  });

  it("acepta timestamps completos, no solo YYYY-MM-DD", () => {
    const r = evaluarFrescura("2026-05-28T15:30:00Z", REF);
    expect(r.obsoleto).toBe(true);
    expect(r.ultimaFecha).toBe("2026-05-28");
  });

  it("por debajo de 2 meses el aviso habla en días", () => {
    const r = evaluarFrescura("2026-07-05", REF); // 45 días
    expect(r.obsoleto).toBe(true);
    expect(r.aviso).toContain("45 días");
  });
});
