import { describe, it, expect } from "vitest";
import {
  encodeKopilotoLink,
  parseKopilotoParam,
  readKopilotoLink,
  resolveKopilotoLink,
  type KopilotoLink,
} from "./kopiloto-link";

const link: KopilotoLink = {
  v: 1,
  a: {
    name: "60/40 mundo",
    holdings: [
      { fundId: "ishares-msci-world", weight: 60 },
      { fundId: "vanguard-eur-bond", weight: 40 },
    ],
  },
  b: { preset: "k-geografica-ucit-6" },
  initial: 10000,
  monthly: 300,
  start: "2015-01",
  end: "2025-12",
  benchmark: "bm:msci-world",
  run: true,
};

describe("kopiloto-link", () => {
  it("codifica y decodifica ida y vuelta (con tildes y símbolos)", () => {
    const withAccents = { ...link, a: { ...link.a, name: "Cartera niña 60/40 · €" } };
    const encoded = encodeKopilotoLink(withAccents);
    expect(encoded).not.toMatch(/[+/=]/); // base64url, seguro en URL
    expect(parseKopilotoParam(`?k=${encoded}`)).toEqual(withAccents);
  });

  it("resuelve posiciones sueltas, presets, importes, fechas y benchmark", () => {
    const r = readKopilotoLink(`?k=${encodeKopilotoLink(link)}`);
    expect(r).not.toBeNull();
    expect(r!.a!.name).toBe("60/40 mundo");
    expect(r!.a!.holdings.map((h) => h.fundId)).toEqual(["ishares-msci-world", "vanguard-eur-bond"]);
    expect(r!.b!.name).toMatch(/K6/);
    expect(r!.b!.holdings.length).toBeGreaterThan(3);
    expect(r!.initial).toBe(10000);
    expect(r!.monthly).toBe(300);
    expect(r!.start).toBe("2015-01");
    expect(r!.end).toBe("2025-12");
    expect(r!.benchmark).toBe("bm:msci-world");
    expect(r!.run).toBe(true);
    expect(r!.warnings).toEqual([]);
  });

  it("normaliza pesos que no suman 100 y omite fondos desconocidos", () => {
    const r = resolveKopilotoLink({
      v: 1,
      a: {
        holdings: [
          { fundId: "ishares-msci-world", weight: 3 },
          { fundId: "no-existe", weight: 5 },
          { fundId: "vanguard-eur-bond", weight: 1 },
        ],
      },
    });
    expect(r!.a!.holdings.map((h) => h.weight)).toEqual([75, 25]);
    expect(r!.warnings.some((w) => w.includes("no-existe"))).toBe(true);
  });

  it("descarta lo inválido sin romper: versión, preset inexistente, fechas, benchmark", () => {
    expect(resolveKopilotoLink({ v: 2 as unknown as 1, a: { preset: "k-inbestme-5" } })).toBeNull();
    expect(resolveKopilotoLink({ v: 1, a: { preset: "no-existe" } })).toBeNull();
    const r = resolveKopilotoLink({
      v: 1,
      a: { preset: "k-inbestme-5", rebalance: "quarterly", fee: 0.5 },
      start: "enero",
      end: "2025-13",
      benchmark: "bm:nada",
      initial: -5,
    });
    expect(r!.a!.rebalanceFrequency).toBe("quarterly");
    expect(r!.a!.managementFee).toBe(0.5);
    expect(r!.start).toBeUndefined();
    expect(r!.end).toBeUndefined();
    expect(r!.benchmark).toBeUndefined();
    expect(r!.initial).toBeUndefined();
    expect(r!.run).toBe(false);
  });

  it("devuelve null con basura en la URL o sin parámetro", () => {
    expect(parseKopilotoParam("?k=%%%")).toBeNull();
    expect(parseKopilotoParam("?k=bm9wZQ")).toBeNull(); // "nope" no es JSON
    expect(readKopilotoLink("?campus=1")).toBeNull();
  });
});
