// Motor de "Mi cartera": el socio sube SUS activos (nombre, ISIN, categoría,
// parte y euros) y fija SU plan. La app no propone productos ni pesos: solo
// mide la distancia entre lo que tiene y lo que ha decidido tener.
//
// Reglas:
// - El semáforo actúa sobre la Cartera Núcleo, por categoría, según el
//   MÉTODO DE REBALANCEO que elija el socio: por periodo (una fecha fija;
//   entre medias no se mira) o por bandas (absolutas, en puntos; o
//   relativas, en % del objetivo). Rojo si se sale de la banda, ámbar a
//   partir del 60 % de la banda; por periodo, ámbar cuando llega la fecha.
// - La renta variable del Núcleo se reparte por REGIONES (geográfica), por
//   SECTORES (sectorial) o por ambas (mixta), según el plan; el semáforo
//   también vigila ese reparto.
// - Las acciones de empresa solo entran en Satélite o Play Money.
// - Satélite y Play Money no se rebalancean: solo avisan si superan el tope
//   que el socio les haya puesto sobre el total (10 % y 5 % si no dice nada).
// - Diferencias por debajo de 10 € no cuentan.

export type Categoria = "rv" | "rf-gob" | "rf-corp" | "rf-hy" | "oro" | "otros";

export const CATEGORIAS: { id: Categoria; nombre: string; corto: string }[] = [
  { id: "rv", nombre: "Renta variable", corto: "RV" },
  { id: "rf-gob", nombre: "Renta fija pública", corto: "RF pública" },
  { id: "rf-corp", nombre: "Renta fija corporativa", corto: "RF corporativa" },
  { id: "rf-hy", nombre: "Renta fija high yield", corto: "RF high yield" },
  { id: "oro", nombre: "Oro", corto: "Oro" },
  { id: "otros", nombre: "Otros", corto: "Otros" },
];

export function nombreCategoria(c: Categoria): string {
  return CATEGORIAS.find((x) => x.id === c)?.nombre ?? c;
}

// ---------------------------------------------------------------------------
// Reparto de la renta variable: regiones y sectores

export type Region = "global" | "eeuu" | "europa" | "asia" | "emergentes" | "smallcaps";
export type Sector = "staples" | "salud" | "tecnologia" | "energia" | "inmobiliario" | "utilities" | "otro-sector";
export type SubRV = Region | Sector;

export const REGIONES: { id: Region; nombre: string }[] = [
  { id: "global", nombre: "Global desarrollado" },
  { id: "eeuu", nombre: "EE. UU." },
  { id: "europa", nombre: "Europa" },
  { id: "asia", nombre: "Asia-Pacífico y Japón" },
  { id: "emergentes", nombre: "Emergentes" },
  { id: "smallcaps", nombre: "Small caps" },
];

export const SECTORES: { id: Sector; nombre: string }[] = [
  { id: "staples", nombre: "Consumo básico" },
  { id: "salud", nombre: "Salud" },
  { id: "tecnologia", nombre: "Tecnología" },
  { id: "energia", nombre: "Energía" },
  { id: "inmobiliario", nombre: "Inmobiliario" },
  { id: "utilities", nombre: "Utilities" },
  { id: "otro-sector", nombre: "Otro sector" },
];

export const SUBS_RV: { id: SubRV; nombre: string; tipo: "region" | "sector" }[] = [
  ...REGIONES.map((r) => ({ id: r.id as SubRV, nombre: r.nombre, tipo: "region" as const })),
  ...SECTORES.map((s) => ({ id: s.id as SubRV, nombre: s.nombre, tipo: "sector" as const })),
];

export function nombreSubRV(s: SubRV): string {
  return SUBS_RV.find((x) => x.id === s)?.nombre ?? s;
}

export function esRegion(s: SubRV): boolean {
  return REGIONES.some((r) => r.id === s);
}

export type EstrategiaRV = "geografica" | "sectorial" | "mixta";

export const ESTRATEGIAS_RV: { id: EstrategiaRV; nombre: string; detalle: string }[] = [
  { id: "geografica", nombre: "Geográfica", detalle: "La bolsa repartida por regiones del mundo." },
  { id: "sectorial", nombre: "Sectorial", detalle: "La bolsa repartida por sectores." },
  { id: "mixta", nombre: "Mixta", detalle: "Una parte por regiones y otra por sectores." },
];

/** Subcategorías que admite cada estrategia. */
export function subsDe(estrategia: EstrategiaRV | undefined): { id: SubRV; nombre: string; tipo: "region" | "sector" }[] {
  if (estrategia === "geografica") return SUBS_RV.filter((s) => s.tipo === "region");
  if (estrategia === "sectorial") return SUBS_RV.filter((s) => s.tipo === "sector");
  return SUBS_RV;
}

