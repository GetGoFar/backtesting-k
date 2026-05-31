// =============================================================================
// K-RAY TRANSLATIONS — Traducciones EN → ES para etiquetas de composición
// =============================================================================
//
// EODHD y FT.com devuelven los nombres de sectores, regiones, países y asset
// classes en inglés (Morningstar canonical taxonomy). Para mostrar los
// gráficos en castellano normalizamos cada etiqueta cuando agregamos en el
// motor K-Ray.
//
// Además de traducir, esta normalización **deduplica variantes**:
//   - "Consumer Cyclical" y "Consumer Cyclicals" → "Consumo Cíclico"
//   - "Financial Services" y "Financials" → "Servicios Financieros"
//   - "Healthcare" y "Health Care" → "Salud"
// Esto evita que el mismo sector aparezca como dos categorías separadas en
// la tarta cuando los fondos vienen de fuentes distintas.
// =============================================================================

/**
 * Normaliza una cadena para usarla como clave de lookup en los mapas de
 * traducción: minúsculas, sin acentos, sin caracteres no alfanuméricos.
 * Así "Consumer-Cyclical", "consumer cyclical" y "Consumer Cyclicals" caen
 * todos en variantes que podemos mapear por igual.
 */
function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // elimina combining diacritics tras NFD
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// -----------------------------------------------------------------------------
// Sectores — taxonomía Morningstar
// -----------------------------------------------------------------------------

const SECTOR_MAP: Record<string, string> = {
  // Tecnología
  technology: "Tecnología",
  "information technology": "Tecnología",
  tech: "Tecnología",

  // Servicios Financieros
  "financial services": "Servicios Financieros",
  financials: "Servicios Financieros",
  finance: "Servicios Financieros",

  // Salud
  healthcare: "Salud",
  "health care": "Salud",
  health: "Salud",

  // Consumo Cíclico
  "consumer cyclical": "Consumo Cíclico",
  "consumer cyclicals": "Consumo Cíclico",
  "consumer discretionary": "Consumo Cíclico",
  cyclical: "Consumo Cíclico",

  // Consumo Defensivo
  "consumer defensive": "Consumo Defensivo",
  "consumer staples": "Consumo Defensivo",
  defensive: "Consumo Defensivo",

  // Industriales
  industrials: "Industriales",
  industrial: "Industriales",

  // Comunicaciones
  "communication services": "Comunicaciones",
  communications: "Comunicaciones",
  "telecom services": "Comunicaciones",
  telecommunications: "Comunicaciones",
  telecom: "Comunicaciones",
  media: "Comunicaciones",

  // Materiales Básicos
  "basic materials": "Materiales Básicos",
  materials: "Materiales Básicos",

  // Energía
  energy: "Energía",
  oil: "Energía",
  "oil gas": "Energía",

  // Utilities / Suministros
  utilities: "Utilities",

  // Inmobiliario
  "real estate": "Inmobiliario",
  reits: "Inmobiliario",
  reit: "Inmobiliario",

  // Supergrupos Morningstar (Cyclical / Defensive / Sensitive)
  sensitive: "Sensible",

  // Otros / desconocido
  other: "Otros",
  unknown: "No clasificado",
  "not classified": "No clasificado",
};

// -----------------------------------------------------------------------------
// Regiones — broad regions Morningstar
// -----------------------------------------------------------------------------

const REGION_MAP: Record<string, string> = {
  "north america": "Norteamérica",
  northamerica: "Norteamérica",
  "latin america": "Latinoamérica",
  latinamerica: "Latinoamérica",
  americas: "América",

  "greater europe": "Europa Ampliada",
  "europe developed": "Europa Desarrollada",
  "developed europe": "Europa Desarrollada",
  "europe emerging": "Europa Emergente",
  "emerging europe": "Europa Emergente",
  "europe ex euro": "Europa ex-Euro",
  europe: "Europa",
  eurozone: "Eurozona",
  "united kingdom": "Reino Unido",
  uk: "Reino Unido",

  "greater asia": "Asia Ampliada",
  "asia developed": "Asia Desarrollada",
  "developed asia": "Asia Desarrollada",
  "asia emerging": "Asia Emergente",
  "emerging asia": "Asia Emergente",
  "asia ex japan": "Asia ex-Japón",
  asia: "Asia",
  japan: "Japón",
  australasia: "Australasia",

  "africa middle east": "África / Oriente Medio",
  "middle east": "Oriente Medio",
  "middle east africa": "África / Oriente Medio",
  africa: "África",
};

// -----------------------------------------------------------------------------
// Países
// -----------------------------------------------------------------------------

