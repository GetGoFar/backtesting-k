import { describe, expect, it } from "vitest";
import { componerRiesgo, perfilPorVolatilidad, type RespuestaRiesgo } from "./riesgo";
import type { Posicion } from "./cartera";

describe("perfil por volatilidad (tabla CONFIG de la Excel)", () => {
  it("cada volatilidad objetivo devuelve su perfil", () => {
    expect(perfilPorVolatilidad(0.05).perfil).toBe(1);
    expect(perfilPorVolatilidad(0.07).perfil).toBe(4);
    expect(perfilPorVolatilidad(0.1).perfil).toBe(7);
    expect(perfilPorVolatilidad(0.13).perfil).toBe(10);
  });
  it("entre dos objetivos elige el más cercano; por encima del 13 % marca 'o más'", () => {
    expect(perfilPorVolatilidad(0.103).perfil).toBe(7);
    expect(perfilPorVolatilidad(0.116).perfil).toBe(9);
    expect(perfilPorVolatilidad(0.02).perfil).toBe(1);
    expect(perfilPorVolatilidad(0.2)).toEqual({ perfil: 10, oMas: true });
    expect(perfilPorVolatilidad(0.135).oMas).toBe(false);
  });
});

describe("componerRiesgo", () => {
  const pos = (id: string, isin: string, valor: number, nombre = id): Posicion => ({ id, nombre, isin, categoria: "rv", parte: "nucleo", valor });
  const respuesta: RespuestaRiesgo = {
    volatilidad: 0.1,
    caidaMaxima: -0.2,
    desde: "2023-09-29",
    hasta: "2026-09-25",
    meses: 36,
    incluidos: [{ isin: "IE00A", nombre: "A" }, { isin: "IE00B", nombre: "B" }],
    excluidos: [],
  };
  it("la liquidez diluye la volatilidad y cuenta como cubierta", () => {
    const r = componerRiesgo([pos("a", "IE00A", 6000), pos("b", "IE00B", 2000), pos("c", "", 2000, "Liquidez")], respuesta);
    expect(r.volatilidad).toBeCloseTo(0.08, 6);
    expect(r.perfil).toBe(5);
    expect(r.cobertura).toBeCloseTo(1, 6);
    expect(r.sinDatos).toEqual([]);
    expect(r.caidaExtrema).toBeCloseTo(0.24, 6);
  });
  it("el peor tramo de tres años se escala igual y da su propio perfil; se listan las crisis que faltan", () => {
    const r = componerRiesgo([pos("a", "IE00A", 5000), pos("c", "", 5000, "Liquidez")], { ...respuesta, desde: "2016-05-02", volatilidadPeor3a: 0.2, peor3aHasta: "2020-06-30" });
    expect(r.volatilidadPeor).toBeCloseTo(0.1, 6);
    expect(r.perfilPeor).toBe(7);
    expect(r.peorHasta).toBe("2020-06-30");
    expect(r.sinCrisis).toEqual(["la crisis de 2008"]);
  });
  it("una serie desde 2023 no incluye 2008, 2020 ni 2022", () => {
    const r = componerRiesgo([pos("a", "IE00A", 5000)], { ...respuesta, desde: "2023-09-29" });
    expect(r.sinCrisis).toEqual(["la crisis de 2008", "la caída de 2020", "el año 2022"]);
    expect(r.perfilPeor).toBeUndefined();
  });
  it("lo que no tiene datos ni es liquidez baja la cobertura y se nombra", () => {
    const r = componerRiesgo([pos("a", "IE00A", 8000), pos("x", "ES00X", 2000, "Plan del banco")], respuesta);
    expect(r.volatilidad).toBeCloseTo(0.1, 6);
    expect(r.cobertura).toBeCloseTo(0.8, 6);
    expect(r.sinDatos).toEqual(["Plan del banco"]);
  });
});
