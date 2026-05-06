// =============================================================================
// API: POST /api/lead/migracion
// =============================================================================
//
// Captura el lead de la calculadora "Dinero Quemado" en Beehiiv.
// El usuario, tras ver el alfa de su fondo, deja nombre + email a cambio
// del plan de migración personalizado a su alternativa indexada.
//
// El plan de migración real lo envía Pablo desde Beehiiv (Automation
// triggerada por "Added by API" — enrolamos al subscriber explícitamente
// en la automation tras crearlo). Antes usábamos un segmento dinámico
// pero Beehiiv los recalcula 1x/día, lo cual rompe el flujo en tiempo
// real. Con "Added by API" el email sale en cuanto enrolamos al user.
//
// Tags que aplicamos:
//   - "calculadora-DQ"   -> ya no dispara nada, sólo segmentación retrospectiva
//   - "fondo-{ISIN}"     -> Pablo puede segmentar por fondo origen
//
// Custom fields (ya existen en la publicación):
//   - first_name      -> nombre del usuario
//   - adquisición     -> "calculadora-dinero-quemado"
//   - fondo_isin      -> ES0146309002 (la merge tag {{fondo_isin}} la usa el email)
//   - fondo_nombre    -> nombre completo del fondo
//
// Configuración requerida en Vercel:
//   BEEHIIV_API_KEY     -> create new key en Beehiiv > Settings > Integrations
//
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const BEEHIIV_PUBLICATION_ID = "pub_39dfba72-1988-4f94-82e0-17bfe1d3d34e";
// Automation "New Automation" — envía el email del informe.
// Trigger: "Added by API". Enrolamos al subscriber con un POST a
// /publications/{pub}/automations/{aut}/journeys tras crearlo.
const BEEHIIV_AUTOMATION_INFORME = "aut_50384733-839d-49b1-a914-c0f9603b9d6d";

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
  if (isin && !RE_ISIN.test(isin)) {
    return NextResponse.json(
      { ok: false, error: "isin_invalido" },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  // POST a Beehiiv para crear/actualizar el suscriptor.
  // La API es idempotente por email: si ya existe lo actualiza con los nuevos
  // custom fields y le añade los tags sin duplicarlo.
  const customFields: Array<{ name: string; value: string }> = [
    { name: "adquisición", value: "calculadora-dinero-quemado" },
  ];
  if (nombre) customFields.push({ name: "first_name", value: nombre });
  // El ISIN se guarda en custom field para que la automation pueda inyectarlo
  // en la URL del email (https://.../informe/{{fondo_isin}}). Pablo debe crear
  // este custom field en Beehiiv (Settings > Custom Fields) tipo string.
  if (isin) customFields.push({ name: "fondo_isin", value: isin });
  if (fondoNombre) customFields.push({ name: "fondo_nombre", value: fondoNombre });

  const beehiivBody: Record<string, unknown> = {
    email,
    reactivate_existing: true,
    send_welcome_email: false,
    utm_source: "calculadora-dinero-quemado",
    utm_medium: "web",
    referring_site: "elproyectok.com",
    custom_fields: customFields,
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
  // Tag "calculadora-DQ" sirve para análisis/segmentación retrospectiva.
  // Tag "fondo-{ISIN}" segmenta por fondo origen.
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

    // Enrolar al subscriber en la automation del informe.
    // Esto es lo que dispara el envío del email en tiempo real
    // (en lugar de depender de un segmento dinámico que recalcula 1x/día).
    // Si el subscriber ya está enrolado Beehiiv responde 4xx — ignoramos
    // el error porque no queremos duplicar envíos.
    try {
      const journeyRes = await fetch(
        `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/automations/${BEEHIIV_AUTOMATION_INFORME}/journeys`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!journeyRes.ok) {
        const txt = await journeyRes.text();
        console.warn(
          `[lead/migracion] enroll automation ${journeyRes.status}: ${txt.slice(0, 200)}`,
        );
      }
    } catch (err) {
      console.warn("[lead/migracion] no se pudo enrolar en automation:", err);
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
