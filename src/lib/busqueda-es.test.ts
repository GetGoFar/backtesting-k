import { describe, it, expect } from "vitest";
import { normalizaTexto, terminosEnIngles, coincideTexto } from "./busqueda-es";

describe("normalizaTexto", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(normalizaTexto("Japón")).toBe("japon");
    expect(normalizaTexto("  Energía  ")).toBe("energia");
    expect(normalizaTexto("MSCI World")).toBe("msci world");
  });
});

describe("terminosEnIngles", () => {
  it("traduce el caso que falló: mineras de oro", () => {
    // EODHD devolvía 0 resultados con "mineras de oro" y sí encontraba GDX/GDXJ
    // con "gold miners".
    const t = terminosEnIngles("mineras de oro");
    expect(t).toContain("gold mining");
    expect(t).toContain("gold miners");
  });

  it("aguanta el singular y el acento", () => {
    expect(terminosEnIngles("tecnología")).toEqual(["technology"]);
    expect(terminosEnIngles("japon")).toEqual(["japan"]);
  });

  it("devuelve vacío si no reconoce nada", () => {
    expect(terminosEnIngles("IWDA")).toEqual([]);
    expect(terminosEnIngles("")).toEqual([]);
  });
});

describe("coincideTexto", () => {
  it("encuentra sin acentos en los dos sentidos", () => {
    expect(coincideTexto("Vanguard Japan Stock Index", "japon")).toBe(true);
    expect(coincideTexto("CaixaBank Renta Variable Japón", "japon")).toBe(true);
    expect(coincideTexto("CaixaBank Renta Variable Japon", "japón")).toBe(true);
  });

  it("encuentra por traducción al inglés", () => {
    expect(coincideTexto("L&G Gold Mining UCITS ETF", "mineras")).toBe(true);
    expect(coincideTexto("Pictet - Water P EUR", "agua")).toBe(true);
  });

  it("NO confunde oro con Goldman Sachs", () => {
    // El motivo de exigir palabra completa en las traducciones.
    expect(coincideTexto("Goldman Sachs Europe CORE Equity", "oro")).toBe(false);
    expect(coincideTexto("SPDR Gold Shares", "oro")).toBe(true);
  });

  it("sigue casando por subcadena y por palabras sueltas", () => {
    expect(coincideTexto("iShares Core MSCI World", "msci")).toBe(true);
    expect(coincideTexto("Euro / Dólar (EURUSD)", "eur usd")).toBe(true);
  });
});