export type Parte = "nucleo" | "satelite" | "play";

export const PARTES: { id: Parte; nombre: string; detalle: string }[] = [
  { id: "nucleo", nombre: "Cartera Núcleo", detalle: "Tu cartera indexada. Aquí actúa el semáforo." },
  { id: "satelite", nombre: "Cartera Satélite", detalle: "Apuestas con criterio, pequeñas." },
  { id: "play", nombre: "Play Money", detalle: "Dinero de juego. Sin reglas, con tope." },
];

export function nombreParte(p: Parte): string {
  return PARTES.find((x) => x.id === p)?.nombre ?? p;
}

export type TipoActivo = "etf" | "fondo" | "accion" | "otro";

/** Las acciones de empresa no entran en el Núcleo (regla de Pablo). */
export function puedeIrAlNucleo(tipo: TipoActivo | undefined): boolean {
  return tipo !== "accion";
}

export type Posicion = {
  id: string;
  nombre: string;
  isin: string;
  categoria: Categoria;
  parte: Parte;
  valor: number;
  /** Región o sector, solo para renta variable del Núcleo. */
  sub?: SubRV;
  /** % real de esa región/sector según la composición (EODHD). Solo informativo: no entra en ningún cálculo. */
  subPct?: number;
  tipo?: TipoActivo;
};

/** Cómo decide el socio cuándo rebalancear. */
export type MetodoRebalanceo =
  | { metodo: "periodo"; meses: 12 | 24 }
  | { metodo: "bandas"; tipo: "absoluta" | "relativa"; banda: number };

/** Método por defecto de El Proyecto K: una revisión al año. */
export const METODO_POR_DEFECTO: MetodoRebalanceo = { metodo: "periodo", meses: 12 };
export const BANDA_ABSOLUTA_POR_DEFECTO = 0.05; // 5 puntos
export const BANDA_RELATIVA_POR_DEFECTO = 0.25; // 25 % del objetivo (la de la Excel)
/** Topes de Satélite y Play Money sobre el total cuando el plan no dice otra cosa. */
export const TOPE_SATELITE_POR_DEFECTO = 0.1;
export const TOPE_PLAY_POR_DEFECTO = 0.05;

export type Plan = {
  /** Peso objetivo de cada categoría dentro de la Cartera Núcleo (fracciones, suman 1). */
  objetivo: Partial<Record<Categoria, number>>;
  /** Cómo se reparte la renta variable. */
  estrategiaRV?: EstrategiaRV;
  /** Reparto de la renta variable por región/sector: fracciones DE LA RENTA VARIABLE, suman 1. */
  objetivoRV?: Partial<Record<SubRV, number>>;
  /** Tope de la Satélite sobre el total de la cartera (fracción). Sin valor = 10 %; 0 = sin aviso. */
  topeSatelite?: number;
  /** Tope de Play Money sobre el total (fracción). Sin valor = 5 %; 0 = sin aviso. */
  topePlay?: number;
  rebalanceo?: MetodoRebalanceo;
  /** Día del mes (1-28) en que el socio aporta. Solo se guarda: no cambia ningún cálculo. */
  aportacion?: { dia: number };
};

export type Cartera = {
  posiciones: Posicion[];
  plan: Plan;
  /** Dinero aportado acumulado (lo que el socio ha metido de su bolsillo). */
  aportado: number;
  /** Fecha (ISO) del último rebalanceo o revisión marcada como hecha. */
  ultimoRebalanceo?: string;
  actualizadoEl?: string;
};

export const IMPORTE_MINIMO = 10;

export type Semaforo = "verde" | "ambar" | "rojo";
const ORDEN: Record<Semaforo, number> = { rojo: 0, ambar: 1, verde: 2 };

export function peorSemaforo(lista: Semaforo[]): Semaforo {
  return lista.reduce<Semaforo>((peor, s) => (ORDEN[s] < ORDEN[peor] ? s : peor), "verde");
}

export function carteraVacia(): Cartera {
  return { posiciones: [], plan: { objetivo: {} }, aportado: 0 };
}

/** Un plan está definido cuando sus pesos suman (casi) el 100 %. */
export function planDefinido(plan: Plan): boolean {
  const suma = sumaPlan(plan);
  return suma > 0 && Math.abs(suma - 1) < 0.005;
}

export function sumaPlan(plan: Plan): number {
  return CATEGORIAS.reduce((s, c) => s + (plan.objetivo[c.id] ?? 0), 0);
}

export function sumaPlanRV(plan: Plan): number {
  return SUBS_RV.reduce((s, x) => s + (plan.objetivoRV?.[x.id] ?? 0), 0);
}

