// Formato de números en español: 327.450 € · 2.450 € · 66,4 %
// Se usa la configuración regional de-DE a propósito: mismos separadores que
// el español (punto de miles, coma decimal) pero agrupa también las cifras
// de cuatro dígitos ("2.450"), cosa que es-ES no hace ("2450").
const LOCALE = "de-DE";
const fmtEnteros = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function eur(n: number, decimales = 0): string {
  const f = decimales === 0 ? fmtEnteros : new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${f.format(n)} €`;
}

export function eurSigno(n: number): string {
  const s = eur(Math.abs(n));
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

export function pct(fraccion: number, decimales = 1): string {
  const f = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${f.format(fraccion * 100)} %`;
}

export function numero(n: number, decimales = 0): string {
  return new Intl.NumberFormat(LOCALE, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
}

/**
 * Convierte lo que teclea el usuario en un número. Acepta "32.450", "32450",
 * "32.450,50", "32450.5" y "1 234". Devuelve NaN si no hay nada que leer.
 */
export function parseEuros(texto: string): number {
  let s = texto.replace(/[€\s]/g, "").replace(/[^0-9.,-]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    const partes = s.split(".");
    if (partes.length > 1) {
      const ultima = partes[partes.length - 1] ?? "";
      // Un solo punto con 1-2 decimales → decimal; si no, separador de miles.
      s = partes.length === 2 && ultima.length > 0 && ultima.length < 3 ? s : partes.join("");
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
