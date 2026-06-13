"use client";

// =============================================================================
// MOMENTUM SIDEBAR NAV — Navegación lateral específica para /momentum
// =============================================================================
//
// Misma mecánica que SidebarNav (scroll-spy, colapsable en escritorio, slide-in
// en móvil, persistencia de "colapsado" en localStorage), pero con secciones
// específicas de la página de momentum.
//
// MODO SINGLE: lista plana de secciones (config + resultados).
// MODO A/B: las sub-secciones se anidan visualmente bajo "Estrategia A" y
//   "Estrategia B" (con sangría), de forma que al scrollear por la página el
//   menú destaca exactamente en qué bloque de qué estrategia estás.
// =============================================================================

import { useEffect, useRef, useState } from "react";

interface MomentumSidebarNavProps {
  /** Si hay resultados disponibles (afecta a qué secciones se muestran). */
  hasResults: boolean;
  /** Si estamos en modo comparación A vs B (afecta a si hay anidación A/B). */
  comparisonMode: boolean;
  /** Nombre legible de la estrategia A (modo A/B). Default "Estrategia A". */
  nameA?: string;
  /** Nombre legible de la estrategia B (modo A/B). Default "Estrategia B". */
  nameB?: string;
}

interface NavItem {
  /** ID del elemento al que hace scroll (sin el prefijo "section-"). */
  baseId: string;
  /** Etiqueta visible en el menú. */
  label: string;
  /** Emoji o ícono pequeño. */
  icon?: string;
  /** Si true, se renderiza con sangría (sub-sección). */
  nested?: boolean;
}

const COLLAPSED_STORAGE_KEY = "epk-momentum-sidebar-collapsed";

// Sub-secciones que aparecen DENTRO de cada estrategia, en orden de scroll.
// Coinciden con los IDs que añade MomentumResultsView vía su prop idSuffix.
const STRATEGY_SUBSECTIONS: NavItem[] = [
  { baseId: "metrics", label: "Métricas", icon: "📊", nested: true },
  { baseId: "equity", label: "Evolución patrimonio", icon: "📈", nested: true },
  { baseId: "annual", label: "Rentabilidades anuales", icon: "📅", nested: true },
  { baseId: "monthly", label: "Calor mensual", icon: "🗓️", nested: true },
  { baseId: "live", label: "Ranking actual (vivo)", icon: "🔴", nested: true },
  { baseId: "attribution", label: "Atribución por activo", icon: "🧮", nested: true },
  { baseId: "stats", label: "Estadísticas", icon: "🎲", nested: true },
  { baseId: "history", label: "Historial de operaciones", icon: "🔁", nested: true },
];

