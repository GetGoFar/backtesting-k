// =============================================================================
// EODHD — presencia de la clave (SOLO SERVIDOR)
// =============================================================================
//
// Sin `EODHD_API_TOKEN` la app no falla: devuelve listas vacías. Eso hace que un
// despliegue mal configurado parezca un problema de datos ("no se pudo obtener
// el rango", "no encuentra el fondo") y cuesta horas descubrir que lo que falta
// es la variable de entorno. Pasó en sep-2026: la clave estaba solo en el
// entorno Production de Vercel, así que TODOS los previews de rama salían
// mudos. Este módulo centraliza la comprobación y el texto del aviso.
// =============================================================================

const TOKEN = process.env.EODHD_API_TOKEN || "";

/** ¿Puede este despliegue hablar con EODHD? */
export function hayClaveEodhd(): boolean {
  return TOKEN !== "" && TOKEN !== "demo";
}

/** Lo que se le enseña al usuario cuando no la hay. */
export const MENSAJE_SIN_CLAVE =
  "Este despliegue no tiene configurada la clave de datos (EODHD_API_TOKEN). " +
  "La búsqueda de fondos y los precios no funcionarán hasta que se añada a las " +
  "variables de entorno de este entorno de Vercel.";
