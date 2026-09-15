// =============================================================================
// ACCESS CODES — códigos de acceso etiquetados por audiencia
// =============================================================================
//
// Fuente ÚNICA de verdad para /api/acceso (login) y middleware.ts (gate).
// La etiqueta permite saber en el registro de accesos QUÉ GRUPO entra
// (no identifica personas, identifica el código usado).
//
// Para rotar/añadir códigos: edita esta lista y despliega. Los códigos se
// normalizan (lowercase + trim) y se comparan por hash SHA-256; la cookie
// guarda el hash, así que rotar un código invalida las sesiones que lo usaban.
//
// IMPORTANTE: usa tu código personal ("pablo") para tus propios accesos —
// así el registro distingue tus visitas de las de los suscriptores.

export interface AccessCode {
  /** Código en plano (se normaliza antes de hashear) */
  code: string;
  /** Etiqueta de audiencia que aparece en el registro de accesos */
  label: string;
}

// Entrada de los socios de Ataraxia sin código: /api/acceso/ataraxia comprueba el token que firma
// el portal de Ataraxia con ATARAXIA_LAB_SECRET y emite la cookie con el hash de este código, que
// se deriva del propio secreto y nunca se publica ni se teclea. Sin secreto, la entrada no existe.
const SECRETO_ATARAXIA = (process.env.ATARAXIA_LAB_SECRET || "").trim();
const CODIGO_ATARAXIA: AccessCode[] = SECRETO_ATARAXIA.length >= 16
  ? [{ code: "ataraxia:" + SECRETO_ATARAXIA, label: "ataraxia" }]
  : [];

export const ACCESS_CODES: ReadonlyArray<AccessCode> = [
  ...CODIGO_ATARAXIA,
  // Código PERSONAL de Pablo — no compartir
  { code: "pablo-k-2026", label: "pablo" },
  // RETIRADOS el 15-sep-2026 (decisión de Pablo: la herramienta es solo para socios de
  // Ataraxia, que entran con su pase, y para él): "proyectok", "proyectok2025" y
  // "elproyectok" (suscriptores de la newsletter) y "taller-k-2026" (alumnos del Taller).
  // Al quitarlos, las cookies que los usaban dejan de valer y /acceso pide de nuevo.
];
