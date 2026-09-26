"use client";

// Importar la cartera desde una captura del bróker: elegir imagen (o pegarla),
// esperar la lectura, revisar cada fila y añadir. Nada entra sin confirmar.
// Si un activo ya está en la cartera (mismo ISIN), se le actualiza el importe
// en vez de duplicarlo: así la captura de cada mes sirve para poner al día.

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/mi-cartera/store";
import { CATEGORIAS, PARTES, type Posicion } from "@/lib/mi-cartera/cartera";
import { ES_ISIN, limpiarIsin, type PosicionImportada, type RespuestaImportacion } from "@/lib/mi-cartera/importar";
import { eur } from "@/lib/mi-cartera/formato";
import { Boton, InputEuros, Tarjeta } from "@/components/mi-cartera/ui";
import { BuscadorIsin } from "@/components/mi-cartera/BuscadorIsin";

const MAX_BYTES = 3.5 * 1024 * 1024;
const MAX_LADO = 2200;
const ESPERA_MAXIMA_MS = 58_000;

type Fila = PosicionImportada & { incluir: boolean };
type ModoImportacion = "actualizar" | "sustituir" | "satelite" | "play";
const MODOS: { id: ModoImportacion; nombre: string; detalle: string }[] = [
  { id: "actualizar", nombre: "Actualizar mi cartera", detalle: "Lo que ya tienes cambia de importe; lo nuevo se añade donde digas." },
  { id: "sustituir", nombre: "Sustituir la cartera actual", detalle: "Se quita todo lo que hay y queda solo esto. El plan no se toca." },
  { id: "satelite", nombre: "Añadir todo como Satélite", detalle: "Todas las filas van a la Cartera Satélite." },
  { id: "play", nombre: "Añadir todo como Play Money", detalle: "Todas las filas van a Play Money." },
];

/**
 * Las capturas grandes se reducen en el navegador para no pasar del límite del
 * servidor. Las fotos JPEG se recodifican siempre: el lienzo borra los
 * metadatos (EXIF, geolocalización) antes de enviarlas. Si el navegador no
 * puede, se envía el fichero tal cual y el servidor ya avisa si pesa de más.
 */
async function prepararImagen(archivo: File): Promise<Blob> {
  const reducir = archivo.size > MAX_BYTES;
  if (!reducir && archivo.type !== "image/jpeg") return archivo;
  try {
    const mapa = await createImageBitmap(archivo);
    const escala = reducir ? Math.min(1, MAX_LADO / Math.max(mapa.width, mapa.height)) : 1;
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(mapa.width * escala));
    lienzo.height = Math.max(1, Math.round(mapa.height * escala));
    lienzo.getContext("2d")?.drawImage(mapa, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise<Blob | null>((r) => lienzo.toBlob(r, "image/jpeg", 0.92));
    return blob ?? archivo;
  } catch {
    return archivo;
  }
}

const esEuro = (moneda: string | null) => !moneda || moneda.toUpperCase() === "EUR";

