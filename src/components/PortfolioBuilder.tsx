"use client";

import { useState, useEffect, useCallback } from "react";
import { FundSearch } from "./FundSearch";
import { FundDataRange } from "./FundDataRange";
import type { Fund, PortfolioPreset, PortfolioHolding, RebalanceFrequency } from "@/lib/types";
import { getAllPresets } from "@/lib/portfolio-presets";
import { getFundById } from "@/lib/fund-database";

// Tipo interno para manejar allocaciones con datos completos del fondo
export interface FundAllocation {
  fund: Fund;
  weight: number;
}

interface PortfolioBuilderProps {
  side: "a" | "b";
  onUpdate: (data: {
    name: string;
    holdings: PortfolioHolding[];
    isValid: boolean;
    managementFee: number;
    /** Modo fiscal de la cartera */
    taxMode: "none" | "flat" | "spain-irpf";
    /** Tasa impositiva fija (decimal, ej: 0.21) — solo aplica en modo "flat" */
    taxRate: number;
    /** Frecuencia de rebalanceo de esta cartera */
    rebalanceFrequency: RebalanceFrequency;
    /** Banda relativa en % (UI), 0 = desactivada */
    rebalanceBandRelativePct: number;
    /** Banda absoluta en % (UI), 0 = desactivada */
    rebalanceBandAbsolutePct: number;
  }) => void;
}

// Colores según el side — estilo El Proyecto K
const SIDE_COLORS = {
  a: {
    bg: "bg-white",
    border: "border-brand-border",
    headerBg: "bg-brand-navy",
    accent: "blue",
    ring: "ring-brand-coral",
  },
  b: {
    bg: "bg-white",
    border: "border-brand-border",
    headerBg: "bg-brand-coral",
    accent: "rose",
    ring: "ring-brand-coral",
  },
};

