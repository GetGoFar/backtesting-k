"use client";

// =============================================================================
// REPORT GENERATOR MODAL
// =============================================================================
//
// Modal donde el usuario elige las secciones que quiere incluir en el PDF.
// Soporta presets rápidos (Básico/Estándar/Completo) y checklist personalizado.
//
// =============================================================================

import { useState, useMemo } from "react";
import type { BacktestResponse } from "@/lib/types";
import {
  REPORT_SECTIONS,
  PRESET_LABELS,
  PRESET_SECTIONS,
  type ReportPreset,
  type ReportSectionId,
  type ReportConfig,
} from "@/lib/report-types";

interface ReportGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  results: BacktestResponse;
}

// Todas las secciones del backtest completo están implementadas en report-pdf.ts.
const SECTIONS_NOT_YET_IMPLEMENTED: ReportSectionId[] = [];

export function ReportGeneratorModal({ open, onClose, results }: ReportGeneratorModalProps) {
  const hasA = !!results.resultA;
  const hasB = !!results.resultB;

  const [preset, setPreset] = useState<ReportPreset>("completo");
  const [selectedSections, setSelectedSections] = useState<Set<ReportSectionId>>(
    new Set(PRESET_SECTIONS.completo)
  );
  const [primaryPortfolio, setPrimaryPortfolio] = useState<"a" | "b">(hasA ? "a" : "b");
  // Con dos carteras, el informe es COMPARATIVO por defecto (no hay que elegir una).
  const [comparative, setComparative] = useState<boolean>(hasA && hasB);
  // Base de las rentabilidades principales del informe (valor final / CAGR).
  const [valueMode, setValueMode] = useState<"bruto" | "camino" | "liquidar">("camino");
  const [clientName, setClientName] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePresetChange = (newPreset: ReportPreset) => {
    setPreset(newPreset);
    if (newPreset !== "personalizado") {
      setSelectedSections(new Set(PRESET_SECTIONS[newPreset]));
    }
  };

  const toggleSection = (id: ReportSectionId) => {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setPreset("personalizado");
  };

  const estimatedPages = useMemo(() => {
    return REPORT_SECTIONS.reduce(
      (sum, s) => (selectedSections.has(s.id) ? sum + (s.pages ?? 1) : sum),
      0
    );
  }, [selectedSections]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const config: ReportConfig = {
        sections: REPORT_SECTIONS
          .filter((s) => selectedSections.has(s.id))
          .map((s) => s.id),
        primaryPortfolio,
        comparative: hasA && hasB && comparative,
        clientName: clientName.trim() || undefined,
        valueMode,
      };

      // Carga dinámica del generador de PDF (lazy: solo cuando el usuario
      // decide generar, evita engordar el bundle inicial de la app).
      const { generateReportPDF } = await import("@/lib/report-pdf");
      const blob = generateReportPDF(results, config);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `informe-${primaryPortfolio.toUpperCase()}-${new Date().toISOString().substring(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar el informe");
    } finally {
      setGenerating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-brand-navy">Generar informe PDF</h2>
            <p className="text-xs text-brand-tertiary mt-0.5">
              Elige las secciones que quieres incluir
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {/* Body scrollable */}
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Tipo de informe: comparativo (default con 2 carteras) o una sola */}
          {(hasA && hasB) && (
            <div>
              <label className="block text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">
                Tipo de informe
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setComparative(true)}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg border transition-colors ${
                    comparative
                      ? "bg-brand-coral text-white border-brand-coral"
                      : "bg-white text-brand-navy border-slate-200 hover:border-brand-coral"
                  }`}
                >
                  Comparativo A vs B
                </button>
                <button
                  type="button"
                  onClick={() => { setComparative(false); setPrimaryPortfolio("a"); }}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg border transition-colors ${
                    !comparative && primaryPortfolio === "a"
                      ? "bg-brand-navy text-white border-brand-navy"
                      : "bg-white text-brand-navy border-slate-200 hover:border-brand-coral"
                  }`}
                >
                  Solo {results.resultA?.portfolioName ?? "A"}
                </button>
                <button
                  type="button"
                  onClick={() => { setComparative(false); setPrimaryPortfolio("b"); }}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg border transition-colors ${
                    !comparative && primaryPortfolio === "b"
                      ? "bg-brand-navy text-white border-brand-navy"
                      : "bg-white text-brand-navy border-slate-200 hover:border-brand-coral"
                  }`}
                >
                  Solo {results.resultB?.portfolioName ?? "B"}
                </button>
              </div>
              {comparative && (
                <p className="text-xs text-brand-tertiary mt-2">
                  Compara ambas carteras cara a cara: veredicto, métricas, evolución, año a año,
                  caídas, ventanas móviles, costes{(results.resultA?.fees.taxMode && results.resultA.fees.taxMode !== "none") || (results.resultB?.fees.taxMode && results.resultB.fees.taxMode !== "none") ? " e impuestos" : ""} y conclusiones.
                </p>
              )}
            </div>
          )}

          {/* Base de las rentabilidades principales */}
          <div>
            <label className="block text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">
              Rentabilidades principales
            </label>
            <div className="flex gap-2">
              {([
                ["bruto", "Brutas", "Antes de impuestos"],
                ["camino", "Neta del camino", "Lo que ves hoy"],
                ["liquidar", "Al liquidar", "Tras Hacienda"],
              ] as const).map(([mode, title, sub]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setValueMode(mode)}
                  className={`flex-1 px-3 py-2 rounded-lg border transition-colors text-left ${
                    valueMode === mode
                      ? "bg-brand-coral text-white border-brand-coral"
                      : "bg-white text-brand-navy border-slate-200 hover:border-brand-coral"
                  }`}
                >
                  <span className="block text-sm font-medium leading-tight">{title}</span>
                  <span className={`block text-[11px] ${valueMode === mode ? "text-white/80" : "text-brand-tertiary"}`}>{sub}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-brand-tertiary mt-2">
              Define sobre qué base se muestran el valor final y la rentabilidad (CAGR) en todo el
              informe. El riesgo (volatilidad, Sharpe, caídas) no cambia, y la sección de impuestos
              sigue mostrando los tres escenarios.
            </p>
          </div>

          {/* Cliente opcional */}
          <div>
            <label className="block text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">
              Cliente (opcional)
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nombre del destinatario"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
            />
          </div>

          {/* Plantilla y secciones: solo en modo de una sola cartera
              (el comparativo tiene su propio conjunto fijo de secciones). */}
          {!comparative && (
          <>
          {/* Preset selector */}
          <div>
            <label className="block text-xs font-semibold text-brand-navy uppercase tracking-wider mb-2">
              Plantilla
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(PRESET_LABELS) as ReportPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                    preset === p
                      ? "bg-brand-coral text-white border-brand-coral"
                      : "bg-white text-brand-secondary border-slate-200 hover:border-brand-coral"
                  }`}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist de secciones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-brand-navy uppercase tracking-wider">
                Secciones a incluir
              </label>
              <span className="text-xs text-brand-tertiary tabular-nums">
                ~{estimatedPages} páginas
              </span>
            </div>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto border border-slate-100 rounded-lg p-2 bg-slate-50">
              {REPORT_SECTIONS.map((section) => {
                const isSelected = selectedSections.has(section.id);
                const isRequired = section.required;
                const notImplemented = SECTIONS_NOT_YET_IMPLEMENTED.includes(section.id);
                return (
                  <label
                    key={section.id}
                    className={`flex items-start gap-3 p-2 rounded-md transition-colors ${
                      isRequired ? "bg-slate-100" : "bg-white hover:bg-slate-100 cursor-pointer"
                    } ${notImplemented ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={isRequired || notImplemented}
                      onChange={() => toggleSection(section.id)}
                      className="mt-0.5 w-4 h-4 accent-brand-coral cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm">{section.emoji}</span>
                        <span className="text-sm font-semibold text-brand-navy">
                          {section.title}
                        </span>
                        {isRequired && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            Obligatoria
                          </span>
                        )}
                        {notImplemented && (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            Próximamente
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-tertiary mt-0.5 leading-snug">
                        {section.description}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
          </>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 text-sm text-brand-secondary hover:text-brand-navy disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || selectedSections.size === 0}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-brand-coral text-white hover:bg-brand-coral/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {generating && (
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {generating ? "Generando…" : "Generar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
