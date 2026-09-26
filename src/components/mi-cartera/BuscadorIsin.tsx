"use client";

// =============================================================================
// BuscadorIsin — un ISIN que falta se escribe a mano o se busca por el nombre (o el ticker)
// =============================================================================
// Lo usan la revisión de una captura importada (filas que llegaron sin ISIN) y el panel «editar» de
// cada posición. Busca en el catálogo del Laboratorio K y en el mercado (/api/cartera/buscar) y, al
// elegir un resultado, devuelve su ISIN y su nombre oficial. Nada se guarda hasta que el socio elige.

import { useRef, useState } from "react";
import { buscarActivos, type Activo } from "@/lib/mi-cartera/buscar";

export const ES_ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function BuscadorIsin({
  valor,
  nombre,
  ticker,
  onCambio,
  onElegir,
  compacto = false,
}: {
  /** El ISIN actual (puede estar vacío). */
  valor: string;
  /** Con qué buscar: el nombre de la fila y, si lo hay, el ticker del bróker. */
  nombre: string;
  ticker?: string | null;
  /** Cada cambio del texto (ya en mayúsculas); el que lo usa decide cuándo guardarlo. */
  onCambio: (isin: string) => void;
  /** Al elegir un resultado de la búsqueda. */
  onElegir: (activo: Activo) => void;
  /** Sin etiqueta «ISIN» encima (dentro de una rejilla que ya la implica). */
  compacto?: boolean;
}) {
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<Activo[] | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const limpio = valor.trim().toUpperCase();
  const valido = limpio === "" || ES_ISIN_RE.test(limpio);

  const buscar = async () => {
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setBuscando(true);
    setResultados(null);
    try {
      // Primero por el ticker (es lo más preciso); si no da nada, por el nombre.
      const consultas = [ticker?.trim(), nombre.trim()].filter((q): q is string => !!q && q.length >= 2);
      let lista: Activo[] = [];
      for (const q of consultas) {
        lista = await buscarActivos(q, ctrl.current.signal);
        if (lista.length > 0) break;
      }
      setResultados(lista.slice(0, 6));
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  };

  const campo = (
    <div className="flex gap-2">
      <input
        type="text"
        value={valor}
        onChange={(e) => onCambio(e.target.value.toUpperCase())}
        placeholder={compacto ? "ISIN" : "Sin ISIN: escríbelo o búscalo"}
        className={`tabular w-full !py-2 text-sm text-tinta ${valido ? "" : "!border-ambar"}`}
        aria-label="ISIN"
      />
      <button
        type="button"
        onClick={buscar}
        disabled={buscando}
        className="shrink-0 whitespace-nowrap rounded-full border border-borde bg-white px-3 text-sm text-tinta hover:border-tinta disabled:opacity-50"
      >
        {buscando ? "Buscando…" : "Buscar"}
      </button>
    </div>
  );

  return (
    <div className="text-xs text-gris">
      {compacto ? campo : <label className="block">ISIN<div className="mt-1">{campo}</div></label>}
      {!valido && <p className="mt-1 text-ambar">Un ISIN tiene 12 caracteres, por ejemplo IE00B4L5Y983.</p>}
      {resultados && resultados.length === 0 && <p className="mt-1">No encuentro nada con ese nombre. Escribe el ISIN a mano (lo tienes en tu bróker).</p>}
      {resultados && resultados.length > 0 && (
        <ul className="mt-2 divide-y divide-borde rounded-xl border border-borde bg-white">
          {resultados.map((a) => (
            <li key={a.isin}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-tinta hover:bg-crema"
                onClick={() => {
                  setResultados(null);
                  onElegir(a);
                }}
              >
                <span className="min-w-0 truncate">{a.nombre}</span>
                <span className="tabular shrink-0 text-xs text-gris">{a.isin}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
