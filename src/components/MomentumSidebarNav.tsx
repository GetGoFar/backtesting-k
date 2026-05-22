"use client";

// =============================================================================
// MOMENTUM SIDEBAR NAV — Navegación lateral específica para /momentum
// =============================================================================
//
// Misma mecánica que SidebarNav (scroll-spy, colapsable en escritorio, slide-in
// en móvil, persistencia de "colapsado" en localStorage), pero con secciones
// específicas de la página de momentum (universos, parámetros, comparativa,
// equity, ranking vivo, stats, historial, ...).
// =============================================================================

import { useEffect, useRef, useState } from "react";

interface MomentumSidebarNavProps {
  /** Si hay resultados disponibles (afecta a qué secciones se muestran). */
  hasResults: boolean;
  /** Si estamos en modo comparación A vs B (afecta a si hay secciones por
   *  estrategia o sólo una). */
  comparisonMode: boolean;
}

interface NavSection {
  id: string;
  label: string;
  group: "config" | "results";
  icon?: string;
  /** Si está definido, sólo se muestra cuando comparisonMode coincide. */
  requiresComparison?: boolean;
  requiresSingle?: boolean;
}

const ALL_SECTIONS: NavSection[] = [
  // === Configuración ===
  { id: "section-strategies", label: "Estrategias", group: "config", icon: "🎯" },
  // === Resultados ===
  {
    id: "section-comparison",
    label: "Comparativa A vs B",
    group: "results",
    icon: "⚖️",
    requiresComparison: true,
  },
  // Anchor por estrategia en modo comparación (cada uno expone el bloque
  // completo: métricas, equity, ranking, stats, historial).
  {
    id: "section-strategy-a",
    label: "Estrategia A",
    group: "results",
    icon: "🅰️",
    requiresComparison: true,
  },
  {
    id: "section-strategy-b",
    label: "Estrategia B",
    group: "results",
    icon: "🅱️",
    requiresComparison: true,
  },
  // Sub-secciones para modo single
  { id: "section-metrics", label: "Métricas", group: "results", icon: "📊", requiresSingle: true },
  { id: "section-equity", label: "Evolución patrimonio", group: "results", icon: "📈", requiresSingle: true },
  { id: "section-annual", label: "Rentabilidades anuales", group: "results", icon: "📅", requiresSingle: true },
  { id: "section-live", label: "Ranking actual (vivo)", group: "results", icon: "🔴", requiresSingle: true },
  { id: "section-stats", label: "Estadísticas", group: "results", icon: "🎲", requiresSingle: true },
  { id: "section-history", label: "Historial de operaciones", group: "results", icon: "🔁", requiresSingle: true },
];

const COLLAPSED_STORAGE_KEY = "epk-momentum-sidebar-collapsed";

export function MomentumSidebarNav({ hasResults, comparisonMode }: MomentumSidebarNavProps) {
  const [activeSection, setActiveSection] = useState<string>("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored === "true") setIsCollapsed(true);
    } catch {
      // localStorage no disponible
    }
  }, []);

  const setCollapsedPersistent = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // no-op
    }
  };

  const manualClickRef = useRef<number>(0);

  // Filtrar secciones según el modo y disponibilidad de resultados
  const visibleSections = ALL_SECTIONS.filter((s) => {
    if (s.group === "config") return true;
    if (!hasResults) return false;
    if (s.requiresComparison && !comparisonMode) return false;
    if (s.requiresSingle && comparisonMode) return false;
    return true;
  });

  // Scroll-spy
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() - manualClickRef.current < 900) return;
        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topVisible = visibleEntries[0];
          if (topVisible) setActiveSection(topVisible.target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    visibleSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleSections, hasResults, comparisonMode]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      setActiveSection(id);
      manualClickRef.current = Date.now();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileOpen(false);
    }
  };

  const configSections = visibleSections.filter((s) => s.group === "config");
  const resultSections = visibleSections.filter((s) => s.group === "results");

  return (
    <>
      {/* Botón hamburguesa móvil */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-2.5 left-3 z-[60] w-9 h-9 rounded-lg bg-brand-navy text-white shadow-lg flex items-center justify-center"
        aria-label="Abrir menú de navegación"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isMobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-[55]"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Botón flotante para mostrar sidebar colapsado */}
      {isCollapsed && (
        <button
          onClick={() => setCollapsedPersistent(false)}
          className="hidden lg:flex fixed top-20 left-2 z-30 items-center justify-center w-8 h-12 rounded-r-lg bg-white border border-l-0 border-slate-200 text-brand-secondary hover:text-brand-navy hover:bg-slate-50 shadow-md transition-colors"
          aria-label="Mostrar menú de navegación"
          title="Mostrar menú de navegación"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 lg:top-16 left-0 h-screen lg:h-[calc(100vh-4rem)]
          bg-white border-r border-slate-200 shadow-lg lg:shadow-none
          z-[58] lg:z-30 transition-all overflow-y-auto
          ${isCollapsed ? "lg:w-0 lg:border-r-0 lg:overflow-hidden" : "w-64"}
          ${isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className={`p-4 ${isCollapsed ? "lg:hidden" : ""}`}>
          <div className="mb-4 lg:mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-brand-tertiary uppercase tracking-wider">
              Navegación rápida
            </h3>
            <button
              onClick={() => setCollapsedPersistent(true)}
              className="hidden lg:flex items-center justify-center w-6 h-6 rounded text-brand-tertiary hover:text-brand-navy hover:bg-slate-100 transition-colors"
              aria-label="Ocultar menú de navegación"
              title="Ocultar menú"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Configuración */}
          <div className="mb-4">
            <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2 mb-1">
              Configuración
            </p>
            <ul className="space-y-0.5">
              {configSections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => handleClick(section.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                      activeSection === section.id
                        ? "bg-brand-coral/10 text-brand-coral font-medium"
                        : "text-brand-secondary hover:bg-slate-50 hover:text-brand-navy"
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{section.icon}</span>
                    <span className="truncate">{section.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Resultados */}
          {hasResults && resultSections.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2 mb-1">
                Análisis de resultados
              </p>
              <ul className="space-y-0.5">
                {resultSections.map((section) => (
                  <li key={section.id}>
                    <button
                      onClick={() => handleClick(section.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                        activeSection === section.id
                          ? "bg-brand-coral/10 text-brand-coral font-medium"
                          : "text-brand-secondary hover:bg-slate-50 hover:text-brand-navy"
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{section.icon}</span>
                      <span className="truncate">{section.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasResults && (
            <p className="text-xs text-brand-tertiary italic px-2 mt-4">
              Ejecuta la estrategia para ver las secciones de análisis.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
