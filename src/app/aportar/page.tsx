"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/mi-cartera/store";
import { calcularEstado, mesAno, nombreCategoria, nombreSubRV, planificarAportacion, planificarRebalanceo, textoSemaforo, type Estado, type Operacion } from "@/lib/mi-cartera/cartera";
import { eur, pct } from "@/lib/mi-cartera/formato";
import { Boton, Cargando, EstadoGrande, InputEuros, Punto, Tarjeta, Titulo } from "@/components/mi-cartera/ui";

function ListaOperaciones({ titulo, ops, tono }: { titulo: string; ops: Operacion[]; tono: "falta" | "sobra" }) {
  if (ops.length === 0) return null;
  return (
    <div>
      <h3 className={`text-sm font-medium uppercase tracking-wide ${tono === "sobra" ? "text-rojo" : "text-verde"}`}>{titulo}</h3>
      <ul className="mt-2 divide-y divide-borde">
        {ops.map((o, i) => (
          <li key={o.posicionId ?? `hueco-${i}`} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="font-medium leading-snug">{o.nombre}</p>
              <p className="text-sm text-gris">
                {o.isin && (
                  <>
                    <span className="tabular">{o.isin}</span>
                    <span className="mx-1.5 text-gris-2">·</span>
                  </>
                )}
                {nombreCategoria(o.categoria)}
                {o.sub ? ` · ${nombreSubRV(o.sub)}` : ""}
              </p>
              {o.posicionId === null && (
                <p className="text-xs text-gris-2">
                  Aún no tienes ninguno:{" "}
                  <Link href="/cartera/posiciones" className="text-k hover:underline">
                    añádelo en Mis posiciones
                  </Link>
                  .
                </p>
              )}
            </div>
            <p className="tabular text-2xl font-serif whitespace-nowrap">{eur(o.importe)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Despues({ estado, titulo }: { estado: Estado; titulo: string }) {
  const t = textoSemaforo(estado);
  return (
    <div className="rounded-2xl bg-crema p-4">
      <p className="text-sm text-gris">{titulo}</p>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {estado.categorias.map((c) => (
          <div key={c.categoria}>
            <p className="text-xs text-gris">{c.nombre}</p>
            <p className="tabular text-lg font-medium">{pct(c.pesoActual)}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-2 text-sm">
        <Punto semaforo={estado.semaforo} className="h-2.5 w-2.5" />
        {estado.semaforo === "verde" ? "Tu Cartera Núcleo quedará dentro de tu plan." : t.detalle}
      </p>
    </div>
  );
}

function Aportar() {
  const { datos, registrarAportacion } = useStore();
  const router = useRouter();
  const cartera = datos.cartera!;
  const [importe, setImporte] = useState<number | undefined>(undefined);
  const [calculado, setCalculado] = useState<number | undefined>(undefined);
  const plan = useMemo(() => (calculado && calculado > 0 ? planificarAportacion(cartera, calculado) : undefined), [cartera, calculado]);

  return (
    <div className="flex flex-col gap-5">
      <Tarjeta>
        <label htmlFor="importe" className="block text-lg">
          ¿Cuánto vas a aportar al Núcleo?
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <InputEuros id="importe" valor={importe} onChange={setImporte} className="w-full max-w-[240px]" autoFocus />
          <Boton disabled={!importe || importe <= 0} onClick={() => setCalculado(importe)}>
            Calcular aportación
          </Boton>
        </div>
        <p className="mt-3 text-xs text-gris-2">Satélite y Play Money se actualizan a mano en Mis posiciones.</p>
      </Tarjeta>

      {plan && (
        <Tarjeta className="flex flex-col gap-5">
          <h2 className="text-2xl">Distribuye tu aportación así</h2>
          <ListaOperaciones titulo="Reparto" ops={plan.compras} tono="falta" />
          <Despues estado={plan.despues} titulo="Después de esta aportación" />
          {!plan.corrige && <p className="text-sm text-gris leading-relaxed">Con esta aportación te acercas a tu plan, pero no basta para volver al rango. Cuando la hayas guardado, mira la pestaña Rebalancear.</p>}
          <div>
            <Boton
              onClick={() => {
                registrarAportacion(plan.compras.map((c) => ({ posicionId: c.posicionId, categoria: c.categoria, sub: c.sub, delta: c.importe })), plan.importe);
                router.push("/cartera");
              }}
            >
              Guardar aportación
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function Rebalancear() {
  const { datos, registrarRebalanceo, marcarRevisado } = useStore();
  const router = useRouter();
  const cartera = datos.cartera!;
  const estado = useMemo(() => calcularEstado(cartera), [cartera]);
  const plan = useMemo(() => planificarRebalanceo(cartera), [cartera]);
  const [verHoy, setVerHoy] = useState(false);
  const texto = textoSemaforo(estado);
  const hayOps = plan.ventas.length + plan.compras.length > 0;
  const pendiente = estado.revision?.pendiente === true;
  const porPeriodo = estado.metodo.metodo === "periodo";

  const cabecera =
    estado.semaforo === "rojo"
      ? { semaforo: "rojo" as const, titulo: "Tu cartera necesita rebalancearse", detalle: texto.detalle }
      : pendiente
        ? { semaforo: "ambar" as const, titulo: "Toca tu revisión", detalle: texto.detalle }
        : estado.semaforo === "ambar"
          ? { semaforo: "ambar" as const, titulo: "Aún no es necesario", detalle: `${texto.detalle} Puedes esperar a tu próxima aportación para corregirlo sin vender, o hacerlo ahora.` }
          : {
              semaforo: "verde" as const,
              titulo: "No necesitas rebalancear",
              detalle: estado.revision ? `Próxima revisión: ${mesAno(estado.revision.proxima)}. Hasta entonces, deja que el tiempo trabaje.` : "Tu Cartera Núcleo está dentro de los rangos de tu plan. Deja que el tiempo trabaje.",
            };

  const mostrarLista = hayOps && (cabecera.semaforo !== "verde" || verHoy);

  return (
    <div className="flex flex-col gap-5">
      <EstadoGrande semaforo={cabecera.semaforo} titulo={cabecera.titulo} detalle={cabecera.detalle} />

      {cabecera.semaforo === "verde" && hayOps && !verHoy && (
        <div>
          <Boton variante="secundario" onClick={() => setVerHoy(true)}>
            Ver qué sobra y qué falta hoy
          </Boton>
        </div>
      )}

      {pendiente && !hayOps && (
        <Tarjeta className="flex flex-col gap-4">
          <p className="text-gris">Nada que mover: las diferencias son de menos de 10 €.</p>
          <div>
            <Boton
              onClick={() => {
                marcarRevisado();
                router.push("/cartera");
              }}
            >
              Marcar como revisado
            </Boton>
          </div>
        </Tarjeta>
      )}

      {mostrarLista && (
        <Tarjeta className="flex flex-col gap-5">
          <h2 className="text-2xl">Para volver a tu plan</h2>
          <ListaOperaciones titulo="Te sobra" ops={plan.ventas} tono="sobra" />
          <ListaOperaciones titulo="Te falta" ops={plan.compras} tono="falta" />
          <Despues estado={plan.despues} titulo="Cartera Núcleo después del rebalanceo" />
          {porPeriodo && !pendiente && <p className="text-sm text-gris">Si lo haces ahora, la próxima revisión se contará desde hoy.</p>}
          <div>
            <Boton
              onClick={() => {
                registrarRebalanceo([
                  ...plan.ventas.map((v) => ({ posicionId: v.posicionId, categoria: v.categoria, sub: v.sub, delta: -v.importe })),
                  ...plan.compras.map((c) => ({ posicionId: c.posicionId, categoria: c.categoria, sub: c.sub, delta: c.importe })),
                ]);
                router.push("/cartera");
              }}
            >
              Marcar como hecho
            </Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}

function Contenido() {
  const { datos, hidratado } = useStore();
  const params = useSearchParams();
  const [vista, setVista] = useState<"aportar" | "rebalancear">(params.get("vista") === "rebalancear" ? "rebalancear" : "aportar");
  if (!hidratado) return <Cargando />;

  const estado = datos.cartera ? calcularEstado(datos.cartera) : undefined;
  if (!datos.cartera || !estado || estado.vacia || estado.sinPlan) {
    return (
      <div className="flex flex-col gap-5">
        <Titulo sub={!estado || estado.vacia ? "Para calcular una aportación necesitamos tu cartera con sus valores de hoy." : "Para calcular una aportación necesitamos tu plan: cuánto quieres en cada categoría."}>Aportar</Titulo>
        <div>
          <Boton href={!estado || estado.vacia ? "/cartera/posiciones" : "/cartera/posiciones#plan"}>{!estado || estado.vacia ? "Añadir mis activos" : "Fijar mi plan"}</Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Titulo>{vista === "aportar" ? "Voy a aportar" : "Rebalancear cartera"}</Titulo>
      <div className="inline-flex rounded-full bg-crema-2 p-1 self-start" role="tablist">
        {(
          [
            ["aportar", "Aportar"],
            ["rebalancear", "Rebalancear"],
          ] as const
        ).map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${vista === id ? "bg-white shadow-card text-tinta" : "text-gris hover:text-tinta"}`}>
            {nombre}
          </button>
        ))}
      </div>
      {vista === "aportar" ? <Aportar /> : <Rebalancear />}
    </div>
  );
}

export default function PaginaAportar() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}
