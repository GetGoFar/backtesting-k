// Importar una cartera desde una captura del bróker.
// Tipos compartidos entre servidor y cliente, y las funciones puras (sin red)
// que se prueban con vitest. La llamada al modelo y las búsquedas viven en
// `importar-servidor.ts`.

import type { Categoria, Parte } from "./cartera";

export type Confianza = "alta" | "media" | "baja";

/** Una fila tal como la lee el modelo de visión en la captura. */
export type FilaExtraida = {
  nombre: string;
  ticker: string | null;
  bolsa: string | null;
  cantidad: number | null;
  precio: number | null;
  valor: number | null;
  moneda: string | null;
  grupo: string | null;
  nombreCompleto: string | null;
  isinPropuesto: string | null;
  confianza: Confianza;
};

export type Extraccion = {
  moneda: string | null;
  total: number | null;
  filas: FilaExtraida[];
  avisos: string[];
};

/** Cómo se ha llegado al ISIN. `null` = no encontrado (o varios igual de probables). */
export type OrigenIsin = "ticker" | "catalogo" | "isin" | "nombre";

export type PosicionImportada = {
  clave: string;
  nombre: string;
  isin: string;
  ticker: string | null;
  categoria: Categoria;
  parte: Parte;
  valor: number;
  moneda: string | null;
  confianza: Confianza;
  origen: OrigenIsin | null;
  /** Había varios productos igual de probables: el socio decide. */
  ambiguo: boolean;
  grupo: string | null;
};

export type RespuestaImportacion = {
  posiciones: PosicionImportada[];
  avisos: string[];
  moneda: string | null;
  total: number | null;
};

/** Códigos de bolsa de Interactive Brokers (y otros) → sufijo del símbolo en EODHD. */
const SUFIJOS: Record<string, string> = {
  IBIS: "DE",
  IBIS2: "DE",
  XETRA: "DE",
  GETTEX: "DE",
  TGATE: "DE",
  FWB: "F",
  FWB2: "F",
  SBF: "PA",
  AEB: "AS",
  BVME: "MI",
  "BVME.ETF": "MI",
  LSE: "L",
  LSEETF: "L",
  EBS: "SW",
  SWX: "SW",
  VIRTX: "SW",
  BM: "MC",
};

