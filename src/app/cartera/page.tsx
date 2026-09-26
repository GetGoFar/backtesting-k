"use client";

import { useStore, type GuardadoEn } from "@/lib/mi-cartera/store";
import { calcularEstado, subcategoriasSobreRV, textoSemaforo } from "@/lib/mi-cartera/cartera";
import { eur, eurSigno, fechaCorta, pct } from "@/lib/mi-cartera/formato";
import { Boton, Cargando, Cifra, Distribucion, EstadoGrande, Tarjeta, pctObjetivo } from "@/components/mi-cartera/ui";
import { TarjetaRiesgo } from "@/components/mi-cartera/Riesgo";

const TEXTO_GUARDADO: Record<GuardadoEn, string> = {
  servidor: "Guardada en tu cuenta de Ataraxia",
  navegador: "Solo en este navegador",
  "sin-confirmar": "Sin conexión con el servidor: los cambios se quedan en este navegador hasta que vuelva",
};

/** Una línea discreta al pie: dónde vive la cartera. Nada hasta que el servidor haya contestado
 *  (o agotado la espera), para que no parpadee en la primera consulta. */
function DondeSeGuarda({ guardadoEn, consultado }: { guardadoEn: GuardadoEn; consultado: boolean }) {
  if (!consultado) return null;
  return <p className="text-xs text-gris">{TEXTO_GUARDADO[guardadoEn]}.</p>;
}

function Paso({ titulo, texto, cta, href }: { titulo: string; texto: string; cta: string; href: string }) {
  return (
    <Tarjeta>
      <h2 className="text-2xl">{titulo}</h2>
      <p className="mt-2 text-gris leading-relaxed">{texto}</p>
      <div className="mt-5">
        <Boton href={href}>{cta}</Boton>
      </div>
    </Tarjeta>
  );
}

export default function Inicio() {
  const { datos, hidratado, guardadoEn, servidorConsultado } = useStore();
  if (!hidratado) return <Cargando />;
  const pie = <DondeSeGuarda guardadoEn={guardadoEn} consultado={servidorConsultado} />;

  const cartera = datos.cartera;
  const estado = cartera ? calcularEstado(cartera) : undefined;

  if (!cartera || !estado || estado.vacia) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl">Tu cartera, sin ruido.</h1>
          <p className="mt-3 text-gris leading-relaxed max-w-md">
            Mi cartera te dice dónde estás, dónde quieres estar y si tienes que hacer algo. La mayoría de las veces, la respuesta será que no.
          </p>
        </div>
        <Paso titulo="Añade lo que tienes hoy" texto="Tus fondos, ETFs o liquidez, en euros, por categoría. La app no elige por ti: tú decides el plan." cta="Añadir mis activos" href="/cartera/posiciones" />
        <p className="text-sm text-gris">
          ¿No sabes cuánto riesgo quieres asumir?{" "}
          <a href="/perfil" className="text-k hover:underline">
            Haz el test de perfil
          </a>
          .
        </p>
        {pie}
      </div>
    );
  }

  const resultado = estado.total - cartera.aportado;
  const texto = textoSemaforo(estado);
  const excedidas = estado.partes.filter((p) => p.excedido);
  // Satélite y Play Money a cero se pliegan a una línea; el Núcleo siempre se ve entero.
  const partesConDinero = estado.partes.filter((p) => p.parte === "nucleo" || p.valor > 0);
  const partesVacias = estado.partes.filter((p) => p.parte !== "nucleo" && p.valor <= 0);
  const bolsaSobreRV = subcategoriasSobreRV(estado, cartera.plan);

  return (
    <div className="flex flex-col gap-5">
      {estado.sinPlan ? (
        <EstadoGrande semaforo="verde" titulo={texto.titulo} detalle={texto.detalle} accion={<Boton href="/cartera/posiciones#plan">Fijar mi plan</Boton>} />
      ) : (
        <EstadoGrande
          semaforo={estado.semaforo}
          titulo={texto.titulo}
          detalle={texto.detalle}
          accion={
            estado.semaforo === "rojo" ? (
              <Boton href="/aportar?vista=rebalancear">Ver rebalanceo</Boton>
            ) : estado.semaforo === "ambar" ? (
              <Boton href="/aportar?vista=rebalancear" variante="secundario">Ver cómo corregirlo</Boton>
            ) : undefined
          }
        />
      )}

      <div>
        <p className="tabular text-3xl md:text-4xl font-serif tracking-tight">{eur(estado.total)}</p>
        <p className="mt-1 text-sm text-gris">Valor actual de la cartera</p>
        {cartera.aportado > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-4 max-w-sm">
            <Cifra etiqueta="Aportado" valor={eur(cartera.aportado)} />
            <Cifra etiqueta="Resultado acumulado" valor={eurSigno(resultado)} tono={resultado > 0 ? "positivo" : resultado < 0 ? "negativo" : "normal"} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-gris">
            ¿Cuánto has aportado hasta hoy?{" "}
            <a href="/cartera/posiciones#aportado" className="text-k hover:underline">
              Indícalo
            </a>{" "}
            y verás tu resultado acumulado.
          </p>
        )}
      </div>

      <Tarjeta>
        <div className={`grid gap-3 ${partesConDinero.length === 3 ? "grid-cols-3" : partesConDinero.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {partesConDinero.map((p) => (
            <div key={p.parte}>
              <p className="text-xs text-gris">{p.nombre.replace("Cartera ", "")}</p>
              <p className="tabular text-lg font-medium">{eur(p.valor)}</p>
              <p className={`tabular text-xs ${p.excedido ? "text-ambar" : "text-gris"}`}>
                {pct(p.pesoTotal, 0)}
                {p.tope !== undefined && p.tope > 0 ? ` · tope ${pctObjetivo(p.tope)}` : ""}
              </p>
            </div>
          ))}
        </div>
        {partesVacias.length > 0 && (
          <p className="tabular mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gris">
            {partesVacias.map((p) => (
              <span key={p.parte}>
                {p.nombre.replace("Cartera ", "")} · {eur(0)}
              </span>
            ))}
          </p>
        )}
        {excedidas.length > 0 && <p className="mt-3 text-sm text-ambar">{excedidas.map((p) => `${p.nombre} pasa de su tope`).join(". ")}.</p>}
      </Tarjeta>

      {!estado.sinPlan && estado.categorias.length > 0 && (
        <Tarjeta>
          <h2 className="text-xl mb-4">Cartera Núcleo</h2>
          <Distribucion categorias={estado.categorias} />
          {bolsaSobreRV.length > 0 && (
            <div className="mt-5 border-t border-borde pt-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gris">Dentro de la bolsa</p>
              <Distribucion categorias={bolsaSobreRV} compacta />
              <p className="mt-3 text-xs text-gris">Porcentajes sobre tu renta variable, como en tu plan.</p>
            </div>
          )}
          <p className="mt-4 text-xs text-gris">La zona sombreada es la banda de tu plan; la marca negra, tu objetivo. Debajo de cada barra, cuánto te desvías.</p>
        </Tarjeta>
      )}

      <TarjetaRiesgo posiciones={cartera.posiciones} perfilDeclarado={datos.perfil?.perfil} />

      <p className="text-sm text-gris flex flex-wrap items-center gap-x-3 gap-y-1">
        {cartera.actualizadoEl && <span>Actualizado el {fechaCorta(cartera.actualizadoEl)}.</span>}
        <Boton href="/cartera/posiciones" variante="enlace" className="!px-0">
          Actualizar valores
        </Boton>
      </p>
      {pie}
    </div>
  );
}
