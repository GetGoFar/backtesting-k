// =============================================================================
// campus-client.ts — Helpers de CLIENTE para el modo campus (?campus=1)
// =============================================================================
// El modo campus restringe la app cuando va embebida en elproyectok.com/campus,
// para que los alumnos NO accedan al universo completo ni a carteras de clientes
// de consultoría. El uso PERSONAL directo de la app (sin ?campus=1) no se toca.
//
// Nota: esto es solo defensa de interfaz (UX). El gate real de datos vive en el
// servidor (campus-whitelist.ts + /api/funds + /api/search).
// =============================================================================

/** ¿La app va embebida en el campus? Lee el flag de la URL (?campus=1) o de
 *  sessionStorage (persistido por FundSearch al primer render). SSR-safe y
 *  sin efectos secundarios: se puede llamar durante el render. */
export function isCampusMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("campus") === "1" || p.get("campus") === "true") return true;
    return sessionStorage.getItem("k-campus") === "1";
  } catch {
    return false;
  }
}

/** Prefijos de id de las ÚNICAS familias de carteras visibles en el campus:
 *  todas las Carteras K y todas las de Indexa. Cualquier otro preset
 *  (clientes de consultoría, banca, BBVA, CaixaBank, etc.) queda oculto. */
export const CAMPUS_PRESET_PREFIXES = [
  "k-inbestme-",
  "k-sectorial-usa-",
  "k-geografica-usa-",
  "k-geografica-ucit-",
  "indexa-", // cubre indexa-N e indexa-usa-N
] as const;

/** ¿Este preset (por su id) puede mostrarse en el campus? */
export function isCampusPreset(id: string): boolean {
  return CAMPUS_PRESET_PREFIXES.some((pre) => id.startsWith(pre));
}
