import { describe, it, expect } from "vitest";
import { convertPriceMap, normalizeCurrency } from "./fx-convert";

const m = (obj: Record<string, number>) => new Map(Object.entries(obj));

describe("normalizeCurrency", () => {
  it("normaliza códigos ISO y peniques", () => {
    expect(normalizeCurrency("usd")).toEqual({ code: "USD", scale: 1 });
    expect(normalizeCurrency("GBP")).toEqual({ code: "GBP", scale: 1 });
    expect(normalizeCurrency("GBX")).toEqual({ code: "GBP", scale: 0.01 });
    expect(normalizeCurrency("GBp")).toEqual({ code: "GBP", scale: 0.01 });
    expect(normalizeCurrency(undefined)).toBeNull();
    expect(normalizeCurrency("EURO")).toBeNull();
  });
});

describe("convertPriceMap", () => {
  it("USD → EUR divide por el tipo de cambio del día (USD por EUR)", () => {
    const prices = m({ "2020-01-02": 100, "2020-01-03": 110 });
    const usdPerEur = m({ "2020-01-02": 1.25, "2020-01-03": 1.1 });
    const { prices: out, droppedDays } = convertPriceMap(prices, null, usdPerEur);
    expect(droppedDays).toBe(0);
    expect(out.get("2020-01-02")).toBeCloseTo(80, 10);
    expect(out.get("2020-01-03")).toBeCloseTo(100, 10);
  });

  it("EUR → USD multiplica; EUR → EUR con series iguales es identidad", () => {
    const prices = m({ "2020-01-02": 80 });
    const usdPerEur = m({ "2020-01-02": 1.25 });
    expect(convertPriceMap(prices, usdPerEur, null).prices.get("2020-01-02")).toBeCloseTo(100, 10);
    expect(convertPriceMap(prices, usdPerEur, usdPerEur).prices.get("2020-01-02")).toBeCloseTo(80, 10);
  });

  it("pivota por el dólar entre dos divisas que no son USD (EUR → JPY)", () => {
    const prices = m({ "2020-01-02": 10 }); // 10 EUR
    const usdPerEur = m({ "2020-01-02": 1.1 });
    const usdPerJpy = m({ "2020-01-02": 1 / 110 });
    const out = convertPriceMap(prices, usdPerEur, usdPerJpy).prices;
    expect(out.get("2020-01-02")).toBeCloseTo(10 * 1.1 * 110, 8); // 1.210 JPY
  });

  it("mide en oro: USD → XAU divide por el precio de la onza", () => {
    const prices = m({ "2020-01-02": 3000 }); // 3.000 USD
    const usdPerOz = m({ "2020-01-02": 1500 });
    expect(convertPriceMap(prices, null, usdPerOz).prices.get("2020-01-02")).toBeCloseTo(2, 10);
  });

  it("hace forward-fill del tipo de cambio cuando ese día no hay dato", () => {
    const prices = m({ "2020-01-02": 100, "2020-01-03": 100, "2020-01-06": 100 });
    const usdPerEur = m({ "2020-01-02": 1.25, "2020-01-06": 1.0 });
    const out = convertPriceMap(prices, null, usdPerEur).prices;
    expect(out.get("2020-01-03")).toBeCloseTo(80, 10); // usa el 02
    expect(out.get("2020-01-06")).toBeCloseTo(100, 10);
  });

  it("descarta los días anteriores al primer tipo de cambio disponible", () => {
    const prices = m({ "1999-12-31": 100, "2000-01-03": 100, "2000-01-04": 100 });
    const usdPerGbp = m({ "2000-01-04": 1.6 });
    const { prices: out, droppedDays } = convertPriceMap(prices, usdPerGbp, null);
    expect(droppedDays).toBe(2);
    expect(Array.from(out.keys())).toEqual(["2000-01-04"]);
    expect(out.get("2000-01-04")).toBeCloseTo(160, 10);
  });

  it("aplica la escala de peniques antes de convertir (GBX → EUR)", () => {
    const prices = m({ "2020-01-02": 250 }); // 250 p = 2,5 GBP
    const usdPerGbp = m({ "2020-01-02": 1.3 });
    const usdPerEur = m({ "2020-01-02": 1.1 });
    const out = convertPriceMap(prices, usdPerGbp, usdPerEur, 0.01).prices;
    expect(out.get("2020-01-02")).toBeCloseTo(2.5 * 1.3 / 1.1, 10);
  });

  it("sin serie de cambio (mapa vacío) no convierte ningún día", () => {
    const prices = m({ "2020-01-02": 100 });
    const { prices: out, droppedDays } = convertPriceMap(prices, new Map(), null);
    expect(out.size).toBe(0);
    expect(droppedDays).toBe(1);
  });
});