/** El reparto de la renta variable está definido cuando sus fracciones suman 1. */
export function repartoRVDefinido(plan: Plan): boolean {
  const suma = sumaPlanRV(plan);
  return suma > 0 && Math.abs(suma - 1) < 0.005;
}

export function nuevoId(): string {
  const r = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `p-${r}`;
}

export function sumarMeses(iso: string, meses: number): Date {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// ---------------------------------------------------------------------------
// Estado

export type EstadoCategoria = {
  categoria: Categoria;
  nombre: string;
  valor: number;
  pesoObjetivo: number;
  pesoActual: number;
  valorObjetivo: number;
  /** Positivo = falta, negativo = sobra. */
  diferencia: number;
  desviacionRelativa: number;
  semaforo: Semaforo;
  rango: { min: number; max: number };
  /** Tiene dinero pero no está en el plan. */
  fueraDePlan: boolean;
  /** El plan la pide pero no hay ningún activo en ella. */
  sinActivos: boolean;
};

/** Región o sector dentro de la renta variable del Núcleo. Pesos sobre el Núcleo. */
export type EstadoSubRV = {
  sub: SubRV | "sin-clasificar";
  nombre: string;
  valor: number;
  pesoObjetivo: number;
  pesoActual: number;
  valorObjetivo: number;
  diferencia: number;
  desviacionRelativa: number;
  semaforo: Semaforo;
  rango: { min: number; max: number };
  sinActivos: boolean;
};

export type EstadoLinea = {
  posicion: Posicion;
  pesoActual: number; // sobre el Núcleo
  valorObjetivo: number;
  diferencia: number;
};

export type EstadoParte = {
  parte: Parte;
  nombre: string;
  valor: number;
  pesoTotal: number; // sobre el total de la cartera
  tope?: number;
  excedido: boolean;
};

export type Revision = {
  /** Fecha ISO de la próxima revisión. */
  proxima: string;
  /** Ya ha llegado la fecha. */
  pendiente: boolean;
  meses: number;
};

export type Estado = {
  total: number;
  nucleo: number;
  partes: EstadoParte[];
  categorias: EstadoCategoria[];
  /** Solo cuando el plan reparte la renta variable por región/sector. */
  subcategoriasRV: EstadoSubRV[];
  lineas: EstadoLinea[];
  semaforo: Semaforo;
  avisos: EstadoCategoria[];
  vacia: boolean;
  sinPlan: boolean;
  metodo: MetodoRebalanceo;
  /** Solo con método por periodo. */
  revision?: Revision;
};

function semaforoDe(pesoObjetivo: number, pesoActual: number, diferenciaEuros: number, metodo: MetodoRebalanceo): Semaforo {
  if (Math.abs(diferenciaEuros) < IMPORTE_MINIMO) return "verde";
  if (pesoObjetivo <= 0) return pesoActual > 0 ? "ambar" : "verde";
  if (metodo.metodo === "periodo") return "verde";
  const desv = metodo.tipo === "absoluta" ? Math.abs(pesoActual - pesoObjetivo) : Math.abs(pesoActual - pesoObjetivo) / pesoObjetivo;
  if (desv > metodo.banda) return "rojo";
  if (desv > metodo.banda * 0.6) return "ambar";
  return "verde";
}

function rangoDe(objetivo: number, metodo: MetodoRebalanceo): { min: number; max: number } {
  if (metodo.metodo === "periodo") return { min: objetivo, max: objetivo };
  if (metodo.tipo === "absoluta") return { min: Math.max(0, objetivo - metodo.banda), max: Math.min(1, objetivo + metodo.banda) };
  return { min: objetivo * (1 - metodo.banda), max: objetivo * (1 + metodo.banda) };
}

/**
 * Banda de tolerancia de un objetivo según el método del plan: ±X puntos
 * (absoluta) o ±Y % del objetivo (relativa). Por periodo no hay banda: min y
 * max coinciden con el objetivo. Es la misma que usa el semáforo.
 */
export function bandaDe(objetivo: number, plan: Plan): { min: number; max: number } {
  return rangoDe(objetivo, plan.rebalanceo ?? METODO_POR_DEFECTO);
}

/** Reparto de un grupo entre sus posiciones: proporcional a lo que tienen; a partes iguales si están a cero. */
function cuotas(posiciones: Posicion[]): number[] {
  const suma = posiciones.reduce((s, p) => s + (p.valor || 0), 0);
  if (posiciones.length === 0) return [];
  if (suma <= 0) return posiciones.map(() => 1 / posiciones.length);
  return posiciones.map((p) => (p.valor || 0) / suma);
}

/**
 * Estado de la cartera. `capitalFinalNucleo` evalúa el Núcleo contra un
 * patrimonio distinto del actual (tras una aportación), como la Excel.
 * `hoy` permite fijar la fecha (tests).
 */
export function calcularEstado(cartera: Cartera, opciones: { capitalFinalNucleo?: number; hoy?: Date } = {}): Estado {
  const metodo = cartera.plan.rebalanceo ?? METODO_POR_DEFECTO;
  const valorDe = (p: Posicion) => p.valor || 0;
  const total = cartera.posiciones.reduce((s, p) => s + valorDe(p), 0);
  const delNucleo = cartera.posiciones.filter((p) => p.parte === "nucleo");
  const nucleo = delNucleo.reduce((s, p) => s + valorDe(p), 0);
  const base = opciones.capitalFinalNucleo ?? nucleo;
  const vacia = total <= 0;
  const sinPlan = !planDefinido(cartera.plan);
  const conRepartoRV = !sinPlan && (cartera.plan.objetivo.rv ?? 0) > 0 && repartoRVDefinido(cartera.plan);

  const partes: EstadoParte[] = PARTES.map((pt) => {
    const valor = cartera.posiciones.filter((p) => p.parte === pt.id).reduce((s, p) => s + valorDe(p), 0);
    const pesoTotal = total > 0 ? valor / total : 0;
    const tope = pt.id === "satelite" ? (cartera.plan.topeSatelite ?? TOPE_SATELITE_POR_DEFECTO) : pt.id === "play" ? (cartera.plan.topePlay ?? TOPE_PLAY_POR_DEFECTO) : undefined;
    return { parte: pt.id, nombre: pt.nombre, valor, pesoTotal, tope, excedido: tope !== undefined && tope > 0 && pesoTotal > tope + 1e-9 && valor >= IMPORTE_MINIMO };
  });

  const categorias: EstadoCategoria[] = CATEGORIAS.map((c) => {
    const propias = delNucleo.filter((p) => p.categoria === c.id);
    const valor = propias.reduce((s, p) => s + valorDe(p), 0);
    const objetivo = sinPlan ? 0 : (cartera.plan.objetivo[c.id] ?? 0);
    const valorObjetivo = objetivo * base;
    const pesoActual = base > 0 ? valor / base : 0;
    const diferencia = valorObjetivo - valor;
    const semaforo = vacia || sinPlan ? "verde" : semaforoDe(objetivo, pesoActual, diferencia, metodo);
    return {
      categoria: c.id,
      nombre: c.nombre,
      valor,
      pesoObjetivo: objetivo,
      pesoActual,
      valorObjetivo,
      diferencia,
      desviacionRelativa: objetivo > 0 ? (pesoActual - objetivo) / objetivo : 0,
      semaforo,
      rango: bandaDe(objetivo, cartera.plan),
      fueraDePlan: !sinPlan && objetivo <= 0 && valor >= IMPORTE_MINIMO,
      sinActivos: objetivo > 0 && propias.length === 0,
    };
  }).filter((c) => c.pesoObjetivo > 0 || c.valor > 0);

  // Reparto de la renta variable por región/sector (pesos sobre el Núcleo).
  const subcategoriasRV: EstadoSubRV[] = [];
  const rvNucleo = delNucleo.filter((p) => p.categoria === "rv");
  if (conRepartoRV) {
    const pesoRV = cartera.plan.objetivo.rv ?? 0;
    const grupos: { sub: SubRV | "sin-clasificar"; nombre: string; fraccion: number; propias: Posicion[] }[] = SUBS_RV.map((s) => ({
      sub: s.id,
      nombre: s.nombre,
      fraccion: cartera.plan.objetivoRV?.[s.id] ?? 0,
      propias: rvNucleo.filter((p) => p.sub === s.id),
    }));
    const sinClasificar = rvNucleo.filter((p) => !p.sub);
    if (sinClasificar.length > 0) grupos.push({ sub: "sin-clasificar", nombre: "Sin región ni sector", fraccion: 0, propias: sinClasificar });
    for (const g of grupos) {
      const valor = g.propias.reduce((s, p) => s + valorDe(p), 0);
      const objetivo = pesoRV * g.fraccion;
      if (objetivo <= 0 && valor <= 0) continue;
      const valorObjetivo = objetivo * base;
      const pesoActual = base > 0 ? valor / base : 0;
      const diferencia = valorObjetivo - valor;
      subcategoriasRV.push({
        sub: g.sub,
        nombre: g.nombre,
        valor,
        pesoObjetivo: objetivo,
        pesoActual,
        valorObjetivo,
        diferencia,
        desviacionRelativa: objetivo > 0 ? (pesoActual - objetivo) / objetivo : 0,
        semaforo: vacia ? "verde" : semaforoDe(objetivo, pesoActual, diferencia, metodo),
        rango: bandaDe(objetivo, cartera.plan),
        sinActivos: objetivo > 0 && g.propias.length === 0,
      });
    }
  }

  const lineas: EstadoLinea[] = [];
  for (const c of categorias) {
    if (c.categoria === "rv" && conRepartoRV) {
      // Cada posición de bolsa apunta al objetivo de su región/sector.
      for (const s of subcategoriasRV) {
        const propias = s.sub === "sin-clasificar" ? rvNucleo.filter((p) => !p.sub) : rvNucleo.filter((p) => p.sub === s.sub);
        const q = cuotas(propias);
        propias.forEach((p, i) => {
          const valorObjetivo = s.valorObjetivo * (q[i] ?? 0);
          lineas.push({ posicion: p, pesoActual: base > 0 ? valorDe(p) / base : 0, valorObjetivo, diferencia: valorObjetivo - valorDe(p) });
        });
      }
      continue;
    }
    const propias = delNucleo.filter((p) => p.categoria === c.categoria);
    const q = cuotas(propias);
    propias.forEach((p, i) => {
      const valorObjetivo = c.valorObjetivo * (q[i] ?? 0);
      lineas.push({ posicion: p, pesoActual: base > 0 ? valorDe(p) / base : 0, valorObjetivo, diferencia: valorObjetivo - valorDe(p) });
    });
  }

  const avisos = categorias
    .filter((c) => c.semaforo !== "verde")
    .sort((a, b) => ORDEN[a.semaforo] - ORDEN[b.semaforo] || Math.abs(b.diferencia) - Math.abs(a.diferencia));

  let revision: Revision | undefined;
  if (metodo.metodo === "periodo" && !sinPlan && !vacia) {
    const desde = cartera.ultimoRebalanceo ?? cartera.actualizadoEl ?? new Date().toISOString();
    const proxima = sumarMeses(desde, metodo.meses);
    const hoy = opciones.hoy ?? new Date();
    revision = { proxima: proxima.toISOString(), pendiente: hoy.getTime() >= proxima.getTime(), meses: metodo.meses };
  }

  const semaforoPartes: Semaforo = partes.some((p) => p.excedido) ? "ambar" : "verde";
  const semaforoRevision: Semaforo = revision?.pendiente ? "ambar" : "verde";
  const semaforoSubs: Semaforo = peorSemaforo(subcategoriasRV.map((s) => s.semaforo));
  const semaforo = vacia || sinPlan ? "verde" : peorSemaforo([...categorias.map((c) => c.semaforo), semaforoSubs, semaforoPartes, semaforoRevision]);

  return { total, nucleo, partes, categorias, subcategoriasRV, lineas, semaforo, avisos, vacia, sinPlan, metodo, revision };
}

// ---------------------------------------------------------------------------
// Vista de la bolsa sobre la renta variable (la base en que el socio fija su plan)

export type SubRVSobreRV = {
  sub: SubRV | "sin-clasificar";
  nombre: string;
  valor: number;
  /** Peso actual sobre la renta variable del Núcleo. */
  pesoActual: number;
  /** Fracción del plan (objetivoRV), sobre la renta variable. */
  pesoObjetivo: number;
  /** Banda del plan aplicada a esa fracción. */
  rango: { min: number; max: number };
  /** Positivo = falta, negativo = sobra: el objetivo aplicado a la bolsa actual menos el valor. */
  diferencia: number;
  semaforo: Semaforo;
  sinActivos: boolean;
};

/**
 * Traduce las regiones/sectores del estado (pesos sobre el Núcleo) a pesos
 * sobre la renta variable, que es como el socio escribió su plan y como lo
 * calcularía a mano: «Global es el 92,3 % de mi bolsa; el plan dice 93 %».
 * Solo presentación: el semáforo es el que ya calculó el motor.
 */
export function subcategoriasSobreRV(estado: Estado, plan: Plan): SubRVSobreRV[] {
  const rv = estado.categorias.find((c) => c.categoria === "rv")?.valor ?? 0;
  return estado.subcategoriasRV.map((s) => {
    const fraccion = s.sub === "sin-clasificar" ? 0 : (plan.objetivoRV?.[s.sub] ?? 0);
    const pesoActual = rv > 0 ? s.valor / rv : 0;
    return {
      sub: s.sub,
      nombre: s.nombre,
      valor: s.valor,
      pesoActual,
      pesoObjetivo: fraccion,
      rango: bandaDe(fraccion, plan),
      diferencia: fraccion * rv - s.valor,
      semaforo: s.semaforo,
      sinActivos: s.sinActivos,
    };
  });
}

// ---------------------------------------------------------------------------
// Operaciones (Núcleo)

export type Operacion = {
  /** null cuando el plan pide una categoría o región/sector en que no hay ningún activo. */
  posicionId: string | null;
  nombre: string;
  isin: string;
  categoria: Categoria;
  sub?: SubRV;
  importe: number; // siempre positivo
};

export type PlanAportacion = {
  importe: number;
  compras: Operacion[];
  despues: Estado;
  corrige: boolean;
};

function redondearRepartiendo(importes: number[], total: number): number[] {
  const enteros = importes.map((x) => Math.floor(x));
  let resto = Math.round(total) - enteros.reduce((s, x) => s + x, 0);
  const orden = importes.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of orden) {
    if (resto <= 0) break;
    enteros[i] = (enteros[i] ?? 0) + 1;
    resto -= 1;
  }
  return enteros;
}

