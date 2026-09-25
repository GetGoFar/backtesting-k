// =============================================================================
// ACCESS CODES — códigos de acceso etiquetados por audiencia
// =============================================================================
//
// Fuente ÚNICA de verdad para /api/acceso (login) y middleware.ts (gate).
// La etiqueta permite saber en el registro de accesos QUÉ GRUPO entra
// (no identifica personas, identifica el código usado).
//
// NINGÚN código vive en este fichero: el repositorio es público y cada entrada
// sale de una variable de entorno (Vercel en producción, .env.local en desarrollo).
// Los códigos se normalizan (lowercase + trim) y se comparan por hash SHA-256; la
// cookie guarda el hash, así que rotar un código invalida las sesiones que lo usaban.
//
// IMPORTANTE: usa tu código personal ("pablo") para tus propios accesos —
// así el registro distingue tus visitas de las de los socios.

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

// Código PERSONAL de Pablo: el valor vive en la variable PABLO_LAB_CODE (Vercel; en local,
// .env.local) y nunca en el repo. Con él /api/acceso emite además la identidad "pablo"
// (cartera:pablo en servidor) y /api/presets/privados entrega sus presets. Sin la variable,
// o con menos de 8 caracteres, no hay código de Pablo. Rotarlo invalida sus sesiones.
const CODIGO_PABLO_VALOR = (process.env.PABLO_LAB_CODE || "").trim();
const CODIGO_PABLO: AccessCode[] = CODIGO_PABLO_VALOR.length >= 8
  ? [{ code: CODIGO_PABLO_VALOR, label: "pablo" }]
  : [];

export const ACCESS_CODES: ReadonlyArray<AccessCode> = [
  ...CODIGO_ATARAXIA,
  ...CODIGO_PABLO,
  // RETIRADOS el 15-sep-2026 (decisión de Pablo: la herramienta es solo para socios de
  // Ataraxia, que entran con su pase, y para él): los códigos de los suscriptores de la
  // newsletter y el de los alumnos del Taller. Al quitarlos, las cookies que los usaban
  // dejaron de valer y /acceso pide de nuevo.
];