export function PortfolioBuilder({ side, onUpdate }: PortfolioBuilderProps) {
  const [allocations, setAllocations] = useState<FundAllocation[]>([]);
  const defaultName = side === "a" ? "Cartera A" : "Cartera B";
  const [name, setName] = useState(defaultName);
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [managementFee, setManagementFee] = useState(0);
  // Modo fiscal: "none" = sin impuestos (fondos con traspaso), "flat" = tasa fija
  // (otros países o personalización), "spain-irpf" = tramos progresivos del IRPF
  // español sobre el ahorro (19%/21%/23%/27%/28%).
  const [taxMode, setTaxMode] = useState<"none" | "flat" | "spain-irpf">("none");
  // Tasa fija a aplicar cuando taxMode = "flat" (porcentaje en UI, ej: 21)
  const [taxRatePct, setTaxRatePct] = useState(21);
  // Rebalanceo por cartera (cada cartera tiene su propia configuración).
  // Permite comparar la MISMA composición con frecuencias/bandas distintas.
  const [rebalanceFrequencyLocal, setRebalanceFrequencyLocal] =
    useState<RebalanceFrequency>("annual");
  const [bandRelativePct, setBandRelativePct] = useState(0);
  const [bandAbsolutePct, setBandAbsolutePct] = useState(0);
  // Modo "Activo satélite": al añadir, los pesos existentes se reescalan
  // proporcionalmente para hacer hueco al nuevo activo
  const [satelliteMode, setSatelliteMode] = useState(false);
  const [satelliteWeight, setSatelliteWeight] = useState(10);

  const presets = getAllPresets();
  const colors = SIDE_COLORS[side];

  // Calcular peso total
  const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
  const isValid = allocations.length > 0 && Math.abs(totalWeight - 100) <= 2;

  // Notificar cambios al padre
  const notifyUpdate = useCallback(() => {
    onUpdate({
      name,
      holdings: allocations.map((a) => ({
        fundId: a.fund.id,
        weight: a.weight,
        // Incluir datos del fondo para fondos dinámicos (Yahoo Finance)
        fund: a.fund.id.startsWith("yahoo-") ? a.fund : undefined,
      })),
      isValid,
      managementFee,
      taxMode,
      taxRate: taxRatePct / 100, // UI en %, motor en decimal
      rebalanceFrequency: rebalanceFrequencyLocal,
      rebalanceBandRelativePct: bandRelativePct,
      rebalanceBandAbsolutePct: bandAbsolutePct,
    });
  }, [name, allocations, isValid, managementFee, taxMode, taxRatePct,
      rebalanceFrequencyLocal, bandRelativePct, bandAbsolutePct,
      onUpdate]);

  useEffect(() => {
    notifyUpdate();
  }, [notifyUpdate]);

  // Auto-nombre: si el usuario no editó manualmente, actualizar según contexto
  const updateAutoName = useCallback(
    (allocs: FundAllocation[], presetId: string | null) => {
      if (nameManuallyEdited) return;
      if (presetId) {
        const preset = presets.find((p) => p.id === presetId);
        if (preset) {
          setName(preset.name);
          return;
        }
      }
      if (allocs.length === 1 && allocs[0]) {
        // Preferir el nombre completo del fondo; si es demasiado largo, usar shortName
        // pero nunca usar shortName si parece un ticker (contiene puntos o es solo mayúsculas/números)
        const fund = allocs[0].fund;
        const looksLikeTicker = /^[A-Z0-9.]{2,15}$/.test(fund.shortName);
        const displayName = looksLikeTicker ? fund.name : (fund.shortName || fund.name);
        // Truncar a 40 chars para que quepa en el header
        setName(displayName.length > 40 ? displayName.substring(0, 37) + "..." : displayName);
        return;
      }
      setName(defaultName);
    },
    [nameManuallyEdited, presets, defaultName]
  );

  // Marcar como personalizada cuando se modifica manualmente
  const markAsCustom = () => {
    if (selectedPresetId !== null) {
      setSelectedPresetId(null);
    }
  };

  const handleAddFund = (fund: Fund) => {
    // Evitar duplicados
    if (allocations.some((a) => a.fund.id === fund.id)) return;

    let newAllocs: FundAllocation[];

    // Modo satélite: reescalar pesos existentes proporcionalmente
    // para hacer hueco al nuevo activo con weight = satelliteWeight
    const currentTotal = allocations.reduce((sum, a) => sum + a.weight, 0);
    const canRescale =
      satelliteMode &&
      allocations.length > 0 &&
      currentTotal > 0 &&
      satelliteWeight > 0 &&
      satelliteWeight < 100;

    if (canRescale) {
      const scale = (100 - satelliteWeight) / currentTotal;
      const rescaled = allocations.map((a) => ({
        ...a,
        weight: Math.round(a.weight * scale * 100) / 100,
      }));
      // Ajuste de redondeo: la diferencia hasta (100 - satelliteWeight) la absorbe el primero
      const rescaledTotal = rescaled.reduce((sum, a) => sum + a.weight, 0);
      const delta = Math.round((100 - satelliteWeight - rescaledTotal) * 100) / 100;
      if (rescaled.length > 0 && Math.abs(delta) > 0) {
        rescaled[0] = {
          ...rescaled[0]!,
          weight: Math.round((rescaled[0]!.weight + delta) * 100) / 100,
        };
      }
      newAllocs = [...rescaled, { fund, weight: satelliteWeight }];
    } else {
      newAllocs = [...allocations, { fund, weight: 0 }];
    }

    setAllocations(newAllocs);
    markAsCustom();
    updateAutoName(newAllocs, null);
  };

  const handleRemoveFund = (fundId: string) => {
    const newAllocs = allocations.filter((a) => a.fund.id !== fundId);
    setAllocations(newAllocs);
    markAsCustom();
    updateAutoName(newAllocs, null);
  };

  const handleWeightChange = (fundId: string, weight: number) => {
    setAllocations(
      allocations.map((a) =>
        a.fund.id === fundId
          ? { ...a, weight: Math.min(100, Math.max(0, weight)) }
          : a
      )
    );
    markAsCustom();
  };

  // Reparte 100% equiponderado entre todos los activos.
  // El último activo absorbe el redondeo para que la suma sea exactamente 100.
  const handleEqualizeWeights = () => {
    if (allocations.length === 0) return;
    const n = allocations.length;
    const baseWeight = Math.floor((100 / n) * 100) / 100; // 2 decimales redondeado a la baja
    const remainder = Math.round((100 - baseWeight * n) * 100) / 100;
    const newAllocations = allocations.map((a, idx) => ({
      ...a,
      weight: idx === n - 1 ? Math.round((baseWeight + remainder) * 100) / 100 : baseWeight,
    }));
    setAllocations(newAllocations);
    markAsCustom();
  };

  const handleTerChange = (fundId: string, ter: number) => {
    setAllocations(
      allocations.map((a) =>
        a.fund.id === fundId
          ? { ...a, fund: { ...a.fund, ter: Math.max(0, ter) } }
          : a
      )
    );
    markAsCustom();
  };

  const handlePresetSelect = (preset: PortfolioPreset) => {
    // Convertir holdings del preset a allocaciones con fondos completos
    const presetAllocations: FundAllocation[] = [];
    for (const holding of preset.holdings) {
      const fund = getFundById(holding.fundId);
      if (fund) {
        presetAllocations.push({ fund, weight: holding.weight });
      }
    }

    // Modo satélite: si hay cartera actual, INSERTAR el preset en lugar de reemplazar
    const currentTotal = allocations.reduce((sum, a) => sum + a.weight, 0);
    const presetTotal = presetAllocations.reduce((sum, a) => sum + a.weight, 0);
    const canInsertAsSatellite =
      satelliteMode &&
      allocations.length > 0 &&
      currentTotal > 0 &&
      presetTotal > 0 &&
      satelliteWeight > 0 &&
      satelliteWeight < 100;

    if (canInsertAsSatellite) {
      // 1) Reescalar pesos existentes a (100 - satelliteWeight)
      const existingScale = (100 - satelliteWeight) / currentTotal;
      // 2) Reescalar pesos del preset para que sumen satelliteWeight
      const presetScale = satelliteWeight / presetTotal;

      // Mapa fundId → allocation final (combinando duplicados si los hay)
      const merged = new Map<string, FundAllocation>();

      for (const a of allocations) {
        merged.set(a.fund.id, {
          fund: a.fund,
          weight: Math.round(a.weight * existingScale * 100) / 100,
        });
      }

      for (const a of presetAllocations) {
        const existing = merged.get(a.fund.id);
        const scaledWeight = Math.round(a.weight * presetScale * 100) / 100;
        if (existing) {
          merged.set(a.fund.id, {
            fund: a.fund,
            weight: Math.round((existing.weight + scaledWeight) * 100) / 100,
          });
        } else {
          merged.set(a.fund.id, { fund: a.fund, weight: scaledWeight });
        }
      }

      const mergedAllocations = Array.from(merged.values());

      // Ajuste de redondeo: la diferencia con 100 la absorbe el primer activo
      const mergedTotal = mergedAllocations.reduce((sum, a) => sum + a.weight, 0);
      const delta = Math.round((100 - mergedTotal) * 100) / 100;
      if (mergedAllocations.length > 0 && Math.abs(delta) > 0) {
        mergedAllocations[0] = {
          ...mergedAllocations[0]!,
          weight: Math.round((mergedAllocations[0]!.weight + delta) * 100) / 100,
        };
      }

      setAllocations(mergedAllocations);
      setSelectedPresetId(null); // ya no es un preset puro
      setShowPresetDropdown(false);
      // Auto-nombrar: "<nombre actual> + <satélite> N%"
      setNameManuallyEdited(false);
      setName(`${name} + ${preset.name} ${satelliteWeight}%`);
      return;
    }

    // Modo normal: reemplazar la cartera con el preset
    setAllocations(presetAllocations);
    setSelectedPresetId(preset.id);
    setShowPresetDropdown(false);
    // Reset manual edit flag — preset name takes over
    setNameManuallyEdited(false);
    setName(preset.name);
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    setNameManuallyEdited(true);
  };

  // Calcular TER medio ponderado
  const weightedTer =
    totalWeight > 0
      ? allocations.reduce((sum, a) => sum + a.fund.ter * a.weight, 0) /
        totalWeight
      : 0;

  // Obtener IDs de fondos ya añadidos para excluir del buscador
  const excludedFundIds = allocations.map((a) => a.fund.id);

  // Agrupar presets por tipo
  const inbestmePresets = presets.filter((p) => p.id.startsWith("k-inbestme"));
  const sectorialUSAPresets = presets.filter((p) => p.id.startsWith("k-sectorial-usa"));
  const geograficaUSAPresets = presets.filter((p) => p.id.startsWith("k-geografica-usa"));
  const geograficaUCITPresets = presets.filter((p) => p.id.startsWith("k-geografica-ucit"));
  const indexaUSAPresets = presets.filter((p) => p.id.startsWith("indexa-usa-"));
  const indexaPresets = presets.filter((p) => p.id.startsWith("indexa-") && !p.id.startsWith("indexa-usa-"));
  const indexPresets = presets.filter((p) => p.type === "index"
    && !p.id.startsWith("k-inbestme")
    && !p.id.startsWith("k-sectorial-usa")
    && !p.id.startsWith("k-geografica-usa")
    && !p.id.startsWith("k-geografica-ucit")
    && !p.id.startsWith("indexa-"));
  const bancaPrivadaPresets = presets.filter((p) => p.id.startsWith("banca-privada"));
  const alternativosCanigueralPresets = presets.filter((p) => p.id.startsWith("alternativos-canigueral"));
  const activePresets = presets.filter((p) => p.type === "active" && !p.id.startsWith("banca-privada") && !p.id.startsWith("alternativos-canigueral"));

  return (
    <div
      className={`${colors.bg} border ${colors.border} rounded-lg overflow-hidden shadow-sm`}
    >
      {/* Header con color */}
      <div className={`${colors.headerBg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold text-sm">
              {side.toUpperCase()}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="font-semibold text-white bg-transparent border-b border-dashed border-white/30 hover:border-white/60 focus:border-white focus:outline-none px-1 placeholder-white/60 max-w-[200px]"
              placeholder="Nombre de la cartera"
              title="Haz clic para editar el nombre"
            />
            <svg className="w-3.5 h-3.5 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          {selectedPresetId && (
            <span className="text-xs text-white/70 bg-white/10 px-2 py-1 rounded">
              Preset
            </span>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Selector de preset */}
        <div className="relative">
          <button
            onClick={() => setShowPresetDropdown(!showPresetDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50 transition-colors"
          >
            <span className="text-slate-600">
              {satelliteMode && allocations.length > 0
                ? `🛰️ Añadir cartera satélite al ${satelliteWeight}%...`
                : selectedPresetId
                ? presets.find((p) => p.id === selectedPresetId)?.name
                : "Seleccionar cartera predefinida..."}
            </span>
            <svg
              className={`w-5 h-5 text-slate-400 transition-transform ${
                showPresetDropdown ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showPresetDropdown && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-96 overflow-auto">
              {/* Carteras K Inbestme (1-10) */}
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider px-2 py-1">
                  Carteras K Inbestme (1-10) <span className="text-[10px] font-normal text-indigo-300">· EUR</span>
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {inbestmePresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={`text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors ${
                        selectedPresetId === preset.id ? "bg-indigo-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="font-medium text-xs text-slate-800">
                          {preset.name.replace("Cartera ", "")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Carteras K Sectorial USA (1-9, X) — ETFs USD */}
              {sectorialUSAPresets.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider px-2 py-1">
                    Carteras K Sectorial USA (1-9, X) <span className="text-[10px] font-normal text-orange-400">· USD</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {sectorialUSAPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={`text-left px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors ${
                          selectedPresetId === preset.id ? "bg-orange-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="font-medium text-xs text-slate-800">
                            {preset.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Carteras K Geográfica USA (1-9, X) — fondos Vanguard USD */}
              {geograficaUSAPresets.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-teal-600 uppercase tracking-wider px-2 py-1">
                    Carteras K Geográfica USA (1-9, X) <span className="text-[10px] font-normal text-teal-400">· USD</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {geograficaUSAPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={`text-left px-2 py-1.5 rounded-lg hover:bg-teal-50 transition-colors ${
                          selectedPresetId === preset.id ? "bg-teal-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-teal-500" />
                          <span className="font-medium text-xs text-slate-800">
                            {preset.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Carteras K Geográfica UCIT (1-10) */}
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-sky-600 uppercase tracking-wider px-2 py-1">
                  Carteras K Geográfica UCIT (1-10) <span className="text-[10px] font-normal text-sky-400">· EUR</span>
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {geograficaUCITPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={`text-left px-2 py-1.5 rounded-lg hover:bg-sky-50 transition-colors ${
                        selectedPresetId === preset.id ? "bg-sky-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        <span className="font-medium text-xs text-slate-800">
                          {preset.name.replace("Cartera ", "")}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Carteras Indexa Capital (1-10) */}
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider px-2 py-1">
                  Indexa Capital (1-10) <span className="text-[10px] font-normal text-emerald-400">· EUR</span>
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {indexaPresets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={`text-left px-2 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors ${
                        selectedPresetId === preset.id ? "bg-emerald-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="font-medium text-xs text-slate-800">
                          {preset.name}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Carteras Indexa USA ETFs (1-10) — réplica desde Portfoliovisualizer */}
              {indexaUSAPresets.length > 0 && (
                <div className="p-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider px-2 py-1">
                    Indexa USA ETFs (1-10) <span className="text-[10px] font-normal text-rose-400">· USD</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {indexaUSAPresets.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={`text-left px-2 py-1.5 rounded-lg hover:bg-rose-50 transition-colors ${
                          selectedPresetId === preset.id ? "bg-rose-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          <span className="font-medium text-xs text-slate-800">
                            {preset.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Carteras Tradicionales (Indexadas) */}
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Carteras Tradicionales
                </p>
                {indexPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Banca Privada */}
              {bancaPrivadaPresets.length > 0 && (
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider px-2 py-1">
                  Banca Privada
                </p>
                {bancaPrivadaPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-amber-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
              )}

              {/* Fondos Alternativos */}
              {alternativosCanigueralPresets.length > 0 && (
              <div className="p-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-2 py-1">
                  Fondos Alternativos
                </p>
                {alternativosCanigueralPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-purple-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-purple-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
              )}

              {/* Carteras Bancarias */}
              <div className="p-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Carteras Bancarias (Activas)
                </p>
                {activePresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetSelect(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-rose-50 transition-colors ${
                      selectedPresetId === preset.id ? "bg-rose-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      <span className="font-medium text-sm text-slate-800">
                        {preset.name}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 ml-4 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modo activo satélite */}
        {allocations.length > 0 && (
          <div className={`rounded-lg border p-3 transition-colors ${
            satelliteMode ? "border-brand-coral/40 bg-brand-coral/5" : "border-slate-200 bg-slate-50/50"
          }`}>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={satelliteMode}
                onChange={(e) => setSatelliteMode(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-brand-coral focus:ring-brand-coral/50"
              />
              <span className="text-sm font-medium text-brand-navy">
                Modo activo satélite
              </span>
              <span className="text-xs text-brand-tertiary">
                — Al añadir un activo <em>o cartera</em>, los pesos actuales se reescalan en proporción
              </span>
            </label>

            {satelliteMode && (
              <div className="mt-3 space-y-2 pl-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-brand-secondary">
                    Peso del satélite:
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    value={satelliteWeight}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 99) setSatelliteWeight(v);
                    }}
                    className="w-16 px-2 py-1 text-sm font-semibold border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-coral/30 focus:border-brand-coral"
                  />
                  <span className="text-sm font-semibold text-brand-navy">%</span>
                  <span className="text-xs text-brand-tertiary ml-1">
                    → la cartera actual se reescala al {100 - satelliteWeight}%
                  </span>
                </div>
                <p className="text-xs text-brand-coral/80 italic">
                  💡 Funciona también al seleccionar otra cartera predefinida: se inserta como satélite en vez de reemplazar
                </p>
              </div>
            )}
          </div>
        )}

        {/* Buscador de fondos */}
        <FundSearch onSelect={handleAddFund} excludeIds={excludedFundIds} />

        {/* Lista de fondos */}
        <div className="space-y-2">
          {allocations.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg
                className="w-12 h-12 mx-auto mb-2 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p className="text-sm">Selecciona un preset o busca fondos</p>
            </div>
          ) : (
            allocations.map((allocation) => (
              <div
                key={allocation.fund.id}
                className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 shadow-sm"
              >
                {/* Badge de tipo */}
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                    allocation.fund.type === "index"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {allocation.fund.type === "index" ? "Indexado" : "Activo"}
                </span>

                {/* Info del fondo */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate" title={allocation.fund.name}>
                    {allocation.fund.name !== allocation.fund.shortName && allocation.fund.name.length > allocation.fund.shortName.length
                      ? allocation.fund.name
                      : allocation.fund.shortName}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {/* Mostrar ISIN si es un ISIN real (2 letras + 10 chars), si no el ticker */}
                    {/^[A-Z]{2}[A-Z0-9]{10}$/.test(allocation.fund.isin)
                      ? allocation.fund.isin
                      : allocation.fund.yahooTicker || allocation.fund.isin}
                  </p>
                  <FundDataRange fund={allocation.fund} />
                  {/* TER editable */}
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs text-slate-500">TER:</span>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.01"
                      value={allocation.fund.ter}
                      onChange={(e) =>
                        handleTerChange(
                          allocation.fund.id,
                          Number(e.target.value)
                        )
                      }
                      className={`w-14 px-1 py-0.5 text-xs text-right border rounded focus:outline-none focus:ring-1 focus:ring-brand-coral ${
                        allocation.fund.terConfirmed === false
                          ? "border-amber-400 bg-amber-50"
                          : "border-slate-200"
                      }`}
                      title={
                        allocation.fund.terConfirmed === false
                          ? "TER no confirmado — edita el valor correcto"
                          : "Editar TER"
                      }
                    />
                    <span className="text-xs text-slate-500">%</span>
                    {allocation.fund.terConfirmed === false && (
                      <span
                        className="text-amber-500 cursor-help text-xs font-bold"
                        title="TER no confirmado. Morningstar no devolvió dato fiable. Edita el campo con el valor real."
                      >
                        ⚠
                      </span>
                    )}
                  </div>
                </div>

                {/* Input de peso */}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={allocation.weight}
                    onChange={(e) =>
                      handleWeightChange(
                        allocation.fund.id,
                        Number(e.target.value)
                      )
                    }
                    className={`w-16 px-2 py-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:${colors.ring}`}
                  />
                  <span className="text-sm text-slate-400">%</span>
                </div>

                {/* Botón eliminar */}
                <button
                  onClick={() => handleRemoveFund(allocation.fund.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Eliminar fondo"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Botón vaciar cartera */}
        {allocations.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setAllocations([]);
                setSelectedPresetId(null);
                setNameManuallyEdited(false);
                setName(defaultName);
                setManagementFee(0);
                setTaxMode("none");
                setTaxRatePct(21);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 hover:border-red-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Vaciar cartera
            </button>
          </div>
        )}

        {/* Resumen de peso y TER */}
        {allocations.length > 0 && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            {/* Peso total + botón equiponderar */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Peso total:</span>
                {allocations.length >= 2 && (
                  <button
                    onClick={handleEqualizeWeights}
                    title={`Repartir 100% equiponderado entre los ${allocations.length} activos`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-brand-coral hover:bg-brand-coral/10 rounded-md transition-colors border border-brand-coral/30"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Equiponderar
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-24 h-2 rounded-full overflow-hidden ${
                    isValid ? "bg-emerald-100" : "bg-amber-100"
                  }`}
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      isValid ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${Math.min(totalWeight, 100)}%` }}
                  />
                </div>
                <span
                  className={`font-bold text-sm ${
                    isValid ? "text-emerald-600" : "text-amber-600"
                  }`}
                >
                  {totalWeight.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Mensaje de validación */}
            {!isValid && (
              <p
                className={`text-xs ${
                  totalWeight < 98 ? "text-amber-600" : "text-amber-600"
                }`}
              >
                {totalWeight < 98
                  ? `Faltan ${(100 - totalWeight).toFixed(0)}% por asignar`
                  : totalWeight > 102
                  ? `Excedido por ${(totalWeight - 100).toFixed(0)}%`
                  : "Los pesos deben sumar 100%"}
              </p>
            )}

            {/* TER promedio */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-600">TER promedio ponderado:</span>
              <span
                className={`font-medium ${
                  weightedTer < 0.5 ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                {weightedTer.toFixed(2)}%
              </span>
            </div>

            {/* Comisión de gestión adicional */}
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600">Comisión de gestión:</span>
                <span
                  className="text-slate-400 cursor-help"
                  title="Comisión adicional del gestor/robo-advisor/banco sobre el total de la cartera (se descuenta mensualmente del valor). Ejemplos: Inbestme ~0.40%, Indexa ~0.44%, Banco ~0.50-1.00%"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.01"
                  value={managementFee}
                  onChange={(e) => setManagementFee(Math.max(0, Number(e.target.value)))}
                  className="w-16 px-1.5 py-0.5 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-coral"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            </div>

            {/* Fiscalidad de rebalanceo — selector de modo */}
            <div className="pt-2 border-t border-dashed border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Fiscalidad al rebalancear
                </span>
                <span
                  className="text-slate-400 cursor-help"
                  title="Aplica a ETFs (cada venta realiza plusvalías). Los fondos de inversión españoles son exentos por la figura del traspaso. El modo IRPF España calcula automáticamente los tramos progresivos en función de la plusvalía realizada cada año."
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>

              {/* Selector de modo (3 botones tipo tabs) */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg text-[10px] font-medium">
                <button
                  type="button"
                  onClick={() => setTaxMode("none")}
                  className={`py-1.5 px-1 rounded-md transition-colors ${
                    taxMode === "none"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-slate-500 hover:text-brand-navy"
                  }`}
                  title="Sin impuestos: fondos de inversión españoles (traspaso exento)"
                >
                  Sin impuestos
                </button>
                <button
                  type="button"
                  onClick={() => setTaxMode("spain-irpf")}
                  className={`py-1.5 px-1 rounded-md transition-colors ${
                    taxMode === "spain-irpf"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-slate-500 hover:text-brand-navy"
                  }`}
                  title="Tramos progresivos del IRPF español sobre el ahorro: 19% (hasta 6k€/año), 21% (6k-50k), 23% (50k-200k), 27% (200k-300k), 28% (+300k)"
                >
                  IRPF España
                </button>
                <button
                  type="button"
                  onClick={() => setTaxMode("flat")}
                  className={`py-1.5 px-1 rounded-md transition-colors ${
                    taxMode === "flat"
                      ? "bg-white text-brand-navy shadow-sm"
                      : "text-slate-500 hover:text-brand-navy"
                  }`}
                  title="Tasa fija personalizable (útil para otros países o casos específicos)"
                >
                  Tasa fija
                </button>
              </div>

              {/* Descripción / input según el modo seleccionado */}
              {taxMode === "none" && (
                <p className="text-[11px] text-slate-500 italic leading-snug">
                  Sin coste fiscal — apropiado para fondos de inversión españoles
                  (los traspasos entre fondos están exentos de tributación).
                </p>
              )}

              {taxMode === "spain-irpf" && (
                <div className="text-[11px] text-slate-600 leading-snug">
                  <p className="mb-1">
                    Tramos automáticos del IRPF sobre el ahorro (cómputo anual de plusvalías):
                  </p>
                  <ul className="space-y-0.5 ml-3">
                    <li>• Hasta 6.000 €: <strong>19%</strong></li>
                    <li>• 6.000 – 50.000 €: <strong>21%</strong></li>
                    <li>• 50.000 – 200.000 €: <strong>23%</strong></li>
                    <li>• 200.000 – 300.000 €: <strong>27%</strong></li>
                    <li>• Más de 300.000 €: <strong>28%</strong></li>
                  </ul>
                </div>
              )}

              {taxMode === "flat" && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">Tasa fija:</span>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={taxRatePct}
                      onChange={(e) => setTaxRatePct(Math.max(0, Math.min(50, Number(e.target.value))))}
                      className="w-16 px-1.5 py-0.5 text-xs text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-coral"
                    />
                    <span className="text-xs text-slate-500">%</span>
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    Útil para otros países o tasas fijas (ej: ganancias a corto plazo
                    en EEUU, planes específicos…).
                  </p>
                </div>
              )}
            </div>

            {/* Rebalanceo de esta cartera */}
            <div className="pt-2 border-t border-dashed border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Rebalanceo
                </span>
                <span
                  className="text-slate-400 cursor-help"
                  title="Frecuencia y bandas de rebalanceo de esta cartera. Si configuras una banda (>0), sustituye al rebalanceo por frecuencia. Cada cartera puede tener una configuración distinta para comparar estrategias."
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>

              <div className="space-y-2.5">
                {/* Frecuencia local */}
                <div>
                  <span className="block text-[11px] text-slate-600 mb-1">Frecuencia</span>
                  <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-lg text-[10px] font-medium">
                    {[
                      { value: "monthly", label: "Mensual" },
                      { value: "quarterly", label: "Trimestral" },
                      { value: "annual", label: "Anual" },
                      { value: "none", label: "Sin reb." },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRebalanceFrequencyLocal(opt.value as RebalanceFrequency)}
                        className={`py-1.5 px-1 rounded-md transition-colors ${
                          rebalanceFrequencyLocal === opt.value
                            ? "bg-white text-brand-navy shadow-sm"
                            : "text-slate-500 hover:text-brand-navy"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bandas locales */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-600">Banda rel.</span>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          value={bandRelativePct}
                          onChange={(e) =>
                            setBandRelativePct(Math.max(0, Math.min(100, Number(e.target.value))))
                          }
                          className="w-12 px-1 py-0.5 text-[11px] text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-coral"
                        />
                        <span className="text-[10px] text-slate-500">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-600">Banda abs.</span>
                      <div className="flex items-center gap-0.5">
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="1"
                          value={bandAbsolutePct}
                          onChange={(e) =>
                            setBandAbsolutePct(Math.max(0, Math.min(50, Number(e.target.value))))
                          }
                          className="w-12 px-1 py-0.5 text-[11px] text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-coral"
                        />
                        <span className="text-[10px] text-slate-500">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 italic leading-snug">
                  {(bandRelativePct > 0 || bandAbsolutePct > 0) ? (
                    <>
                      <strong className="text-brand-coral not-italic">⚡ Bandas activas:</strong>{" "}
                      la frecuencia indica cuándo se <strong>revisan</strong> las bandas;
                      solo se rebalancea si están rotas en ese momento.{" "}
                      {rebalanceFrequencyLocal === "none" && <>Con "Sin reb." se revisan <strong>cada día</strong>.</>}
                      {rebalanceFrequencyLocal === "monthly" && <>Se revisan el <strong>1 de cada mes</strong>.</>}
                      {rebalanceFrequencyLocal === "quarterly" && <>Se revisan <strong>cada trimestre</strong>.</>}
                      {rebalanceFrequencyLocal === "annual" && <>Se revisan <strong>cada enero</strong>.</>}
                    </>
                  ) : (
                    <>Sin bandas: rebalanceo periódico clásico en la frecuencia seleccionada.</>
                  )}
                </p>
              </div>
            </div>

            {/* Coste total anual (TER + gestión) */}
            {managementFee > 0 && (
              <div className="flex justify-between items-center text-sm pt-1 border-t border-dashed border-slate-200">
                <span className="text-slate-700 font-medium">Coste total anual:</span>
                <span className={`font-bold ${(weightedTer + managementFee) < 0.8 ? "text-emerald-600" : "text-amber-600"}`}>
                  {(weightedTer + managementFee).toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Función auxiliar para convertir allocaciones a holdings del API
export function allocationsToHoldings(
  allocations: FundAllocation[]
): PortfolioHolding[] {
  return allocations.map((a) => ({
    fundId: a.fund.id,
    weight: a.weight,
  }));
}
