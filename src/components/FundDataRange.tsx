"use client";

import { useState, useEffect } from "react";
import type { Fund } from "@/lib/types";
import { fetchWithSource } from "@/lib/data-source";

interface DataRangeInfo {
  firstDate: string;
  lastDate: string;
  months: number;
}

interface FundDataRangeProps {
  fund: Fund;
  /** Callback opcional que se dispara cuando el rango se carga.
   *  El padre (PortfolioBuilder) lo usa para acumular firstDate por fundId
   *  y poder ordenar la lista por antigüedad. */
  onRangeLoaded?: (fundId: string, firstDate: string) => void;
}

/**
 * Muestra el rango de datos disponible para un fondo.
 * Hace una llamada a /api/data-range al montarse.
 */
export function FundDataRange({ fund, onRangeLoaded }: FundDataRangeProps) {
  const [range, setRange] = useState<DataRangeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchRange() {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams();
        params.set("fundId", fund.id);
        if (fund.ticker) params.set("ticker", fund.ticker);
        if (fund.isin) params.set("isin", fund.isin);

        const res = await fetchWithSource(`/api/data-range?${params.toString()}`);
        if (!res.ok) throw new Error("fetch failed");

        const data = await res.json();
        if (!cancelled && data.firstDate && data.lastDate) {
          setRange(data);
          onRangeLoaded?.(fund.id, data.firstDate);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRange();
    return () => { cancelled = true; };
  }, [fund.id, fund.ticker, fund.isin, onRangeLoaded]);

  if (loading) {
    return (
      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
        <span className="inline-block w-3 h-3 border border-slate-300 border-t-slate-500 rounded-full animate-spin" />
        Consultando rango de datos...
      </p>
    );
  }

  if (error || !range) {
    return (
      <p className="text-xs text-amber-500 mt-0.5">
        No se pudo obtener el rango de datos
      </p>
    );
  }

  return (
    <p className="text-xs text-blue-600 mt-0.5">
      Datos: <strong>{formatMonth(range.firstDate)}</strong> — <strong>{formatMonth(range.lastDate)}</strong>
      <span className="text-slate-400 ml-1">({range.months} meses)</span>
    </p>
  );
}

function formatMonth(dateStr: string): string {
  const [year, month] = dateStr.split("-");
  const monthNames = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  const idx = parseInt(month || "1", 10) - 1;
  return `${monthNames[idx]} ${year}`;
}
