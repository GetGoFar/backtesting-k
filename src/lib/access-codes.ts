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

export const ACCESS_CODES: ReadonlyArray<AccessCode> = [
  // Códigos publicados a suscriptores (históricos)
  { code: "proyectok", label: "general" },
  { code: "proyectok2025", label: "general-2025" },
  { code: "elproyectok", label: "general-alt" },
  // Código PERSONAL de Pablo — no compartir
  { code: "pablo-k-2026", label: "pablo" },
  // Código para alumnos del taller (rotar por edición si se quiere)
  { code: "taller-k-2026", label: "taller" },
];