export function Importar({ compacto, onRevisando }: { compacto: boolean; onRevisando?: (revisando: boolean) => void }) {
  const { datos, anadirPosiciones, actualizarValores, sustituirPosiciones } = useStore();
  // Qué hacer con lo leído: actualizar lo que hay (lo normal cada mes), sustituir la cartera entera, o meterlo
  // todo en Satélite o en Play Money (una cuenta aparte, un bróker de apuestas…).
  const [modo, setModo] = useState<ModoImportacion>("actualizar");
  const [abierto, setAbierto] = useState(false);
  const [fase, setFase] = useState<"inicio" | "leyendo" | "revisar">("inicio");
  const [error, setError] = useState<string | undefined>();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [hecho, setHecho] = useState<{ nuevas: number; actualizadas: number } | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);
  const controlador = useRef<AbortController | null>(null);

  // La página esconde su barra fija mientras se revisa, para que no tape el botón de añadir.
  useEffect(() => {
    onRevisando?.(fase === "revisar");
    return () => onRevisando?.(false);
  }, [fase, onRevisando]);

  const procesar = useCallback(async (archivo: File) => {
    setError(undefined);
    setHecho(undefined);
    setAbierto(true);
    setFase("leyendo");
    const ctrl = new AbortController();
    controlador.current = ctrl;
    const temporizador = setTimeout(() => ctrl.abort("tiempo"), ESPERA_MAXIMA_MS);
    try {
      if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) throw new Error("Sube una imagen PNG, JPG o WebP.");
      const blob = await prepararImagen(archivo);
      const fd = new FormData();
      fd.append("imagen", blob, archivo.name || "captura.png");
      let res: Response;
      try {
        res = await fetch("/api/cartera/importar", { method: "POST", body: fd, signal: ctrl.signal });
      } catch (e) {
        if (ctrl.signal.aborted) {
          if (ctrl.signal.reason === "tiempo") throw new Error("La lectura ha tardado demasiado. Prueba con una captura de menos filas.");
          return; // cancelado por el socio: sin mensaje
        }
        throw new Error("No hay conexión ahora mismo. Vuelve a intentarlo en un momento.");
      }
      const data = (await res.json().catch(() => ({}))) as Partial<RespuestaImportacion> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `No he podido leer la captura (${res.status}).`);
      const pos = data.posiciones ?? [];
      if (pos.length === 0) throw new Error("No he encontrado posiciones en la captura. Prueba con la tabla de posiciones completa y nítida.");
      setFilas(pos.map((p) => ({ ...p, incluir: p.confianza !== "baja" && p.valor > 0 && esEuro(p.moneda) })));
      setAvisos(data.avisos ?? []);
      setFase("revisar");
    } catch (e) {
      setError((e as Error).message);
      setFase("inicio");
    } finally {
      clearTimeout(temporizador);
      if (controlador.current === ctrl) controlador.current = null;
    }
  }, []);

  // Pegar una captura con Ctrl+V mientras el panel está abierto.
  useEffect(() => {
    if (!abierto || fase !== "inicio") return;
    const alPegar = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        void procesar(f);
      }
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  }, [abierto, fase, procesar]);

  // Activos que ya están en la cartera, por ISIN: se actualizan en vez de duplicarse.
  const existentes = new Map<string, Posicion>();
  for (const p of datos.cartera?.posiciones ?? []) if (p.isin) existentes.set(p.isin.toUpperCase(), p);
  const parteForzada: Fila["parte"] | undefined = modo === "satelite" ? "satelite" : modo === "play" ? "play" : undefined;
  const parteDe = (f: Fila): Fila["parte"] => parteForzada ?? f.parte;
  const yaEnCartera = (f: Fila): Posicion | undefined => {
    if (modo === "sustituir" || !f.isin) return undefined;
    const p = existentes.get(limpiarIsin(f.isin));
    if (!p) return undefined;
    if (parteForzada && p.parte !== parteForzada) return undefined;
    return p;
  };

  const cambiar = (i: number, cambios: Partial<Fila>) => setFilas((fs) => fs.map((f, k) => (k === i ? { ...f, ...cambios } : f)));
  const seleccionadas = filas.filter((f) => f.incluir && f.valor > 0 && f.nombre.trim().length > 0);
  const nuevas = seleccionadas.filter((f) => !yaEnCartera(f));
  const actualizadas = seleccionadas.filter((f) => yaEnCartera(f));
  const totalSel = seleccionadas.reduce((s, f) => s + f.valor, 0);

  const cancelar = () => {
    controlador.current?.abort("socio");
    setFilas([]);
    setAvisos([]);
    setError(undefined);
    setFase("inicio");
    if (compacto) setAbierto(false);
  };

  const aPosicion = (f: Fila) => ({ nombre: f.nombre.trim(), isin: limpiarIsin(f.isin), categoria: f.categoria, parte: parteDe(f), valor: f.valor });
  const anadir = () => {
    if (modo === "sustituir") {
      sustituirPosiciones(seleccionadas.map(aPosicion));
      setHecho({ nuevas: seleccionadas.length, actualizadas: 0 });
    } else {
      if (actualizadas.length > 0) actualizarValores(Object.fromEntries(actualizadas.map((f) => [yaEnCartera(f)!.id, f.valor])));
      if (nuevas.length > 0) anadirPosiciones(nuevas.map(aPosicion));
      setHecho({ nuevas: nuevas.length, actualizadas: actualizadas.length });
    }
    setFilas([]);
    setAvisos([]);
    setFase("inicio");
    setAbierto(false);
  };

  const selectorArchivo = (
    <input
      ref={inputRef}
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void procesar(f);
      }}
    />
  );

  if (hecho && fase === "inicio" && !abierto) {
    const partes = [];
    if (hecho.nuevas > 0) partes.push(hecho.nuevas === 1 ? "1 activo añadido" : `${hecho.nuevas} activos añadidos`);
    if (hecho.actualizadas > 0) partes.push(hecho.actualizadas === 1 ? "1 importe actualizado" : `${hecho.actualizadas} importes actualizados`);
    return (
      <p className="text-sm text-gris">
        {partes.join(" y ")} desde la captura.{" "}
        <button
          type="button"
          className="text-k hover:underline"
          onClick={() => {
            setHecho(undefined);
            setAbierto(true);
          }}
        >
          Importar otra
        </button>
      </p>
    );
  }

  if (compacto && !abierto) {
    return (
      <p className="text-sm text-gris">
        ¿Tienes una captura de tu bróker?{" "}
        <button type="button" className="text-k hover:underline" onClick={() => setAbierto(true)}>
          Impórtala
        </button>{" "}
        y te ahorras teclear.
      </p>
    );
  }

  if (fase === "leyendo") {
    return (
      <Tarjeta>
        <h2 className="text-xl">Leyendo la captura…</h2>
        <p className="mt-2 text-gris leading-relaxed">Puede tardar medio minuto: leo la tabla, busco el ISIN de cada activo y sugiero su categoría.</p>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-crema-2" aria-hidden>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-k" />
        </div>
        <button type="button" className="mt-4 text-sm text-gris hover:text-tinta" onClick={cancelar}>
          Cancelar
        </button>
      </Tarjeta>
    );
  }

  if (fase === "revisar") {
    const etiquetaBoton =
      modo === "sustituir"
        ? `Sustituir por ${seleccionadas.length === 1 ? "1 activo" : `${seleccionadas.length} activos`}`
        : [nuevas.length > 0 ? (nuevas.length === 1 ? "Añadir 1" : `Añadir ${nuevas.length}`) : "", actualizadas.length > 0 ? (actualizadas.length === 1 ? "actualizar 1" : `actualizar ${actualizadas.length}`) : ""].filter(Boolean).join(" y ");
    return (
      <Tarjeta>
        <h2 className="text-xl">Revisa lo que he leído</h2>
        <p className="mt-1 text-sm text-gris">Confirma categoría y parte de cada activo. Lo que no quieras, desmárcalo.</p>
        <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">¿Qué hago con lo leído?</legend>
          {MODOS.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${modo === m.id ? "border-tinta bg-white" : "border-borde bg-crema/60"}`}>
              <input type="radio" name="modo-importacion" value={m.id} checked={modo === m.id} onChange={() => setModo(m.id)} className="mt-1 accent-[#C81E2E]" />
              <span>
                <span className="block font-medium">{m.nombre}</span>
                <span className="block text-xs text-gris">{m.detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {modo === "sustituir" && (datos.cartera?.posiciones.length ?? 0) > 0 && (
          <p className="mt-2 text-xs text-ambar">Ojo: se quitarán las {datos.cartera?.posiciones.length} posiciones que tienes ahora.</p>
        )}
        <ul className="mt-4 divide-y divide-borde">
          {filas.map((f, i) => {
            const ya = yaEnCartera(f);
            const enEuros = esEuro(f.moneda);
            return (
              <li key={f.clave} className={`py-3 ${f.incluir ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={f.incluir} onChange={(e) => cambiar(i, { incluir: e.target.checked })} className="mt-3 h-4 w-4 shrink-0 accent-[#C81E2E]" aria-label={`Incluir ${f.nombre}`} />
                  <div className="min-w-0 flex-1">
                    {ya ? (
                      <>
                        <p className="py-2 text-[15px] font-medium leading-snug">{ya.nombre}</p>
                        <div className="grid grid-cols-2 items-center gap-2">
                          <p className="text-xs text-gris">
                            Ya en tu cartera con {eur(ya.valor)}. Le pongo el importe nuevo.
                          </p>
                          <InputEuros valor={f.valor || undefined} onChange={(n) => cambiar(i, { valor: n ?? 0 })} className="w-full" />
                        </div>
                      </>
                    ) : (
                      <>
                        <input type="text" value={f.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} className="w-full !py-2 text-[15px]" aria-label="Nombre del activo" />
                        <div className="mt-2 grid grid-cols-2 gap-2 [&>*]:min-w-0 [&>*]:w-full">
                          {f.origen !== null && f.isin !== "" ? (
                            <p className="tabular self-center px-1 text-sm text-gris">{f.isin}</p>
                          ) : (
                            <div className="col-span-2">
                              <BuscadorIsin
                                compacto
                                valor={f.isin}
                                nombre={f.nombre}
                                ticker={f.ticker}
                                onCambio={(isin) => cambiar(i, { isin })}
                                onElegir={(a) => cambiar(i, { isin: a.isin, nombre: a.nombre, origen: "nombre", ambiguo: false })}
                              />
                            </div>
                          )}
                          <select value={f.categoria} onChange={(e) => cambiar(i, { categoria: e.target.value as Fila["categoria"] })} className="!py-2 text-sm" aria-label="Categoría">
                            {CATEGORIAS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre}
                              </option>
                            ))}
                          </select>
                          <select value={parteDe(f)} disabled={parteForzada !== undefined} onChange={(e) => cambiar(i, { parte: e.target.value as Fila["parte"] })} className="!py-2 text-sm disabled:opacity-60" aria-label="Parte de la cartera">
                            {PARTES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre.replace("Cartera ", "")}
                              </option>
                            ))}
                          </select>
                          <InputEuros valor={f.valor || undefined} onChange={(n) => cambiar(i, { valor: n ?? 0 })} className="w-full" />
                        </div>
                        {f.origen === null && (
                          <p className="mt-1 text-xs text-ambar">
                            {f.ambiguo ? "Hay varios productos con ese nombre y no quiero adivinar." : `No he encontrado el ISIN${f.ticker ? ` de ${f.ticker}` : ""}.`} Pulsa «Buscar» o escríbelo; si no, puedes añadirlo más tarde.
                          </p>
                        )}
                      </>
                    )}
                    {!enEuros && <p className="mt-1 text-xs text-ambar">Leído en {f.moneda}. Pásalo a euros y marca la fila.</p>}
                    {f.confianza === "baja" && <p className="mt-1 text-xs text-gris-2">No estoy seguro de que sea una posición: la he dejado sin marcar. Márcala si lo es.</p>}
                    {f.confianza === "media" && <p className="mt-1 text-xs text-gris-2">Lectura con dudas: comprueba el importe.</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {avisos.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-xs text-gris">
            {avisos.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Boton disabled={seleccionadas.length === 0} onClick={anadir}>
            {seleccionadas.length === 0 ? "Nada seleccionado" : `${etiquetaBoton} · ${eur(totalSel)}`}
          </Boton>
          <button type="button" className="text-sm text-gris hover:text-tinta" onClick={cancelar}>
            Cancelar
          </button>
        </div>
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Importar de una captura</h2>
          <p className="mt-1 text-gris leading-relaxed">Sube una captura de la tabla de posiciones de tu bróker. Leo nombre, ticker y valor, busco el ISIN y tú confirmas antes de añadir nada. Si un activo ya está en tu cartera, solo le actualizo el importe.</p>
        </div>
        {compacto && (
          <button type="button" className="shrink-0 text-sm text-gris hover:text-tinta" onClick={cancelar}>
            Cerrar
          </button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Boton onClick={() => inputRef.current?.click()}>Elegir imagen</Boton>
        <span className="hidden text-sm text-gris md:inline">o pega una captura con Ctrl+V</span>
      </div>
      {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
      <p className="mt-3 text-xs text-gris-2">La imagen se envía a Claude (Anthropic) solo para leerla y no se guarda. Los nombres de los activos se buscan en el catálogo del Laboratorio K y en el mercado.</p>
      {selectorArchivo}
    </Tarjeta>
  );
}
