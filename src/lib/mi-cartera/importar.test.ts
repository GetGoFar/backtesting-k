import { describe, expect, it } from "vitest";
import { categoriaPorGrupo, clasesComunes, coincidencia, elegirCandidato, esCripto, limpiarIsin, partePorGrupo, sufijoBolsa, tipoImagenReal, valorDe } from "./importar";

describe("sufijoBolsa", () => {
  it("traduce los códigos de Interactive Brokers a sufijos de EODHD", () => {
    expect(sufijoBolsa("IBIS2")).toBe("DE");
    expect(sufijoBolsa("SBF")).toBe("PA");
    expect(sufijoBolsa("AEB")).toBe("AS");
    expect(sufijoBolsa("bvme.etf")).toBe("MI");
    expect(sufijoBolsa("SMART")).toBeUndefined();
    expect(sufijoBolsa(null)).toBeUndefined();
  });
});

describe("coincidencia", () => {
  it("ignora ruido (UCITS, ETF, Acc, EUR) y admite prefijos", () => {
    expect(coincidencia("Amundi Euro Government Bond 10-15Y UCITS ETF Acc", "Amundi Euro Government Bond 10-15Y UCITS ETF Acc")).toBe(1);
    expect(coincidencia("Xtrackers MSCI World Health Care UCITS ETF 1C", "Xtrackers MSCI World Health Care UCITS ETF")).toBe(1);
    expect(coincidencia("Vanguard Global Stock Index Fund EUR Acc", "Vanguard Global Stock Index Fund USD Hedged Acc")).toBe(1);
  });
  it("las cifras distinguen productos: el tramo equivocado vale cero", () => {
    expect(coincidencia("Amundi Euro Government Bond 10-15Y", "Amundi Euro Government Bond 7-10Y")).toBe(0);
    expect(coincidencia("iShares Core Euro Government Bond 1-3", "iShares Core Euro Government Bond 3-5")).toBe(0);
    expect(coincidencia("iShares NASDAQ 100", "iShares NASDAQ 100 UCITS ETF USD (Acc)")).toBe(1);
  });
  it("un nombre genérico no llega al umbral frente a un tramo concreto", () => {
    expect(coincidencia("Amundi Euro Gov Bond", "Amundi Euro Government Bond 10-15Y")).toBeLessThanOrEqual(0.5);
    expect(coincidencia("iShares NASDAQ 100", "iShares Core MSCI World")).toBeLessThan(0.5);
  });
  it("clasesComunes cuenta EUR/USD/Hedged/Acc compartidas", () => {
    expect(clasesComunes("Vanguard Global Stock Index Fund EUR Acc", "Vanguard Global Stock Index Fund EUR Acc")).toBe(2);
    expect(clasesComunes("Vanguard Global Stock Index Fund EUR Acc", "Vanguard Global Stock Index Fund USD Hedged Acc")).toBe(1);
  });
});

