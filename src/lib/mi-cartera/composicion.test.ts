import { describe, expect, it } from "vitest";
import { casillasDe, mapearSub, parsearFundamentales, parsearPesos, variantesEodhd, type Composicion } from "./composicion";

// ETF: formato plano, valores como strings numéricos, campos de más y de menos.
const ETF_TECNOLOGIA = {
  General: { Code: "XDWT", Exchange: "XETRA", Name: "Xtrackers MSCI World IT", ISIN: "IE00BM67HT60", CurrencyCode: "EUR" },
  ETF_Data: {
    ISIN: "IE00BM67HT60",
    Holdings_Count: "150",
    Sector_Weights: {
      Technology: { "Equity_%": "96.8", "Relative_to_Category": "72.1" },
      "Communication Services": { "Equity_%": "2.1" },
      "Consumer Cyclical": { "Equity_%": "1.1" },
      "Real Estate": {},
    },
    World_Regions: {
      "North America": { "Equity_%": "88.3" },
      "United Kingdom": { "Equity_%": "0.5" },
      "Europe Developed": { "Equity_%": "5.2" },
      Japan: { "Equity_%": "4.0" },
      "Asia Developed": { "Equity_%": "2.0" },
      "Africa/Middle East": "0",
    },
    Market_Capitalization: { Big: "78.5", Medium: "20.0", Small: "1.5", Micro: "0" },
  },
};

// Fondo: formato anidado con índices numéricos, Amount_% / Stocks_% / Portfolio_%.
const FONDO_EUROPA = {
  General: { Code: "0P0000ABCD", Exchange: "EUFUND", ISIN: "LU0000000001" },
  MutualFund_Data: {
    Currency: "EUR",
    Sector_Weights: {
      "0": { Name: "Financial Services", "Amount_%": "22.5" },
      "1": { Name: "Industrials", "Amount_%": 18.1 },
      "2": { Name: "Healthcare", "Amount_%": "14.0" },
      "3": { Name: "Consumer Defensive", "Amount_%": "10.2" },
      "4": { Name: "Technology", "Amount_%": "9.9" },
      "5": { Name: "Basic Materials" },
    },
    World_Regions: {
      "0": { Name: "Europe Developed", "Stocks_%": "78.4" },
      "1": { Name: "United Kingdom", "Stocks_%": "19.1" },
      "2": { Name: "North America", "Stocks_%": "2.5" },
    },
    Market_Capitalization: {
      "0": { Size: "Giant", "Portfolio_%": "40.1" },
      "1": { Size: "Large", "Portfolio_%": "35.0" },
      "2": { Size: "Medium", "Portfolio_%": "20.0" },
      "3": { Size: "Small", "Portfolio_%": "4.9" },
    },
  },
};

const comp = (sectores: Record<string, number>, regiones: Record<string, number>, capitalizacion?: Composicion["capitalizacion"]): Composicion => ({
  isin: "IE00TEST0001",
  ticker: "TEST.XETRA",
  sectores,
  regiones,
  capitalizacion,
  fecha: "2026-09-26T00:00:00.000Z",
});

describe("parsearFundamentales", () => {
  it("lee ETF_Data con strings numéricos, ignora lo vacío y trata lo ausente como 0", () => {
    const c = parsearFundamentales(ETF_TECNOLOGIA, { fecha: "2026-09-26T00:00:00.000Z" });
    expect(c).not.toBeNull();
    expect(c!.isin).toBe("IE00BM67HT60");
    expect(c!.ticker).toBe("XDWT.XETRA");
    expect(c!.sectores.Technology).toBe(96.8);
    expect(c!.sectores["Real Estate"]).toBeUndefined();
    expect(c!.regiones["North America"]).toBe(88.3);
    expect(c!.regiones["Africa/Middle East"]).toBe(0);
    expect(c!.capitalizacion).toEqual({ grande: 78.5, media: 20, pequena: 1.5, micro: 0 });
    expect(c!.divisa).toBe("EUR");
    expect(c!.posiciones).toBe(150);
    expect(c!.fecha).toBe("2026-09-26T00:00:00.000Z");
  });
  it("lee MutualFund_Data en formato anidado y suma Giant + Large en grande", () => {
    const c = parsearFundamentales(FONDO_EUROPA, { isin: "LU0000000001", ticker: "LU0000000001.EUFUND" });
    expect(c).not.toBeNull();
    expect(c!.ticker).toBe("LU0000000001.EUFUND");
    expect(c!.sectores["Financial Services"]).toBe(22.5);
    expect(c!.sectores.Industrials).toBe(18.1);
    expect(c!.sectores["Basic Materials"]).toBeUndefined();
    expect(c!.regiones["Europe Developed"]).toBe(78.4);
    expect(c!.capitalizacion).toEqual({ grande: 75.1, media: 20, pequena: 4.9, micro: 0 });
    expect(c!.divisa).toBe("EUR");
    expect(c!.posiciones).toBeUndefined();
  });
  it("devuelve null sin ETF_Data ni MutualFund_Data, o sin sectores ni regiones", () => {
    expect(parsearFundamentales(null)).toBeNull();
    expect(parsearFundamentales("basura")).toBeNull();
    expect(parsearFundamentales({ General: { Code: "AAPL" } })).toBeNull();
    expect(parsearFundamentales({ ETF_Data: { Sector_Weights: {}, World_Regions: null } })).toBeNull();
  });
  it("parsearPesos admite números, strings con % y objetos sin campo de peso", () => {
    expect(parsearPesos({ A: 10, B: "20,5%", C: { "Equity_%": "30" }, D: { Relative_to_Category: "99" }, E: null })).toEqual({ A: 10, B: 20.5, C: 30 });
    expect(parsearPesos(undefined)).toEqual({});
  });
});