export function MomentumSidebarNav({
  hasResults,
  comparisonMode,
  nameA = "Estrategia A",
  nameB = "Estrategia B",
}: MomentumSidebarNavProps) {
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

  // === Construir la lista de items según el modo ===
  // Cada item tiene `id` con el prefijo "section-" listo para document.getElementById.
  type SidebarItem = {
    id: string;
    label: string;
    icon?: string;
    nested?: boolean;
    /** Header de grupo (no clicable, sólo etiqueta). */
    isGroupHeader?: boolean;
  };

  const configItems: SidebarItem[] = [
    { id: "section-strategies", label: "Estrategias", icon: "🎯" },
  ];

  const resultItems: SidebarItem[] = [];
  if (hasResults) {
    if (comparisonMode) {
      resultItems.push({
        id: "section-comparison",
        label: "Comparativa A vs B",
        icon: "⚖️",
      });
      // Grupo Estrategia A (anchor en la cabecera del bloque + sub-secciones)
      resultItems.push({
        id: "section-strategy-a",
        label: nameA,
        icon: "🅰️",
      });
      for (const sub of STRATEGY_SUBSECTIONS) {
        resultItems.push({
          id: `section-${sub.baseId}-a`,
          label: sub.label,
          icon: sub.icon,
          nested: true,
        });
      }
      // Grupo Estrategia B
      resultItems.push({
        id: "section-strategy-b",
        label: nameB,
        icon: "🅱️",
      });
      for (const sub of STRATEGY_SUBSECTIONS) {
        resultItems.push({
          id: `section-${sub.baseId}-b`,
          label: sub.label,
          icon: sub.icon,
          nested: true,
        });
      }
    } else {
      // Single mode: lista plana
      for (const sub of STRATEGY_SUBSECTIONS) {
        resultItems.push({
          id: `section-${sub.baseId}`,
          label: sub.label,
          icon: sub.icon,
        });
      }
    }
  }

  const allItems = [...configItems, ...resultItems];

  // Scroll-spy: observamos todos los items con id que existan en el DOM
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() - manualClickRef.current < 900) return;
        // Excluimos los anchors PADRE (section-strategy-a / section-strategy-b)
        // del cálculo del activo porque son contenedores muy grandes que
        // engloban a TODAS las sub-secciones: si los dejamos competir, su
        // boundingClientRect.top es siempre el más negativo (porque empiezan
        // muy arriba) y ganarían sobre la sub-sección real visible. Estos
        // anchors siguen siendo observables a efectos de scroll-on-click,
        // sólo no participan en el "highlight by scroll".
        const visibleEntries = entries.filter(
          (e) =>
            e.isIntersecting &&
            !e.target.id.startsWith("section-strategy-") &&
            e.target.id !== "section-strategies"
        );
        if (visibleEntries.length > 0) {
          // Preferimos la entry cuyo top sea >= 0 (justo debajo del borde
          // superior del viewport) con el menor top — es la sección "en la
          // que estamos ahora". Si ninguna tiene top >= 0, caemos a la que
          // tenga el top más cercano a 0 desde abajo (la que está justo
          // por encima del viewport).
          const above = visibleEntries.filter((e) => e.boundingClientRect.top >= 0);
          const pool = above.length > 0 ? above : visibleEntries;
          pool.sort((a, b) => {
            const ta = a.boundingClientRect.top;
            const tb = b.boundingClientRect.top;
            // Si ambos >= 0, el menor (más cerca del top del viewport) gana
            if (ta >= 0 && tb >= 0) return ta - tb;
            // Si ambos < 0, el mayor (más cerca de 0) gana
            return tb - ta;
          });
          const topVisible = pool[0];
          if (topVisible) setActiveSection(topVisible.target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    allItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasResults, comparisonMode, nameA, nameB]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      setActiveSection(id);
      manualClickRef.current = Date.now();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileOpen(false);
    }
  };

  function renderItem(item: SidebarItem) {
    const isActive = activeSection === item.id;
    return (
      <li key={item.id}>
        <button
          onClick={() => handleClick(item.id)}
          className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
            item.nested ? "pl-6 text-[13px]" : ""
          } ${
            isActive
              ? "bg-brand-coral/10 text-brand-coral font-medium"
              : "text-brand-secondary hover:bg-slate-50 hover:text-brand-navy"
          }`}
        >
          {item.icon && (
            <span className={`flex-shrink-0 ${item.nested ? "text-sm" : "text-base"}`}>
              {item.icon}
            </span>
          )}
          <span className="truncate">{item.label}</span>
        </button>
      </li>
    );
  }

  return (
    <>
      {/* Botón hamburguesa móvil — un poco más a la derecha para no taparlo
          con el logo K en pantallas pequeñas. */}
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

      {/* Botón flotante para mostrar sidebar colapsado en escritorio */}
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
          ${isCollapsed ? "lg:w-0 lg:border-r-0 lg:overflow-hidden" : "w-72 sm:w-64"}
          ${isMobileOpen ? "translate-x-0 w-72 sm:w-64" : "-translate-x-full lg:translate-x-0"}
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
            <ul className="space-y-0.5">{configItems.map(renderItem)}</ul>
          </div>

          {/* Resultados */}
          {hasResults && resultItems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2 mb-1">
                Análisis de resultados
              </p>
              <ul className="space-y-0.5">{resultItems.map(renderItem)}</ul>
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
