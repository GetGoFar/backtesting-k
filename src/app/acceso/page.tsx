"use client";

// =============================================================================
// /acceso — Página del formulario de código de suscriptor
// =============================================================================
//
// Llamada desde el middleware cuando la cookie `epk-access` falta o es
// inválida. Tras enviar un código correcto al /api/acceso, la cookie queda
// emitida y el navegador redirige al ?next= original.
// =============================================================================

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Si vienen con ?error=1 mostramos un mensaje (el middleware lo añade
  // cuando detecta una cookie corrupta/expirada).
  useEffect(() => {
    if (searchParams.get("error")) {
      setError("Tu sesión ha caducado. Vuelve a introducir el código.");
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
        // Cookie ya emitida — redirect al destino original
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
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl gradient-k flex items-center justify-center shadow-lg mx-auto mb-4">
            <span className="text-4xl font-bold text-white">K</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-navy">Backtesting Tool</h1>
          <p className="text-sm text-brand-tertiary mt-1">
            Herramienta exclusiva para suscriptores
          </p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-xl border border-brand-border shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="Introduce el código de tu newsletter..."
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
                <span>Acceder</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-brand-tertiary">
              ¿No tienes el código?{" "}
              <a
                href="https://elproyectok.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-coral hover:underline font-medium"
              >
                Suscríbete a la newsletter
              </a>
            </p>
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
      <AccessForm />
    </Suspense>
  );
}