describe("elegirCandidato", () => {
  const nombreDe = (c: { n: string; isin: string; moneda?: string }) => c.n;
  const isinDe = (c: { n: string; isin: string }) => c.isin;
  const sectoriales = [
    { n: "Xtrackers MSCI World Consumer Staples UCITS ETF 1C", isin: "IE00BM67HN09" },
    { n: "Xtrackers MSCI World Utilities UCITS ETF 1C", isin: "IE00BM67HQ30" },
    { n: "Xtrackers MSCI World Health Care UCITS ETF 1C", isin: "IE00BM67HK77" },
    { n: "Xtrackers MSCI World Energy UCITS ETF 1C", isin: "IE00BM67HM91" },
  ];
  it("con un nombre genérico que casa con varios ISIN distintos no elige: mejor sin ISIN", () => {
    expect(elegirCandidato(sectoriales, { nombreDe, isinDe, consultas: ["Xtrackers MSCI World UCITS ETF"], minimo: 0.8 })).toBeUndefined();
  });
  it("con el nombre completo elige el bueno", () => {
    const e = elegirCandidato(sectoriales, { nombreDe, isinDe, consultas: ["Xtrackers MSCI World Health Care UCITS ETF 1C"], minimo: 0.8 });
    expect(e?.candidato.isin).toBe("IE00BM67HK77");
    expect(e?.puntos).toBe(1);
  });
  it("prefiere el nombre exacto frente al que añade palabras (coincidencia inversa)", () => {
    const lista = [
      { n: "SPDR MSCI ACWI IMI UCITS ETF", isin: "IE00B3YLTY66" },
      { n: "SPDR MSCI ACWI UCITS ETF", isin: "IE00B44Z5B48" },
    ];
    expect(elegirCandidato(lista, { nombreDe, isinDe, consultas: ["SPDR MSCI ACWI UCITS ETF"], minimo: 0.8 })?.candidato.isin).toBe("IE00B44Z5B48");
  });
  it("entre clases del mismo fondo prefiere la que comparte EUR/Acc con la consulta", () => {
    const lista = [
      { n: "Vanguard Global Stock Index Fund USD Hedged Acc", isin: "IE00B03HCZ61" },
      { n: "Vanguard Global Stock Index Fund EUR Acc", isin: "IE00B03HD191" },
    ];
    expect(elegirCandidato(lista, { nombreDe, isinDe, consultas: ["Vanguard Global Stock Index Fund EUR Acc"], minimo: 0.8 })?.candidato.isin).toBe("IE00B03HD191");
  });
  it("el mismo ISIN en varias bolsas no es un empate", () => {
    const lista = [
      { n: "Xtrackers MSCI World Utilities UCITS ETF", isin: "IE00BM67HQ30", moneda: "GBP" },
      { n: "db x-trackers MSCI World Utilities UCITS", isin: "IE00BM67HQ30", moneda: "EUR" },
    ];
    const e = elegirCandidato(lista, { nombreDe, isinDe, consultas: [], minimo: 0, bonus: (c) => (c.moneda === "EUR" ? 1 : 0) });
    expect(e?.candidato.moneda).toBe("EUR");
  });
  it("dos productos distintos con el mismo ticker y sin nombre que los distinga: sin elección", () => {
    const lista = [
      { n: "SPDR Portfolio S&P 500 High Dividend ETF", isin: "US78468R7888" },
      { n: "SPDR S&P US Dividend Aristocrats UCITS ETF", isin: "IE00B6YX5D40" },
    ];
    expect(elegirCandidato(lista, { nombreDe, isinDe, consultas: ["SPYD"], minimo: 0.5 })).toBeUndefined();
    expect(elegirCandidato(lista, { nombreDe, isinDe, consultas: ["SPDR S&P US Dividend Aristocrats"], minimo: 0.5 })?.candidato.isin).toBe("IE00B6YX5D40");
  });
});

describe("grupo del bróker", () => {
  it("categoría solo como último recurso", () => {
    expect(categoriaPorGrupo("RENTA FIJA")).toBe("rf-gob");
    expect(categoriaPorGrupo("RENTA VARIABLE")).toBe("rv");
    expect(categoriaPorGrupo("ORO")).toBe("oro");
    expect(categoriaPorGrupo("Mis fondos")).toBeUndefined();
    expect(categoriaPorGrupo(null)).toBeUndefined();
  });
  it("parte por el epígrafe", () => {
    expect(partePorGrupo("Satélite")).toBe("satelite");
    expect(partePorGrupo("PLAY MONEY")).toBe("play");
    expect(partePorGrupo("RENTA VARIABLE")).toBe("nucleo");
  });
  it("las cripto nunca son oro aunque el bróker las agrupe ahí", () => {
    expect(esCripto("WisdomTree Physical Bitcoin")).toBe(true);
    expect(esCripto("iShares Physical Gold ETC")).toBe(false);
  });
});

describe("limpiarIsin, valorDe y tipoImagenReal", () => {
  it("normaliza el ISIN y rechaza basura", () => {
    expect(limpiarIsin(" ie00b4l5y983 ")).toBe("IE00B4L5Y983");
    expect(limpiarIsin("IE00B4L5")).toBe("");
    expect(limpiarIsin(null)).toBe("");
  });
  it("valor de mercado si lo hay; si no, cantidad × precio", () => {
    expect(valorDe({ valor: 237894.4, cantidad: 1250, precio: 200.41 })).toBe(237894);
    expect(valorDe({ valor: null, cantidad: 1250, precio: 200.418 })).toBe(250523);
    expect(valorDe({ valor: null, cantidad: null, precio: 12 })).toBe(0);
  });
  it("reconoce la imagen por sus bytes, no por lo que diga el navegador", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    const txt = new Uint8Array([0x68, 0x6f, 0x6c, 0x61, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(tipoImagenReal(png)).toBe("image/png");
    expect(tipoImagenReal(jpg)).toBe("image/jpeg");
    expect(tipoImagenReal(webp)).toBe("image/webp");
    expect(tipoImagenReal(txt)).toBeUndefined();
  });
});
