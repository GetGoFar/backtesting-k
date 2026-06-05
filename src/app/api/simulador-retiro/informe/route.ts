// =============================================================================
// API /api/simulador-retiro/informe — Captura lead a Beehiiv
// =============================================================================
//
// POST { email, name?, consent, planSummary }
//   1. Valida campos
//   2. Suscribe al email en Beehiiv con tag "simulador-retiro" + custom fields
//      con los datos clave del plan (capital, edad, probabilidad)
//   3. Devuelve { ok: true } para que el cliente proceda con la descarga
//      del PDF (el PDF se genera en cliente con jsPDF — no aquí)
//
// CORS: el endpoint está pensado para ser llamado desde el iframe en
// elproyectok.com (vía /simulador-retiro).
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";
const BEEHIIV_PUBLICATION_ID = "pub_39dfba72-1988-4f94-82e0-17bfe1d3d34e";
const TAG_NAME = "simulador-retiro";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

interface PlanSummary {
  capitalInicial: number;
  edadActual: number;
  edadJubilacion: number;
  probExito: number;
}

interface RequestBody {
  email?: string;
  name?: string;
  consent?: boolean;
  planSummary?: PlanSummary;
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "json_invalido" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const email = body.email?.trim().toLowerCase();
  const name = body.name?.trim() || undefined;
  const consent = body.consent === true;
  const planSummary = body.planSummary;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "email_invalido" },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (!consent) {
    return NextResponse.json(
      { ok: false, error: "consentimiento_requerido" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Suscribir a Beehiiv — si falla, no abortamos: el usuario aún quiere su PDF
  const apiKey = process.env.BEEHIIV_API_KEY;
  if (apiKey) {
    try {
      await subscribeToBeehiiv(apiKey, { email, name, planSummary });
    } catch (err) {
      console.error("[simulador-retiro/informe] Beehiiv error:", err);
      // No devolvemos error: el lead a Beehiiv es best-effort
    }
  } else {
    console.warn(
      "[simulador-retiro/informe] BEEHIIV_API_KEY no configurada — lead no enviado a Beehiiv"
    );
  }

  return NextResponse.json(
    { ok: true },
    { status: 200, headers: CORS_HEADERS }
  );
}

// -----------------------------------------------------------------------------
// Suscripción a Beehiiv
// -----------------------------------------------------------------------------

async function subscribeToBeehiiv(
  apiKey: string,
  args: {
    email: string;
    name?: string;
    planSummary?: PlanSummary;
  }
): Promise<void> {
  const { email, name, planSummary } = args;

  // Custom fields para que la automation de Beehiiv pueda segmentar/personalizar
  // Pablo: si quieres usar estos campos para segmentaciones, créalos en
  // Beehiiv > Settings > Custom Fields como `string`.
  const customFields: Array<{ name: string; value: string }> = [
    { name: "adquisición", value: "simulador-retiro" },
  ];
  if (planSummary) {
    customFields.push(
      {
        name: "plan_capital_inicial",
        value: Math.round(planSummary.capitalInicial).toString(),
      },
      { name: "plan_edad_actual", value: planSummary.edadActual.toString() },
      {
        name: "plan_edad_jubilacion",
        value: planSummary.edadJubilacion.toString(),
      },
      { name: "plan_prob_exito", value: planSummary.probExito.toFixed(1) }
    );
  }
  if (name) customFields.push({ name: "first_name", value: name });

  const subRes = await fetch(
    `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: false,
        utm_source: "simulador-retiro",
        utm_medium: "web",
        referring_site: "elproyectok.com",
        custom_fields: customFields,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!subRes.ok) {
    const text = await subRes.text();
    console.error(
      `[simulador-retiro/informe] Beehiiv subscribe ${subRes.status}: ${text.slice(0, 300)}`
    );
    return;
  }

  const subResp = (await subRes.json()) as { data?: { id?: string } };
  const subscriptionId = subResp.data?.id;
  if (!subscriptionId) return;

  // Aplicar tag para segmentación
  try {
    await fetch(
      `${BEEHIIV_API_BASE}/publications/${BEEHIIV_PUBLICATION_ID}/subscriptions/${subscriptionId}/tags`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tags: [TAG_NAME] }),
        signal: AbortSignal.timeout(8_000),
      }
    );
  } catch (err) {
    console.warn("[simulador-retiro/informe] tag fallo:", err);
  }
}
