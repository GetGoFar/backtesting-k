"use client";

// Estado de Mi cartera: en el navegador (localStorage) y, para el socio identificado, también en
// el servidor (/api/cartera/estado, ver sync.ts) para que se vea igual desde cualquier dispositivo.
// v2: el socio sube sus propios activos y fija su plan (nada se prefija).
//
// Cómo se sincroniza:
//   1. Al montar se lee localStorage. La red no se toca hasta que una página usa el store
//      (useStore avisa al proveedor): el Backtest y las páginas públicas no hacen ninguna petición.
//   2. Entonces se hace un GET: si el servidor tiene algo más reciente (sello `guardado`) o aquí no
//      hay nada, se adopta y se escribe en localStorage; si lo de aquí es más nuevo, se sube.
//      Hasta que ese GET no responde bien (con identidad o sin ella) el store está "sin confirmar":
//      enseña lo local (o vacío) pero NO sube nada, porque no sabe qué hay guardado y podría
//      pisarlo. Si el GET falla o tarda más de ESPERA_SERVIDOR_MS, se reintenta con el siguiente
//      cambio y al volver a la pestaña.
//   3. Cada cambio sella `guardado`, se escribe en localStorage y se sube con un debounce de 800 ms.
//      Si el servidor responde 409 (tiene algo más reciente), se adopta lo suyo en vez de insistir.
//      Otros fallos se ignoran en silencio: localStorage ya lo tiene y el próximo cambio reintenta.
//      Si el servidor no reconoce al socio, no se vuelve a intentar hasta la siguiente carga.
//   4. Dos pestañas del mismo navegador se sincronizan por el evento `storage`.
//   5. `guardadoEn` dice dónde vive la cartera ahora mismo (servidor · navegador · sin-confirmar),
//      para que la pantalla se lo diga al socio.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { calcularPerfil, type Respuestas, type ResultadoPerfil } from "./perfil";
import { aplicarOperaciones, calcularEstado, carteraVacia, esRegion, nuevoId, type Cartera, type Categoria, type Plan, type Posicion, type SubRV } from "./cartera";
import {
  ESTADO_SERVIDOR_INICIAL,
  EstadoAnticuado,
  SinIdentidad,
  accionAlCambiar,
  cargarEstado,
  estaVacio,
  guardadoEn as guardadoEnDe,
  guardarEstado,
  mandaElServidor,
  type EstadoServidor,
  type GuardadoEn,
} from "./sync";

export type { GuardadoEn } from "./sync";

export type Movimiento = {
  fecha: string;
  tipo: "aportacion" | "rebalanceo" | "revision" | "actualizacion";
  importe?: number;
  total: number;
};

export type Datos = {
  version: 2;
  perfil?: ResultadoPerfil & { respuestas: Respuestas; fecha: string };
  cartera?: Cartera;
  movimientos: Movimiento[];
  /** Sello (ISO) del último cambio. Decide quién manda entre el navegador y el servidor. */
  guardado?: string;
};

const CLAVE = "cartera-k:v2";
const VACIO: Datos = { version: 2, movimientos: [] };
const ESPERA_GUARDADO_MS = 800;
/** Cuánto se espera al servidor antes de enseñar una cartera vacía (si aquí ya hay datos no se
 *  espera). Pasado ese tiempo sin respuesta, el store sigue "sin confirmar" hasta que llegue. */
const ESPERA_SERVIDOR_MS = 3000;

export type Cambio = { posicionId: string | null; categoria: Categoria; sub?: SubRV; delta: number };

type Acciones = {
  guardarPerfil: (respuestas: Respuestas) => ResultadoPerfil;
  anadirPosicion: (p: Omit<Posicion, "id">) => string;
  anadirPosiciones: (lista: Omit<Posicion, "id">[]) => void;
  /** Deja SOLO estas posiciones (el plan, el perfil y lo aportado no se tocan). Para «sustituir la cartera» al importar. */
  sustituirPosiciones: (lista: Omit<Posicion, "id">[]) => void;
  editarPosicion: (id: string, cambios: Partial<Omit<Posicion, "id">>) => void;
  borrarPosicion: (id: string) => void;
  actualizarValores: (valores: Record<string, number>) => void;
  fijarPlan: (plan: Plan, ultimoRebalanceo?: string) => void;
  marcarRevisado: () => void;
  usarActualComoPlan: () => void;
  registrarAportacion: (compras: Cambio[], importe: number) => void;
  registrarRebalanceo: (cambios: Cambio[]) => void;
  ajustarAportado: (aportado: number) => void;
  borrarTodo: () => void;
};