type Destino = { posicionId: string | null; nombre: string; isin: string; categoria: Categoria; sub?: SubRV; deficit: number; pesoObjetivo: number };

/** Destinos posibles de una compra: cada posición del Núcleo y, si el plan pide una categoría o región/sector vacíos, un hueco. */
function destinos(estado: Estado): Destino[] {
  const lista: Destino[] = estado.lineas.map((l) => ({
    posicionId: l.posicion.id,
    nombre: l.posicion.nombre,
    isin: l.posicion.isin,
    categoria: l.posicion.categoria,
    sub: l.posicion.sub,
    deficit: l.diferencia,
    pesoObjetivo: 0,
  }));
  const conRepartoRV = estado.subcategoriasRV.length > 0;
  for (const c of estado.categorias) {
    if (c.categoria === "rv" && conRepartoRV) continue;
    if (c.sinActivos) lista.push({ posicionId: null, nombre: `Un activo de ${c.nombre.toLowerCase()}`, isin: "", categoria: c.categoria, deficit: c.diferencia, pesoObjetivo: c.pesoObjetivo });
  }
  for (const s of estado.subcategoriasRV) {
    if (s.sinActivos && s.sub !== "sin-clasificar") lista.push({ posicionId: null, nombre: `Un activo de bolsa: ${s.nombre.toLowerCase()}`, isin: "", categoria: "rv", sub: s.sub, deficit: s.diferencia, pesoObjetivo: s.pesoObjetivo });
  }
  for (const d of lista) {
    if (!d.posicionId) continue;
    const linea = estado.lineas.find((l) => l.posicion.id === d.posicionId);
    if (!linea) continue;
    // Peso objetivo de la posición sobre el Núcleo (para repartir sobre cartera vacía).
    const grupoObjetivo = d.categoria === "rv" && conRepartoRV
      ? (estado.subcategoriasRV.find((s) => s.sub === (d.sub ?? "sin-clasificar"))?.pesoObjetivo ?? 0)
      : (estado.categorias.find((c) => c.categoria === d.categoria)?.pesoObjetivo ?? 0);
    const hermanas = estado.lineas.filter((l) => l.posicion.categoria === d.categoria && (d.categoria !== "rv" || !conRepartoRV || l.posicion.sub === d.sub));
    const q = cuotas(hermanas.map((l) => l.posicion));
    const idx = hermanas.findIndex((l) => l.posicion.id === d.posicionId);
    d.pesoObjetivo = grupoObjetivo * (q[idx] ?? 0);
  }
  return lista;
}

