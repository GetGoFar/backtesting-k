"use client";

// =============================================================================
// /quiz-carteras-k — Calculadora "¿Cuánto llevarías ganando con una Cartera K?"
// =============================================================================
// Port a producción del prototipo de Pablo (quiz-carteras-k.jsx): mismo flujo
// (3 preguntas con auto-avance → informe), misma estética (paleta papel/rojo,
// tarjeta oscura con la cifra protagonista, barras comparativas) y mismo tono.
//
// Cambios respecto al prototipo:
//   - Datos REALES: en vez de datoFicticio(), pide a /api/campus/quiz-carteras-k
//     (que reutiliza el motor de backtest + los presets K e Indexa por perfil).
//   - TypeScript estricto + estados de carga/error (el fetch es asíncrono).
//   - Accesibilidad: foco de teclado visible, roles ARIA, prefers-reduced-motion.
//   - CTA configurable por query (?ctaLabel=...&ctaUrl=...) para reusar el quiz
//     en distintos sitios del campus sin tocar el código.
//   - Rango de meses generado dinámicamente (oct-2024 → mes actual) en vez de
//     una lista fija, para que no se quede obsoleto.
//
// Solo campus (gated por middleware).
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

// -----------------------------------------------------------------------------
// Paleta — heredada del prototipo (identidad de El Proyecto K)
// -----------------------------------------------------------------------------
const C = {
  papel: "#F2ECE1",
  papelHondo: "#E8DFD0",
  tinta: "#1C1A17",
  rojo: "#C8341F",
  rojoHondo: "#9E2615",
  verde: "#3E6B4A",
  gris: "#8A8276",
  linea: "#D6CBB8",
} as const;

const FONT_DISPLAY = "'Georgia', 'Times New Roman', serif";
const FONT_BODY = "'Helvetica Neue', Arial, sans-serif";

// Primera edición del curso. Debe coincidir con MES_MINIMO del endpoint.
const MES_MINIMO = "2024-10";

const MESES_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface OpcionMes {
  id: string;
  label: string;
}

/** Opciones de mes desde MES_MINIMO hasta el mes actual (más reciente abajo,
 *  como en el prototipo: octubre 2024 primero). */
