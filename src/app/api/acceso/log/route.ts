// =============================================================================
// API /api/acceso/log — Visor del registro de accesos (solo admin)
// =============================================================================
//
// GET /api/acceso/log?key=<CRON_SECRET>           → tabla HTML legible
// GET /api/acceso/log?key=<CRON_SECRET>&format=json → JSON crudo
//
// Protegido con el CRON_SECRET ya configurado en Vercel (sin env vars nuevas).
// La ruta es pública a nivel de middleware (/api/*) pero exige la clave.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getRecentAccesses, isLogStoreAvailable } from "@/lib/access-log";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const key = request.nextUrl.searchParams.get("key");
  const secret = process.env.CRON_SECRET;
  if (!secret || key !== secret) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  const available = await isLogStoreAvailable();
  const entries = available ? await getRecentAccesses(300) : [];

  if (request.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ ok: true, redis: available, count: entries.length, entries });
  }

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("es-ES", {
        timeZone: "Europe/Madrid",
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };
  const esc = (s: string | undefined) =>
    (s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = entries
    .map((e) => {
      const okStyle = e.result === "ok"
        ? "color:#1a7f37;font-weight:600"
        : "color:#C81E2E;font-weight:600";
      return `<tr>
        <td>${fmtDate(e.ts)}</td>
        <td style="${okStyle}">${e.result === "ok" ? "✓ ok" : "✗ fallo"}</td>
        <td><strong>${esc(e.label)}</strong></td>
        <td>${esc(e.city)}${e.country ? ` (${esc(e.country)})` : ""}</td>
        <td>${esc(e.ip)}</td>
        <td>${esc(e.ua)}</td>
      </tr>`;
    })
    .join("\n");

  const aviso = available
    ? entries.length === 0
      ? `<p class="aviso">Sin accesos registrados todavía. El registro empezó con el despliegue de esta función.</p>`
      : ""
    : `<p class="aviso error">⚠ Redis (Upstash) no está configurado en este entorno — el registro no puede guardar nada. Configura KV_REST_API_URL y KV_REST_API_TOKEN en Vercel.</p>`;

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Registro de accesos — Backtesting K</title>
<meta name="robots" content="noindex">
<style>
  body{font-family:Poppins,system-ui,sans-serif;background:#F5F0EB;color:#202020;margin:0;padding:24px;}
  h1{font-family:Georgia,serif;font-size:22px;margin:0 0 4px;}
  p.sub{color:#5A5A5A;font-size:13px;margin:0 0 20px;}
  p.aviso{background:#fff7e0;border:1px solid #e8d9a0;padding:10px 14px;border-radius:8px;font-size:13px;}
  p.aviso.error{background:#fdecec;border-color:#f0b9b9;}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;font-size:13px;}
  th{background:#202020;color:#fff;text-align:left;padding:8px 12px;font-weight:600;}
  td{padding:7px 12px;border-bottom:1px solid #eee8df;}
  tr:hover td{background:#faf7f2;}
</style></head><body>
<h1>Registro de accesos</h1>
<p class="sub">Últimos ${entries.length} intentos de login en backtesting-k.vercel.app · hora de Madrid · IP truncada por privacidad</p>
${aviso}
<table>
<thead><tr><th>Fecha</th><th>Resultado</th><th>Código (etiqueta)</th><th>Ciudad</th><th>IP</th><th>Navegador</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
