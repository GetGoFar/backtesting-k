"use client";

import { KMark } from "@/components/KMark";

// =============================================================================
// /acceso — la puerta cerrada del Laboratorio K
// =============================================================================
//
// La ve quien llega sin pase: el middleware manda aquí cuando la cookie
// `epk-access` falta o no vale. Los socios de Ataraxia no teclean nada: entran
// desde la pestaña "Laboratorio K" de su portal (hub.elproyectok.com), que
// navega a /api/acceso/ataraxia con un token firmado. El formulario de código
// (el personal de Pablo) queda plegado tras "Tengo un código"; tras un código
// correcto en /api/acceso, la cookie queda emitida y se vuelve al ?next=
// original (solo rutas relativas de esta app).
// =============================================================================

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const URL_ATARAXIA = "https://hub.elproyectok.com/course/ataraxia";

function PuertaCerrada() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Solo rutas relativas de esta app (nunca "//otro.dominio" ni "https://...").
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [mostrarCodigo, setMostrarCodigo] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Con ?error=1 (el middleware lo añade al encontrar una cookie corrupta o caducada)
  // se avisa y se despliega el formulario, por si quien llega es Pablo.
  useEffect(() => {
    if (searchParams.get("error")) {
      setError("Tu sesión ha caducado. Vuelve a entrar desde Ataraxia o introduce tu código.");
      setMostrarCodigo(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        // Cookie ya emitida: vuelta al destino original.
        router.replace(next);
      } else {
        setError(data.error ?? "Código incorrecto");
        setCode("");
      }
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Cabecera */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl gradient-k flex items-center justify-center shadow-lg mx-auto mb-4">
            <KMark className="h-10 w-auto text-white" />
          </div>
          <h1 className="text-2xl font-bold text-brand-navy">Laboratorio K</h1>
        </div>

        {/* Entrada de los socios */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm p-6 text-center">
          <p className="text-sm text-brand-secondary leading-relaxed">
            Solo para socios de Ataraxia. Entra desde tu portal en LearnWorlds: la pestaña
            Laboratorio K te abre sin pedir nada.
          </p>
          {/* target=_top: si esta página ha caído dentro del iframe, el enlace saca la ventana entera. */}
          <a
            href={URL_ATARAXIA}
            target="_top"
            rel="noopener"
            className="btn-coral inline-flex items-center justify-center px-6 py-3 mt-5 text-sm font-medium"
          >
            Ir a Ataraxia →
          </a>

          {error && !mostrarCodigo && (
            <p className="mt-4 text-sm text-red-600">{error}</p>
          )}

          {/* Código personal, discreto */}
          <div className="mt-6 pt-4 border-t border-slate-100">
            {!mostrarCodigo ? (
              <button
                type="button"
                onClick={() => setMostrarCodigo(true)}
                className="text-xs text-brand-tertiary hover:text-brand-coral hover:underline"
              >
                Tengo un código
              </button>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div>
                  <label
                    htmlFor="access-code"
                    className="block text-sm font-medium text-brand-navy mb-2"
                  >
                    Código de acceso
                  </label>
                  <input
                    id="access-code"
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(null);
                    }}
                    placeholder="Código de acceso"
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                      error
                        ? "border-red-300 focus:ring-red-300 bg-red-50"
                        : "border-slate-200 focus:ring-brand-coral/30 focus:border-brand-coral"
                    }`}
                    autoFocus
                    autoComplete="off"
                    disabled={isSubmitting}
                  />
                  {error && (
                    <p className="mt-2 text-sm text-red-600">{error}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !code.trim()}
                  className={`btn-coral w-full py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                    isSubmitting || !code.trim()
                      ? "!bg-slate-200 !text-slate-400 !cursor-not-allowed !shadow-none"
                      : ""
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verificando...</span>
                    </>
                  ) : (
                    <span>Entrar</span>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccesoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
        </div>
      }
    >
      <PuertaCerrada />
    </Suspense>
  );
}