/**
 * Reparte una aportación entre lo que está por debajo de su objetivo en el
 * Núcleo. Si cubre todos los déficits, el Núcleo queda en el plan; si no, en
 * proporción a lo que le falta a cada destino. Nunca propone ventas.
 */
export function planificarAportacion(cartera: Cartera, importe: number): PlanAportacion {
  const importeNeto = Math.max(0, Math.round(importe));
  const actual = calcularEstado(cartera);
  const objetivo = calcularEstado(cartera, { capitalFinalNucleo: actual.nucleo + importeNeto });
  const dest = destinos(objetivo);
  const deficits = dest.map((d) => Math.max(0, d.deficit));
  const sumaDeficits = deficits.reduce((s, x) => s + x, 0);

  let brutos: number[];
  if (sumaDeficits <= 0) brutos = dest.map((d) => d.pesoObjetivo * importeNeto);
  else if (sumaDeficits <= importeNeto + 0.5) brutos = deficits;
  else brutos = deficits.map((d) => (d / sumaDeficits) * importeNeto);

  const enteros = redondearRepartiendo(brutos, importeNeto);
  const compras: Operacion[] = dest
    .map((d, i) => ({ posicionId: d.posicionId, nombre: d.nombre, isin: d.isin, categoria: d.categoria, sub: d.sub, importe: enteros[i] ?? 0 }))
    .filter((op) => op.importe > 0);

  const despues = calcularEstado(aplicarOperaciones(cartera, compras.map((c) => ({ posicionId: c.posicionId, categoria: c.categoria, sub: c.sub, delta: c.importe }))));
  const enRango = despues.categorias.every((c) => c.semaforo === "verde") && despues.subcategoriasRV.every((s) => s.semaforo === "verde");
  return { importe: importeNeto, compras, despues, corrige: enRango };
}

