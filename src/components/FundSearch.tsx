"use client";

import { useState, useRef, useEffect } from "react";
import type { Fund } from "@/lib/types";

interface FundSearchProps {
  onSelect: (fund: Fund) => void;
  excludeIds?: string[];
}

export function FundSearch({ onSelect, excludeIds = [] }: FundSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (value: string) => {
    setQuery(value);

    if (value.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    try {
      const response = await fetch(
        `/api/funds?search=${encodeURIComponent(value)}`
      );
      const data = await response.json();
      // Filtrar fondos ya añadidos
      const filtered = (data.funds || []).filter(
        (fund: Fund) => !excludeIds.includes(fund.id)
      );
      setResults(filtered);
    } catch (error) {
      console.error("Error buscando fondos:", error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (fund: Fund) => {
    onSelect(fund);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Buscar fondo por nombre, ISIN o categoría..."
          className="w-full px-4 py-2.5 pl-10 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
        />
        <svg
          className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Resultados */}
      {isOpen && results.length > 0 && (
        <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-64 overflow-auto">
          {results.map((fund) => (
            <li
              key={fund.id}
              onClick={() => handleSelect(fund)}
              className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full mt-0.5 ${
                    fund.type === "index"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {fund.type === "index" ? "Indexado" : "Activo"}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900">
                    {fund.shortName}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5">
                    <span>{fund.isin}</span>
                    <span className="text-slate-300">•</span>
                    <span>TER: {fund.ter}%</span>
                    <span className="text-slate-300">•</span>
                    <span>{fund.category}</span>
                    {fund.bank && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-amber-600">{fund.bank}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Sin resultados */}
      {isOpen && query.length >= 2 && !isLoading && results.length === 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-center text-sm text-slate-500">
          No se encontraron fondos para &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
