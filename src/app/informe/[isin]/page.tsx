// =============================================================================
// PÁGINA: /informe/[isin]
// =============================================================================
//
// Informe personalizado del fondo del usuario vs Cartera K10 Sectorial.
// Página dinámica (server-rendered): cada visita ejecuta el backtest con
// los NAVs más actuales (cacheados 12h en CDN para no abusar EODHD).
//
// Foco: solo lo esencial — gráfico de evolución, 4 KPIs, correlación.
// El usuario llega aquí desde el email automatizado de Beehiiv tras
// dejar su lead en la calculadora.
//
// =============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import InformeChart from "./InformeChart";
import type { InformeFondo } from "@/lib/informe-fondo";

interface ApiResponse {
  ok: boolean;
  informe?: InformeFondo;
  error?: string;
  detail?: string;
}

interface Props {
  params: Promise<{ isin: string }>;
}

export const dynamic = "force-dynamic";

async function fetchInforme(isin: string): Promise<ApiResponse> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("host") || "backtesting-k.vercel.app";
  const url = `${proto}://${host}/api/informe-fondo?isin=${encodeURIComponent(isin)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    return (await r.json()) as ApiResponse;
  } catch (err) {
    return { ok: false, error: "fetch_fallo", detail: err instanceof Error ? err.message : String(err) };
  }
}

function fmtEur(n: number): string {
  return Math.round(n).toLocaleString("es-ES") + " €";
}
function fmtPct(n: number, decimales = 2): string {
  return (n * 100).toFixed(decimales).replace(".", ",") + " %";
}
function fmtPctSigno(n: number, decimales = 2): string {
  const valor = (n * 100).toFixed(decimales).replace(".", ",");
  return n >= 0 ? `+${valor} %` : `${valor} %`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { isin } = await params;
  return {
    title: `Informe ${isin.toUpperCase()} vs Cartera K10 · El Proyecto K`,
    description: "Comparativa personalizada de tu fondo contra una cartera indexada sectorial.",
    robots: "noindex, nofollow", // informes personales, no indexar
  };
}

export default async function InformePage({ params }: Props) {
  const { isin: rawIsin } = await params;
  const isin = (rawIsin || "").toUpperCase();
  const RE_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

  if (!RE_ISIN.test(isin)) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ color: "#ff8a8a", marginTop: 0 }}>ISIN no válido</h1>
          <p>El identificador del fondo no tiene el formato correcto. Verifica el enlace que recibiste.</p>
        </div>
      </main>
    );
  }

  const r = await fetchInforme(isin);

  if (!r.ok || !r.informe) {
    return (
      <main style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ color: "#ff8a8a", marginTop: 0 }}>No se pudo generar el informe</h1>
          <p style={{ color: "#c5c8d0" }}>
            {r.detail || "Inténtalo de nuevo en unos minutos. Si persiste, escríbenos."}
          </p>
          <p style={{ marginTop: 24 }}>
            <strong>ISIN:</strong> <code>{isin}</code>
          </p>
        </div>
      </main>
    );
  }

  const inf = r.informe;
  const dq5Equiv = inf.kpiK10.valorFinal - inf.kpiFondo.valorFinal;
  const fondoMejor = inf.kpiFondo.valorFinal > inf.kpiK10.valorFinal;

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 22 }}>K</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>Informe Comparativo</div>
              <div style={{ fontSize: 13, color: "#666" }}>El Proyecto K</div>
            </div>
          </div>
          <a href="https://elproyectok.com" style={{ color: "#1d4ed8", textDecoration: "none", fontSize: 14, fontWeight: 600 }}>elproyectok.com →</a>
        </header>

        {/* Title */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 28, lineHeight: 1.2 }}>{inf.nombreFondo}</h1>
          <div style={{ color: "#666", fontSize: 14 }}>
            <code style={{ background: "#eef0f4", padding: "2px 8px", borderRadius: 4 }}>{inf.isin}</code>
            {" · "}
            vs Cartera K10 Sectorial (80% RV Sectorial + 20% Oro)
            {" · "}
            {inf.anosCubiertos.toFixed(1)} años analizados
          </div>
        </div>

        {/* Chart */}
        <section style={cardStyle}>
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600 }}>Evolución del patrimonio</h2>
          <p style={{ color: "#666", margin: "0 0 16px", fontSize: 13 }}>10.000 € invertidos en {inf.rangoFechas.inicio} hasta {inf.rangoFechas.fin}.</p>
          <InformeChart fechas={inf.fechas} fondo={inf.valorFondo} k10={inf.valorK10} nombreFondo={inf.nombreFondo} />
        </section>

        {/* KPIs */}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 16 }}>
          <KpiCard
            label="Valor final"
            valorFondo={fmtEur(inf.kpiFondo.valorFinal)}
            valorK10={fmtEur(inf.kpiK10.valorFinal)}
            mejor={fondoMejor ? "fondo" : "k10"}
            tooltip="Cuánto vale tu inversión inicial de 10.000 € al final del período."
            nombreFondo={inf.nombreFondo}
          />
          <KpiCard
            label="CAGR"
            valorFondo={fmtPctSigno(inf.kpiFondo.cagr)}
            valorK10={fmtPctSigno(inf.kpiK10.cagr)}
            mejor={inf.kpiFondo.cagr > inf.kpiK10.cagr ? "fondo" : "k10"}
            tooltip="Tasa de crecimiento anual compuesto. Lo que rinde de media cada año."
            nombreFondo={inf.nombreFondo}
          />
          <KpiCard
            label="Volatilidad"
            valorFondo={fmtPct(inf.kpiFondo.volatilidad)}
            valorK10={fmtPct(inf.kpiK10.volatilidad)}
            mejor={inf.kpiFondo.volatilidad < inf.kpiK10.volatilidad ? "fondo" : "k10"}
            mejorEsMenor
            tooltip="Cuánto fluctúa el valor. Menor = más estable."
            nombreFondo={inf.nombreFondo}
          />
          <KpiCard
            label="Max Drawdown"
            valorFondo={fmtPct(inf.kpiFondo.maxDrawdown)}
            valorK10={fmtPct(inf.kpiK10.maxDrawdown)}
            mejor={inf.kpiFondo.maxDrawdown > inf.kpiK10.maxDrawdown ? "fondo" : "k10"}
            mejorEsMenor
            tooltip="La mayor caída desde un máximo en todo el período."
            nombreFondo={inf.nombreFondo}
          />
        </section>

        {/* Correlación */}
        <section style={{ ...cardStyle, marginTop: 16, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#666", marginBottom: 6 }}>Correlación entre carteras</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "#1d4ed8" }}>{Math.round(inf.correlacion * 100)} %</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
            {Math.abs(inf.correlacion) < 0.4
              ? "Carteras poco correlacionadas — diversificación real."
              : Math.abs(inf.correlacion) < 0.7
              ? "Correlación moderada — algo de diversificación."
              : "Correlación alta — ambas se mueven parecido."}
          </div>
        </section>

        {/* Resumen interpretación */}
        <section style={{ ...cardStyle, marginTop: 16, background: fondoMejor ? "#f0f9ff" : "#fef2f2", borderLeft: `4px solid ${fondoMejor ? "#1d4ed8" : "#dc2626"}` }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 16, color: fondoMejor ? "#1d4ed8" : "#dc2626" }}>
            {fondoMejor
              ? "Tu fondo bate a la K10 en valor final"
              : "La K10 Sectorial bate a tu fondo"}
          </h3>
          <p style={{ margin: 0, color: "#444", lineHeight: 1.5 }}>
            {fondoMejor
              ? `Sobre 10.000 € invertidos durante ${inf.anosCubiertos.toFixed(1)} años, tu fondo terminó ${fmtEur(Math.abs(dq5Equiv))} por encima de la cartera K10. Felicidades — perteneces al pequeño grupo que efectivamente bate al indexado.`
              : `Sobre 10.000 € invertidos durante ${inf.anosCubiertos.toFixed(1)} años, la K10 Sectorial terminó ${fmtEur(Math.abs(dq5Equiv))} por encima de tu fondo. Esa diferencia es lo que las comisiones del fondo activo te están costando — dinero que se queda en la gestora en lugar de en tu bolsillo.`}
          </p>
        </section>

        {/* CTA */}
        <section style={{ marginTop: 32, textAlign: "center", padding: "24px 16px", background: "#0f172a", color: "#fff", borderRadius: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>¿Quieres aprender a montar tu propia cartera indexada?</h3>
          <p style={{ margin: "0 0 16px", color: "#cbd5e1", fontSize: 14 }}>
            En el taller de El Proyecto K te enseñamos paso a paso, sin tecnicismos.
          </p>
          <a
            href="https://elproyectok.com/taller"
            style={{
              display: "inline-block",
              background: "linear-gradient(135deg, #ff4444, #ff6b6b)",
              color: "#fff",
              padding: "12px 28px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 15,
            }}
          >
            Apuntarme al taller →
          </a>
        </section>

        {/* Disclaimer */}
        <footer style={{ marginTop: 24, fontSize: 12, color: "#888", textAlign: "center", lineHeight: 1.6 }}>
          <p>
            Datos: Morningstar / EODHD. Período común disponible con la cartera K10. Las rentabilidades pasadas no garantizan resultados futuros.
          </p>
          <p>
            Esta herramienta tiene fines exclusivamente educativos. El Proyecto K no es una entidad de asesoramiento financiero regulada.
          </p>
        </footer>
      </div>
    </main>
  );
}

// -----------------------------------------------------------------------------
// Componentes auxiliares
// -----------------------------------------------------------------------------

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f6f7f9",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: "#222",
  padding: "20px 0",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

interface KpiCardProps {
  label: string;
  valorFondo: string;
  valorK10: string;
  mejor: "fondo" | "k10";
  mejorEsMenor?: boolean;
  tooltip?: string;
  nombreFondo: string;
}

function KpiCard({ label, valorFondo, valorK10, mejor, nombreFondo }: KpiCardProps) {
  const fondoMejor = mejor === "fondo";
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600, maxWidth: "55%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {nombreFondo}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700, color: fondoMejor ? "#059669" : "#222" }}>{valorFondo}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>K10 Sectorial</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: !fondoMejor ? "#059669" : "#222" }}>{valorK10}</span>
        </div>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: !fondoMejor ? "#dc2626" : "#059669", fontWeight: 600 }}>
        {fondoMejor ? "Tu fondo gana ✓" : "K10 gana ✓"}
      </div>
    </div>
  );
}
