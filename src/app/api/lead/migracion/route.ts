// =============================================================================
// API: POST /api/lead/migracion
// =============================================================================
//
// Captura el lead de la calculadora "Dinero Quemado" en Beehiiv.
// El usuario, tras ver el alfa de su fondo, deja nombre + email a cambio
// del plan de migración personalizado a su alternativa indexada.
//
// El plan de migración real lo envía Pablo desde Beehiiv (Automation
// triggerada por la tag "calculadora-DQ"). Aquí solo creamos el suscriptor
// con los metadatos suficientes para personalizar el email.
//
// Tags que aplicamos:
//   - "calculadora-DQ"   -> dispara la automation de Pablo
//   - "fondo-{ISIN}"     -> Pablo puede segmentar por fondo origen
//
// Custom fields (ya existen en la publicación):
//   - first_name      -> nombre del usuario
//   - adquisición     -> "calculadora-dinero-quemado"
//
// Configuración requerida en Vercel:
//   BEEHIIV_API_KEY     -> create new key en Beehiiv > Settings > Integrations
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const BEEHIIV_PUBLICATION_ID = "pub_39dfba72-1988-4f94-82e0-17bfe1d3d34e";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface LeadPayload {
  nombre?: string;
  email?: string;
  isin?: string;
  fondoNombre?: string;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "config_missing", detail: "BEEHIIV_API_KEY no configurada en el servidor" },
      { status: 503, headers: CORS_HEADERS },
    );
  }

  let body: LeadPayload;
  try {
    body = (await req.json()) as LeadPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "json_invalido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const nombre = (body.nombre || "").trim().slice(0, 100);
  const email = (body.email || "").trim().toLowerCase().slice(0, 200);
  const isin = (body.isin || "").trim().toUpperCase().slice(0, 12);
  const fondoNombre = (body.fondoNombre || "").trim().slice(0, 200);

  if (!RE_EMAIL.test(email)) {
    return NextResponse.json(
      { ok: false, error: "email_invalido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (!nombre) {
    return NextResponse.json(
      { ok: false, error: "nombre_requerido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  if (isin && !RE_ISIN.test(isin)) {
    return NextResponse.json(
      { ok: false, error: "isin_invalido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // POST a Beehiiv para crear/actualizar el suscriptor.
  // La API es idempotente por email: si ya existe lo actualiza con los nuevos
  // custom fields y le añade los tags sin duplicarlo.
  const beehiivBody: Record<string, unknown> = {
    email,
    reactivate_existing: true,
    send_welcome_email: false,
    utm_source: "calculadora-dinero-quemado",
    utm_medium: "web",
    referring_site: "elproyectok.com",
    custom_fields: [
      { name: "first_name", value: nombre },
      { name: "adquisición", value: "calculadora-dinero-quemado" },
    ],
  };

  let beehiivRes: Response;
  try {
    beehiivRes = await fetch(
      `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(beehiivBody),
        signal: AbortSignal.timeout(15_000),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "beehiiv_red", detail: msg },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  if (!beehiivRes.ok) {
    const text = await beehiivRes.text();
    console.error(`[lead/migracion] Beehiiv ${beehiivRes.status}: ${text.slice(0, 300)}`);
    return NextResponse.json(
      { ok: false, error: "beehiiv_rechazo", status: beehiivRes.status },
      { status: 502, headers: CORS_HEADERS },
    );
  }

  const subResp = (await beehiivRes.json()) as { data?: { id?: string } };
  const subscriptionId = subResp.data?.id;

  // Aplicar tags (en una segunda llamada porque la API de POST subscriptions
  // no acepta tags en el body — sólo en endpoint dedicado).
  // Tag "calculadora-DQ" dispara automation. Tag "fondo-{ISIN}" segmenta.
  if (subscriptionId) {
    const tags: string[] = ["calculadora-DQ"];
    if (isin) tags.push(`fondo-${isin}`);

    try {
      await fetch(
        `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions/${subscriptionId}/tags`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tags }),
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch (err) {
      // No abortamos — el suscriptor se creó, los tags son extras
      console.warn("[lead/migracion] no se pudieron aplicar tags:", err);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      subscriptionId: subscriptionId || null,
      fondoNombre: fondoNombre || null,
      isin: isin || null,
    },
    { headers: CORS_HEADERS },
  );
}