describe("casillasDe", () => {
  it("suma los sectores Morningstar en las casillas y el resto en otro-sector; regiones agrupadas; smallcaps = Small + Micro", () => {
    const c = parsearFundamentales(ETF_TECNOLOGIA)!;
    const k = casillasDe(c);
    expect(k.tecnologia).toBe(96.8);
    expect(k["otro-sector"]).toBe(3.2);
    expect(k.eeuu).toBe(88.3);
    expect(k.europa).toBe(5.7);
    expect(k.asia).toBe(6);
    expect(k.emergentes).toBe(0);
    expect(k.smallcaps).toBe(1.5);
    expect(k.global).toBeUndefined();
  });
});

describe("mapearSub", () => {
  it("sector dominante ≥ 60 % → sectorial y mixta lo usan; geográfica va a la región dominante", () => {
    const c = parsearFundamentales(ETF_TECNOLOGIA)!;
    expect(mapearSub(c, "sectorial")).toMatchObject({ sub: "tecnologia", sector: { id: "tecnologia", pct: 96.8 }, region: { id: "eeuu", pct: 88.3 } });
    expect(mapearSub(c, "mixta").sub).toBe("tecnologia");
    expect(mapearSub(c, "geografica").sub).toBe("eeuu");
  });
  it("sin sector dominante: sectorial no decide y mixta cae a la región", () => {
    const c = parsearFundamentales(FONDO_EUROPA)!;
    const s = mapearSub(c, "sectorial");
    expect(s.sub).toBeUndefined();
    expect(s.sector).toBeUndefined();
    expect(s.motivo).toBe("sin sector dominante");
    expect(mapearSub(c, "mixta")).toMatchObject({ sub: "europa", region: { id: "europa", pct: 97.5 } });
    expect(mapearSub(c, "geografica").sub).toBe("europa");
  });
  it("ninguna región llega al 60 % → global (con el % de la mayor, informativo)", () => {
    const c = comp({ Technology: 25, "Financial Services": 15, Healthcare: 12, Industrials: 11, "Consumer Cyclical": 10 }, { "North America": 55, "Europe Developed": 20, Japan: 8, "Asia Emerging": 7, "Latin America": 3 });
    expect(mapearSub(c, "geografica")).toMatchObject({ sub: "global", region: { id: "global", pct: 55 } });
    const m = mapearSub(c, "mixta");
    expect(m.sub).toBe("global");
    expect(m.sector).toBeUndefined();
    expect(mapearSub(c, "sectorial").sub).toBeUndefined();
  });
  it("otro-sector puede dominar (un ETF de bancos) y se etiqueta como tal", () => {
    const c = comp({ "Financial Services": 92, Technology: 5, Industrials: 3 }, { "Europe Developed": 90, "United Kingdom": 10 });
    expect(mapearSub(c, "sectorial")).toMatchObject({ sub: "otro-sector", sector: { id: "otro-sector", pct: 95 } });
  });
  it("Small + Micro ≥ 60 % → smallcaps antes que la región", () => {
    const c = comp({ Industrials: 20, Technology: 18, "Financial Services": 16 }, { "North America": 98, "Europe Developed": 2 }, { grande: 2, media: 20, pequena: 60, micro: 18 });
    expect(mapearSub(c, "geografica")).toMatchObject({ sub: "smallcaps", region: { id: "smallcaps", pct: 78 } });
    expect(mapearSub(c, "mixta").sub).toBe("smallcaps");
  });
  it("emergentes = Asia Emerging + Latin America + Africa/Middle East", () => {
    const c = comp({ Technology: 30 }, { "Asia Emerging": 45, "Latin America": 12, "Africa/Middle East": 8, "Asia Developed": 20, "Europe Emerging": 5, "North America": 10 });
    expect(mapearSub(c, "geografica")).toMatchObject({ sub: "emergentes", region: { id: "emergentes", pct: 65 } });
    expect(casillasDe(c).europa).toBe(5);
  });
  it("sin datos de regiones no inventa global; sin estrategia se comporta como mixta", () => {
    const c = comp({ Technology: 70 }, {});
    expect(mapearSub(c, "geografica")).toMatchObject({ sub: undefined, motivo: "sin datos de regiones" });
    expect(mapearSub(c, undefined).sub).toBe("tecnologia");
  });
});

describe("variantesEodhd", () => {
  it("traduce los sufijos de la app a los de EODHD", () => {
    expect(variantesEodhd("XDWT.DE")).toEqual(["XDWT.XETRA", "XDWT.F", "XDWT.DE"]);
    expect(variantesEodhd("IBTE.L")).toEqual(["IBTE.LSE", "IBTE.L"]);
    expect(variantesEodhd("IWDA.AS")).toEqual(["IWDA.AS"]);
    expect(variantesEodhd("QQQ")).toEqual(["QQQ"]);
    expect(variantesEodhd("")).toEqual([]);
  });
});