/** Aplica deltas; los que van a un hueco (posicionId null) crean una posición provisional en esa categoría. */
export function aplicarOperaciones(cartera: Cartera, cambios: { posicionId: string | null; categoria: Categoria; sub?: SubRV; delta: number }[]): Cartera {
  const posiciones = cartera.posiciones.map((p) => {
    const delta = cambios.filter((c) => c.posicionId === p.id).reduce((s, c) => s + c.delta, 0);
    return { ...p, valor: Math.max(0, Math.round((p.valor || 0) + delta)) };
  });
  for (const c of cambios.filter((x) => x.posicionId === null && x.delta > 0)) {
    const etiqueta = c.sub ? nombreSubRV(c.sub).toLowerCase() : nombreCategoria(c.categoria).toLowerCase();
    const nueva: Posicion = { id: nuevoId(), nombre: `Pendiente: ${etiqueta}`, isin: "", categoria: c.categoria, parte: "nucleo", valor: Math.round(c.delta) };
    if (c.sub) nueva.sub = c.sub;
    posiciones.push(nueva);
  }
  return { ...cartera, posiciones };
}

export type PlanRebalanceo = {
  ventas: Operacion[];
  compras: Operacion[];
  despues: Estado;
  /** Rojo por bandas o revisión periódica pendiente. */
  necesario: boolean;
};

