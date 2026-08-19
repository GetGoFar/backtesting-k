// =============================================================================
// FRESCURA DE DATOS — detecta series de NAV que han dejado de actualizarse
// =============================================================================
//
// Un fondo fusionado, cerrado o con el feed roto sigue devolviendo su histórico
// por EODHD, pero congelado en la fecha en que dejó de publicar NAV. Sin
// comprobarlo, ese fondo aparece como si estuviera al día: en la Liga compite en
// el ranking contra fondos con datos de la semana pasada, y en el informe se
// compara contra la Cartera K10 sobre un periodo que ya no es el mismo.
//
// El umbral sale de los datos reales de la Liga (snapshot de ago-2026, 97
// fondos): 94 tenían entre 2 y 4 días de desfase y 3 tenían 65, 99 y 101. El
// hueco entre 4 y 65 es tan ancho que cualquier corte intermedio da el mismo
// resultado; 30 días queda muy por encima del retraso normal (incluido el
// puente de agosto) y muy por debajo de las anomalías reales.
// =============================================================================

/** Días naturales sin NAV nuevo a partir de los cuales la serie se considera parada. */
export const DIAS_DATOS_OBSOLETOS = 30;

export interface FrescuraDatos {
  /** true si la serie lleva más de DIAS_DATOS_OBSOLETOS sin actualizarse */
  obsoleto: boolean;
  /** Días naturales entre el último dato y la fecha de referencia */
  diasSinActualizar: number;
  /** Último dato disponible (YYYY-MM-DD) */
  ultimaFecha: string;
  /** Mensaje listo para mostrar, o null si la serie está al día */
  aviso: string | null;
}

/** Formatea YYYY-MM-DD como DD/MM/AAAA para mostrar. */
function formatearFecha(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/**
 * Evalúa si una serie de datos está al día.
 *
 * @param ultimaFecha  último dato disponible (YYYY-MM-DD)
 * @param referencia   fecha contra la que medir (por defecto, hoy). Se pasa
 *                     explícitamente desde la Liga para medir contra el momento
 *                     en que se generó el snapshot, no contra el de lectura.
 */
export function evaluarFrescura(
  ultimaFecha: string | null | undefined,
  referencia: Date = new Date(),
): FrescuraDatos {
  if (!ultimaFecha) {
    return { obsoleto: false, diasSinActualizar: 0, ultimaFecha: "", aviso: null };
  }
  const fecha = ultimaFecha.slice(0, 10);
  const ms = referencia.getTime() - new Date(`${fecha}T00:00:00Z`).getTime();
  const dias = Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
  if (dias <= DIAS_DATOS_OBSOLETOS) {
    return { obsoleto: false, diasSinActualizar: dias, ultimaFecha: fecha, aviso: null };
  }
  // En meses solo a partir de 2 meses COMPLETOS: redondear 45 días a "2 meses"
  // exagera el desfase, y este aviso va en un informe que se manda a terceros.
  const cuanto = dias >= 60 ? `${Math.round(dias / 30)} meses` : `${dias} días`;
  return {
    obsoleto: true,
    diasSinActualizar: dias,
    ultimaFecha: fecha,
    aviso:
      `Este fondo no publica valor liquidativo desde el ${formatearFecha(fecha)} ` +
      `(${cuanto}). Suele indicar que se ha fusionado con otro fondo o que ha ` +
      `cerrado. Los datos mostrados llegan solo hasta esa fecha.`,
  };
}
