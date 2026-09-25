// Simulador de aportaciones periódicas (hoja SIMULADOR de la Excel).
// Fórmula anual: V(n) = C0·(1+r)^n + 12·m·((1+r)^n − 1)/r

export type EntradaSimulacion = {
  capitalInicial: number;
  aportacionMensual: number;
  rentabilidadAnual: number; // fracción, 0.06 = 6 %
  anos: number;
  inflacionAnual: number; // fracción
};

export type FilaSimulacion = {
  ano: number;
  aportado: number;
  valor: number;
  beneficio: number;
  valorReal: number;
};

export type ResultadoSimulacion = {
  filas: FilaSimulacion[];
  aportado: number;
  valorFinal: number;
  valorFinalReal: number;
  beneficio: number;
  rentabilidadTotal: number;
};

export function valorEnAno(e: EntradaSimulacion, n: number): number {
  const r = e.rentabilidadAnual;
  const anual = e.aportacionMensual * 12;
  if (Math.abs(r) < 1e-12) return e.capitalInicial + anual * n;
  const factor = Math.pow(1 + r, n);
  return e.capitalInicial * factor + (anual * (factor - 1)) / r;
}

export function simular(e: EntradaSimulacion): ResultadoSimulacion {
  const anos = Math.max(1, Math.min(60, Math.round(e.anos)));
  const filas: FilaSimulacion[] = [];
  for (let n = 1; n <= anos; n++) {
    const aportado = e.capitalInicial + e.aportacionMensual * 12 * n;
    const valor = valorEnAno(e, n);
    filas.push({
      ano: n,
      aportado,
      valor,
      beneficio: valor - aportado,
      valorReal: valor / Math.pow(1 + e.inflacionAnual, n),
    });
  }
  const ultima = filas[filas.length - 1];
  const aportado = ultima?.aportado ?? e.capitalInicial;
  const valorFinal = ultima?.valor ?? e.capitalInicial;
  return {
    filas,
    aportado,
    valorFinal,
    valorFinalReal: ultima?.valorReal ?? e.capitalInicial,
    beneficio: valorFinal - aportado,
    rentabilidadTotal: aportado > 0 ? (valorFinal - aportado) / aportado : 0,
  };
}
