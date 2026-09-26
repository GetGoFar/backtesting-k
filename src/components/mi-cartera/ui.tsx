"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { eur, numero, parseEuros, pct } from "@/lib/mi-cartera/formato";
import { IMPORTE_MINIMO, type Semaforo } from "@/lib/mi-cartera/cartera";

/** Una fila de la distribución: pesos en la misma base (Núcleo o renta variable) y la diferencia en euros (positivo = falta). */
export type FilaDistribucion = { nombre: string; pesoActual: number; pesoObjetivo: number; rango: { min: number; max: number }; semaforo: Semaforo; diferencia: number };

export function Tarjeta({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-2xl bg-white border border-borde shadow-card p-5 md:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl md:text-4xl">{children}</h1>
      {sub && <p className="mt-2 text-gris">{sub}</p>}
    </div>
  );
}

type BotonProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variante?: "primario" | "secundario" | "enlace";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
};

export function Boton({ children, onClick, href, variante = "primario", disabled, type = "button", className = "" }: BotonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium transition-all select-none";
  const estilos = {
    primario: "bg-k text-white hover:bg-k-dark active:scale-[0.98] disabled:bg-gris-2/40 disabled:cursor-not-allowed",
    secundario: "bg-white text-tinta border border-tinta/15 hover:border-tinta/40 active:scale-[0.98] disabled:opacity-50",
    enlace: "text-k hover:underline px-2 py-1",
  }[variante];
  if (href && !disabled) {
    return (
      <Link href={href} className={`${base} ${estilos} ${className}`}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${estilos} ${className}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Semáforo

const COLOR: Record<Semaforo, { punto: string; texto: string; fondo: string }> = {
  verde: { punto: "bg-verde", texto: "text-verde", fondo: "bg-verde-soft" },
  ambar: { punto: "bg-ambar", texto: "text-ambar", fondo: "bg-ambar-soft" },
  rojo: { punto: "bg-rojo", texto: "text-rojo", fondo: "bg-rojo-soft" },
};

/** El color, en palabras: para quien no lo distingue y para el lector de pantalla. */
export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = { verde: "Verde", ambar: "Ámbar", rojo: "Rojo" };

export function Punto({ semaforo, className = "" }: { semaforo: Semaforo; className?: string }) {
  return <span role="img" aria-label={ETIQUETA_SEMAFORO[semaforo]} className={`inline-block h-3 w-3 shrink-0 rounded-full ${COLOR[semaforo].punto} ${className}`} />;
}

export function EstadoGrande({ semaforo, titulo, detalle, accion }: { semaforo: Semaforo; titulo: string; detalle: string; accion?: ReactNode }) {
  const c = COLOR[semaforo];
  return (
    <div className={`rounded-2xl ${c.fondo} p-5 md:p-6`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Punto semaforo={semaforo} className="h-3.5 w-3.5" />
        <h2 className={`text-xl md:text-2xl font-semibold ${c.texto}`}>{titulo}</h2>
        <span className="text-xs uppercase tracking-wide text-gris">{ETIQUETA_SEMAFORO[semaforo]}</span>
      </div>
      <p className="mt-2 text-tinta/80 leading-relaxed">{detalle}</p>
      {accion && <div className="mt-4">{accion}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribución por clase de activo: barra horizontal con la banda del plan

/** Objetivo con un decimal solo cuando no es entero: 65 % · 8,8 % · 33,3 %. */
export function pctObjetivo(fraccion: number): string {
  const puntos = fraccion * 100;
  return Math.abs(puntos - Math.round(puntos)) < 1e-6 ? pct(fraccion, 0) : pct(fraccion, 1);
}

/** «−2,0 puntos» / «+1,5 puntos» / «0,0 puntos». */
export function textoPuntos(desviacion: number): string {
  const puntos = Math.round(desviacion * 1000) / 10;
  const abs = numero(Math.abs(puntos), 1);
  const signo = puntos > 0 ? "+" : puntos < 0 ? "−" : "";
  return `${signo}${abs} punto${abs === "1,0" ? "" : "s"}`;
}

/** «te faltan ≈48.800 €» / «te sobran ≈12.000 €», a centenas; nada si no llega a 50 €. */
export function textoEuros(diferencia: number): string | undefined {
  const centenas = Math.round(diferencia / 100) * 100;
  if (centenas === 0) return undefined;
  return `${centenas > 0 ? "te faltan" : "te sobran"} ≈${eur(Math.abs(centenas))}`;
}

/** Fuera de la banda del plan (y la diferencia cuenta: 10 € o más). */
export function fueraDeBanda(f: Pick<FilaDistribucion, "pesoActual" | "rango" | "diferencia">): boolean {
  if (Math.abs(f.diferencia) < IMPORTE_MINIMO) return false;
  return f.pesoActual < f.rango.min - 1e-9 || f.pesoActual > f.rango.max + 1e-9;
}

export function Distribucion({ categorias, compacta = false, escala }: { categorias: FilaDistribucion[]; compacta?: boolean; escala?: number }) {
  const maxEscala = escala ?? Math.max(0.5, ...categorias.map((c) => Math.max(c.pesoActual, c.rango.max))) * 1.05;
  return (
    <ul className={compacta ? "flex flex-col gap-3" : "flex flex-col gap-4"}>
      {categorias.map((c, i) => {
        const w = (x: number) => `${Math.min(100, (x / maxEscala) * 100)}%`;
        const fuera = fueraDeBanda(c);
        const euros = fuera ? textoEuros(c.diferencia) : undefined;
        const colorDesvio = !fuera ? "text-gris" : c.semaforo === "verde" ? "text-tinta" : COLOR[c.semaforo].texto;
        return (
          <li key={`${c.nombre}-${i}`}>
            <div className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="flex items-center gap-2">
                <Punto semaforo={c.semaforo} className={compacta ? "h-2 w-2" : "h-2.5 w-2.5"} />
                {c.nombre}
              </span>
              <span className="tabular text-gris whitespace-nowrap">
                <span className="text-tinta font-medium">{pct(c.pesoActual)}</span>
                <span className="mx-1.5 text-gris-2">·</span>
                objetivo {pctObjetivo(c.pesoObjetivo)}
              </span>
            </div>
            <div className="relative mt-2 h-2.5 w-full rounded-full bg-crema-2 overflow-hidden" aria-hidden>
              {/* banda del plan (debajo del peso, para que la barra se lea sobre ella) */}
              <div className="absolute inset-y-0 bg-tinta/10" style={{ left: w(c.rango.min), width: `calc(${w(c.rango.max)} - ${w(c.rango.min)})` }} />
              {/* peso actual */}
              <div className={`absolute inset-y-0 left-0 rounded-full ${COLOR[c.semaforo].punto} opacity-90 transition-all`} style={{ width: w(c.pesoActual) }} />
              {/* límites de la banda, visibles también sobre la barra */}
              {c.rango.max - c.rango.min > 1e-9 && (
                <>
                  <div className="absolute inset-y-0 w-px bg-tinta/40" style={{ left: w(c.rango.min) }} />
                  <div className="absolute inset-y-0 w-px bg-tinta/40" style={{ left: w(c.rango.max) }} />
                </>
              )}
              {/* objetivo */}
              <div className="absolute inset-y-0 w-0.5 bg-tinta" style={{ left: w(c.pesoObjetivo) }} />
            </div>
            <p className={`tabular mt-1 text-xs ${colorDesvio}`}>
              {textoPuntos(c.pesoActual - c.pesoObjetivo)}
              {euros && (
                <>
                  <span className="mx-1.5 text-gris-2">·</span>
                  {euros}
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Entrada de euros

export function InputEuros({
  valor,
  onChange,
  id,
  placeholder = "0",
  autoFocus,
  className = "",
}: {
  valor: number | undefined;
  onChange: (n: number | undefined) => void;
  id?: string;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [texto, setTexto] = useState(valor === undefined || valor === 0 ? "" : numero(valor));
  const [enfocado, setEnfocado] = useState(false);

  useEffect(() => {
    if (!enfocado) setTexto(valor === undefined || valor === 0 ? "" : numero(valor));
  }, [valor, enfocado]);

  return (
    <div className={`relative ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder}
        onFocus={() => setEnfocado(true)}
        onBlur={() => {
          setEnfocado(false);
          const n = parseEuros(texto);
          setTexto(Number.isNaN(n) || n === 0 ? "" : numero(n));
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = parseEuros(e.target.value);
          onChange(Number.isNaN(n) ? undefined : n);
        }}
        className="tabular w-full pr-9 text-right text-lg"
      />
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gris">€</span>
    </div>
  );
}

export function Cifra({ etiqueta, valor, tono = "normal" }: { etiqueta: string; valor: string; tono?: "normal" | "positivo" | "negativo" }) {
  const color = tono === "positivo" ? "text-verde" : tono === "negativo" ? "text-rojo" : "text-tinta";
  return (
    <div>
      <p className="text-sm text-gris">{etiqueta}</p>
      <p className={`tabular mt-0.5 text-xl font-medium ${color}`}>{valor}</p>
    </div>
  );
}

export function Importe({ n }: { n: number }) {
  return <span className="tabular">{eur(n)}</span>;
}

export function Cargando() {
  return <div className="h-40 animate-pulse rounded-2xl bg-white/60" aria-busy />;
}
