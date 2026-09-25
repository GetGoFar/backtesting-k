// Búsqueda de activos por nombre o ISIN. El servidor (app/api/cartera/buscar) pregunta
// a la Backtesting Tool de El Proyecto K (catálogo curado + EODHD) y aquí se
// normaliza el resultado y se sugiere una categoría que el socio confirma.

import { sugerirCategoria, type Categoria } from "./cartera";

export type TipoActivo = "etf" | "fondo" | "accion" | "otro";

export type Activo = {
  nombre: string;
  isin: string;
  tipo: TipoActivo;
  categoriaSugerida: Categoria;
  origen: "catalogo" | "mercado";
};

/** Categorías del catálogo de la Backtesting Tool → categorías de Mi cartera. */
export function categoriaDesdeCatalogo(categoria: string | undefined, nombre: string, tipo: TipoActivo): Categoria {
  const porNombre = sugerirCategoria(nombre);
  if (porNombre === "rf-hy") return "rf-hy"; // el catálogo no distingue high yield
  const c = categoria ?? "";
  if (c.startsWith("RV ")) return "rv";
  if (/^RF (EUR|USD) Gov|^RF Inflation/.test(c)) return "rf-gob";
  if (/^RF (EUR|USD) Corp/.test(c)) return "rf-corp";
  if (c === "Oro") return "oro";
  if (porNombre !== "otros") return porNombre;
  if (tipo === "accion") return "rv";
  return "otros";
}

/**
 * EODHD antepone la sociedad paraguas ("SSgA SPDR ETFs Europe I Public
 * Limited Company - SPDR MSCI ACWI UCITS ETF"). Nos quedamos con el nombre
 * del producto cuando la parte de después del guion es reconocible.
 */
export function acortarNombre(nombre: string): string {
  const limpio = nombre.replace(/\s+/g, " ").trim();
  const partes = limpio.split(/\s[-–]\s/);
  if (partes.length >= 2) {
    const ultima = partes[partes.length - 1] ?? "";
    if (ultima.split(" ").length >= 3) return ultima;
  }
  return limpio;
}

export function nombreTipo(t: TipoActivo): string {
  return { etf: "ETF", fondo: "Fondo", accion: "Acción", otro: "Otro" }[t];
}

export async function buscarActivos(q: string, signal?: AbortSignal): Promise<Activo[]> {
  const res = await fetch(`/api/cartera/buscar?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`Búsqueda fallida (${res.status})`);
  const data = (await res.json()) as { activos: Activo[] };
  return data.activos;
}

export function esIsin(s: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/i.test(s.trim());
}
