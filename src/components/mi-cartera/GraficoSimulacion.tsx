"use client";

import type { FilaSimulacion } from "@/lib/mi-cartera/simulador";

function etiquetaEuros(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€`;
  if (v >= 1000) return `${Math.round(v / 1000)} k€`;
  return `${Math.round(v)} €`;
}

function escalaBonita(max: number): number[] {
  const bruto = max / 4;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? pot * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + paso * 0.001; v += paso) ticks.push(v);
  return ticks;
}

export function GraficoSimulacion({ filas }: { filas: FilaSimulacion[] }) {
  if (filas.length === 0) return null;
  const W = 640;
  const H = 260;
  const m = { top: 12, right: 12, bottom: 28, left: 56 };
  const w = W - m.left - m.right;
  const h = H - m.top - m.bottom;

  const maxY = Math.max(...filas.map((f) => f.valor));
  const ticksY = escalaBonita(maxY);
  const topY = ticksY[ticksY.length - 1] ?? maxY;
  const n = filas.length;

  const x = (i: number) => m.left + (i / n) * w;
  const y = (v: number) => m.top + h - (v / topY) * h;

  const puntos = (sel: (f: FilaSimulacion) => number) => [`${x(0)},${y(0)}`, ...filas.map((f, i) => `${x(i + 1)},${y(sel(f))}`)];
  const area = (sel: (f: FilaSimulacion) => number) => `M${puntos(sel).join(" L")} L${x(n)},${y(0)} Z`;
  const linea = (sel: (f: FilaSimulacion) => number) => `M${puntos(sel).join(" L")}`;

  const ticksX = n <= 10 ? filas.map((f) => f.ano) : filas.filter((f) => f.ano % 5 === 0).map((f) => f.ano);

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Evolución del capital aportado y del capital estimado">
        {ticksY.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={W - m.right} y1={y(t)} y2={y(t)} stroke="#202020" strokeOpacity="0.08" />
            <text x={m.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8A8580">
              {etiquetaEuros(t)}
            </text>
          </g>
        ))}
        {ticksX.map((a) => (
          <text key={a} x={x(a)} y={H - 8} textAnchor="middle" fontSize="11" fill="#8A8580">
            {a}
          </text>
        ))}
        <path d={area((f) => f.valor)} fill="#C81E2E" fillOpacity="0.10" />
        <path d={area((f) => f.aportado)} fill="#202020" fillOpacity="0.10" />
        <path d={linea((f) => f.valor)} fill="none" stroke="#C81E2E" strokeWidth="2.2" strokeLinejoin="round" />
        <path d={linea((f) => f.aportado)} fill="none" stroke="#202020" strokeWidth="1.6" strokeOpacity="0.55" strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-2 flex gap-5 text-sm text-gris">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-k" /> Capital estimado
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-tinta/50" /> Capital aportado
        </span>
      </figcaption>
    </figure>
  );
}
