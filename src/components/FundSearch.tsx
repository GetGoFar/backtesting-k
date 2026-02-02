"use client";

import { useState, useRef, useEffect } from "react";
import type { Fund } from "@/lib/types";

// Resultado de Yahoo Finance
interface YahooResult {
  symbol: string;
  name: string;
  shortName: string;
  exchange: string;
  type: string;
  typeDisplay: string;
}

interface FundSearchProps {
  onSelect: (fund: Fund) => void;
  excludeIds?: string[];
}

export function FundSearch({ onSelect, excludeIds = [] }: FundSearchProps) {
  const [query, setQuery] = useState("");
  const [localResults, setLocalResults] = useState<Fund[]>([]);
  const [yahooResults, setYahooResults] = useState<YahooResult[]>([]);
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
      setLocalResults([]);
      setYahooResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    setIsOpen(true);

    try {
      // Buscar en paralelo: base de datos local + Yahoo Finance
      const [localResponse, yahooResponse] = await Promise.all([
        fetch(`/api/funds?search=${encodeURIComponent(value)}`),
        fetch(`/api/yahoo-search?q=${encodeURIComponent(value)}`),
      ]);

      const localData = await localResponse.json();
      const yahooData = await yahooResponse.json();

      // Filtrar fondos ya añadidos de resultados locales
      const filteredLocal = (localData.funds || []).filter(
        (fund: Fund) => !excludeIds.includes(fund.id)
      );
      setLocalResults(filteredLocal);

      // Filtrar resultados de Yahoo que ya están en local (por símbolo similar)
      const localSymbols = new Set(
        filteredLocal.map((f: Fund) => f.yahooTicker?.toUpperCase())
      );
      const filteredYahoo = (yahooData.results || []).filter(
        (r: YahooResult) => !localSymbols.has(r.symbol.toUpperCase())
      );
      setYahooResults(filteredYahoo);
    } catch (error) {
      console.error("Error buscando fondos:", error);
      setLocalResults([]);
      setYahooResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectLocal = (fund: Fund) => {
    onSelect(fund);
    setQuery("");
    setLocalResults([]);
    setYahooResults([]);
    setIsOpen(false);
  };

  const handleSelectYahoo = (result: YahooResult) => {
    // Convertir resultado de Yahoo a Fund
    const fund: Fund = {
      id: `yahoo-${result.symbol.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
      name: result.name,
      shortName: result.shortName,
      isin: result.symbol, // Usamos el símbolo como identificador
      yahooTicker: result.symbol,
      ter: 0.2, // TER estimado por defecto (el usuario puede ajustarlo)
      category: "RV Global", // Categoría por defecto
      type: "index", // Asumimos indexado por defecto para ETFs
      currency: "EUR",
    };
    onSelect(fund);
    setQuery("");
    setLocalResults([]);
    setYahooResults([]);
    setIsOpen(false);
  };

  const hasResults = localResults.length > 0 || yahooResults.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Buscar fondo por nombre, ISIN o ticker (ej: IWDA, SPY, MSCI)..."
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
      {isOpen && hasResults && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-80 overflow-auto">
          {/* Resultados locales (base de datos) */}
          {localResults.length > 0 && (
            <>
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Fondos preconfigurados
                </span>
              </div>
              <ul>
                {localResults.map((fund) => (
                  <li
                    key={fund.id}
                    onClick={() => handleSelectLocal(fund)}
                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors"
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
            </>
          )}

          {/* Resultados de Yahoo Finance */}
          {yahooResults.length > 0 && (
            <>
              <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-200">
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                  Yahoo Finance
                </span>
              </div>
              <ul>
                {yahooResults.map((result) => (
                  <li
                    key={result.symbol}
                    onClick={() => handleSelectYahoo(result)}
                    className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full mt-0.5 bg-indigo-100 text-indigo-700">
                        {result.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-900">
                          {result.shortName}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5">
                          <span className="font-mono text-indigo-600">{result.symbol}</span>
                          <span className="text-slate-300">•</span>
                          <span>{result.exchange}</span>
                          {result.typeDisplay && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span>{result.typeDisplay}</span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 truncate">
                          {result.name}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Sin resultados */}
      {isOpen && query.length >= 2 && !isLoading && !hasResults && (
        <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-4 text-center text-sm text-slate-500">
          No se encontraron fondos para &quot;{query}&quot;
        </div>
      )}
    </div>
  );
}