export function sufijoBolsa(bolsa: string | null | undefined): string | undefined {
  if (!bolsa) return undefined;
  return SUFIJOS[bolsa.toUpperCase().trim()];
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Clase de participación: no distingue el producto, pero sí desempata entre clases.
const CLASE = new Set(["eur", "usd", "gbp", "chf", "hedged", "acc", "dist", "dis", "inc"]);
// Palabras que no distinguen un producto de otro.
const RUIDO = new Set([...CLASE, "ucits", "etf", "etc", "fund", "index", "the", "de", "class", "clase", "share", "shares", "plc", "sa", "ii", "iii", "1c", "1d", "2c", "2d", "a", "c", "d", "p"]);

export function tokens(s: string): string[] {
  // Las cifras sueltas se conservan aunque sean de un carácter: "1-3" frente a "3-5" distingue tramos.
  return normalizar(s)
    .split(" ")
    .filter((t) => (t.length >= 2 || /^\d$/.test(t)) && !RUIDO.has(t));
}

function tokensClase(s: string): string[] {
  return normalizar(s)
    .split(" ")
    .filter((t) => CLASE.has(t));
}

/** Cuántas palabras de clase (EUR, USD, Hedged, Acc…) comparten consulta y candidato. */
export function clasesComunes(consulta: string, candidato: string): number {
  const b = new Set(tokensClase(candidato));
  return tokensClase(consulta).filter((t) => b.has(t)).length;
}

const tieneCifras = (t: string) => /\d/.test(t);

/**
 * Fracción de las palabras de `consulta` que aparecen (o empiezan igual) en
 * `candidato`, de 0 a 1. Las palabras con cifras (tramos 7-10Y / 10-15Y,
 * índices 100 / 500) distinguen productos: tienen que coincidir exactas, y un
 * candidato con cifras que la consulta no menciona nunca pasa de 0,5.
 */
export function coincidencia(consulta: string, candidato: string): number {
  const a = tokens(consulta);
  if (a.length === 0) return 0;
  const b = tokens(candidato);
  const setB = new Set(b);
  if (a.some((t) => tieneCifras(t) && !setB.has(t))) return 0;
  let n = 0;
  for (const t of a) if (setB.has(t) || b.some((x) => (t.length >= 3 && x.startsWith(t)) || (x.length >= 3 && t.startsWith(x)))) n++;
  let p = n / a.length;
  const setA = new Set(a);
  if (b.some((t) => tieneCifras(t) && !setA.has(t))) p = Math.min(p, 0.5);
  return p;
}

export type Eleccion<T> = { candidato: T; puntos: number };

/**
 * Elige el candidato que mejor casa con alguna de las consultas. Orden: puntos,
 * luego coincidencia inversa (prefiere el nombre más exacto frente al que
 * añade palabras), luego clase de participación, luego el `bonus` (p. ej.
 * cotiza en euros). Si tras todo eso siguen empatados varios ISIN distintos,
 * devuelve undefined: mejor sin ISIN que con el ISIN de otro producto.
 */
export function elegirCandidato<T>(candidatos: T[], opciones: { nombreDe: (c: T) => string; isinDe: (c: T) => string; consultas: string[]; minimo: number; bonus?: (c: T) => number }): Eleccion<T> | undefined {
  const { nombreDe, isinDe, consultas, minimo, bonus } = opciones;
  const puntuados = candidatos
    .map((c) => {
      const nombre = nombreDe(c);
      let p = 0;
      let inversa = 0;
      let clases = 0;
      for (const q of consultas) {
        const x = coincidencia(q, nombre);
        if (x > p) {
          p = x;
          inversa = coincidencia(nombre, q);
          clases = clasesComunes(q, nombre);
        }
      }
      return { c, p, inversa, clases, extra: bonus ? bonus(c) : 0 };
    })
    .filter((x) => x.p >= minimo);
  if (puntuados.length === 0) return undefined;
  puntuados.sort((a, b) => b.p - a.p || b.inversa - a.inversa || b.clases - a.clases || b.extra - a.extra);
  const top = puntuados[0]!;
  const empatados = new Set(puntuados.filter((x) => x.p === top.p && x.inversa === top.inversa && x.clases === top.clases && x.extra === top.extra).map((x) => isinDe(x.c).toUpperCase()));
  if (empatados.size > 1) return undefined;
  return { candidato: top.c, puntos: top.p };
}

/** Epígrafe del bróker o del propio socio → categoría, solo como último recurso. */
export function categoriaPorGrupo(grupo: string | null | undefined): Categoria | undefined {
  if (!grupo) return undefined;
  const g = normalizar(grupo);
  if (/\b(oro|gold|metales?)\b/.test(g)) return "oro";
  if (/high yield|alto rendimiento/.test(g)) return "rf-hy";
  if (/corporativ|corporate|credito|credit/.test(g)) return "rf-corp";
  if (/renta fija|bonos|bond|fixed income|deuda/.test(g)) return "rf-gob";
  if (/renta variable|acciones|equity|equities|bolsa|stocks/.test(g)) return "rv";
  return undefined;
}

export function partePorGrupo(grupo: string | null | undefined): Parte {
  if (!grupo) return "nucleo";
  const g = normalizar(grupo);
  if (/satelite|satellite/.test(g)) return "satelite";
  if (/\bplay\b|juego|especulaci/.test(g)) return "play";
  return "nucleo";
}

/** Criptomonedas y similares nunca son oro ni renta variable: van a "otros". */
export function esCripto(texto: string): boolean {
  return /bitcoin|ethereum|\bether\b|crypto|cripto|solana|\bbtc\b|\beth\b/i.test(texto);
}

export const ES_ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function limpiarIsin(s: string | null | undefined): string {
  const x = (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ES_ISIN.test(x) ? x : "";
}

/** Valor de la fila: el valor de mercado; si falta, cantidad × precio. */
export function valorDe(f: Pick<FilaExtraida, "valor" | "cantidad" | "precio">): number {
  if (typeof f.valor === "number" && Number.isFinite(f.valor) && f.valor > 0) return Math.round(f.valor);
  if (f.cantidad && f.precio) return Math.round(f.cantidad * f.precio);
  return 0;
}

/** Firma de los primeros bytes: el tipo MIME que declara el navegador no es de fiar. */
export function tipoImagenReal(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | undefined {
  if (bytes.length < 12) return undefined;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return undefined;
}
