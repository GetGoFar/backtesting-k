"use client";

import { useState } from "react";
import { useStore } from "@/lib/mi-cartera/store";
import { PREGUNTAS, cuestionarioCompleto, tramoPerfil, type Respuestas } from "@/lib/mi-cartera/perfil";
import { pct } from "@/lib/mi-cartera/formato";
import { Boton, Cargando, Tarjeta, Titulo } from "@/components/mi-cartera/ui";

function Resultado({ perfil, onRepetir }: { perfil: number; onRepetir: () => void }) {
  const t = tramoPerfil(perfil);
  const { datos } = useStore();
  const limitante = datos.perfil?.limitante;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-gris">Tu perfil de riesgo</p>
        <h1 className="mt-1 text-5xl md:text-6xl">
          {perfil}
          <span className="text-gris-2 text-3xl">/10</span>
        </h1>
        <p className="mt-2 text-xl">{t.nombre}</p>
        <p className="mt-3 text-gris leading-relaxed max-w-lg">{t.descripcion}</p>
        {limitante === "capacidad" && <p className="mt-2 text-sm text-gris-2">Lo que más limita tu perfil es tu situación financiera, no tu actitud ante el riesgo.</p>}
        {limitante === "actitud" && <p className="mt-2 text-sm text-gris-2">Lo que más limita tu perfil es tu actitud ante el riesgo, no tu situación financiera.</p>}
      </div>

      <Tarjeta>
        <h2 className="text-xl">Qué suele significar</h2>
        <ul className="mt-3 flex flex-col gap-2 text-[15px]">
          <li className="flex justify-between gap-4">
            <span className="text-gris">Bolsa en la cartera</span>
            <span className="text-right">{t.bolsaOrientativa}</span>
          </li>
          <li className="flex justify-between gap-4">
            <span className="text-gris">Caída máxima esperada en una crisis</span>
            <span className="tabular">−{pct(t.caidaEsperada, 0)}</span>
          </li>
          <li className="flex justify-between gap-4">
            <span className="text-gris">Horizonte mínimo</span>
            <span>{t.horizonteMinimo}</span>
          </li>
        </ul>
        <p className="mt-4 text-sm text-gris leading-relaxed">Es una orientación educativa, no una recomendación. El plan de tu cartera lo decides tú en Mis posiciones.</p>
      </Tarjeta>

      <div className="flex flex-wrap items-center gap-3">
        <Boton href="/cartera/posiciones#plan">Ir a mi plan</Boton>
        <Boton variante="enlace" onClick={onRepetir}>
          Repetir el test
        </Boton>
      </div>
    </div>
  );
}

function Cuestionario({ inicial, onTerminar }: { inicial: Respuestas; onTerminar: (r: Respuestas) => void }) {
  const [respuestas, setRespuestas] = useState<Respuestas>(inicial);
  const [i, setI] = useState(0);
  const p = PREGUNTAS[i]!;
  const elegida = respuestas[p.id];
  const ultima = i === PREGUNTAS.length - 1;
  const progreso = (i / PREGUNTAS.length) * 100;

  const siguiente = () => {
    if (elegida === undefined) return;
    if (ultima) {
      if (cuestionarioCompleto(respuestas)) onTerminar(respuestas);
      return;
    }
    setI(i + 1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="h-1.5 w-full rounded-full bg-crema-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progreso)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-k transition-all" style={{ width: `${progreso}%` }} />
        </div>
        <p className="mt-3 text-sm text-gris">
          Pregunta {i + 1} de {PREGUNTAS.length}
        </p>
      </div>

      <h1 className="text-2xl md:text-3xl leading-snug">{p.texto}</h1>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="sr-only">{p.texto}</legend>
        {p.opciones.map((o, idx) => {
          const activa = elegida === idx;
          return (
            <label key={idx} className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-[15px] transition-colors ${activa ? "border-tinta shadow-card" : "border-borde hover:border-tinta/30"}`}>
              <input type="radio" name={p.id} checked={activa} onChange={() => setRespuestas({ ...respuestas, [p.id]: idx })} className="h-4 w-4 accent-[#C81E2E]" />
              {o.texto}
            </label>
          );
        })}
      </fieldset>

      <div className="flex items-center justify-between">
        <Boton variante="enlace" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className={i === 0 ? "invisible" : ""}>
          Atrás
        </Boton>
        <Boton onClick={siguiente} disabled={elegida === undefined}>
          {ultima ? "Ver mi perfil" : "Continuar"}
        </Boton>
      </div>
    </div>
  );
}

export default function PaginaPerfil() {
  const { datos, hidratado, guardarPerfil } = useStore();
  const [repitiendo, setRepitiendo] = useState(false);
  if (!hidratado) return <Cargando />;

  if (datos.perfil && !repitiendo) {
    return <Resultado perfil={datos.perfil.perfil} onRepetir={() => setRepitiendo(true)} />;
  }

  return (
    <div>
      {!datos.perfil && <Titulo sub="Diez preguntas. Sin respuestas correctas: solo las tuyas.">Mi perfil</Titulo>}
      <Cuestionario
        inicial={repitiendo ? {} : (datos.perfil?.respuestas ?? {})}
        onTerminar={(r) => {
          guardarPerfil(r);
          setRepitiendo(false);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}
