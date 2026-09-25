// Cuestionario de perfil de riesgo. Reproduce la hoja "1. Tu Perfil" de la
// Excel "Cartera Core El Proyecto K v3": diez preguntas en dos bloques
// (capacidad y actitud), cada bloque suma como máximo 100 puntos y la
// puntuación final es el MÍNIMO de los dos. El perfil 1-10 sale de esa
// puntuación por tramos de 10.

export type Bloque = "capacidad" | "actitud";

export type Opcion = { texto: string; puntos: number };

export type Pregunta = {
  id: string;
  bloque: Bloque;
  texto: string;
  opciones: Opcion[];
};

export const PREGUNTAS: Pregunta[] = [
  {
    id: "q1",
    bloque: "capacidad",
    texto: "¿Cuándo necesitarás retirar la mitad o más de este dinero?",
    opciones: [
      { texto: "En menos de 3 años", puntos: 0 },
      { texto: "Entre 3 y 7 años", puntos: 8 },
      { texto: "Entre 8 y 15 años", puntos: 20 },
      { texto: "Entre 16 y 25 años", puntos: 30 },
      { texto: "Dentro de más de 25 años", puntos: 40 },
    ],
  },
  {
    id: "q2",
    bloque: "capacidad",
    texto: "¿Cómo son tus ingresos?",
    opciones: [
      { texto: "Variables, autónomo sin colchón", puntos: 0 },
      { texto: "Empleado con contrato temporal", puntos: 3 },
      { texto: "Empleado fijo en un sector estable", puntos: 7 },
      { texto: "Funcionario o ingresos pasivos recurrentes", puntos: 12 },
    ],
  },
  {
    id: "q3",
    bloque: "capacidad",
    texto: "Fuera de esta inversión, ¿cuántos meses de gastos tienes en liquidez?",
    opciones: [
      { texto: "Menos de 3 meses", puntos: 0 },
      { texto: "Entre 3 y 6 meses", puntos: 6 },
      { texto: "Entre 6 y 12 meses", puntos: 11 },
      { texto: "Más de 12 meses", puntos: 16 },
    ],
  },
  {
    id: "q4",
    bloque: "capacidad",
    // Pregunta 4 según "Perfil de Riesgo El Proyecto K v2" (PDF, sep-2026).
    texto: "¿Qué parte de tus ingresos netos consigues ahorrar cada mes?",
    opciones: [
      { texto: "No ahorro nada", puntos: 0 },
      { texto: "Menos del 5 %", puntos: 4 },
      { texto: "Entre el 5 y el 10 %", puntos: 9 },
      { texto: "Entre el 10 y el 20 %", puntos: 14 },
      { texto: "Más del 20 %", puntos: 20 },
    ],
  },
  {
    id: "q5",
    bloque: "capacidad",
    texto: "¿Tienes deudas significativas?",
    opciones: [
      { texto: "Sí, más del 50 % de mis ingresos netos", puntos: 0 },
      { texto: "Sí, entre el 30 y el 50 % de mis ingresos", puntos: 4 },
      { texto: "Solo una hipoteca razonable (menos del 30 %)", puntos: 8 },
      { texto: "No, sin deudas", puntos: 12 },
    ],
  },
  {
    id: "q6",
    bloque: "actitud",
    texto: "¿Has vivido una caída del mercado de más del 20 % con dinero invertido?",
    opciones: [
      { texto: "Nunca he invertido", puntos: 10 },
      { texto: "Sí, y vendí en pánico", puntos: 0 },
      { texto: "Sí, y aguanté con mucho estrés", puntos: 8 },
      { texto: "Sí, y aguanté sin problema", puntos: 15 },
      { texto: "Sí, y compré más aprovechando", puntos: 20 },
    ],
  },
  {
    id: "q7",
    bloque: "actitud",
    texto:
      "Tienes 100.000 € invertidos. En seis meses el mercado cae un 40 % y tu cartera vale 60.000 €. ¿Qué haces?",
    opciones: [
      { texto: "Vendo todo inmediatamente", puntos: 0 },
      { texto: "Vendo la mitad para asegurar", puntos: 6 },
      { texto: "Me estreso, pero aguanto sin vender", puntos: 13 },
      { texto: "No me preocupa, mantengo el plan", puntos: 20 },
      { texto: "Aprovecho para aportar más", puntos: 25 },
    ],
  },
  {
    id: "q8",
    bloque: "actitud",
    texto: "¿Cada cuánto revisas el valor de tu cartera?",
    opciones: [
      { texto: "Diariamente", puntos: 0 },
      { texto: "Semanalmente", puntos: 3 },
      { texto: "Mensualmente", puntos: 6 },
      { texto: "Trimestralmente", puntos: 9 },
      { texto: "Anualmente o menos", puntos: 12 },
    ],
  },
  {
    id: "q9",
    bloque: "actitud",
    texto:
      "Tu cartera lleva dos años rindiendo un −5 % anual mientras el plazo fijo da un +2 %. ¿Cómo te sientes?",
    opciones: [
      { texto: "Muy mal, fue un error invertir", puntos: 0 },
      { texto: "Mal, me planteo cambiar de estrategia", puntos: 5 },
      { texto: "Incómodo, pero entiendo que es volatilidad normal", puntos: 11 },
      { texto: "Tranquilo, son solo dos años en un horizonte largo", puntos: 18 },
    ],
  },
  {
    id: "q10",
    bloque: "actitud",
    texto: "¿Qué priorizas en tu inversión?",
    opciones: [
      { texto: "Tranquilidad total, prefiero dormir bien aunque gane menos", puntos: 0 },
      { texto: "Equilibrio entre rentabilidad y paz mental", puntos: 10 },
      { texto: "Rentabilidad, acepto la volatilidad como parte del juego", puntos: 18 },
      { texto: "Máxima rentabilidad, la volatilidad no me afecta", puntos: 25 },
    ],
  },
];

