// =============================================================================
// API ROUTE: /api/perfil-bandas — Estudio CNMV de deriva de perfil por bandas
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { runWithContext } from "@/lib/request-context";
import { runPerfilBandasStudy, type PerfilBandasConfig } from "@/lib/perfil-bandas-engine";

const TIMEOUT_MS = 120_000;

export async function POST(request: NextRequest): Promise<NextResponse> {
  return runWithContext({ dataSource: "eodhd" }, async () => {
    try {
      let body: Partial<PerfilBandasConfig>;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
      }

      const config: PerfilBandasConfig = {
        family: body.family ?? "k-geografica-ucit",
        band: body.band ?? { mode: "rel", width: 0.5 },
        initialAmount: body.initialAmount ?? 100_000,
        taxMode: body.taxMode ?? "spain-irpf",
        taxRate: body.taxRate,
        realizedWindowMonths: body.realizedWindowMonths ?? 12,
        sensitivityBands: body.sensitivityBands,
      };

      const result = await Promise.race([
        runPerfilBandasStudy(config),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), TIMEOUT_MS)),
      ]);

      return NextResponse.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      const status = message === "Timeout" ? 408 : 500;
      return NextResponse.json({ error: "Error en el estudio", message }, { status });
    }
  });
}