function opcionesDeMes(): OpcionMes[] {
  const hoy = new Date();
  const yMax = hoy.getFullYear();
  const mMax = hoy.getMonth() + 1;
  const out: OpcionMes[] = [];
  let y = Number(MES_MINIMO.slice(0, 4));
  let m = Number(MES_MINIMO.slice(5, 7));
  while (y < yMax || (y === yMax && m <= mMax)) {
    const nombre = MESES_ES[m - 1] ?? "";
    out.push({ id: `${y}-${String(m).padStart(2, "0")}`, label: `${nombre} ${y}` });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function fechaLarga(iso?: string): string {
  if (!iso) return "";
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const nombre = MESES_ES[m - 1];
  if (!y || !m || !nombre) return "";
  return `${nombre.toLowerCase()} de ${y}`;
}

// -----------------------------------------------------------------------------
// Formato de números (es-ES, con signo)
// -----------------------------------------------------------------------------
const fmtPct = (v: number): string => {
  const s = v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v > 0 ? "+" : ""}${s}%`;
};
const fmtPuntos = (v: number): string => {
  const s = Math.abs(v).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${s} puntos`;
};
// Volatilidad: porcentaje SIN signo (siempre positiva).
const fmtVol = (v: number): string =>
  `${v.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
// Ratio rentabilidad/riesgo (Sharpe): número con 2 decimales.
const fmtRatio = (v: number): string =>
  v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// -----------------------------------------------------------------------------
// Tipos del API y del resultado normalizado a la forma del prototipo
// -----------------------------------------------------------------------------
type Tipo = "geografica" | "sectorial";

interface ApiResumen {
  rentabilidad: number; // decimal
  cagr: number; // decimal
  drawdown: number; // decimal negativo
  volatilidad: number; // decimal
}
interface ApiResponse {
  meses: number;
  effectiveDateRange?: { startDate?: string; endDate?: string };
  cartera: ApiResumen;
  indexa: ApiResumen;
  diferenciaPuntos: number;
}
// Métricas normalizadas a unidades de presentación: rent/cagr/vol/dd en %
// (número), ratio = rentabilidad anual ÷ volatilidad (número adimensional).
interface MetricSet {
  rent: number; // % acumulada
  cagr: number; // % anual (CAGR)
  vol: number; // % volatilidad
  dd: number; // % caída máxima (negativo)
  ratio: number; // CAGR ÷ volatilidad (rentabilidad/riesgo)
}
interface Resultado {
  cartera: MetricSet;
  indexa: MetricSet;
  meses: number;
  dif: number; // puntos (K - Indexa) en rentabilidad
  desde?: string; // fecha de inicio efectiva (ISO)
}

interface CtaConfig {
  label: string;
  url: string;
}
const CTA_DEFECTO: CtaConfig = {
  label: "Quiero aprender a construirla →",
  url: "https://elproyectok.com",
};

// =============================================================================
// Componente principal
// =============================================================================
export default function QuizCarterasK() {
  const [meses] = useState<OpcionMes[]>(opcionesDeMes);
  const [paso, setPaso] = useState<0 | 1 | 2 | 4>(0); // 0..2 preguntas, 4 = informe
  const [mes, setMes] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<number | null>(null);
  const [tipo, setTipo] = useState<Tipo | null>(null);

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [cta, setCta] = useState<CtaConfig>(CTA_DEFECTO);

  // CTA desde la URL (sin useSearchParams para evitar el bailout de CSR).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const label = p.get("ctaLabel");
      const url = p.get("ctaUrl");
      if (label || url) setCta({ label: label || CTA_DEFECTO.label, url: url || CTA_DEFECTO.url });
    } catch {
      /* noop */
    }
  }, []);

  const calcular = useCallback(
    async (mesId: string, perfilN: number, tipoSel: Tipo) => {
      setPaso(4);
      setCargando(true);
      setError(null);
      setResultado(null);
      try {
        const res = await fetch("/api/campus/quiz-carteras-k", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mesInicio: mesId, perfil: perfilN, tipo: tipoSel }),
        });
        // Parseo defensivo: una respuesta no-JSON (p. ej. un 500/502 que
        // devuelve HTML) no debe reventar con un error críptico de JSON.parse.
        let json: (ApiResponse & { message?: string }) | null = null;
        try {
          json = (await res.json()) as ApiResponse & { message?: string };
        } catch {
          json = null;
        }
        if (!res.ok || !json) {
          throw new Error(
            json?.message ||
              "No hemos podido calcular el escenario ahora mismo. Inténtalo de nuevo en unos segundos."
          );
        }
        const d = json as ApiResponse;
        const mk = (x: ApiResumen): MetricSet => {
          const rent = +(x.rentabilidad * 100).toFixed(1);
          const cagr = +(x.cagr * 100).toFixed(1);
          const vol = +(x.volatilidad * 100).toFixed(1);
          const dd = +(x.drawdown * 100).toFixed(1);
          // Rentabilidad/riesgo simple: CAGR ÷ volatilidad (sin tasa libre de
          // riesgo, a diferencia del Sharpe). Se calcula con los valores YA
          // redondeados para que la división cuadre a ojo en la tabla.
          return { rent, cagr, vol, dd, ratio: vol > 0 ? +(cagr / vol).toFixed(2) : 0 };
        };
        setResultado({
          cartera: mk(d.cartera),
          indexa: mk(d.indexa),
          meses: d.meses,
          dif: +d.diferenciaPuntos.toFixed(1),
          desde: d.effectiveDateRange?.startDate,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado.");
      } finally {
        setCargando(false);
      }
    },
    []
  );

  const elegirTipo = useCallback(
    (t: Tipo) => {
      setTipo(t);
      if (mes != null && perfil != null) void calcular(mes, perfil, t);
    },
    [mes, perfil, calcular]
  );

  const reintentar = useCallback(() => {
    if (mes != null && perfil != null && tipo != null) void calcular(mes, perfil, tipo);
  }, [mes, perfil, tipo, calcular]);

  function reiniciar() {
    setPaso(0);
    setMes(null);
    setPerfil(null);
    setTipo(null);
    setResultado(null);
    setError(null);
  }

  const progreso = Math.min(paso, 4) / 4;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.papel,
        color: C.tinta,
        fontFamily: FONT_BODY,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 18px",
      }}
    >
      <style>{CSS_GLOBAL}</style>
      <div style={{ width: "100%", maxWidth: 560 }}>
        {/* Cabecera */}
        <header style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: C.rojo,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            El Proyecto K · Calculadora
          </div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 30, lineHeight: 1.1, margin: 0 }}>
            ¿Cuánto llevarías ganando
            <br />
            con una Cartera K?
          </h1>
          <p style={{ color: C.gris, fontSize: 15, marginTop: 12, lineHeight: 1.5 }}>
            Tres preguntas. Te enseño la rentabilidad real desde que hubieras empezado — y la
            comparo con lo que llevaría el típico roboadvisor.
          </p>
        </header>

        {/* Barra de progreso */}
        {paso < 4 && (
          <div style={{ height: 4, background: C.papelHondo, borderRadius: 99, marginBottom: 28 }}>
            <div
              className="qk-anim"
              style={{ height: "100%", width: `${progreso * 100}%`, background: C.rojo, borderRadius: 99 }}
            />
          </div>
        )}

        {/* PREGUNTA 1: cuándo */}
        {paso === 0 && (
          <Tarjeta numero="01" pregunta="¿Cuándo hubieras empezado a invertir?">
            <div role="group" aria-label="Mes de inicio" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {meses.map((m) => (
                <Opcion
                  key={m.id}
                  activa={mes === m.id}
                  onClick={() => {
                    setMes(m.id);
                    setPaso(1);
                  }}
                >
                  {m.label}
                </Opcion>
              ))}
            </div>
          </Tarjeta>
        )}

        {/* PREGUNTA 2: perfil */}
        {paso === 1 && (
          <Tarjeta numero="02" pregunta="¿Cuál es tu perfil de riesgo?" sub="Del 1 (muy conservador) al 10 (muy agresivo).">
            <div role="group" aria-label="Perfil de riesgo del 1 al 10" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                <Opcion
                  key={p}
                  activa={perfil === p}
                  centro
                  onClick={() => {
                    setPerfil(p);
                    setPaso(2);
                  }}
                >
                  {p}
                </Opcion>
              ))}
            </div>
            <Volver onClick={() => setPaso(0)} />
          </Tarjeta>
        )}

        {/* PREGUNTA 3: tipo */}
        {paso === 2 && (
          <Tarjeta numero="03" pregunta="¿Qué tipo de Cartera K?">
            <div role="radiogroup" aria-label="Tipo de Cartera K" style={{ display: "grid", gap: 10 }}>
              <Opcion grande radio activa={tipo === "geografica"} onClick={() => elegirTipo("geografica")}>
                <strong style={{ fontSize: 17 }}>Geográfica</strong>
                <span style={{ display: "block", color: C.gris, fontSize: 13, marginTop: 4 }}>
                  Diversificación por regiones del mundo.
                </span>
              </Opcion>
              <Opcion grande radio activa={tipo === "sectorial"} onClick={() => elegirTipo("sectorial")}>
                <strong style={{ fontSize: 17 }}>Sectorial</strong>
                <span style={{ display: "block", color: C.gris, fontSize: 13, marginTop: 4 }}>
                  Seis sectores. La versión clásica del Proyecto K.
                </span>
              </Opcion>
            </div>
            <Volver onClick={() => setPaso(1)} />
          </Tarjeta>
        )}

        {/* INFORME (con estados de carga / error) */}
        {paso === 4 && (
          <div aria-live="polite">
            {cargando && <Cargando />}
            {!cargando && error && <ErrorCard mensaje={error} onReintentar={reintentar} onVolver={() => setPaso(2)} />}
            {!cargando && !error && resultado && (
              <Informe
                mesLabel={meses.find((m) => m.id === mes)?.label}
                perfil={perfil as number}
                tipo={tipo as Tipo}
                r={resultado}
                cta={cta}
                onReiniciar={reiniciar}
              />
            )}
          </div>
        )}

        <footer
          style={{
            marginTop: 40,
            fontSize: 11.5,
            color: C.gris,
            lineHeight: 1.6,
            borderTop: `1px solid ${C.linea}`,
            paddingTop: 16,
          }}
        >
          Rentabilidades pasadas no garantizan rentabilidades futuras. Esto no constituye
          asesoramiento financiero personalizado, sino contenido educativo de El Proyecto K. El
          benchmark «Roboadvisor (Indexa, mismo perfil)» es una réplica de la cartera modelo de
          Indexa Capital construida con ETFs indexados de bajo coste (mismo perfil y misma fecha de
          inicio); no son las rentabilidades oficiales publicadas por Indexa.
        </footer>
      </div>
    </div>
  );
}

// =============================================================================
// Componentes
// =============================================================================

function Tarjeta({
  numero,
  pregunta,
  sub,
  children,
}: {
  numero: string;
  pregunta: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="qk-fade">
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 13, color: C.rojo, fontWeight: 700 }}>{numero}</span>
        <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 22, margin: 0, fontWeight: 700, lineHeight: 1.2 }}>{pregunta}</h2>
      </div>
      {sub && <p style={{ color: C.gris, fontSize: 14, margin: "0 0 18px 25px" }}>{sub}</p>}
      <div style={{ marginTop: sub ? 0 : 18 }}>{children}</div>
    </div>
  );
}

function Opcion({
  children,
  onClick,
  activa,
  grande,
  centro,
  radio,
}: {
  children: ReactNode;
  onClick: () => void;
  activa?: boolean;
  grande?: boolean;
  centro?: boolean;
  radio?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      role={radio ? "radio" : undefined}
      aria-checked={radio ? !!activa : undefined}
      aria-pressed={!radio ? !!activa : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="qk-opt"
      style={{
        textAlign: centro ? "center" : "left",
        padding: grande ? "16px 18px" : "13px 14px",
        background: activa ? C.rojo : hover ? C.papelHondo : "transparent",
        color: activa ? C.papel : C.tinta,
        border: `1.5px solid ${activa ? C.rojo : C.linea}`,
        borderRadius: 10,
        cursor: "pointer",
        fontSize: 15,
        fontFamily: FONT_BODY,
        width: "100%",
        fontWeight: centro ? 700 : 500,
      }}
    >
      {children}
    </button>
  );
}

function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="qk-opt"
      style={{
        marginTop: 20,
        background: "none",
        border: "none",
        color: C.gris,
        cursor: "pointer",
        fontSize: 13,
        padding: 0,
        fontFamily: FONT_BODY,
      }}
    >
      ← Volver
    </button>
  );
}

function Cargando() {
  return (
    <div className="qk-fade" style={{ padding: "26px 24px", border: `1.5px solid ${C.linea}`, borderRadius: 14, textAlign: "center" }}>
      <div className="qk-pulse" style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: C.tinta }}>
        Calculando tu escenario…
      </div>
      <p style={{ color: C.gris, fontSize: 14, marginTop: 8, marginBottom: 0 }}>
        Reconstruyendo la rentabilidad real mes a mes.
      </p>
    </div>
  );
}

function ErrorCard({ mensaje, onReintentar, onVolver }: { mensaje: string; onReintentar: () => void; onVolver: () => void }) {
  return (
    <div className="qk-fade" role="alert" style={{ padding: "20px 22px", border: `1.5px solid ${C.rojo}`, borderRadius: 14, background: "rgba(200,52,31,0.05)" }}>
      <strong style={{ color: C.rojoHondo, display: "block", marginBottom: 6 }}>No hemos podido calcularlo</strong>
      <p style={{ color: C.tinta, fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>{mensaje}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onReintentar}
          className="qk-opt"
          style={{ flex: 1, background: C.rojo, color: C.papel, border: "none", padding: "11px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: FONT_BODY }}
        >
          Reintentar
        </button>
        <button
          type="button"
          onClick={onVolver}
          className="qk-opt"
          style={{ flex: 1, background: "none", color: C.tinta, border: `1.5px solid ${C.linea}`, padding: "11px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontFamily: FONT_BODY }}
        >
          Cambiar respuestas
        </button>
      </div>
    </div>
  );
}

function Informe({
  mesLabel,
  perfil,
  tipo,
  r,
  cta,
  onReiniciar,
}: {
  mesLabel?: string;
  perfil: number;
  tipo: Tipo;
  r: Resultado;
  cta: CtaConfig;
  onReiniciar: () => void;
}) {
  const ganaK = r.dif >= 0;
  const ganaRatio = r.cartera.ratio >= r.indexa.ratio;
  const desdeTxt = fechaLarga(r.desde) || mesLabel?.toLowerCase() || "";
  const win = (a: number, b: number, higher = true): "k" | "idx" =>
    (higher ? a >= b : a <= b) ? "k" : "idx";
  return (
    <div className="qk-fade">
      <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: C.rojo, fontWeight: 700, marginBottom: 10 }}>
        Tu informe
      </div>

      {/* Resumen del escenario */}
      <p style={{ fontSize: 15, color: C.gris, lineHeight: 1.5, marginTop: 0 }}>
        Cartera <strong style={{ color: C.tinta }}>{tipo === "geografica" ? "Geográfica" : "Sectorial"}</strong>, perfil{" "}
        <strong style={{ color: C.tinta }}>{perfil}/10</strong>, desde{" "}
        <strong style={{ color: C.tinta }}>{desdeTxt}</strong> ({r.meses} meses).
      </p>

      {/* Cifra protagonista */}
      <div style={{ background: C.tinta, color: C.papel, borderRadius: 14, padding: "26px 24px", marginTop: 18 }}>
        <div style={{ fontSize: 13, color: "#B8AE9C", letterSpacing: "0.05em" }}>
          Rentabilidad acumulada de tu Cartera K
        </div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 52, fontWeight: 700, lineHeight: 1, marginTop: 6, color: r.cartera.rent >= 0 ? C.papel : "#E8A598" }}>
          {fmtPct(r.cartera.rent)}
        </div>
        <div style={{ fontSize: 13, color: "#B8AE9C", marginTop: 10 }}>
          Caída máxima en el periodo: <span style={{ color: "#E8A598" }}>{fmtPct(r.cartera.dd)}</span>
        </div>
      </div>

      {/* Comparativa cabeza a cabeza: rentabilidad y riesgo */}
      <h3 style={{ margin: "22px 0 10px", fontSize: 16, fontWeight: 700, fontFamily: FONT_DISPLAY }}>
        Cartera K vs. Roboadvisor (Indexa)
      </h3>
      <div style={{ border: `1.5px solid ${C.linea}`, borderRadius: 14, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr 1fr",
            padding: "10px 14px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.02em",
          }}
        >
          <span />
          <span style={{ textAlign: "right", color: C.rojo }}>Tu Cartera K</span>
          <span style={{ textAlign: "right", color: C.gris }}>Indexa</span>
        </div>
        <FilaMetrica
          label="Rentabilidad"
          kStr={fmtPct(r.cartera.rent)}
          idxStr={fmtPct(r.indexa.rent)}
          winner={win(r.cartera.rent, r.indexa.rent)}
        />
        <FilaMetrica
          label="Rentabilidad anual (CAGR)"
          kStr={fmtPct(r.cartera.cagr)}
          idxStr={fmtPct(r.indexa.cagr)}
          winner={win(r.cartera.cagr, r.indexa.cagr)}
        />
        <FilaMetrica
          label="Volatilidad"
          kStr={fmtVol(r.cartera.vol)}
          idxStr={fmtVol(r.indexa.vol)}
          winner={win(r.cartera.vol, r.indexa.vol, false)}
        />
        <FilaMetrica
          label="Caída máxima"
          kStr={fmtPct(r.cartera.dd)}
          idxStr={fmtPct(r.indexa.dd)}
          winner={win(r.cartera.dd, r.indexa.dd)}
        />
        <FilaMetrica
          label="Rent. / riesgo"
          kStr={fmtRatio(r.cartera.ratio)}
          idxStr={fmtRatio(r.indexa.ratio)}
          winner={win(r.cartera.ratio, r.indexa.ratio)}
        />
      </div>
      <p style={{ fontSize: 11.5, color: C.gris, lineHeight: 1.5, margin: "8px 2px 0" }}>
        Menos volatilidad y menos caída son mejores. «Rent. / riesgo» es la rentabilidad anual
        dividida entre la volatilidad: cuanto más alto, más rentabilidad por cada unidad de riesgo.
        Resaltado en rojo, quién gana cada métrica.
      </p>

      {/* Frase de cierre */}
      <p style={{ fontSize: 15, lineHeight: 1.5, marginTop: 14, padding: "14px 16px", background: C.papelHondo, borderRadius: 10, borderLeft: `3px solid ${ganaK || ganaRatio ? C.rojo : C.gris}` }}>
        {ganaK ? (
          <>
            Tu Cartera K habría rendido <strong style={{ color: C.rojo }}>{fmtPuntos(r.dif)} más</strong> que el mismo
            perfil en un roboadvisor convencional
            {ganaRatio ? (
              <>
                {" "}
                — y además con <strong style={{ color: C.rojo }}>menos riesgo</strong> por el camino.
              </>
            ) : (
              <>. Y sin pagar de más por ello.</>
            )}
          </>
        ) : ganaRatio ? (
          <>
            En rentabilidad bruta se quedó <strong style={{ color: C.tinta }}>{fmtPuntos(r.dif)}</strong> por debajo de
            Indexa, pero con <strong style={{ color: C.rojo }}>menos riesgo</strong>: mejor ratio rentabilidad/riesgo y
            menor caída. A largo plazo, eso es lo que importa.
          </>
        ) : (
          <>
            En este periodo, tu Cartera K se habría quedado <strong style={{ color: C.tinta }}>{fmtPuntos(r.dif)}</strong>{" "}
            por debajo del mismo perfil en Indexa. Los datos son los datos: aquí no se maquillan.
          </>
        )}
      </p>

      {/* CTA */}
      <a
        href={cta.url}
        target="_blank"
        rel="noreferrer"
        className="qk-opt"
        style={{
          display: "block",
          textAlign: "center",
          marginTop: 18,
          background: C.rojo,
          color: C.papel,
          padding: "15px",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 16,
          textDecoration: "none",
        }}
      >
        {cta.label}
      </a>

      <button
        type="button"
        onClick={onReiniciar}
        className="qk-opt"
        style={{
          marginTop: 14,
          width: "100%",
          background: "none",
          border: `1.5px solid ${C.linea}`,
          color: C.tinta,
          padding: "12px",
          borderRadius: 10,
          cursor: "pointer",
          fontSize: 14,
          fontFamily: FONT_BODY,
        }}
      >
        Probar otro escenario
      </button>
    </div>
  );
}

function FilaMetrica({
  label,
  kStr,
  idxStr,
  winner,
}: {
  label: string;
  kStr: string;
  idxStr: string;
  winner: "k" | "idx";
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.3fr 1fr 1fr",
        alignItems: "center",
        padding: "11px 14px",
        borderTop: `1px solid ${C.linea}`,
        fontSize: 14,
      }}
    >
      <span style={{ color: C.gris }}>{label}</span>
      <span
        style={{
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontWeight: winner === "k" ? 700 : 500,
          color: winner === "k" ? C.rojo : C.tinta,
        }}
      >
        {kStr}
      </span>
      <span
        style={{
          textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontWeight: winner === "idx" ? 700 : 500,
          color: winner === "idx" ? C.tinta : C.gris,
        }}
      >
        {idxStr}
      </span>
    </div>
  );
}

// Animaciones, foco visible y respeto a prefers-reduced-motion.
const CSS_GLOBAL = `
  .qk-fade { animation: qkFade .4s ease both; }
  @keyframes qkFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .qk-anim { transition: width .5s ease; }
  .qk-opt { transition: background .15s ease, color .15s ease, border-color .15s ease, transform .08s ease; }
  .qk-opt:active { transform: scale(.98); }
  .qk-opt:focus-visible { outline: 3px solid ${C.rojo}; outline-offset: 2px; }
  .qk-pulse { animation: qkPulse 1.2s ease-in-out infinite; }
  @keyframes qkPulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) {
    .qk-fade, .qk-anim, .qk-opt, .qk-pulse { animation: none !important; transition: none !important; }
    .qk-opt:active { transform: none; }
  }
` as const;