/** Lleva cada activo del Núcleo a su valor objetivo sobre el Núcleo actual. */
export function planificarRebalanceo(cartera: Cartera, hoy?: Date): PlanRebalanceo {
  const estado = calcularEstado(cartera, { hoy });
  const ventas: Operacion[] = [];
  const compras: Operacion[] = [];
  for (const d of destinos(estado)) {
    const x = Math.round(d.deficit);
    if (Math.abs(x) < IMPORTE_MINIMO) continue;
    const op: Operacion = { posicionId: d.posicionId, nombre: d.nombre, isin: d.isin, categoria: d.categoria, sub: d.sub, importe: Math.abs(x) };
    if (x < 0) ventas.push(op);
    else compras.push(op);
  }
  const totalVentas = ventas.reduce((s, v) => s + v.importe, 0);
  const totalCompras = compras.reduce((s, c) => s + c.importe, 0);
  const mayor = compras.reduce<Operacion | undefined>((m, c) => (!m || c.importe > m.importe ? c : m), undefined);
  if (mayor && totalCompras !== totalVentas) mayor.importe += totalVentas - totalCompras;

  const despues = calcularEstado(
    aplicarOperaciones(cartera, [
      ...ventas.map((v) => ({ posicionId: v.posicionId, categoria: v.categoria, sub: v.sub, delta: -v.importe })),
      ...compras.map((c) => ({ posicionId: c.posicionId, categoria: c.categoria, sub: c.sub, delta: c.importe })),
    ]),
    { hoy },
  );
  return { ventas, compras, despues, necesario: estado.semaforo === "rojo" || estado.revision?.pendiente === true };
}

// ---------------------------------------------------------------------------
// Textos del semáforo