const COUNTRY_MAP: Record<string, string> = {
  "united states": "Estados Unidos",
  usa: "Estados Unidos",
  us: "Estados Unidos",
  "united kingdom": "Reino Unido",
  uk: "Reino Unido",
  eurozone: "Eurozona",
  "europe ex euro": "Europa ex-Euro",
  germany: "Alemania",
  france: "Francia",
  italy: "Italia",
  spain: "España",
  netherlands: "Países Bajos",
  switzerland: "Suiza",
  sweden: "Suecia",
  norway: "Noruega",
  denmark: "Dinamarca",
  finland: "Finlandia",
  belgium: "Bélgica",
  austria: "Austria",
  ireland: "Irlanda",
  luxembourg: "Luxemburgo",
  portugal: "Portugal",
  greece: "Grecia",
  poland: "Polonia",
  czechrepublic: "República Checa",
  "czech republic": "República Checa",
  hungary: "Hungría",
  romania: "Rumanía",
  russia: "Rusia",
  turkey: "Turquía",
  iceland: "Islandia",
  china: "China",
  "hong kong": "Hong Kong",
  hongkong: "Hong Kong",
  taiwan: "Taiwán",
  "south korea": "Corea del Sur",
  korea: "Corea del Sur",
  india: "India",
  indonesia: "Indonesia",
  malaysia: "Malasia",
  singapore: "Singapur",
  thailand: "Tailandia",
  philippines: "Filipinas",
  vietnam: "Vietnam",
  pakistan: "Pakistán",
  bangladesh: "Bangladés",
  japan: "Japón",
  brazil: "Brasil",
  mexico: "México",
  argentina: "Argentina",
  chile: "Chile",
  colombia: "Colombia",
  peru: "Perú",
  uruguay: "Uruguay",
  ecuador: "Ecuador",
  venezuela: "Venezuela",
  canada: "Canadá",
  australia: "Australia",
  "new zealand": "Nueva Zelanda",
  newzealand: "Nueva Zelanda",
  "south africa": "Sudáfrica",
  southafrica: "Sudáfrica",
  egypt: "Egipto",
  morocco: "Marruecos",
  nigeria: "Nigeria",
  kenya: "Kenia",
  "saudi arabia": "Arabia Saudí",
  saudiarabia: "Arabia Saudí",
  "united arab emirates": "Emiratos Árabes Unidos",
  uae: "Emiratos Árabes Unidos",
  qatar: "Catar",
  kuwait: "Kuwait",
  israel: "Israel",
};

// -----------------------------------------------------------------------------
// Asset class — equity / bond / cash / etc.
// -----------------------------------------------------------------------------

const ASSET_CLASS_MAP: Record<string, string> = {
  // Renta Variable
  equity: "Renta Variable",
  equities: "Renta Variable",
  stock: "Renta Variable",
  stocks: "Renta Variable",

  // Renta Fija
  bond: "Renta Fija",
  bonds: "Renta Fija",
  "fixed income": "Renta Fija",
  fixedincome: "Renta Fija",

  // Efectivo
  cash: "Efectivo",
  "cash and equivalents": "Efectivo",
  cashandequivalents: "Efectivo",
  "cash equivalents": "Efectivo",
  "usd cash": "Efectivo USD",

  // RV regional
  "non uk stock": "RV ex-Reino Unido",
  "non us stock": "RV ex-EEUU",
  "us stock": "RV EEUU",
  "uk stock": "RV Reino Unido",
  "stock non uk": "RV ex-Reino Unido",
  "stock non us": "RV ex-EEUU",
  "stock us": "RV EEUU",
  "stock uk": "RV Reino Unido",

  // RF regional
  "non uk bond": "RF ex-Reino Unido",
  "non us bond": "RF ex-EEUU",
  "us bond": "RF EEUU",
  "uk bond": "RF Reino Unido",
  "bond non uk": "RF ex-Reino Unido",
  "bond non us": "RF ex-EEUU",
  "bond us": "RF EEUU",
  "bond uk": "RF Reino Unido",

  // Otros instrumentos
  convertible: "Convertibles",
  convertibles: "Convertibles",
  preferred: "Preferentes",
  preferreds: "Preferentes",
  derivative: "Derivados",
  derivatives: "Derivados",

  // Alternativos
  commodity: "Materias Primas",
  commodities: "Materias Primas",
  "real estate": "Inmobiliario",
  realestate: "Inmobiliario",
  gold: "Oro",
  silver: "Plata",
  crypto: "Criptomonedas",
  cryptocurrency: "Criptomonedas",
  currency: "Divisa",

  // Catch-all
  other: "Otros",
  others: "Otros",
};

// -----------------------------------------------------------------------------
// Funciones públicas
// -----------------------------------------------------------------------------

/**
 * Capitaliza una cadena tipo "title case" para usarla como fallback cuando no
 * tenemos traducción explícita. "FOO bar" → "Foo Bar".
 */
function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function translateWith(
  map: Record<string, string>,
  raw: string,
  fallback?: (s: string) => string
): string {
  if (!raw) return raw;
  const key = normalizeKey(raw);
  const found = map[key];
  if (found) return found;
  return fallback ? fallback(raw) : raw;
}

export function translateSector(raw: string): string {
  return translateWith(SECTOR_MAP, raw, titleCase);
}

export function translateRegion(raw: string): string {
  return translateWith(REGION_MAP, raw, titleCase);
}

export function translateCountry(raw: string): string {
  return translateWith(COUNTRY_MAP, raw, titleCase);
}

export function translateAssetClass(raw: string): string {
  return translateWith(ASSET_CLASS_MAP, raw, titleCase);
}
