// =============================================================================
// MORNINGSTAR ALFAS — lookup directo por ISIN
// =============================================================================
//
// Devuelve las alfas (1y/3y/5y/10y), beta, std-dev y Sharpe de Morningstar
// para un ISIN dado. Estas son las cifras que el lector ve en la ficha
// pública del fondo en morningstar.es → pestaña Riesgo → Medidas de
// volatilidad. Usamos esto en lugar de calcular alfa por CAGR-diff propio
// para garantizar coincidencia con la fuente que la audiencia consulta.
//
// Flujo de la API pública de Morningstar:
//   1. Búsqueda por ISIN -> performanceId (PI)
//      GET https://www.morningstar.es/es/util/SecuritySearch.ashx?q=<ISIN>
//   2. Screener con dataPoints AlphaM12/36/60/120 sobre ese PI
//      GET https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener
//
// =============================================================================

const MS_SEARCH_URL = "https://www.morningstar.es/es/util/SecuritySearch.ashx";
const MS_SCREENER_URL = "https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const TIMEOUT_MS = 8000;

export interface MorningstarRiskMetrics {
  /** Performance ID interno de Morningstar */
  performanceId: string;
  /** Nombre tal y como aparece en Morningstar */
  nombre: string;
  /** Alfa anualizada en % a 1 año */
  alfa1: number | null;
  /** Alfa anualizada en % a 3 años */
  alfa3: number | null;
  /** Alfa anualizada en % a 5 años */
  alfa5: number | null;
  /** Alfa anualizada en % a 10 años */
  alfa10: number | null;
  /** Beta a 3 años (vs benchmark de la categoría) */
  beta3: number | null;
  /** Desviación típica anualizada a 3 años en % */
  stdev3: number | null;
  /** Ratio de Sharpe a 3 años */
  sharpe3: number | null;
}

interface SearchHit {
  i: string;
  pi: string;
  n: string;
}

interface ScreenerResponse {
  total: number;
  rows: Array<{
    SecId?: string;
    Name?: string;
    AlphaM12?: number;
    AlphaM36?: number;
    AlphaM60?: number;
    AlphaM120?: number;
    BetaM36?: number;
    StandardDeviationM36?: number;
    SharpeM36?: number;
  }>;
}

/**
 * Wrapper con reintentos de fetch a Morningstar. Aplica backoff exponencial
 * suave (200ms, 600ms, 1500ms) — 3 intentos. Devuelve null si los 3 fallan.
 * Razón: la API publica de Morningstar lanza fallos transitorios cuando se
 * la presiona con concurrencia, y un fallback silencioso a EODHD/CAGR-diff
 * deja al usuario viendo cifras que NO coinciden con la ficha de Morningstar.
 */
async function fetchConReintentos(url: string, maxIntentos: number = 3): Promise<Response | null> {
  let ultimoErr: unknown = null;
  for (let i = 0; i < maxIntentos; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return res;
      ultimoErr = `HTTP ${res.status}`;
    } catch (err) {
      ultimoErr = err instanceof Error ? err.message : String(err);
    }
    if (i < maxIntentos - 1) {
      const backoff = 200 * Math.pow(3, i); // 200ms, 600ms, 1800ms
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  console.warn(`[morningstar-alfa] ${maxIntentos} intentos fallidos: ${ultimoErr}`);
  return null;
}

async function buscarPerformanceId(isin: string): Promise<{ pi: string; nombre: string } | null> {
  const url = `${MS_SEARCH_URL}?q=${encodeURIComponent(isin)}&limit=5`;
  const res = await fetchConReintentos(url);
  if (!res) return null;
  const text = await res.text();
  // Cada línea: "<Nombre>|<JSON>|<Tipo>|...|..."
  for (const line of text.split("\n")) {
    const parts = line.split("|");
    if (parts.length < 2) continue;
    const jsonPart = parts[1];
    if (!jsonPart) continue;
    try {
      const hit = JSON.parse(jsonPart) as SearchHit;
      if (hit.pi) return { pi: hit.pi, nombre: hit.n || (parts[0] ?? "") };
    } catch {
      /* siguiente línea */
    }
  }
  return null;
}

async function pedirMetricas(pi: string): Promise<ScreenerResponse["rows"][0] | null> {
  const fields = [
    "SecId",
    "Name",
    "AlphaM12",
    "AlphaM36",
    "AlphaM60",
    "AlphaM120",
    "BetaM36",
    "StandardDeviationM36",
    "SharpeM36",
  ].join("|");
  const url = `${MS_SCREENER_URL}?outputType=json&securityDataPoints=${fields}&term=${encodeURIComponent(pi)}`;
  const res = await fetchConReintentos(url);
  if (!res) return null;
  const data = (await res.json()) as ScreenerResponse;
  return data.rows?.[0] ?? null;
}

/**
 * Obtiene las métricas de riesgo (alfa1/3/5/10, beta, stdev, sharpe) de
 * Morningstar para un ISIN. Devuelve null si Morningstar no encuentra el
 * fondo. Si el fondo existe pero no tiene métricas (fondo demasiado nuevo),
 * los campos son null individualmente pero el objeto se devuelve para que
 * el llamador pueda registrar el match.
 *
 * No lanza: cualquier fallo de red o parsing devuelve null y se loguea.
 */
export async function obtenerAlfasMorningstar(isin: string): Promise<MorningstarRiskMetrics | null> {
  try {
    const pi = await buscarPerformanceId(isin);
    if (!pi) return null;
    const row = await pedirMetricas(pi.pi);
    if (!row) {
      // Existe el PI pero la API no devolvió row — devolvemos solo identificadores
      return {
        performanceId: pi.pi,
        nombre: pi.nombre,
        alfa1: null,
        alfa3: null,
        alfa5: null,
        alfa10: null,
        beta3: null,
        stdev3: null,
        sharpe3: null,
      };
    }
    return {
      performanceId: pi.pi,
      nombre: row.Name ?? pi.nombre,
      alfa1: row.AlphaM12 ?? null,
      alfa3: row.AlphaM36 ?? null,
      alfa5: row.AlphaM60 ?? null,
      alfa10: row.AlphaM120 ?? null,
      beta3: row.BetaM36 ?? null,
      stdev3: row.StandardDeviationM36 ?? null,
      sharpe3: row.SharpeM36 ?? null,
    };
  } catch (err) {
    console.warn(`[morningstar-alfa] error para ${isin}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
