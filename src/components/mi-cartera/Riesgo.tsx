"use client";

import { useEffect, useState } from "react";
import type { Posicion } from "@/lib/mi-cartera/cartera";
import { calcularRiesgo, claveDe, type Riesgo } from "@/lib/mi-cartera/riesgo";
import { pct } from "@/lib/mi-cartera/formato";
import { Tarjeta } from "@/components/mi-cartera/ui";

export function useRiesgo(posiciones: Posicion[]): { riesgo?: Riesgo; cargando: boolean; error: boolean } {
  const clave = claveDe(posiciones);
  const [estado, setEstado] = useState<{ clave: string; riesgo?: Riesgo; cargando: boolean; error: boolean }>({ clave: "", cargando: false, error: false });

  useEffect(() => {
    if (!clave) return;
    const ctrl = new AbortController();
    setEstado({ clave, cargando: true, error: false });
    calcularRiesgo(posiciones, ctrl.signal)
      .then((r) => setEstado({ clave, riesgo: r, cargando: false, error: false }))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setEstado({ clave, cargando: false, error: true });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (estado.clave !== clave) return { cargando: !!clave, error: false };
  return { riesgo: estado.riesgo, cargando: estado.cargando, error: estado.error };
}

function mesAnoCorto(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { month: "short", year: "numeric" });
}

export function TarjetaRiesgo({ posiciones, perfilDeclarado }: { posiciones: Posicion[]; perfilDeclarado?: number }) {
  const { riesgo, cargando, error } = useRiesgo(posiciones);
  const conIsin = posiciones.some((p) => p.isin && (p.valor || 0) > 0);
  if (!conIsin) return null;

  return (
    <Tarjeta>
      <h2 className="text-xl">Riesgo que asumes</h2>
      {cargando && !riesgo && <p className="mt-3 text-sm text-gris">Calculando con datos reales de tus activos…</p>}
      {error && !riesgo && <p className="mt-3 text-sm text-gris">No he podido calcular la volatilidad ahora mismo. Vuelve a intentarlo más tarde.</p>}
      {riesgo && (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <p className="tabular font-serif text-4xl">
              Perfil {riesgo.perfil}
              {riesgo.oMas ? "+" : ""}
              <span className="text-2xl text-gris-2">/10</span>
            </p>
            <p className="tabular text-gris">
              Volatilidad anual {pct(riesgo.volatilidad)} <span className="text-gris-2">·</span> {mesAnoCorto(riesgo.desde)} a {mesAnoCorto(riesgo.hasta)} ({Math.max(1, Math.round(riesgo.meses / 12))} años)
            </p>
          </div>
          {riesgo.volatilidadPeor !== undefined && riesgo.perfilPeor !== undefined && (
            <p className="tabular mt-2 text-[15px]">
              En el peor tramo de tres años{riesgo.peorHasta ? ` (hasta ${mesAnoCorto(riesgo.peorHasta)})` : ""}: {pct(riesgo.volatilidadPeor)}, como un perfil {riesgo.perfilPeor}.
            </p>
          )}
          {perfilDeclarado !== undefined && (
            <p className="mt-3 text-[15px] leading-relaxed">
              {riesgo.perfil > perfilDeclarado
                ? `Tu test dio ${perfilDeclarado}/10: tu cartera se mueve más de lo que dijiste que aguantas.`
                : riesgo.perfil < perfilDeclarado
                  ? `Tu test dio ${perfilDeclarado}/10: tu cartera se mueve menos de lo que podrías asumir.`
                  : `Coincide con tu test (${perfilDeclarado}/10).`}
            </p>
          )}
          <p className="mt-2 text-sm text-gris">
            Con esta volatilidad, un año de tres desviaciones equivale a un −{pct(riesgo.caidaExtrema, 0)}.
            {Number.isFinite(riesgo.caidaMaxima) && riesgo.caidaMaxima < 0 && ` La peor caída real del periodo fue del −${pct(Math.abs(riesgo.caidaMaxima), 0)}.`}
          </p>
          {riesgo.cobertura < 0.995 && (
            <p className="mt-2 text-xs text-gris">
              Calculado con el {pct(riesgo.cobertura, 0)} de tu cartera. Sin datos: {riesgo.sinDatos.join(", ")}.
            </p>
          )}
          <p className="mt-2 text-xs text-gris">
            Volatilidad histórica de tus activos en el periodo en que todos tienen datos, con la tabla de perfiles de El Proyecto K como referencia. No es una previsión.
            {riesgo.sinCrisis.length > 0 && ` El periodo no incluye ${riesgo.sinCrisis.join(" ni ")}: en una década tranquila el riesgo real es mayor de lo que parece.`}
          </p>
        </>
      )}
    </Tarjeta>
  );
}
