"use client";

import { useEffect, useRef, useState } from "react";

interface SidebarNavProps {
  /** Si la sección de resultados existe (para mostrar las entradas de análisis) */
  hasResults: boolean;
}

interface NavSection {
  id: string;
  label: string;
  group: "config" | "results";
  icon?: string; // emoji o SVG path
}

const ALL_SECTIONS: NavSection[] = [
  // Configuración
  { id: "section-carteras", label: "Carteras", group: "config", icon: "📁" },
  { id: "section-params", label: "Parámetros backtest", group: "config", icon: "⚙️" },
  // Resultados (solo se muestran si hay datos)
  { id: "section-summary", label: "Resumen comisiones", group: "results", icon: "💰" },
  { id: "section-tax-impact", label: "Cómo afectan los impuestos", group: "results", icon: "🧾" },
  { id: "section-performance", label: "Evolución patrimonio", group: "results", icon: "📈" },
  { id: "section-metrics", label: "Métricas comparativas", group: "results", icon: "📊" },
  { id: "section-assets", label: "Métricas por activo", group: "results", icon: "🎯" },
  { id: "section-correlations", label: "Correlaciones", group: "results", icon: "🔗" },
  { id: "section-annual", label: "Rentabilidades anuales", group: "results", icon: "📅" },
  { id: "section-monthly", label: "Rentabilidades mensuales", group: "results", icon: "🗓️" },
  { id: "section-drawdowns-top", label: "Top 10 drawdowns", group: "results", icon: "📉" },
  { id: "section-stress", label: "Crisis históricas", group: "results", icon: "🌪️" },
  { id: "section-benchmark", label: "Benchmark", group: "results", icon: "🏆" },
  { id: "section-rolling-stats", label: "Ventanas rolling", group: "results", icon: "🔄" },
  { id: "section-rolling-chart", label: "Rolling returns", group: "results", icon: "📜" },
  { id: "section-rebalance-log", label: "Historial de rebalanceos", group: "results", icon: "🔁" },
  { id: "section-histogram", label: "Distribución retornos", group: "results", icon: "📐" },
];

const COLLAPSED_STORAGE_KEY = "epk-sidebar-collapsed";

export function SidebarNav({ hasResults }: SidebarNavProps) {
  const [activeSection, setActiveSection] = useState<string>("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  // Estado "oculto en escritorio" — persistido en localStorage para recordarlo
  // entre sesiones. Inicializamos en false para evitar mismatch SSR/cliente;
  // el efecto siguiente lee el valor real al montar.
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored === "true") setIsCollapsed(true);
    } catch {
      // localStorage no disponible — ignoramos
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

  // Cooldown del observer tras un click manual. Mientras está activo, el
  // observer NO sobreescribe activeSection (porque durante el smooth scroll
  // puede detectar erróneamente la sección anterior/intermedia).
  const manualClickRef = useRef<number>(0);

  const visibleSections = ALL_SECTIONS.filter(
    (s) => s.group === "config" || (s.group === "results" && hasResults)
  );

  // Scroll-spy: detectar qué sección está en el viewport
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Si el usuario acaba de hacer click, ignorar el observer durante 900ms
        // (tiempo aproximado del smooth scroll). El active ya está fijado al
        // valor correcto desde handleClick.
        if (Date.now() - manualClickRef.current < 900) return;

        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          visibleEntries.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          const topVisible = visibleEntries[0];
          if (topVisible) setActiveSection(topVisible.target.id);
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      }
    );

    visibleSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [visibleSections, hasResults]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      // Marcar la sección como activa inmediatamente, antes incluso de scroll
      setActiveSection(id);
      // Registrar timestamp para que el observer no nos sobreescriba durante
      // el smooth scroll (puede pasar por secciones intermedias).
      manualClickRef.current = Date.now();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileOpen(false);
    }
  };

  const configSections = visibleSections.filter((s) => s.group === "config");
  const resultSections = visibleSections.filter((s) => s.group === "results");

  return (
    <>
      {/* Botón hamburguesa solo en móvil — por encima del header sticky */}
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

      {/* Backdrop móvil — cubre todo incluido el header (z-50) */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-[55]"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Botón flotante "Mostrar menú" — solo cuando el sidebar está colapsado
          en escritorio. Pegado al borde izquierdo, debajo del header sticky. */}
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
            {/* Botón colapsar — sólo escritorio */}
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

          {/* Grupo: Configuración */}
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

          {/* Grupo: Resultados (solo si hay datos) */}
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
              Ejecuta un backtest para ver las secciones de análisis.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
