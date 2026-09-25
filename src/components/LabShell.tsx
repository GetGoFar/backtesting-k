"use client";

// =============================================================================
// LabShell — el menú del Laboratorio K
// =============================================================================
// Envuelve las páginas SOLO cuando estamos "en el Laboratorio":
//   - las rutas de Mi cartera (/cartera, /aportar, /simuladores, /perfil y sus subrutas), siempre;
//   - la portada "/" (el Backtest) solo en modo campus, es decir, dentro del portal de Ataraxia.
// Fuera de eso (Pablo entrando directo en "/", /momentum, /acceso, /simulador-retiro, /informe/*…)
// devuelve los hijos tal cual, sin ningún contenedor: el layout de lo que ya existe no cambia.
// El modo campus se mira después de montar (useEffect): en el servidor no se sabe y el HTML de
// la hidratación tiene que coincidir, así que en "/" no se envuelve hasta saberlo.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isCampusMode } from "@/lib/campus-client";

type Item = { href: string; nombre: string; icono: ReactNode };

const ICONO = {
  cartera: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M12 3v9h9" />
    </svg>
  ),
  aportar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  simuladores: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19h16" />
      <path d="M5 15l4-5 4 3 6-7" />
    </svg>
  ),
  backtest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h16" />
      <path d="M7 17V9" />
      <path d="M12 17V4" />
      <path d="M17 17v-6" />
    </svg>
  ),
  perfil: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  ),
};

const ITEMS: Item[] = [
  { href: "/cartera", nombre: "Mi cartera", icono: ICONO.cartera },
  { href: "/aportar", nombre: "Aportar", icono: ICONO.aportar },
  { href: "/simuladores", nombre: "Simuladores", icono: ICONO.simuladores },
  { href: "/", nombre: "Backtest", icono: ICONO.backtest },
  { href: "/perfil", nombre: "Mi perfil", icono: ICONO.perfil },
];

/** Rutas de Mi cartera: llevan el menú siempre. Solo la ruta exacta o sus subrutas: /cartera-backtest no cuenta. */
const RUTAS_CARTERA = ["/cartera", "/aportar", "/simuladores", "/perfil"];

export function esRutaCartera(ruta: string): boolean {
  return RUTAS_CARTERA.some((r) => ruta === r || ruta.startsWith(r + "/"));
}

function Logo({ compacto = false }: { compacto?: boolean }) {
  return (
    <Link href="/cartera" className="flex items-baseline gap-1 font-serif text-2xl tracking-tight text-tinta" title="Laboratorio K">
      {!compacto && <span>Laboratorio</span>}
      <span className="text-k font-semibold">K</span>
    </Link>
  );
}

export function LabShell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const enCartera = esRutaCartera(ruta);
  const [campus, setCampus] = useState(false);

  useEffect(() => {
    setCampus(isCampusMode());
  }, [ruta]);

  const enLaboratorio = enCartera || (ruta === "/" && campus);
  if (!enLaboratorio) return <>{children}</>;

  const activo = (href: string) => (href === "/" ? ruta === "/" : ruta.startsWith(href));
  // En el Backtest el comparador ya trae su propio menú de secciones a la izquierda: el del Laboratorio se
  // estrecha a una columna de iconos (con el nombre como título) para no comerse el ancho de las gráficas.
  const compacto = !enCartera;

  return (
    <div className="min-h-dvh md:flex">
      {/* Escritorio: barra lateral */}
      <aside className={`hidden md:flex md:shrink-0 md:flex-col md:border-r md:border-borde md:py-7 md:sticky md:top-0 md:h-dvh ${compacto ? "md:w-16 md:items-center md:px-2" : "md:w-60 md:px-5"}`}>
        <Logo compacto={compacto} />
        <nav className="mt-10 flex flex-col gap-1" aria-label="Laboratorio K">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              aria-current={activo(it.href) ? "page" : undefined}
              title={compacto ? it.nombre : undefined}
              className={`flex items-center gap-3 rounded-xl py-2.5 text-[15px] transition-colors ${compacto ? "px-2.5" : "px-3"} ${
                activo(it.href) ? "bg-white text-tinta shadow-card font-medium" : "text-gris hover:bg-white/60 hover:text-tinta"
              }`}
            >
              <span className="h-5 w-5">{it.icono}</span>
              {compacto ? <span className="sr-only">{it.nombre}</span> : it.nombre}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        {enCartera ? (
          <>
            {/* En móvil, la marca arriba (el Backtest ya lleva la suya y su botón de menú en esa esquina). */}
            <header className="md:hidden flex items-center px-4 pt-5 pb-2">
              <Logo />
            </header>
            <main className="lab-cartera mx-auto w-full max-w-2xl px-4 pt-4 pb-28 md:px-10 md:pt-12 md:pb-10">{children}</main>
          </>
        ) : (
          // El Backtest dentro del campus: todo el ancho a la derecha del menú; en móvil, hueco para la barra inferior.
          <div className="pb-20 md:pb-0">{children}</div>
        )}
      </div>

      {/* Móvil: barra inferior. z-20: por debajo del menú de secciones del Backtest (z-55/60). */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-20 border-t border-borde bg-crema/95 backdrop-blur px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2"
        aria-label="Laboratorio K"
      >
        <ul className="grid grid-cols-5">
          {ITEMS.map((it) => (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={activo(it.href) ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] ${activo(it.href) ? "text-k font-medium" : "text-gris"}`}
              >
                <span className="h-6 w-6">{it.icono}</span>
                {it.nombre}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
