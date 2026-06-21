// =============================================================================
// API ROUTE: /api/campus/precios
// =============================================================================
// Devuelve el ÚLTIMO precio (NAV de cierre) de una lista de ISIN, para valorar
// a diario la cartera del alumno en la pestaña Seguimiento. Resuelve cada ISIN
// igual que el backtest: 1) base de datos del motor; 2) EODHD por símbolo de
// bolsa (fondo dinámico). EOD = precio de ayer para fondos, normal.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getFundById, getFundByIsin } from "@/lib/fund-database";
import { getDailyPrices } from "@/lib/data-fetcher";
import { runWithContext } from "@/lib/request-context";

const EODHD_API_TOKEN = process.env.EODHD_API_TOKEN || "";
const EX_SUFFIX: Record<string, string> = {
  AS: ".AS", PA: ".PA", XETRA: ".DE", F: ".F", LSE: ".L", L: ".L",
  MI: ".MI", MC: ".MC", BR: ".BR", ST: ".ST", US: "", EUFUND: ".EUFUND",
};
const EX_PREF = ["XETRA", "AS", "MI", "PA", "LSE", "L", "MC", "BR", "ST", "F", "US"];
type EodhdHit = { Code?: string; Exchange?: string; Name?: string; ISIN?: string };

async function resolveSymbol(isin: string): Promise<{ fundId: string; ticker?: string; name: string } | null> {
  const local = getFundByIsin(isin);
  if (local) return { fundId: local.id, ticker: local.ticker, name: local.shortName || local.name };
  if (!EODHD_API_TOKEN || EODHD_API_TOKEN === "demo") return null;
  try {
    const url = `https://eodhd.com/api/search/${encodeURIComponent(isin)}?api_token=${EODHD_API_TOKEN}&limit=30`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as EodhdHit[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const exact = data.filter((r) => r?.ISIN === isin);
    const pool = exact.length ? exact : data;
    pool.sort((a, b) => {
      const ia = EX_PREF.indexOf(a?.Exchange ?? ""); const ib = EX_PREF.indexOf(b?.Exchange ?? "");
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const best = pool[0];
    if (!best?.Code || !best?.Exchange) return null;
    return {
      fundId: `eodhd-${isin}`,
      ticker: `${best.Code}${EX_SUFFIX[best.Exchange] ?? "." + best.Exchange}`,
      name: best.Name || isin,
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    let body: { isins?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const isins = (Array.isArray(body.isins) ? body.isins : [])
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 40);

    const entries = await Promise.all(
      isins.map(async (isin) => {
        const r = await resolveSymbol(isin);
        if (!r) return [isin, null] as const;
        try {
          const { prices } = await getDailyPrices(r.fundId, r.ticker, isin);
          const keys = prices ? [...prices.keys()].sort() : [];
          const last = keys[keys.length - 1];
          if (!last) return [isin, null] as const;
          const price = prices.get(last);
          if (price === undefined || price === null) return [isin, null] as const;
          return [isin, { price, date: last, name: r.name }] as const;
        } catch {
          return [isin, null] as const;
        }
      })
    );

    const prices: Record<string, { price: number; date: string; name: string } | null> = {};
    for (const [isin, v] of entries) prices[isin] = v;
    return NextResponse.json({ prices });
  });
}
