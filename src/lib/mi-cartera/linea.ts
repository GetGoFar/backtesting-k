// =============================================================================
// linea.ts — lo que Mi cartera le cuenta a la línea de Hoy del portal de Ataraxia
// =============================================================================
// La portada de Ataraxia dice en una frase qué hacer hoy («Este mes toca tu revisión», «Hoy toca
// aportar»…). Esas dos señales salen de la cartera del socio, que vive aquí. Este módulo es puro:
// recibe los Datos guardados y devuelve el contrato que lee el portal (pintarHero, ataraxia.cartera.linea):
//   { revision: "YYYY-MM" | null, aportacion: { dia } | null, hecho: { revision?, aportacion? } }
// Nada de euros ni de posiciones: solo fechas y un semáforo.

import { calcularEstado, type Cartera, type Semaforo } from "./cartera";
import type { Datos } from "./store";

export type LineaCartera = {
  /** Mes (YYYY-MM) en que toca la revisión: la próxima del método por periodo, o el mes actual si las
   *  bandas piden rebalancear. null si no hay plan o no toca. */
  revision: string | null;
  /** Día del mes en que el socio aporta, si lo ha dicho en su plan. */
  aportacion: { dia: number } | null;
  /** Meses (YYYY-MM) en que ya hizo cada gesto, para que la línea no insista. */
  hecho: { revision?: string; aportacion?: string };
  semaforo: Semaforo | null;
};

const mes = (iso: string | Date): string => {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** El mes del último movimiento de un tipo (o de varios), o undefined si no hay ninguno. */
function ultimoMes(datos: Datos, tipos: Array<Datos["movimientos"][number]["tipo"]>): string | undefined {
  let mejor = "";
  for (const m of datos.movimientos) if (tipos.includes(m.tipo) && m.fecha > mejor) mejor = m.fecha;
  return mejor ? mes(mejor) : undefined;
}

export function lineaDe(datos: Datos, hoy: Date = new Date()): LineaCartera {
  const cartera: Cartera | undefined = datos.cartera;
  const hecho: LineaCartera["hecho"] = {};
  const a = ultimoMes(datos, ["aportacion"]);
  const r = ultimoMes(datos, ["rebalanceo", "revision"]);
  if (a) hecho.aportacion = a;
  if (r) hecho.revision = r;
  const aportacion = cartera?.plan.aportacion?.dia ? { dia: cartera.plan.aportacion.dia } : null;
  if (!cartera || cartera.posiciones.length === 0) return { revision: null, aportacion, hecho, semaforo: null };

  const estado = calcularEstado(cartera, { hoy });
  let revision: string | null = null;
  if (estado.revision) {
    // Por periodo: el mes de la próxima revisión (si ya pasó y no se ha hecho, sigue siendo ese mes).
    revision = mes(estado.revision.proxima);
    if (estado.revision.pendiente) revision = mes(hoy);
  } else if (!estado.sinPlan && estado.semaforo === "rojo") {
    // Por bandas: toca cuando el semáforo lo dice.
    revision = mes(hoy);
  }
  return { revision, aportacion, hecho, semaforo: estado.sinPlan ? null : estado.semaforo };
}
