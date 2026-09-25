"use client";

import { useMemo, useState } from "react";
import { simular } from "@/lib/mi-cartera/simulador";
import { eur, numero } from "@/lib/mi-cartera/formato";
import { Boton, Cifra, InputEuros, Tarjeta, Titulo } from "@/components/mi-cartera/ui";
import { GraficoSimulacion } from "@/components/mi-cartera/GraficoSimulacion";

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm text-gris mb-1.5">
        {etiqueta}
      </label>
      {children}
    </div>
  );
}

function InputNumero({ id, valor, onChange, sufijo, paso = 1, min = 0, max }: { id: string; valor: number; onChange: (n: number) => void; sufijo: string; paso?: number; min?: number; max?: number }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(valor) ? valor : ""}
        step={paso}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        className="tabular w-full pr-16 text-right text-lg"
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gris">{sufijo}</span>
    </div>
  );
}

export default function Simuladores() {
  const [capital, setCapital] = useState<number | undefined>(10000);
  const [mensual, setMensual] = useState<number | undefined>(500);
  const [rent, setRent] = useState(6);
  const [anos, setAnos] = useState(20);
  const [inflacion, setInflacion] = useState(3);
  const [entrada, setEntrada] = useState<ReturnType<typeof leer> | undefined>(undefined);
  const [detalle, setDetalle] = useState(false);

  function leer() {
    return {
      capitalInicial: capital ?? 0,
      aportacionMensual: mensual ?? 0,
      rentabilidadAnual: (Number.isFinite(rent) ? rent : 0) / 100,
      anos: Number.isFinite(anos) ? anos : 1,
      inflacionAnual: (Number.isFinite(inflacion) ? inflacion : 0) / 100,
    };
  }

  const resultado = useMemo(() => (entrada ? simular(entrada) : undefined), [entrada]);
  const valido = (capital ?? 0) >= 0 && (mensual ?? 0) >= 0 && Number.isFinite(rent) && Number.isFinite(anos) && anos >= 1;

  return (
    <div className="flex flex-col gap-5">
      <Titulo sub="Una proyección, no una promesa. Sirve para ver el efecto del tiempo y de la constancia.">Simulador de aportaciones</Titulo>

      <Tarjeta>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="capital" etiqueta="Capital inicial">
            <InputEuros id="capital" valor={capital} onChange={setCapital} />
          </Campo>
          <Campo id="mensual" etiqueta="Aportación mensual">
            <InputEuros id="mensual" valor={mensual} onChange={setMensual} />
          </Campo>
          <Campo id="rent" etiqueta="Rentabilidad anual esperada">
            <InputNumero id="rent" valor={rent} onChange={setRent} sufijo="%" paso={0.5} min={-20} max={30} />
          </Campo>
          <Campo id="anos" etiqueta="Años">
            <InputNumero id="anos" valor={anos} onChange={setAnos} sufijo="años" min={1} max={60} />
          </Campo>
          <Campo id="inflacion" etiqueta="Inflación anual">
            <InputNumero id="inflacion" valor={inflacion} onChange={setInflacion} sufijo="%" paso={0.5} min={0} max={20} />
          </Campo>
        </div>
        <div className="mt-5">
          <Boton disabled={!valido} onClick={() => setEntrada(leer())}>
            Simular
          </Boton>
        </div>
      </Tarjeta>

      {resultado && entrada && (
        <Tarjeta className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Cifra etiqueta="Capital aportado" valor={eur(resultado.aportado)} />
            <Cifra etiqueta="Capital estimado final" valor={eur(resultado.valorFinal)} />
            <Cifra etiqueta="Ganancia estimada" valor={eur(resultado.beneficio)} tono={resultado.beneficio >= 0 ? "positivo" : "negativo"} />
          </div>
          <p className="text-sm text-gris -mt-2">
            En euros de hoy, con una inflación del {numero(entrada.inflacionAnual * 100, 1)} %, equivaldría a <span className="tabular text-tinta">{eur(resultado.valorFinalReal)}</span>.
          </p>

          <GraficoSimulacion filas={resultado.filas} />

          <div>
            <Boton variante="secundario" onClick={() => setDetalle(!detalle)}>
              {detalle ? "Ocultar detalle anual" : "Ver detalle anual"}
            </Boton>
          </div>

          {detalle && (
            <div className="overflow-x-auto -mx-5 md:-mx-6">
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="text-gris text-xs uppercase tracking-wide">
                    <th className="px-5 md:px-6 py-2 text-left font-medium">Año</th>
                    <th className="px-3 py-2 text-right font-medium">Aportado</th>
                    <th className="px-3 py-2 text-right font-medium">Estimado</th>
                    <th className="px-5 md:px-6 py-2 text-right font-medium">Ganancia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {resultado.filas.map((f) => (
                    <tr key={f.ano}>
                      <td className="px-5 md:px-6 py-2">{f.ano}</td>
                      <td className="px-3 py-2 text-right">{eur(f.aportado)}</td>
                      <td className="px-3 py-2 text-right">{eur(f.valor)}</td>
                      <td className={`px-5 md:px-6 py-2 text-right ${f.beneficio >= 0 ? "text-verde" : "text-rojo"}`}>{eur(f.beneficio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      )}
    </div>
  );
}
