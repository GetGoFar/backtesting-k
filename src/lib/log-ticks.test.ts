import { describe, it, expect } from "vitest";
import { logAxisTicks } from "./log-ticks";

describe("logAxisTicks", () => {
  it("rango estrecho (menos de una década): marcas finas hasta el máximo", () => {
    // Caso real: cartera en onzas de oro, dominio 3.600–15.400
    expect(logAxisTicks(3600, 15400)).toEqual([4000, 5000, 6000, 8000, 10000, 15000]);
  });

  it("rango medio: 1-2-5", () => {
    expect(logAxisTicks(900, 60000)).toEqual([1000, 2000, 5000, 10000, 20000, 50000]);
  });

  it("rango amplio: solo potencias de diez", () => {
    expect(logAxisTicks(90, 2_000_000)).toEqual([100, 1000, 10000, 100000, 1000000]);
  });

  it("siempre hay una marca por encima del 60 % del máximo en rangos estrechos", () => {
    for (const [min, max] of [[9000, 13000], [4000, 14000], [10500, 19000], [1, 9]]) {
      const ticks = logAxisTicks(min!, max!);
      expect(ticks.length).toBeGreaterThan(0);
      expect(Math.max(...ticks)).toBeGreaterThan(max! * 0.6);
    }
  });

  it("dominios inválidos devuelven vacío", () => {
    expect(logAxisTicks(0, 100)).toEqual([]);
    expect(logAxisTicks(100, 100)).toEqual([]);
    expect(logAxisTicks(-5, 100)).toEqual([]);
  });
});
