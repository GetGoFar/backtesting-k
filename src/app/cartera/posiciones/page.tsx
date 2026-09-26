"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/mi-cartera/store";
import { BANDA_ABSOLUTA_POR_DEFECTO, BANDA_RELATIVA_POR_DEFECTO, CATEGORIAS, ESTRATEGIAS_RV, METODO_POR_DEFECTO, PARTES, TOPE_PLAY_POR_DEFECTO, TOPE_SATELITE_POR_DEFECTO, calcularEstado, mesAno, nombreCategoria, nombreSubRV, puedeIrAlNucleo, subsDe, sugerirCategoria, sugerirSubRV, sumarMeses, type Categoria, type EstrategiaRV, type Parte, type Plan, type Posicion, type SubRV, type TipoActivo } from "@/lib/mi-cartera/cartera";
import { buscarActivos, esIsin, nombreTipo, type Activo } from "@/lib/mi-cartera/buscar";
import { tramoPerfil } from "@/lib/mi-cartera/perfil";
import { eur, pct } from "@/lib/mi-cartera/formato";
import { Boton, Cargando, InputEuros, Tarjeta, Titulo } from "@/components/mi-cartera/ui";
import { Importar } from "@/components/mi-cartera/Importar";
import { BuscadorIsin, ES_ISIN_RE } from "@/components/mi-cartera/BuscadorIsin";
import { pedirSugerencia, resumenEodhd, type RespuestaComposicion } from "@/lib/mi-cartera/composicion-cliente";

// ---------------------------------------------------------------------------
// Hoja de alta: buscar → confirmar categoría y parte → euros

type Elegido = { nombre: string; isin: string; categoria: Categoria; tipo?: TipoActivo; sub?: SubRV };