type Contexto = {
  datos: Datos;
  hidratado: boolean;
  /** Dónde vive la cartera ahora mismo: en la cuenta del socio, solo en este navegador, o aún
   *  sin saberlo (el servidor no ha contestado bien). */
  guardadoEn: GuardadoEn;
  /** El primer GET ya ha respondido (bien o mal) o ha agotado la espera: a partir de aquí
   *  `guardadoEn` se puede enseñar sin que parpadee durante la primera consulta. */
  servidorConsultado: boolean;
} & Acciones;

const Ctx = createContext<Contexto | null>(null);
/** Por aquí useStore avisa al proveedor de que alguien usa los datos, y arranca la sincronización. */
const CtxActivar = createContext<() => void>(() => {});

function leer(): Datos {
  try {
    const raw = window.localStorage.getItem(CLAVE);
    if (!raw) return VACIO;
    const d = JSON.parse(raw) as Datos;
    if (d.version !== 2) return VACIO;
    return { ...VACIO, ...d };
  } catch {
    return VACIO;
  }
}

function escribir(d: Datos): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify(d));
  } catch {
    /* sin almacenamiento: la app sigue funcionando en memoria */
  }
}

const ahora = () => new Date().toISOString();
const movimiento = (tipo: Movimiento["tipo"], total: number, importe?: number): Movimiento =>
  importe === undefined ? { fecha: ahora(), tipo, total } : { fecha: ahora(), tipo, total, importe };