export function mesAno(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

export function textoSemaforo(estado: Estado): { titulo: string; detalle: string } {
  if (estado.vacia) return { titulo: "Sin activos", detalle: "Añade lo que tienes, en euros, y verás el estado de tu cartera." };
  if (estado.sinPlan) return { titulo: "Falta tu plan", detalle: "Di qué peso quieres para cada categoría de tu Cartera Núcleo y la app te dirá si estás en él." };
  const parteExcedida = estado.partes.find((p) => p.excedido);
  const peor = estado.avisos[0];
  const peorSub = [...estado.subcategoriasRV].filter((s) => s.semaforo !== "verde").sort((a, b) => ORDEN[a.semaforo] - ORDEN[b.semaforo] || Math.abs(b.diferencia) - Math.abs(a.diferencia))[0];

  if (estado.revision?.pendiente && !peor && !peorSub) {
    return {
      titulo: "Toca tu revisión",
      detalle: `Ha pasado el plazo que fijaste (${estado.revision.meses === 12 ? "un año" : "dos años"}). Mira qué sobra y qué falta y, si es poco, déjalo estar.${parteExcedida ? ` ${parteExcedida.nombre} supera su tope.` : ""}`,
    };
  }
  if (estado.semaforo === "verde") {
    const proxima = estado.revision ? ` Próxima revisión: ${mesAno(estado.revision.proxima)}.` : "";
    return { titulo: "Todo correcto", detalle: `Tu cartera está dentro de tu plan. No necesitas hacer nada.${proxima}` };
  }
  let quien = "";
  if (peor?.fueraDePlan) quien = `${peor.nombre} tiene dinero pero no está en tu plan.`;
  else if (peor) quien = `${peor.nombre} está ${peor.desviacionRelativa < 0 ? "por debajo" : "por encima"} de su rango.`;
  else if (peorSub && peorSub.sub === "sin-clasificar") quien = "Tienes bolsa sin región ni sector asignados.";
  else if (peorSub) quien = `Dentro de la bolsa, ${peorSub.nombre.toLowerCase()} está ${peorSub.desviacionRelativa < 0 ? "por debajo" : "por encima"} de su rango.`;
  else if (parteExcedida) quien = `${parteExcedida.nombre} supera el tope que le pusiste.`;
  if (estado.semaforo === "ambar") return { titulo: "Revisa tu cartera", detalle: `Tu cartera empieza a desviarse de tu plan. ${quien}`.trim() };
  return { titulo: "Tu cartera necesita rebalancearse", detalle: quien };
}

// ---------------------------------------------------------------------------
// Sugerir categoría y región/sector por el nombre (el socio siempre confirma)

const REGLAS: { categoria: Categoria; re: RegExp }[] = [
  { categoria: "oro", re: /\b(gold|oro|physical gold|xau)\b/i },
  { categoria: "rf-hy", re: /high[\s-]?yield|alto rendimiento|\bhy\b|emerging markets? (government )?bond|em bond|emerging markets? debt|fallen angel/i },
  { categoria: "rf-corp", re: /corporate|corporativ|credit|investment grade|\big\b/i },
  { categoria: "rf-gob", re: /government|govt|gov\b|treasury|treasuries|gilt|bund|sovereign|soberan|tesoro|gubernamental|deuda p[úu]blica|inflation[\s-]?linked|\btips\b|aggregate|agg\b|renta fija|fixed income|\bbond|bonos?\b|monetario|money market|cash|liquidez|euro short term|floating rate/i },
  { categoria: "rv", re: /equity|equities|stock|acciones|msci|s&p|sp500|ftse|nasdaq|stoxx|russell|world|europe|emerging|small[\s-]?cap|value|growth|dividend|momentum|quality|technology|health|energy|staples|utilities|financials|industrials|materials|real estate|reit|epra|nareit|index fund|indexado|renta variable|bolsa|ibex|dax|nikkei|topix|china|india|japan|usa|global/i },
];

export function sugerirCategoria(nombre: string): Categoria {
  for (const r of REGLAS) if (r.re.test(nombre)) return r.categoria;
  return "otros";
}

const REGLAS_SUB: { sub: SubRV; re: RegExp }[] = [
  { sub: "staples", re: /consumer staples|consumo b[áa]sico|staples/i },
  { sub: "salud", re: /health|salud|pharma|biotech/i },
  { sub: "tecnologia", re: /information technology|technology|tecnolog|semiconductor|software|nasdaq/i },
  { sub: "energia", re: /\benergy\b|energ[íi]a|oil|gas\b/i },
  { sub: "inmobiliario", re: /real estate|reit|epra|nareit|inmobiliari|property/i },
  { sub: "utilities", re: /utilities|utility/i },
  { sub: "smallcaps", re: /small[\s-]?cap|smallcap/i },
  { sub: "emergentes", re: /emerging|emergente|\bem\b|china|india|brasil|brazil/i },
  { sub: "eeuu", re: /s&p ?500|sp500|\busa?\b|us equity|united states|america|russell|dow jones|nasdaq/i },
  { sub: "europa", re: /europe|europa|euro ?stoxx|stoxx|ibex|dax|cac|ftse 100|eurozone/i },
  { sub: "asia", re: /japan|jap[óo]n|nikkei|topix|pacific|asia|korea|taiwan|australia/i },
  { sub: "global", re: /world|global|acwi|all[\s-]?country|developed|mundial|desarrollad/i },
];

export function sugerirSubRV(nombre: string, estrategia?: EstrategiaRV): SubRV | undefined {
  const permitidos = new Set(subsDe(estrategia).map((s) => s.id));
  for (const r of REGLAS_SUB) if (permitidos.has(r.sub) && r.re.test(nombre)) return r.sub;
  return undefined;
}
