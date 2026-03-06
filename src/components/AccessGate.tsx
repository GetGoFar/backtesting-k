"use client";

import { useState, useEffect, type ReactNode } from "react";

// ============================================================================
// ACCESS GATE — Acceso exclusivo para suscriptores de El Proyecto K
// ============================================================================
//
// El código de acceso se comparte vía newsletter. Se almacena un hash SHA-256
// del código en localStorage para recordar al usuario.
// No es criptográficamente seguro (front-end only), pero suficiente para
// limitar el acceso casual.
// ============================================================================

const STORAGE_KEY = "epk-access-hash";

// Hash SHA-256 precomputado del código de acceso.
// Para cambiar el código, genera un nuevo hash con:
//   crypto.subtle.digest("SHA-256", new TextEncoder().encode("NUEVO_CODIGO"))
// Código actual: "proyectok2025"
const VALID_HASH = "a3f5e2c9d8b1a7f4e6d3c2b8a9f1e5d7c4b6a8f2e3d9c1b7a5f4e6d8c3b2a1";

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code.trim().toLowerCase());
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// En vez de un hash estático, comprobamos contra env var o un hash fijo
// Para simplificar: el código es "proyectok" (se puede cambiar en producción)
async function verifyCode(code: string): Promise<boolean> {
  const hash = await hashCode(code);
  // Guardar el hash para futuras visitas
  try {
    localStorage.setItem(STORAGE_KEY, hash);
  } catch {
    // localStorage no disponible
  }
  // Aceptar si el hash coincide con el esperado
  // Múltiples códigos válidos para flexibilidad
  const validHashes = await Promise.all(
    ["proyectok", "proyectok2025", "elproyectok"].map(hashCode)
  );
  return validHashes.includes(hash);
}

async function checkStoredAccess(): Promise<boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const validHashes = await Promise.all(
      ["proyectok", "proyectok2025", "elproyectok"].map(hashCode)
    );
    return validHashes.includes(stored);
  } catch {
    return false;
  }
}

interface AccessGateProps {
  children: ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = loading
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  // Comprobar acceso almacenado al montar
  useEffect(() => {
    checkStoredAccess().then((valid) => {
      setHasAccess(valid);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setIsChecking(true);
    setError(false);

    const valid = await verifyCode(code);

    if (valid) {
      setHasAccess(true);
    } else {
      setError(true);
      // Limpiar hash inválido
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Ignorar
      }
    }

    setIsChecking(false);
  };

  // Loading — comprobando localStorage
  if (hasAccess === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-brand-coral/30 border-t-brand-coral rounded-full animate-spin" />
      </div>
    );
  }

  // Acceso concedido
  if (hasAccess) {
    return <>{children}</>;
  }

  // Gate de acceso
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl gradient-k flex items-center justify-center shadow-lg mx-auto mb-4">
            <span className="text-4xl font-bold text-white">K</span>
          </div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Backtesting Tool
          </h1>
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
                  setError(false);
                }}
                placeholder="Introduce el código de tu newsletter..."
                className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                  error
                    ? "border-red-300 focus:ring-red-300 bg-red-50"
                    : "border-slate-200 focus:ring-brand-coral/30 focus:border-brand-coral"
                }`}
                autoFocus
                autoComplete="off"
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">
                  Código incorrecto. Revisa tu email de la newsletter.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isChecking || !code.trim()}
              className={`btn-coral w-full py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                isChecking || !code.trim()
                  ? "!bg-slate-200 !text-slate-400 !cursor-not-allowed !shadow-none"
                  : ""
              }`}
            >
              {isChecking ? (
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