function SelectorSub({ id, valor, estrategia, onChange }: { id: string; valor: SubRV | undefined; estrategia: EstrategiaRV | undefined; onChange: (s: SubRV | undefined) => void }) {
  const opciones = subsDe(estrategia);
  const regiones = opciones.filter((o) => o.tipo === "region");
  const sectores = opciones.filter((o) => o.tipo === "sector");
  return (
    <select id={id} value={valor ?? ""} onChange={(e) => onChange((e.target.value || undefined) as SubRV | undefined)} className="mt-1.5 w-full text-tinta">
      <option value="">Sin asignar</option>
      {regiones.length > 0 && (
        <optgroup label="Regiones">
          {regiones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </optgroup>
      )}
      {sectores.length > 0 && (
        <optgroup label="Sectores">
          {sectores.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function HojaAlta({ parteInicial, estrategia, onAnadir, onCerrar }: { parteInicial: Parte; estrategia: EstrategiaRV | undefined; onAnadir: (p: Omit<Posicion, "id">) => void; onCerrar: () => void }) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Activo[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [aMano, setAMano] = useState(false);
  const [manual, setManual] = useState<{ nombre: string; isin: string; tipo: TipoActivo }>({ nombre: "", isin: "", tipo: "fondo" });
  const [elegido, setElegido] = useState<Elegido | undefined>();
  const [parte, setParte] = useState<Parte>(parteInicial);
  const [valor, setValor] = useState<number | undefined>();
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2 || aMano) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    setError(undefined);
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const r = await buscarActivos(texto, ctrl.current.signal);
        setResultados(r);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("No he podido buscar ahora mismo. Puedes añadirlo a mano.");
      } finally {
        setBuscando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, aMano]);

  const elegir = (e: Elegido) => {
    setElegido(e);
    setValor(undefined);
    // Las acciones de empresa no entran en el Núcleo.
    if (!puedeIrAlNucleo(e.tipo) && parte === "nucleo") setParte("satelite");
  };

  const esAccion = elegido !== undefined && !puedeIrAlNucleo(elegido.tipo);
  const pideSub = elegido?.categoria === "rv" && parte === "nucleo";

  const anadir = () => {
    if (!elegido) return;
    const nueva: Omit<Posicion, "id"> = { nombre: elegido.nombre.trim(), isin: elegido.isin.trim().toUpperCase(), categoria: elegido.categoria, parte, valor: valor ?? 0 };
    if (elegido.tipo) nueva.tipo = elegido.tipo;
    if (pideSub && elegido.sub) nueva.sub = elegido.sub;
    onAnadir(nueva);
    onCerrar();
  };

  return (
    <div className="mt-4 rounded-2xl border border-tinta/15 bg-crema p-4 md:p-5">
      {!elegido ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Añadir activo</p>
            <button type="button" onClick={onCerrar} className="text-sm text-gris hover:text-tinta">
              Cancelar
            </button>
          </div>
          {!aMano ? (
            <>
              <input
                type="text"
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nombre o ISIN"
                className="mt-3 w-full"
                aria-label="Buscar por nombre o ISIN"
              />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <button type="button" className="text-k hover:underline" onClick={() => elegir({ nombre: "Liquidez", isin: "", categoria: "otros", tipo: "otro" })}>
                  Liquidez (sin buscar)
                </button>
                <button type="button" className="text-k hover:underline" onClick={() => setAMano(true)}>
                  Añadir a mano
                </button>
              </div>
              {buscando && <p className="mt-3 text-sm text-gris">Buscando…</p>}
              {error && <p className="mt-3 text-sm text-rojo">{error}</p>}
              {!buscando && q.trim().length >= 2 && resultados.length === 0 && !error && (
                <p className="mt-3 text-sm text-gris">
                  Nada con ese nombre.{" "}
                  <button type="button" className="text-k hover:underline" onClick={() => setAMano(true)}>
                    Añádelo a mano
                  </button>
                  .
                </p>
              )}
              {resultados.length > 0 && (
                <ul className="mt-3 divide-y divide-borde rounded-xl border border-borde bg-white">
                  {resultados.map((r) => (
                    <li key={r.isin}>
                      <button type="button" onClick={() => elegir({ nombre: r.nombre, isin: r.isin, categoria: r.categoriaSugerida, tipo: r.tipo, sub: r.categoriaSugerida === "rv" ? sugerirSubRV(r.nombre, estrategia) : undefined })} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-crema">
                        <span className="min-w-0">
                          <span className="block truncate text-[15px]">{r.nombre}</span>
                          <span className="tabular text-xs text-gris">{r.isin}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-crema-2 px-2 py-0.5 text-xs text-gris">{nombreTipo(r.tipo)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              <input type="text" autoFocus value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} placeholder="Nombre del activo" aria-label="Nombre del activo" />
              <input type="text" value={manual.isin} onChange={(e) => setManual({ ...manual, isin: e.target.value })} placeholder="ISIN (opcional)" aria-label="ISIN" className="tabular" />
              <label className="block text-sm text-gris">
                ¿Qué es?
                <select value={manual.tipo} onChange={(e) => setManual({ ...manual, tipo: e.target.value as TipoActivo })} className="mt-1.5 w-full text-tinta">
                  <option value="fondo">Fondo de inversión</option>
                  <option value="etf">ETF</option>
                  <option value="accion">Acción de una empresa</option>
                  <option value="otro">Otra cosa (plan de pensiones, depósito…)</option>
                </select>
              </label>
              {manual.isin.trim() !== "" && !esIsin(manual.isin) && <p className="text-xs text-gris">Un ISIN tiene 12 caracteres, por ejemplo IE00B4L5Y983.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Boton
                  disabled={manual.nombre.trim().length < 2}
                  onClick={() => {
                    const categoria = manual.tipo === "accion" ? "rv" : sugerirCategoria(manual.nombre);
                    elegir({ nombre: manual.nombre, isin: manual.isin, categoria, tipo: manual.tipo, sub: categoria === "rv" ? sugerirSubRV(manual.nombre, estrategia) : undefined });
                  }}
                >
                  Continuar
                </Boton>
                <button type="button" className="text-sm text-gris hover:text-tinta" onClick={() => setAMano(false)}>
                  Volver a buscar
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium leading-snug">{elegido.nombre}</p>
              {elegido.isin && <p className="tabular text-sm text-gris">{elegido.isin}</p>}
            </div>
            <button type="button" onClick={() => setElegido(undefined)} className="shrink-0 text-sm text-gris hover:text-tinta">
              Cambiar
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-gris">
              Categoría
              <select value={elegido.categoria} onChange={(e) => setElegido({ ...elegido, categoria: e.target.value as Categoria })} className="mt-1.5 w-full text-tinta">
                {CATEGORIAS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <div className="text-sm text-gris">
              ¿Dónde va?
              <div className="mt-1.5 inline-flex w-full rounded-full bg-white border border-borde p-1" role="radiogroup">
                {PARTES.map((p) => {
                  const bloqueada = p.id === "nucleo" && esAccion;
                  return (
                    <button key={p.id} type="button" role="radio" aria-checked={parte === p.id} disabled={bloqueada} onClick={() => setParte(p.id)} className={`flex-1 rounded-full px-2 py-1.5 text-sm ${parte === p.id ? "bg-tinta text-white" : bloqueada ? "text-gris-2 cursor-not-allowed" : "text-gris hover:text-tinta"}`}>
                      {p.id === "nucleo" ? "Núcleo" : p.id === "satelite" ? "Satélite" : "Play"}
                    </button>
                  );
                })}
              </div>
              {esAccion && <p className="mt-1.5 text-xs text-gris">Las acciones de empresa van en Satélite o Play Money.</p>}
            </div>
          </div>

          {pideSub && (
            <label htmlFor="alta-sub" className="mt-4 block text-sm text-gris">
              Región o sector {elegido.sub ? <span className="text-gris-2">(sugerido)</span> : null}
              <SelectorSub id="alta-sub" valor={elegido.sub} estrategia={estrategia} onChange={(sub) => setElegido({ ...elegido, sub })} />
            </label>
          )}

          <label htmlFor="alta-valor" className="mt-4 block text-sm text-gris">
            ¿Cuánto vale hoy?
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <InputEuros id="alta-valor" valor={valor} onChange={setValor} className="w-full max-w-[220px]" autoFocus />
            <Boton onClick={anadir}>Añadir</Boton>
            <button type="button" onClick={onCerrar} className="text-sm text-gris hover:text-tinta">
              Cancelar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fila de un activo

// ISIN de una posición que llegó sin él (o con uno equivocado): se escribe a mano (se guarda cuando tiene
// los 12 caracteres, o al vaciarlo) o se busca por el nombre y el ticker; al elegir, ISIN y nombre oficial.
function EditorIsin({ posicion, onElegir }: { posicion: Posicion; onElegir: (cambios: Partial<Omit<Posicion, "id">>) => void }) {
  const [texto, setTexto] = useState(posicion.isin ?? "");
  return (
    <BuscadorIsin
      valor={texto}
      nombre={posicion.nombre}
      onCambio={(isin) => {
        setTexto(isin);
        const limpio = isin.trim();
        if (limpio === "" || ES_ISIN_RE.test(limpio)) onElegir({ isin: limpio === "" ? undefined : limpio });
      }}
      onElegir={(a) => {
        setTexto(a.isin);
        onElegir({ isin: a.isin, nombre: a.nombre });
      }}
    />
  );
}

function Fila({ p, valor, estrategia, onValor }: { p: Posicion; valor: number | undefined; estrategia: EstrategiaRV | undefined; onValor: (n: number | undefined) => void }) {
  const { editarPosicion, borrarPosicion } = useStore();
  const [editando, setEditando] = useState(false);
  const esAccion = !puedeIrAlNucleo(p.tipo);
  const rvNucleo = p.categoria === "rv" && p.parte === "nucleo";
  const isinValido = rvNucleo && !!p.isin && ES_ISIN_RE.test(p.isin);

  // Composición real (EODHD) de la bolsa del Núcleo: una petición por ISIN, con caché.
  // `undefined` = aún no se ha pedido o está en vuelo; `null` = sin composición.
  const [comp, setComp] = useState<RespuestaComposicion | null | undefined>(undefined);
  useEffect(() => {
    if (!isinValido) {
      setComp(undefined);
      return;
    }
    const ctrl = new AbortController();
    setComp(undefined);
    pedirSugerencia(p.isin, ctrl.signal).then(setComp, () => {
      if (!ctrl.signal.aborted) setComp(null);
    });
    return () => ctrl.abort();
  }, [isinValido, p.isin]);

  // Sin sub: se etiqueta sola con la casilla que da la composición para la estrategia del plan.
  // Con sub puesta (a mano o antes): no se toca; solo se rellena el % si falta y se conoce.
  const casillas = comp?.sugerencia.casillas;
  useEffect(() => {
    if (!rvNucleo || !comp?.composicion || !casillas) return;
    if (!p.sub) {
      const sub = comp.sugerencia[estrategia ?? "mixta"];
      if (sub) editarPosicion(p.id, { sub, subPct: casillas[sub] });
    } else if (p.subPct === undefined) {
      const pct = casillas[p.sub];
      if (pct !== undefined) editarPosicion(p.id, { subPct: pct });
    }
  }, [rvNucleo, comp, casillas, estrategia, p.id, p.sub, p.subPct, editarPosicion]);

  // La sugerencia por nombre queda de respaldo cuando no hay composición (sin clave EODHD,
  // fondos sin datos) o cuando la composición no decide (sectorial sin sector dominante).
  const sinComposicion = !isinValido || comp === null || (comp !== undefined && !comp.composicion);
  const compSinDecidir = !!comp?.composicion && !comp.sugerencia[estrategia ?? "mixta"];
  const sugerido = rvNucleo && !p.sub && (sinComposicion || compSinDecidir) ? sugerirSubRV(p.nombre, estrategia) : undefined;
  const cambiarSub = (sub: SubRV | undefined) => editarPosicion(p.id, { sub, subPct: sub ? casillas?.[sub] : undefined });
  const detalleSub = p.sub
    ? p.subPct !== undefined
      ? ` · ${Math.round(p.subPct)} %`
      : p.sub === "global" && comp?.sugerencia.region?.id === "global"
        ? " · sin región dominante"
        : ""
    : "";
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium leading-snug">{p.nombre}</p>
          <p className="text-sm text-gris">
            {p.isin && (
              <>
                <span className="tabular">{p.isin}</span>
                <span className="mx-1.5 text-gris-2">·</span>
              </>
            )}
            {nombreCategoria(p.categoria)}
            {rvNucleo && (
              <>
                <span className="mx-1.5 text-gris-2">·</span>
                <span className={p.sub ? "" : "text-ambar"}>{p.sub ? `${nombreSubRV(p.sub)}${detalleSub}` : "sin región ni sector"}</span>
                {sugerido && (
                  <>
                    {" "}
                    <button type="button" className="text-k hover:underline" onClick={() => cambiarSub(sugerido)}>
                      ¿{nombreSubRV(sugerido)}?
                    </button>
                  </>
                )}
              </>
            )}
            {esAccion && (
              <>
                <span className="mx-1.5 text-gris-2">·</span>
                acción
              </>
            )}
            <span className="mx-1.5 text-gris-2">·</span>
            <button type="button" className="text-k hover:underline" onClick={() => setEditando(!editando)}>
              {editando ? "cerrar" : "editar"}
            </button>
          </p>
        </div>
        <InputEuros valor={valor} onChange={onValor} className="w-[150px] shrink-0" />
      </div>
      {editando && (
        <div className="mt-3 grid gap-3 rounded-xl bg-crema p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs text-gris sm:col-span-3">
            Nombre
            <input type="text" value={p.nombre} onChange={(e) => editarPosicion(p.id, { nombre: e.target.value })} className="mt-1 w-full text-sm text-tinta" />
          </label>
          <div className="sm:col-span-3">
            <EditorIsin posicion={p} onElegir={(cambios) => editarPosicion(p.id, cambios)} />
          </div>
          <label className="block text-xs text-gris">
            Categoría
            <select value={p.categoria} onChange={(e) => editarPosicion(p.id, { categoria: e.target.value as Categoria })} className="mt-1 w-full text-sm text-tinta">
              {CATEGORIAS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-gris">
            Parte
            <select value={p.parte} onChange={(e) => editarPosicion(p.id, { parte: e.target.value as Parte })} className="mt-1 w-full text-sm text-tinta">
              {PARTES.map((x) => (
                <option key={x.id} value={x.id} disabled={x.id === "nucleo" && esAccion}>
                  {x.nombre}
                  {x.id === "nucleo" && esAccion ? " (no admite acciones)" : ""}
                </option>
              ))}
            </select>
          </label>
          {rvNucleo && (
            <label className="block text-xs text-gris sm:col-span-3">
              Región o sector
              <SelectorSub id={`sub-${p.id}`} valor={p.sub} estrategia={estrategia} onChange={cambiarSub} />
              {comp?.composicion && resumenEodhd(comp.sugerencia) && <span className="mt-1 block text-xs text-gris">Según EODHD: {resumenEodhd(comp.sugerencia)}</span>}
            </label>
          )}
          <button type="button" className="justify-self-start text-sm text-rojo hover:underline sm:pb-3" onClick={() => borrarPosicion(p.id)}>
            Quitar
          </button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Bloque (Núcleo / Satélite / Play Money)

function Bloque({ parte, posiciones, total, valores, estrategia, onValor, hojaAbierta, onAbrir, onCerrar }: { parte: Parte; posiciones: Posicion[]; total: number; valores: Record<string, number | undefined>; estrategia: EstrategiaRV | undefined; onValor: (id: string, n: number | undefined) => void; hojaAbierta: boolean; onAbrir: () => void; onCerrar: () => void }) {
  const { anadirPosicion } = useStore();
  const info = PARTES.find((p) => p.id === parte)!;
  const grupos = parte === "nucleo" ? CATEGORIAS.map((c) => ({ c, lista: posiciones.filter((p) => p.categoria === c.id) })).filter((g) => g.lista.length > 0) : [{ c: undefined, lista: posiciones }];
  return (
    <Tarjeta>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-xl">{info.nombre}</h2>
          <p className="text-sm text-gris">{info.detalle}</p>
        </div>
        <p className="tabular text-lg font-medium whitespace-nowrap">{eur(total)}</p>
      </div>

      {posiciones.length === 0 && !hojaAbierta && <p className="mt-4 text-sm text-gris">{parte === "nucleo" ? "Añade lo que tienes hoy. La liquidez también cuenta." : "Nada por aquí. Si no tienes, mejor."}</p>}

      {grupos.map((g, i) => (
        <div key={g.c?.id ?? i} className="mt-4">
          {g.c && <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gris">{g.c.nombre}</p>}
          <ul className="divide-y divide-borde">
            {g.lista.map((p) => (
              <Fila key={p.id} p={p} valor={valores[p.id]} estrategia={estrategia} onValor={(n) => onValor(p.id, n)} />
            ))}
          </ul>
        </div>
      ))}

      {hojaAbierta ? (
        <HojaAlta parteInicial={parte} estrategia={estrategia} onAnadir={(p) => anadirPosicion(p)} onCerrar={onCerrar} />
      ) : (
        <div className="mt-4">
          <Boton variante="secundario" onClick={onAbrir} className="!py-2">
            + Añadir activo
          </Boton>
        </div>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Mi plan

/** Porcentajes con hasta tres decimales: el plan admite 12,5 % o 33,333 % sin redondear al entero. */
const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
const es100 = (suma: number) => Math.abs(suma - 100) < 0.0005;
const fmtPct = (n: number) => redondear3(n).toLocaleString("es-ES", { maximumFractionDigits: 3 });
/** «Suma 100 %.» / «Suma 97,5 %. Faltan 2,5 puntos.» / «Suma 102 %. Sobran 2 puntos.» */
function textoSuma(prefijo: string, suma: number): string {
  if (es100(suma)) return `${prefijo} suma 100 %.`;
  const dif = redondear3(Math.abs(100 - suma));
  return `${prefijo} suma ${fmtPct(suma)} %. ${suma < 100 ? "Faltan" : "Sobran"} ${fmtPct(dif)} punto${dif === 1 ? "" : "s"}.`;
}

function InputPct({ id, valor, onChange, placeholder = "0" }: { id: string; valor: number | undefined; onChange: (n: number | undefined) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        max={100}
        step={0.001}
        value={valor === undefined ? "" : valor}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? undefined : redondear3(Math.max(0, Math.min(100, Number(e.target.value)))))}
        className="tabular w-full pr-9 text-right"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gris">%</span>
    </div>
  );
}

/** Masterclass «El arte del rebalanceo», en Ataraxia (Sesiones). Cambiar cuando la app viva dentro del portal. */
const ENLACE_MASTERCLASS_REBALANCEO = process.env.NEXT_PUBLIC_ENLACE_MASTERCLASS_REBALANCEO ?? "https://hub.elproyectok.com/course/ataraxia";

function OpcionMetodo({ activa, titulo, detalle, onClick }: { activa: boolean; titulo: string; detalle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${activa ? "border-tinta bg-white shadow-card" : "border-borde bg-white hover:border-tinta/30"}`}>
      <p className="font-medium">{titulo}</p>
      <p className="mt-0.5 text-sm text-gris leading-snug">{detalle}</p>
    </button>
  );
}

function MiPlan({ plan, nucleo, ultimoRebalanceo }: { plan: Plan; nucleo: number; ultimoRebalanceo?: string }) {
  const { datos, fijarPlan, usarActualComoPlan } = useStore();
  const aPct = (f: number | undefined) => (f === undefined ? undefined : redondear3(f * 100));
  const [pesos, setPesos] = useState<Partial<Record<Categoria, number | undefined>>>(() => Object.fromEntries(CATEGORIAS.map((c) => [c.id, aPct(plan.objetivo[c.id])])));
  const [topeSat, setTopeSat] = useState<number | undefined>(aPct(plan.topeSatelite));
  const [topePlay, setTopePlay] = useState<number | undefined>(aPct(plan.topePlay));
  const reb = plan.rebalanceo ?? METODO_POR_DEFECTO;
  const [metodo, setMetodo] = useState<"periodo" | "bandas">(reb.metodo);
  const [meses, setMeses] = useState<12 | 24>(reb.metodo === "periodo" ? reb.meses : 12);
  const [tipoBanda, setTipoBanda] = useState<"absoluta" | "relativa">(reb.metodo === "bandas" ? reb.tipo : "absoluta");
  const [banda, setBanda] = useState<number | undefined>(reb.metodo === "bandas" ? Math.round(reb.banda * 100) : undefined);
  const [ultimo, setUltimo] = useState<string>(() => (ultimoRebalanceo ?? new Date().toISOString()).slice(0, 10));
  const [estrategia, setEstrategia] = useState<EstrategiaRV>(plan.estrategiaRV ?? "geografica");
  const [pesosRV, setPesosRV] = useState<Partial<Record<SubRV, number | undefined>>>(() => Object.fromEntries(subsDe(undefined).map((s) => [s.id, aPct(plan.objetivoRV?.[s.id])])));
  const [diaAportacion, setDiaAportacion] = useState<number | undefined>(plan.aportacion?.dia);
  const [guardado, setGuardado] = useState(false);
  // «Usar mi reparto actual como plan»: el plan anterior se guarda para poder deshacer durante unos segundos.
  const planAnterior = useRef<Plan | undefined>(undefined);
  const [deshacerVisible, setDeshacerVisible] = useState(false);
  const temporizadorDeshacer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(temporizadorDeshacer.current), []);
  const subsVisibles = subsDe(estrategia);
  const sumaRV = subsVisibles.reduce((s, x) => s + (pesosRV[x.id] ?? 0), 0);
  const hayRV = (pesos.rv ?? 0) > 0;
  const repartoOk = !hayRV || es100(sumaRV);
  const bandaPorDefecto = Math.round((tipoBanda === "absoluta" ? BANDA_ABSOLUTA_POR_DEFECTO : BANDA_RELATIVA_POR_DEFECTO) * 100);
  const bandaOk = metodo === "periodo" || (banda ?? bandaPorDefecto) > 0;

  useEffect(() => {
    setPesos(Object.fromEntries(CATEGORIAS.map((c) => [c.id, aPct(plan.objetivo[c.id])])));
    setTopeSat(aPct(plan.topeSatelite));
    setTopePlay(aPct(plan.topePlay));
    if (plan.estrategiaRV) setEstrategia(plan.estrategiaRV);
    if (plan.objetivoRV) setPesosRV(Object.fromEntries(subsDe(undefined).map((s) => [s.id, aPct(plan.objetivoRV?.[s.id])])));
    setDiaAportacion(plan.aportacion?.dia);
  }, [plan]);

  const suma = CATEGORIAS.filter((c) => c.id !== "otros").reduce((s, c) => s + (pesos[c.id] ?? 0), 0);
  const ok = es100(suma);
  const perfil = datos.perfil;

  const guardar = () => {
    const objetivo: Plan["objetivo"] = {};
    for (const c of CATEGORIAS) if (c.id !== "otros" && (pesos[c.id] ?? 0) > 0) objetivo[c.id] = (pesos[c.id] ?? 0) / 100;
    const nuevo: Plan = { objetivo };
    if (topeSat !== undefined) nuevo.topeSatelite = topeSat / 100;
    if (topePlay !== undefined) nuevo.topePlay = topePlay / 100;
    if (diaAportacion !== undefined) nuevo.aportacion = { dia: diaAportacion };
    nuevo.rebalanceo = metodo === "periodo" ? { metodo: "periodo", meses } : { metodo: "bandas", tipo: tipoBanda, banda: (banda ?? bandaPorDefecto) / 100 };
    if (hayRV) {
      nuevo.estrategiaRV = estrategia;
      const objetivoRV: NonNullable<Plan["objetivoRV"]> = {};
      for (const s of subsVisibles) if ((pesosRV[s.id] ?? 0) > 0) objetivoRV[s.id] = (pesosRV[s.id] ?? 0) / 100;
      nuevo.objetivoRV = objetivoRV;
    }
    fijarPlan(nuevo, metodo === "periodo" ? new Date(`${ultimo}T12:00:00`).toISOString() : undefined);
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  const usarActual = () => {
    if (!window.confirm("¿Sustituir tu plan por el reparto actual? Puedes volver a cambiarlo después.")) return;
    planAnterior.current = plan;
    usarActualComoPlan();
    setDeshacerVisible(true);
    clearTimeout(temporizadorDeshacer.current);
    temporizadorDeshacer.current = setTimeout(() => setDeshacerVisible(false), 8000);
  };

  const deshacer = () => {
    if (planAnterior.current) fijarPlan(planAnterior.current);
    planAnterior.current = undefined;
    clearTimeout(temporizadorDeshacer.current);
    setDeshacerVisible(false);
  };

  return (
    <Tarjeta id="plan" className="scroll-mt-6">
      <h2 className="text-xl">Mi plan</h2>
      <p className="mt-1 text-sm text-gris">Tu plan es tuyo: cuánto quieres en cada categoría de tu Cartera Núcleo.</p>
      {perfil ? (
        <p className="mt-2 text-sm text-gris">
          Perfil {perfil.perfil}/10 · {tramoPerfil(perfil.perfil).nombre} · orientación: bolsa {tramoPerfil(perfil.perfil).bolsaOrientativa}.{" "}
          <Link href="/perfil" className="text-k hover:underline">
            Ver mi perfil
          </Link>
        </p>
      ) : (
        <p className="mt-2 text-sm text-gris">
          Si no sabes por dónde empezar,{" "}
          <Link href="/perfil" className="text-k hover:underline">
            haz el test de perfil
          </Link>
          .
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIAS.filter((c) => c.id !== "otros").map((c) => (
          <label key={c.id} htmlFor={`plan-${c.id}`} className="block text-sm text-gris">
            {c.nombre}
            <div className="mt-1">
              <InputPct id={`plan-${c.id}`} valor={pesos[c.id]} onChange={(n) => setPesos({ ...pesos, [c.id]: n })} />
            </div>
          </label>
        ))}
      </div>
      <p className={`tabular mt-3 text-sm ${ok ? "text-verde" : "text-gris"}`}>{textoSuma("El plan", suma)}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 max-w-sm">
        <label htmlFor="tope-sat" className="block text-sm text-gris">
          Tope Satélite (del total)
          <div className="mt-1">
            <InputPct id="tope-sat" valor={topeSat} onChange={setTopeSat} placeholder={`${Math.round(TOPE_SATELITE_POR_DEFECTO * 100)} (por defecto)`} />
          </div>
        </label>
        <label htmlFor="tope-play" className="block text-sm text-gris">
          Tope Play Money (del total)
          <div className="mt-1">
            <InputPct id="tope-play" valor={topePlay} onChange={setTopePlay} placeholder={`${Math.round(TOPE_PLAY_POR_DEFECTO * 100)} (por defecto)`} />
          </div>
        </label>
        <p className="text-xs text-gris col-span-2">Si lo dejas vacío, valen los topes por defecto. Un 0 quita el aviso.</p>
      </div>

      {hayRV && (
        <>
          <h3 className="mt-6 text-lg">La bolsa, ¿cómo la repartes?</h3>
          <p className="mt-1 text-sm text-gris">Por regiones, por sectores o una parte de cada. Porcentajes sobre tu renta variable.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {ESTRATEGIAS_RV.map((e) => (
              <OpcionMetodo key={e.id} activa={estrategia === e.id} titulo={e.nombre} detalle={e.detalle} onClick={() => setEstrategia(e.id)} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {subsVisibles.map((s) => (
              <label key={s.id} htmlFor={`rv-${s.id}`} className="block text-sm text-gris">
                {s.nombre}
                <div className="mt-1">
                  <InputPct id={`rv-${s.id}`} valor={pesosRV[s.id]} onChange={(n) => setPesosRV({ ...pesosRV, [s.id]: n })} />
                </div>
              </label>
            ))}
          </div>
          <p className={`tabular mt-3 text-sm ${es100(sumaRV) ? "text-verde" : "text-gris"}`}>{textoSuma("La bolsa", sumaRV)}</p>
        </>
      )}

      <h3 className="mt-6 text-lg">¿Cuándo rebalanceas?</h3>
      <p className="mt-1 text-sm text-gris">Elige un método y no lo cambies cada semana.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <OpcionMetodo activa={metodo === "periodo"} titulo="Por periodo" detalle="Revisas en una fecha fija y solo entonces ajustas. Entre medias, no miras. Es lo que recomienda El Proyecto K." onClick={() => setMetodo("periodo")} />
        <OpcionMetodo activa={metodo === "bandas"} titulo="Por bandas" detalle="Ajustas cuando una categoría se sale de un margen alrededor de su objetivo. Para carteras con muchos activos." onClick={() => setMetodo("bandas")} />
      </div>

      {metodo === "periodo" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 max-w-md">
          <label htmlFor="meses" className="block text-sm text-gris">
            Cada cuánto
            <select id="meses" value={meses} onChange={(e) => setMeses(Number(e.target.value) === 24 ? 24 : 12)} className="mt-1 w-full text-tinta">
              <option value={12}>Una vez al año</option>
              <option value={24}>Cada dos años</option>
            </select>
          </label>
          <label htmlFor="ultimo" className="block text-sm text-gris">
            Último rebalanceo
            <input id="ultimo" type="date" value={ultimo} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setUltimo(e.target.value || ultimo)} className="mt-1 w-full text-tinta" />
          </label>
          <p className="text-sm text-gris sm:col-span-2">Próxima revisión: {mesAno(sumarMeses(`${ultimo}T12:00:00`, meses).toISOString())}.</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <OpcionMetodo activa={tipoBanda === "absoluta"} titulo="Banda absoluta" detalle="Puntos de desviación. Con objetivo 60 % y banda 5, actúas por debajo del 55 % o por encima del 65 %." onClick={() => { setTipoBanda("absoluta"); setBanda(undefined); }} />
            <OpcionMetodo activa={tipoBanda === "relativa"} titulo="Banda relativa" detalle="Porcentaje del objetivo. Con objetivo 60 % y banda 25 %, actúas por debajo del 45 % o por encima del 75 %. Vigila más las categorías pequeñas." onClick={() => { setTipoBanda("relativa"); setBanda(undefined); }} />
          </div>
          <label htmlFor="banda" className="block text-sm text-gris max-w-[200px]">
            {tipoBanda === "absoluta" ? "Banda (puntos)" : "Banda (% del objetivo)"}
            <div className="mt-1">
              <InputPct id="banda" valor={banda} onChange={setBanda} placeholder={String(bandaPorDefecto)} />
            </div>
          </label>
          <p className="text-sm text-gris">
            Cuándo conviene cada una, con datos:{" "}
            <a href={ENLACE_MASTERCLASS_REBALANCEO} target="_blank" rel="noreferrer" className="text-k hover:underline">
              masterclass «El arte del rebalanceo»
            </a>
            .
          </p>
        </div>
      )}

      <h3 className="mt-6 text-lg">¿Qué día del mes aportas?</h3>
      <p className="mt-1 text-sm text-gris">Solo lo apuntamos para recordártelo. No cambia ningún cálculo.</p>
      <label htmlFor="dia-aportacion" className="mt-3 block text-sm text-gris max-w-[260px]">
        Día
        <select id="dia-aportacion" value={diaAportacion ?? ""} onChange={(e) => setDiaAportacion(e.target.value === "" ? undefined : Number(e.target.value))} className="mt-1 w-full text-tinta">
          <option value="">No aporto de forma fija</option>
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              El día {d}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Boton disabled={!ok || !bandaOk || !repartoOk} onClick={guardar}>
          {guardado ? "Plan guardado" : "Guardar plan"}
        </Boton>
        {nucleo > 0 && !deshacerVisible && (
          <button type="button" className="text-sm text-k hover:underline" onClick={usarActual}>
            Usar mi reparto actual como plan
          </button>
        )}
        {deshacerVisible && (
          <span className="text-sm text-gris" role="status">
            Plan sustituido por tu reparto actual.{" "}
            <button type="button" className="text-k hover:underline" onClick={deshacer}>
              Deshacer
            </button>
          </span>
        )}
      </div>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------
// Página

export default function PaginaCartera() {
  const { datos, hidratado, actualizarValores, ajustarAportado } = useStore();
  const router = useRouter();
  const cartera = datos.cartera;
  const posiciones = useMemo(() => cartera?.posiciones ?? [], [cartera]);
  const [valores, setValores] = useState<Record<string, number | undefined>>({});
  const [hoja, setHoja] = useState<Parte | undefined>();
  const [editandoAportado, setEditandoAportado] = useState(false);
  const [revisandoImportacion, setRevisandoImportacion] = useState(false);
  const [aportado, setAportado] = useState<number | undefined>();

  // Los inputs arrancan con lo guardado; una posición nueva entra con su valor.
  useEffect(() => {
    setValores((v) => {
      const out: Record<string, number | undefined> = {};
      for (const p of posiciones) out[p.id] = p.id in v ? v[p.id] : p.valor || undefined;
      return out;
    });
  }, [posiciones]);

  // Con un ancla en la URL (#plan, #aportado) la página arranca en <Cargando/> y el navegador no
  // encuentra el destino: al llegar el contenido, llevamos la vista al elemento del hash.
  useEffect(() => {
    if (!hidratado) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView();
  }, [hidratado]);

  if (!hidratado) return <Cargando />;

  const borrador = { ...(cartera ?? { posiciones: [], plan: { objetivo: {} }, aportado: 0 }), posiciones: posiciones.map((p) => ({ ...p, valor: valores[p.id] ?? 0 })) };
  const estado = calcularEstado(borrador);
  const hayCambios = posiciones.some((p) => (valores[p.id] ?? 0) !== p.valor);
  const porParte = (parte: Parte) => posiciones.filter((p) => p.parte === parte);
  const totalParte = (parte: Parte) => estado.partes.find((x) => x.parte === parte)?.valor ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <Titulo sub="Lo que tienes hoy, en euros. Tú decides dónde va cada cosa.">Mis posiciones</Titulo>

      <Importar compacto={posiciones.length > 0} onRevisando={setRevisandoImportacion} />

      {PARTES.map((pt) => (
        <Bloque key={pt.id} parte={pt.id} posiciones={porParte(pt.id)} total={totalParte(pt.id)} valores={valores} estrategia={borrador.plan.estrategiaRV} onValor={(id, n) => setValores((v) => ({ ...v, [id]: n }))} hojaAbierta={hoja === pt.id} onAbrir={() => setHoja(pt.id)} onCerrar={() => setHoja(undefined)} />
      ))}

      <MiPlan plan={borrador.plan} nucleo={estado.nucleo} ultimoRebalanceo={cartera?.ultimoRebalanceo} />

      <div className={`sticky bottom-[72px] md:bottom-4 z-10 ${revisandoImportacion ? "invisible" : ""}`}>
        <div className="rounded-2xl bg-tinta text-white shadow-lg px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/60">Patrimonio total</p>
            <p className="tabular text-xl font-medium">{eur(estado.total)}</p>
            {estado.total > 0 && <p className="tabular text-xs text-white/60">Núcleo {pct(estado.nucleo / estado.total, 0)}</p>}
          </div>
          {hayCambios ? (
            <Boton
              onClick={() => {
                actualizarValores(Object.fromEntries(posiciones.map((p) => [p.id, valores[p.id] ?? 0])));
                router.push("/cartera");
              }}
            >
              Guardar cambios
            </Boton>
          ) : (
            <Boton href="/cartera" disabled={posiciones.length === 0}>
              Ver el estado
            </Boton>
          )}
        </div>
      </div>

      {cartera && (
        <div id="aportado" className="scroll-mt-6 text-sm text-gris flex flex-wrap items-center gap-x-4 gap-y-2">
          {editandoAportado ? (
            <span className="flex items-center gap-2">
              Aportado hasta hoy
              <InputEuros valor={aportado ?? cartera.aportado} onChange={setAportado} className="w-40" autoFocus />
              <Boton
                variante="secundario"
                className="!py-2 !px-4"
                onClick={() => {
                  ajustarAportado(aportado ?? cartera.aportado);
                  setEditandoAportado(false);
                }}
              >
                Guardar
              </Boton>
            </span>
          ) : (
            <span>
              Aportado hasta hoy: <span className="tabular text-tinta">{eur(cartera.aportado)}</span>{" "}
              <button type="button" className="text-k hover:underline" onClick={() => setEditandoAportado(true)}>
                corregir
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
