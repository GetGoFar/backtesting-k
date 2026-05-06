"use client";

import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { RentabilidadAnual, SerieTemporal } from "@/lib/informe-fondo";

interface Props {
  nombreFondo: string;
  rentabilidadesAnuales: RentabilidadAnual[];
  drawdowns: SerieTemporal;
}

// Colores unificados con el chart principal (InformeChart.tsx):
// fondo del usuario = azul, Cartera K10 = rojo.
const COLOR_FONDO = "#1d4ed8"; // azul (fondo del usuario)
const COLOR_K10 = "#dc2626"; // rojo (Cartera K10)

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

function pctFmt(v: number, dec = 1): string {
  return v.toFixed(dec).replace(".", ",") + " %";
}

export default function InformeChartsExtra({
  nombreFondo, rentabilidadesAnuales, drawdowns,
}: Props) {
  const labelFondo = nombreFondo.length > 28 ? nombreFondo.slice(0, 25) + "…" : nombreFondo;

  return (
    <>
      {/* Rentabilidades anuales + Drawdowns en grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, marginTop: 16 }}>
        {/* Rentabilidades anuales */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Rentabilidades anuales</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rentabilidadesAnuales} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="ano" tick={{ fontSize: 11, fill: "#666" }} />
                <YAxis tick={{ fontSize: 11, fill: "#666" }} tickFormatter={(v) => v.toFixed(0) + "%"} width={45} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => pctFmt(value, 1)}
                  labelFormatter={(label) => `Año ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                <ReferenceLine y={0} stroke="#999" strokeDasharray="0" />
                <Bar dataKey="fondo" name={labelFondo} fill={COLOR_FONDO} />
                <Bar dataKey="k10" name="Cartera K10 Inbestme" fill={COLOR_K10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Drawdowns */}
        <section style={cardStyle}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600 }}>Drawdowns (caídas desde máximos)</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={drawdowns.fechas.map((f, i) => ({
                  fecha: f,
                  fondo: drawdowns.valoresFondo[i] ?? 0,
                  k10: drawdowns.valoresK10[i] ?? 0,
                }))}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="fecha"
                  tick={{ fontSize: 11, fill: "#666" }}
                  tickFormatter={(v) => (typeof v === "string" ? v.slice(0, 4) : "")}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#666" }}
                  tickFormatter={(v) => v.toFixed(0) + "%"}
                  width={45}
                />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number) => pctFmt(value, 1)}
                  labelFormatter={(label: string) => label.slice(0, 10)}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
                <Area type="monotone" dataKey="fondo" name={labelFondo} stroke={COLOR_FONDO} fill={COLOR_FONDO} fillOpacity={0.15} strokeWidth={1.5} />
                <Area type="monotone" dataKey="k10" name="Cartera K10 Inbestme" stroke={COLOR_K10} fill={COLOR_K10} fillOpacity={0.15} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </>
  );
}
