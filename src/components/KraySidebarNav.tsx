"use client";

// =============================================================================
// K-RAY SIDEBAR NAV — Navegación lateral para /kray
// =============================================================================

import { useEffect, useRef, useState } from "react";

interface KraySidebarNavProps {
  hasResults: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  group: "config" | "results";
}

const ALL: NavItem[] = [
  { id: "section-portfolio", label: "Cartera analizada", group: "config", icon: "🎯" },
  { id: "section-overview", label: "Resumen", group: "results", icon: "📋" },
  { id: "section-asset-class", label: "Clase de activo", group: "results", icon: "🧮" },
  { id: "section-sectors", label: "Sectores", group: "results", icon: "🏭" },
  { id: "section-regions", label: "Regiones", group: "results", icon: "🌍" },
  { id: "section-countries", label: "Países", group: "results", icon: "🗺️" },
  { id: "section-top-holdings", label: "Top 10 posiciones", group: "results", icon: "🏆" },
  { id: "section-duplicates", label: "Duplicidades", group: "results", icon: "🔁" },
  { id: "section-funds", label: "Detalle por fondo", group: "results", icon: "📁" },
];

const COLLAPSED_STORAGE_KEY = "epk-kray-sidebar-collapsed";

export function KraySidebarNav({ hasResults }: KraySidebarNavProps) {
  const [activeSection, setActiveSection] = useState("");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored === "true") setIsCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  const setCollapsedPersistent = (c: boolean) => {
    setIsCollapsed(c);
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, c ? "true" : "false");
    } catch {
      // ignore
    }
  };

  const manualClickRef = useRef(0);
  const visible = ALL.filter(
    (s) => s.group === "config" || (s.group === "results" && hasResults)
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() - manualClickRef.current < 900) return;
        const vis = entries.filter((e) => e.isIntersecting);
        if (vis.length > 0) {
          vis.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (vis[0]) setActiveSection(vis[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    visible.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [visible, hasResults]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      setActiveSection(id);
      manualClickRef.current = Date.now();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setIsMobileOpen(false);
    }
  };

  const configs = visible.filter((s) => s.group === "config");
  const results = visible.filter((s) => s.group === "results");

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-2.5 left-3 z-[60] w-9 h-9 rounded-lg bg-brand-navy text-white shadow-lg flex items-center justify-center"
        aria-label="Abrir menú"
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
        <div className="lg:hidden fixed inset-0 bg-black/40 z-[55]" onClick={() => setIsMobileOpen(false)} />
      )}

      {isCollapsed && (
        <button
          onClick={() => setCollapsedPersistent(false)}
          className="hidden lg:flex fixed top-20 left-2 z-30 items-center justify-center w-8 h-12 rounded-r-lg bg-white border border-l-0 border-slate-200 text-brand-secondary hover:text-brand-navy hover:bg-slate-50 shadow-md transition-colors"
          aria-label="Mostrar menú"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

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
              aria-label="Ocultar menú"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2 mb-1">
              Cartera
            </p>
            <ul className="space-y-0.5">
              {configs.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => handleClick(s.id)}
                    className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                      activeSection === s.id
                        ? "bg-brand-coral/10 text-brand-coral font-medium"
                        : "text-brand-secondary hover:bg-slate-50 hover:text-brand-navy"
                    }`}
                  >
                    <span className="text-base flex-shrink-0">{s.icon}</span>
                    <span className="truncate">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {hasResults && results.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-brand-tertiary uppercase tracking-wider px-2 mb-1">
                Radiografía
              </p>
              <ul className="space-y-0.5">
                {results.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => handleClick(s.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center gap-2 ${
                        activeSection === s.id
                          ? "bg-brand-coral/10 text-brand-coral font-medium"
                          : "text-brand-secondary hover:bg-slate-50 hover:text-brand-navy"
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{s.icon}</span>
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!hasResults && (
            <p className="text-xs text-brand-tertiary italic px-2 mt-4">
              Ejecuta la radiografía para ver los detalles.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
