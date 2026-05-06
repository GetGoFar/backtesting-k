"use client";

import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import type { RentabilidadAnual, SerieTemporal } from "@/lib/informe-fondo";

interface Props {
  nombreFondo: string;
  rentabilidadesAnuales: RentabilidadAnual[];
  drawdowns: SerieTemporal;
  rolling1y: SerieTemporal;
  rolling3y: SerieTemporal;
  rolling5y: SerieTemporal;
}

const COLOR_FONDO = "#dc2626"; // rojo (mismo que en chart principal)
const COLOR_K10 = "#1d4ed8"; // azul

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
  nombreFondo, rentabilidadesAnuales, drawdowns, rolling1y, rolling3y, rolling5y,
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
                <Bar dataKey="k10" name="Cartera K10 Inbestme" fill={COLOR_K10} />
                <Bar dataKey="fondo" name={labelFondo} fill={COLOR_FONDO} />
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
                <Area type="monotone" dataKey="k10" name="Cartera K10 Inbestme" stroke={COLOR_K10} fill={COLOR_K10} fillOpacity={0.15} strokeWidth={1.5} />
                <Area type="monotone" dataKey="fondo" name={labelFondo} stroke={COLOR_FONDO} fill={COLOR_FONDO} fillOpacity={0.15} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Rolling returns con selector */}
      <RollingReturnsSection
        nombreFondo={labelFondo}
        rolling1y={rolling1y}
        rolling3y={rolling3y}
        rolling5y={rolling5y}
      />
    </>
  );
}

interface RollingProps {
  nombreFondo: string;
  rolling1y: SerieTemporal;
  rolling3y: SerieTemporal;
  rolling5y: SerieTemporal;
}

function RollingReturnsSection({ nombreFondo, rolling1y, rolling3y, rolling5y }: RollingProps) {
  const [periodo, setPeriodo] = useState<"1y" | "3y" | "5y">("3y");
  const series = periodo === "1y" ? rolling1y : periodo === "3y" ? rolling3y : rolling5y;
  const labelPeriodo = periodo === "1y" ? "1 año" : periodo === "3y" ? "3 años" : "5 años";

  const data = series.fechas.map((f, i) => ({
    fecha: f,
    fondo: series.valoresFondo[i] ?? 0,
    k10: series.valoresK10[i] ?? 0,
  }));

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    border: "1px solid " + (active ? "#1d4ed8" : "#e5e7eb"),
    background: active ? "#1d4ed8" : "#fff",
    color: active ? "#fff" : "#666",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  return (
    <section style={{ ...cardStyle, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Rentabilidad móvil anualizada</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setPeriodo("1y")} style={btnStyle(periodo === "1y")}>1 año</button>
          <button onClick={() => setPeriodo("3y")} style={btnStyle(periodo === "3y")}>3 años</button>
          <button onClick={() => setPeriodo("5y")} style={btnStyle(periodo === "5y")}>5 años</button>
        </div>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
              formatter={(value: number) => pctFmt(value, 2)}
              labelFormatter={(label: string) => label.slice(0, 10)}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
            <ReferenceLine y={0} stroke="#999" />
            <Line type="monotone" dataKey="k10" name="Cartera K10 Inbestme" stroke={COLOR_K10} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="fondo" name={nombreFondo} stroke={COLOR_FONDO} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888", textAlign: "center" }}>
        Rentabilidad anualizada calculada sobre ventanas móviles de {labelPeriodo}
      </p>
    </section>
  );
}