/** Respuestas: id de pregunta → índice de la opción elegida. */
export type Respuestas = Record<string, number>;

export type ResultadoPerfil = {
  capacidad: number;
  actitud: number;
  puntuacion: number;
  perfil: number; // 1..10
  /** Qué bloque ha limitado la puntuación final. */
  limitante: "capacidad" | "actitud" | "ambas";
};

export function calcularPerfil(respuestas: Respuestas): ResultadoPerfil {
  let capacidad = 0;
  let actitud = 0;
  for (const p of PREGUNTAS) {
    const idx = respuestas[p.id];
    const opcion = idx === undefined ? undefined : p.opciones[idx];
    if (!opcion) continue;
    if (p.bloque === "capacidad") capacidad += opcion.puntos;
    else actitud += opcion.puntos;
  }
  const puntuacion = Math.min(capacidad, actitud);
  const perfil = Math.max(1, Math.min(10, Math.ceil(puntuacion / 10)));
  const limitante =
    capacidad === actitud ? "ambas" : capacidad < actitud ? "capacidad" : "actitud";
  return { capacidad, actitud, puntuacion, perfil, limitante };
}

export function cuestionarioCompleto(respuestas: Respuestas): boolean {
  return PREGUNTAS.every((p) => respuestas[p.id] !== undefined);
}

export type TramoPerfil = {
  nombre: string;
  descripcion: string;
  /** Meta de rendimiento orientativa sobre la inflación (IPC + x %). */
  metaSobreIPC: string;
  horizonteMinimo: string;
  /** Orientación PÚBLICA del PDF del test: cuánta bolsa suele llevar este tramo. */
  bolsaOrientativa: string;
  /** Caída máxima esperada en una crisis, según la tabla pública del PDF. */
  caidaEsperada: number;
};

/**
 * Tramos de la Excel y del PDF público "Perfil de Riesgo El Proyecto K v2"
 * (0-20, 21-40, 41-60, 61-80, 81-100 puntos). Solo se enseña lo que ya es
 * público en ese PDF: nada de pesos por categoría ni productos.
 */
export function tramoPerfil(perfil: number): TramoPerfil {
  if (perfil <= 2)
    return {
      nombre: "Conservador",
      descripcion: "Buscas preservar tu capital y toleras poca variación. La renta fija es la base y la bolsa, una parte pequeña.",
      metaSobreIPC: "1-2 %",
      horizonteMinimo: "3 años",
      bolsaOrientativa: "alrededor del 20 %",
      caidaEsperada: 0.08,
    };
  if (perfil <= 4)
    return {
      nombre: "Moderadamente conservador",
      descripcion: "Quieres preservar el capital con un crecimiento estable. La renta fija sigue siendo la base, con algo más de bolsa para crecer.",
      metaSobreIPC: "2-3 %",
      horizonteMinimo: "3 años",
      bolsaOrientativa: "entre el 20 y el 40 %",
      caidaEsperada: 0.15,
    };
  if (perfil <= 6)
    return {
      nombre: "Moderado",
      descripcion: "Prefieres que tu capital crezca y aceptas fluctuaciones moderadas. Tu horizonte es de al menos cinco años.",
      metaSobreIPC: "3-4 %",
      horizonteMinimo: "5 años",
      bolsaOrientativa: "entre el 40 y el 60 %",
      caidaEsperada: 0.25,
    };
  if (perfil <= 8)
    return {
      nombre: "Moderadamente agresivo",
      descripcion: "Buscas crecimiento y aceptas fluctuaciones parecidas a las de la bolsa a cambio de una mayor exposición a activos de crecimiento.",
      metaSobreIPC: "4-5 %",
      horizonteMinimo: "7 años",
      bolsaOrientativa: "entre el 60 y el 80 %",
      caidaEsperada: 0.35,
    };
  return {
    nombre: "Agresivo",
    descripcion: "Buscas el máximo crecimiento del capital y toleras las fluctuaciones propias de la bolsa con un horizonte de diez años o más.",
    metaSobreIPC: "5-6 %",
    horizonteMinimo: "10 años",
    bolsaOrientativa: "entre el 80 y el 100 %",
    caidaEsperada: 0.5,
  };
}
