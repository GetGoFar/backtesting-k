// POST /api/cartera/importar  (multipart: campo "imagen")
// Lee una captura del bróker y devuelve posiciones para que el socio las
// revise antes de añadirlas. La imagen no se guarda en ningún sitio.
// Solo para socios: exige la cookie del Laboratorio antes de tocar el cuerpo,
// porque cada captura gasta API de Anthropic y búsquedas en EODHD.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { exigirAcceso } from "@/lib/lab-auth";
import { ErrorImportacion, MEDIA_TYPES, leerCaptura, resolverExtraccion } from "@/lib/mi-cartera/importar-servidor";
import { tipoImagenReal } from "@/lib/mi-cartera/importar";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel corta los cuerpos por encima de 4,5 MB
const DEMASIADO = { error: "La imagen pesa demasiado (máximo 4 MB)." };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sinAcceso = await exigirAcceso(req);
  if (sinAcceso) return sinAcceso;

  // Antes de cargar el cuerpo en memoria.
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (declarado > MAX_BYTES + 64 * 1024) return NextResponse.json(DEMASIADO, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envía la imagen como formulario (campo «imagen»)." }, { status: 400 });
  }
  const archivo = form.get("imagen");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta la imagen." }, { status: 400 });
  if (archivo.size > MAX_BYTES) return NextResponse.json(DEMASIADO, { status: 413 });

  // El tipo que declara el navegador no es de fiar: se mira la firma de los bytes.
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoImagenReal(bytes);
  if (!tipo || !MEDIA_TYPES.includes(tipo)) return NextResponse.json({ error: "Formato no admitido. Sube una imagen PNG, JPG o WebP." }, { status: 415 });

  try {
    const extraccion = await leerCaptura(Buffer.from(bytes).toString("base64"), tipo);
    const resultado = await resolverExtraccion(extraccion);
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErrorImportacion) {
      const status = e.codigo === "sin-clave" ? 503 : 422;
      return NextResponse.json({ error: e.message }, { status });
    }
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || e instanceof Anthropic.NotFoundError) {
      console.error("[importar] configuración de la API rechazada", e.status);
      return NextResponse.json({ error: "La importación por captura no está bien configurada en este servidor." }, { status: 503 });
    }
    if (e instanceof Anthropic.BadRequestError) return NextResponse.json({ error: "No he podido leer esta imagen. Prueba con otra captura." }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Demasiadas capturas seguidas. Espera un minuto y vuelve a probar." }, { status: 429 });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return NextResponse.json({ error: "La lectura ha tardado demasiado. Prueba con una captura de menos filas." }, { status: 504 });
    if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.APIError) {
      console.error("[importar] error de la API", e.name);
      return NextResponse.json({ error: "El servicio de lectura no responde ahora mismo. Vuelve a intentarlo en un rato." }, { status: 502 });
    }
    // Sin volcar el error entero: podría citar nombres e importes de la captura.
    console.error("[importar]", e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ error: "No he podido procesar la captura." }, { status: 500 });
  }
}
