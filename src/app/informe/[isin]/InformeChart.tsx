"use client";

// Chart de evolución de patrimonio: fondo del usuario vs Cartera K10 Sectorial.
// Cliente porque Recharts depende de window/measure-on-mount.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Props {
  fechas: string[];
  fondo: number[];
  k10: number[];
  nombreFondo: string;
}

export default function InformeChart({ fechas, fondo, k10, nombreFondo }: Props) {
  // Recharts quiere [{ fecha, fondo, k10 }, ...]
  const data = fechas.map((f, i) => ({
    fecha: f,
    fondo: fondo[i] ?? 0,
    k10: k10[i] ?? 0,
  }));

  // Etiqueta corta para el legend (truncar a 30 chars)
  const labelFondo = nombreFondo.length > 30 ? nombreFondo.slice(0, 27) + "…" : nombreFondo;

  return (
    <div style={{ width: "100%", height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 11, fill: "#666" }}
            tickFormatter={(v) => v.slice(0, 7)}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#666" }}
            tickFormatter={(v) => Math.round(v / 1000) + "k €"}
            width={60}
          />
          <Tooltip
            contentStyle={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
            formatter={(value: number) => Math.round(value).toLocaleString("es-ES") + " €"}
            labelFormatter={(label: string) => label.slice(0, 7)}
          />
          <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
          <Line
            type="monotone"
            dataKey="fondo"
            name={labelFondo}
            stroke="#1d4ed8"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="k10"
            name="Cartera K10 Inbestme"
            stroke="#dc2626"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