const conCartera = (d: Datos): Cartera => d.cartera ?? carteraVacia();
const totalDe = (c: Cartera) => c.posiciones.reduce((s, p) => s + (p.valor || 0), 0);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [leido, setLeido] = useState(false);
  const [activo, setActivo] = useState(false);
  const [servidorListo, setServidorListo] = useState(false);
  // Lo que el store sabe del servidor: como estado (para pintar) y como ref (para las respuestas de red).
  const [sync, setSync] = useState<EstadoServidor>(ESTADO_SERVIDOR_INICIAL);
  const syncRef = useRef<EstadoServidor>(ESTADO_SERVIDOR_INICIAL);
  // Lo que acaba de llegar de fuera (localStorage, otra pestaña, el servidor) no se vuelve a guardar.
  const omitirPersistencia = useRef(true);
  const consultando = useRef(false);
  const montado = useRef(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Datos | null>(null);
  // Copia de `datos` para leerla desde las respuestas de red sin cerrar sobre un render viejo.
  const datosRef = useRef<Datos>(VACIO);
  useEffect(() => {
    datosRef.current = datos;
  }, [datos]);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const activar = useCallback(() => setActivo(true), []);

  const fijarSync = useCallback((cambios: Partial<EstadoServidor>) => {
    syncRef.current = { ...syncRef.current, ...cambios };
    setSync(syncRef.current);
  }, []);

  // 1. Hidratar de localStorage. Si la app está abierta en dos pestañas, que las dos vean lo mismo.
  useEffect(() => {
    setDatos(leer());
    setLeido(true);
    const alCambiar = (e: StorageEvent) => {
      if (e.key === CLAVE || e.key === null) {
        omitirPersistencia.current = true;
        setDatos(leer());
      }
    };
    window.addEventListener("storage", alCambiar);
    return () => window.removeEventListener("storage", alCambiar);
  }, []);

  /** Adopta lo del servidor: a localStorage sin volver a subirlo, y se descarta lo pendiente. */
  const adoptar = useCallback((remoto: Datos) => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
    pendiente.current = null;
    omitirPersistencia.current = true;
    escribir(remoto);
    setDatos(remoto);
  }, []);

  /** El PUT. Bien → servidor. 409 → el servidor tiene algo más reciente: se adopta (salvo que lo
   *  de aquí haya cambiado después y sea aún más nuevo, en cuyo caso la subida pendiente lo lleva).
   *  SinIdentidad → navegador hasta la siguiente carga. Otro fallo (503, red) → navegador;
   *  localStorage ya lo tiene y el próximo cambio reintenta. */
  const enviar = useCallback(
    (d: Datos, opciones: { keepalive?: boolean } = {}) => {
      guardarEstado(d, opciones)
        .then(() => {
          if (montado.current) fijarSync({ ultimoPut: "ok" });
        })
        .catch((e: unknown) => {
          if (!montado.current) return;
          if (e instanceof SinIdentidad) {
            pendiente.current = null;
            fijarSync({ sinIdentidad: true });
            return;
          }
          if (e instanceof EstadoAnticuado) {
            if (mandaElServidor(e.datos, datosRef.current)) adoptar(e.datos);
            fijarSync({ ultimoPut: "ok" });
            return;
          }
          fijarSync({ ultimoPut: "fallo" });
        });
    },
    [adoptar, fijarSync],
  );

  /** Subida con debounce: solo viaja la última versión. */
  const programarPut = useCallback(
    (d: Datos) => {
      pendiente.current = d;
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => {
        temporizador.current = null;
        const aSubir = pendiente.current;
        pendiente.current = null;
        if (aSubir) enviar(aSubir);
      }, ESPERA_GUARDADO_MS);
    },
    [enviar],
  );

  /** El GET: qué tiene el servidor y si reconoce al socio. Una sola consulta en vuelo. Solo cuando
   *  responde bien se sabe si hay que adoptar lo suyo o subir lo de aquí; si falla, el store se
   *  queda sin confirmar y no sube nada. */
  const consultar = useCallback(() => {
    if (consultando.current || syncRef.current.sinIdentidad) return;
    consultando.current = true;
    cargarEstado()
      .then((remoto) => {
        if (!montado.current) return;
        fijarSync({ confirmado: true });
        const local = datosRef.current;
        if (remoto && mandaElServidor(remoto, local)) {
          adoptar(remoto);
        } else if (pendiente.current || !estaVacio(local) || (remoto && !estaVacio(remoto))) {
          // Lo de aquí es más nuevo (o el servidor no tiene nada): que lo sepa.
          programarPut(local);
        }
      })
      .catch((e: unknown) => {
        if (!montado.current) return;
        if (e instanceof SinIdentidad) {
          pendiente.current = null;
          fijarSync({ confirmado: true, sinIdentidad: true });
        } else {
          // Error o 503 del almacén: no es "vacío". Se reintenta con el siguiente cambio o al volver.
          fijarSync({ confirmado: false });
        }
      })
      .finally(() => {
        consultando.current = false;
        if (montado.current) setServidorListo(true);
      });
  }, [adoptar, fijarSync, programarPut]);

  /** Un cambio local: sin identidad, nada; sin GET confirmado, se guarda como pendiente y se
   *  vuelve a consultar (sin GET no hay PUT); confirmado, se sube. */
  const subir = useCallback(
    (d: Datos) => {
      const accion = accionAlCambiar(syncRef.current);
      if (accion === "nada") return;
      if (accion === "consultar") {
        pendiente.current = d;
        consultar();
        return;
      }
      programarPut(d);
    },
    [consultar, programarPut],
  );

  // Pestaña que vuelve sin confirmar: otra oportunidad de saber qué hay. Pestaña que se esconde
  // con algo pendiente y el servidor confirmado: un último intento (keepalive).
  useEffect(() => {
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "visible") {
        if (activo && !syncRef.current.confirmado) consultar();
        return;
      }
      if (document.visibilityState !== "hidden") return;
      if (!pendiente.current || accionAlCambiar(syncRef.current) !== "subir") return;
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
      const d = pendiente.current;
      pendiente.current = null;
      enviar(d, { keepalive: true });
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [activo, consultar, enviar]);

  // 2. El servidor: cuando alguien usa el store y ya se ha leído localStorage. Pasado el tope se
  //    pinta lo que haya (la consulta sigue viva y se procesa cuando llegue).
  useEffect(() => {
    if (!activo || !leido) return;
    const tope = setTimeout(() => setServidorListo(true), ESPERA_SERVIDOR_MS);
    consultar();
    return () => clearTimeout(tope);
  }, [activo, leido, consultar]);

  // 3. Cada cambio: localStorage y servidor.
  useEffect(() => {
    if (!leido) return;
    if (omitirPersistencia.current) {
      omitirPersistencia.current = false;
      return;
    }
    escribir(datos);
    subir(datos);
  }, [datos, leido, subir]);

  // Con datos locales se pinta al momento; sin ellos se espera (poco) al servidor, para no enseñar
  // una cartera vacía a un socio que la tiene guardada.
  const hidratado = leido && (!activo || servidorListo || !estaVacio(datos));
  const guardadoEn = guardadoEnDe(sync);

  /** Todo cambio del socio pasa por aquí: sella `guardado` para que el servidor sepa cuál manda. */
  const cambiar = useCallback((fn: (d: Datos) => Datos) => {
    setDatos((d) => {
      const n = fn(d);
      return n === d ? d : { ...n, guardado: ahora() };
    });
  }, []);

  const guardarPerfil = useCallback(
    (respuestas: Respuestas) => {
      const r = calcularPerfil(respuestas);
      cambiar((d) => ({ ...d, perfil: { ...r, respuestas, fecha: ahora() } }));
      return r;
    },
    [cambiar],
  );

  const anadirPosicion = useCallback(
    (p: Omit<Posicion, "id">) => {
      const id = nuevoId();
      cambiar((d) => {
        const c = conCartera(d);
        return { ...d, cartera: { ...c, posiciones: [...c.posiciones, { ...p, id, valor: Math.max(0, Math.round(p.valor || 0)) }], actualizadoEl: ahora() } };
      });
      return id;
    },
    [cambiar],
  );

  const anadirPosiciones = useCallback(
    (lista: Omit<Posicion, "id">[]) => {
      if (lista.length === 0) return;
      cambiar((d) => {
        const c = conCartera(d);
        const nuevas = lista.map((p) => ({ ...p, id: nuevoId(), valor: Math.max(0, Math.round(p.valor || 0)) }));
        return { ...d, cartera: { ...c, posiciones: [...c.posiciones, ...nuevas], actualizadoEl: ahora() } };
      });
    },
    [cambiar],
  );

  const sustituirPosiciones = useCallback(
    (lista: Omit<Posicion, "id">[]) => {
      cambiar((d) => {
        const c = conCartera(d);
        const nuevas = lista.map((p) => ({ ...p, id: nuevoId(), valor: Math.max(0, Math.round(p.valor || 0)) }));
        const cartera = { ...c, posiciones: nuevas, actualizadoEl: ahora() };
        return { ...d, cartera, movimientos: [...d.movimientos, movimiento("actualizacion", totalDe(cartera))].slice(-200) };
      });
    },
    [cambiar],
  );

  const editarPosicion = useCallback(
    (id: string, cambios: Partial<Omit<Posicion, "id">>) => {
      cambiar((d) => {
        const c = conCartera(d);
        return { ...d, cartera: { ...c, posiciones: c.posiciones.map((p) => (p.id === id ? { ...p, ...cambios } : p)), actualizadoEl: ahora() } };
      });
    },
    [cambiar],
  );

  const borrarPosicion = useCallback(
    (id: string) => {
      cambiar((d) => {
        const c = conCartera(d);
        return { ...d, cartera: { ...c, posiciones: c.posiciones.filter((p) => p.id !== id), actualizadoEl: ahora() } };
      });
    },
    [cambiar],
  );

  const actualizarValores = useCallback(
    (valores: Record<string, number>) => {
      cambiar((d) => {
        const c = conCartera(d);
        const posiciones = c.posiciones.map((p) => (valores[p.id] !== undefined ? { ...p, valor: Math.max(0, Math.round(valores[p.id] ?? 0)) } : p));
        const cartera = { ...c, posiciones, actualizadoEl: ahora() };
        return { ...d, cartera, movimientos: [...d.movimientos, movimiento("actualizacion", totalDe(cartera))].slice(-200) };
      });
    },
    [cambiar],
  );

  const fijarPlan = useCallback(
    (plan: Plan, ultimoRebalanceo?: string) => {
      cambiar((d) => {
        const c = conCartera(d);
        return { ...d, cartera: ultimoRebalanceo ? { ...c, plan, ultimoRebalanceo } : { ...c, plan } };
      });
    },
    [cambiar],
  );

  const marcarRevisado = useCallback(() => {
    cambiar((d) => {
      const c = conCartera(d);
      const cartera = { ...c, ultimoRebalanceo: ahora() };
      return { ...d, cartera, movimientos: [...d.movimientos, movimiento("revision", totalDe(cartera))].slice(-200) };
    });
  }, [cambiar]);

  const usarActualComoPlan = useCallback(() => {
    cambiar((d) => {
      const c = conCartera(d);
      const e = calcularEstado({ ...c, plan: { objetivo: {} } });
      if (e.nucleo <= 0) return d;
      const objetivo: Plan["objetivo"] = {};
      for (const cat of e.categorias) if (cat.valor > 0) objetivo[cat.categoria] = Math.round((cat.valor / e.nucleo) * 1000) / 1000;
      // Ajuste de redondeo para que sume exactamente 1.
      const suma = Object.values(objetivo).reduce((s, x) => s + (x ?? 0), 0);
      const mayor = (Object.keys(objetivo) as Categoria[]).sort((a, b) => (objetivo[b] ?? 0) - (objetivo[a] ?? 0))[0];
      if (mayor) objetivo[mayor] = Math.round(((objetivo[mayor] ?? 0) + (1 - suma)) * 1000) / 1000;
      // Reparto de la bolsa por región/sector, si las posiciones lo tienen.
      const rv = c.posiciones.filter((p) => p.parte === "nucleo" && p.categoria === "rv" && p.sub && (p.valor || 0) > 0);
      const totalRV = rv.reduce((s2, p) => s2 + p.valor, 0);
      const plan: Plan = { ...c.plan, objetivo };
      if (rv.length > 0 && totalRV > 0) {
        const objetivoRV: NonNullable<Plan["objetivoRV"]> = {};
        for (const p of rv) objetivoRV[p.sub as SubRV] = Math.round((((objetivoRV[p.sub as SubRV] ?? 0) * totalRV + p.valor) / totalRV) * 1000) / 1000;
        const claves = Object.keys(objetivoRV) as SubRV[];
        const sumaRV = claves.reduce((s2, k) => s2 + (objetivoRV[k] ?? 0), 0);
        const mayorRV = [...claves].sort((a, b) => (objetivoRV[b] ?? 0) - (objetivoRV[a] ?? 0))[0];
        if (mayorRV) objetivoRV[mayorRV] = Math.round(((objetivoRV[mayorRV] ?? 0) + (1 - sumaRV)) * 1000) / 1000;
        const hayRegiones = claves.some((k) => esRegion(k));
        const haySectores = claves.some((k) => !esRegion(k));
        plan.objetivoRV = objetivoRV;
        plan.estrategiaRV = hayRegiones && haySectores ? "mixta" : haySectores ? "sectorial" : "geografica";
      }
      return { ...d, cartera: { ...c, plan } };
    });
  }, [cambiar]);

  const registrarAportacion = useCallback(
    (compras: Cambio[], importe: number) => {
      cambiar((d) => {
        const c = conCartera(d);
        const cartera = { ...aplicarOperaciones(c, compras), aportado: c.aportado + importe, actualizadoEl: ahora() };
        return { ...d, cartera, movimientos: [...d.movimientos, movimiento("aportacion", totalDe(cartera), importe)].slice(-200) };
      });
    },
    [cambiar],
  );

  const registrarRebalanceo = useCallback(
    (cambios: Cambio[]) => {
      cambiar((d) => {
        const c = conCartera(d);
        const cartera = { ...aplicarOperaciones(c, cambios), actualizadoEl: ahora(), ultimoRebalanceo: ahora() };
        return { ...d, cartera, movimientos: [...d.movimientos, movimiento("rebalanceo", totalDe(cartera))].slice(-200) };
      });
    },
    [cambiar],
  );

  const ajustarAportado = useCallback(
    (aportado: number) => {
      cambiar((d) => ({ ...d, cartera: { ...conCartera(d), aportado: Math.max(0, aportado) } }));
    },
    [cambiar],
  );

  // Borrar también se guarda (vacío y sellado): así el servidor no devuelve lo borrado en la siguiente carga.
  const borrarTodo = useCallback(() => {
    cambiar(() => VACIO);
  }, [cambiar]);

  const valor = useMemo<Contexto>(
    () => ({
      datos,
      hidratado,
      guardadoEn,
      servidorConsultado: servidorListo,
      guardarPerfil,
      anadirPosicion,
      anadirPosiciones,
      sustituirPosiciones,
      editarPosicion,
      borrarPosicion,
      actualizarValores,
      fijarPlan,
      marcarRevisado,
      usarActualComoPlan,
      registrarAportacion,
      registrarRebalanceo,
      ajustarAportado,
      borrarTodo,
    }),
    [datos, hidratado, guardadoEn, servidorListo, guardarPerfil, anadirPosicion, anadirPosiciones, editarPosicion, borrarPosicion, actualizarValores, fijarPlan, marcarRevisado, usarActualComoPlan, registrarAportacion, registrarRebalanceo, ajustarAportado, borrarTodo],
  );

  return (
    <CtxActivar.Provider value={activar}>
      <Ctx.Provider value={valor}>{children}</Ctx.Provider>
    </CtxActivar.Provider>
  );
}

export function useStore(): Contexto {
  const c = useContext(Ctx);
  const activar = useContext(CtxActivar);
  // Avisar al proveedor de que esta página usa los datos: es lo que arranca la sincronización.
  useEffect(() => {
    activar();
  }, [activar]);
  if (!c) throw new Error("useStore fuera de StoreProvider");
  return c;
}
