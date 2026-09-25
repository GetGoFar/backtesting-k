// =============================================================================
// BÚSQUEDA EN ESPAÑOL — normalización y sinónimos
// =============================================================================
//
// El buscador de fondos manda la consulta tal cual a EODHD, que solo entiende
// inglés: "mineras de oro" devolvía CERO resultados y "mineras" sacaba SQM y
// poco más, mientras que "gold miners" sí encontraba GDX y GDXJ. Y el catálogo
// local comparaba texto con acentos, así que "japon" no encontraba "Japón".
//
// Aquí viven las dos piezas que arreglan eso:
//   · `normalizaTexto`  — minúsculas y sin acentos, para comparar en local.
//   · `terminosEnIngles` — traduce la consulta a términos de mercado en inglés,
//     para reintentar en EODHD cuando la consulta en español no da nada.
//
// No pretende ser un traductor: es una lista corta y revisada a mano de lo que
// un alumno escribe de verdad al buscar un fondo.
// =============================================================================

/** Minúsculas, sin acentos y sin espacios de sobra. "Japón" → "japon". */
export function normalizaTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/**
 * Español → términos de mercado en inglés. Las claves van ya normalizadas
 * (sin acentos). Un término puede dar varias traducciones: se prueban todas.
 */
const SINONIMOS_ES: Record<string, string[]> = {
  mineras: ["mining", "miners"],
  mineria: ["mining", "miners"],
  oro: ["gold"],
  plata: ["silver"],
  petroleo: ["oil"],
  gas: ["gas"],
  energia: ["energy"],
  energias: ["energy"],
  renovables: ["renewable", "clean energy"],
  tecnologia: ["technology"],
  tecnologicas: ["technology"],
  salud: ["health", "healthcare"],
  farmaceuticas: ["pharmaceutical"],
  inmobiliario: ["real estate"],
  inmuebles: ["real estate"],
  emergentes: ["emerging markets"],
  mundial: ["world"],
  global: ["global"],
  europa: ["europe"],
  europeas: ["europe"],
  japon: ["japan"],
  china: ["china"],
  india: ["india"],
  eeuu: ["usa", "us"],
  estadounidenses: ["usa"],
  bonos: ["bond"],
  deuda: ["bond", "debt"],
  acciones: ["equity"],
  dividendo: ["dividend"],
  dividendos: ["dividend"],
  agua: ["water"],
  defensa: ["defense", "defence"],
  semiconductores: ["semiconductor"],
  sostenible: ["sustainable"],
  sostenibles: ["sustainable"],
  materias: ["commodities"],
  primas: ["commodities"],
  inmobiliarias: ["real estate"],
  pequenas: ["small cap"],
  bancos: ["banks"],
  consumo: ["consumer"],
};

/** Palabras vacías que no aportan nada al buscar y estorban al traducir. */
const VACIAS = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "un", "una"]);

/**
 * Traduce la consulta a posibles términos en inglés, de más a menos específico.
 * "mineras de oro" → ["gold mining", "gold miners", "mining", "miners", "gold"].
 * Devuelve [] si no reconoce ninguna palabra (entonces no hay nada que reintentar).
 */
export function terminosEnIngles(consulta: string): string[] {
  const palabras = normalizaTexto(consulta)
    .split(/\s+/)
    .filter((p) => p.length > 0 && !VACIAS.has(p));
  if (palabras.length === 0) return [];

  // Traducciones por palabra, conservando el orden de la consulta.
  const porPalabra = palabras.map((p) => SINONIMOS_ES[p]).filter((t): t is string[] => !!t);
  if (porPalabra.length === 0) return [];

  const salida: string[] = [];
  // Combinada: la primera traducción de cada palabra, en orden inverso, porque
  // en inglés el matiz va delante ("mineras de oro" → "gold mining", no
  // "mining gold"). Al invertir, el sustantivo (la PRIMERA palabra en español)
  // queda al final, así que es ahí donde se prueban todas sus variantes.
  if (porPalabra.length > 1) {
    const combinada = porPalabra.map((t) => t[0]!).reverse();
    for (const variante of porPalabra[0]!) {
      salida.push([...combinada.slice(0, -1), variante].join(" "));
    }
  }
  // Y cada término suelto, por si la combinación no existe como producto.
  for (const traducciones of porPalabra) {
    for (const t of traducciones) salida.push(t);
  }
  return [...new Set(salida)];
}

/**
 * ¿Casa la consulta con este texto? Compara sin acentos y, además, prueba las
 * traducciones al inglés como PALABRA COMPLETA — si no, "oro" → "gold" casaría
 * con "Goldman Sachs", que no es lo que nadie busca.
 */
export function coincideTexto(texto: string, consulta: string): boolean {
  const heno = normalizaTexto(texto);
  const q = normalizaTexto(consulta);
  if (q === "") return true;
  if (heno.includes(q)) return true;

  const palabras = q.split(/\s+/).filter((p) => p.length > 0);
  if (palabras.length > 1 && palabras.every((p) => heno.includes(p))) return true;

  for (const termino of terminosEnIngles(consulta)) {
    const patron = new RegExp(`\\b${termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (patron.test(heno)) return true;
  }
  return false;
}
