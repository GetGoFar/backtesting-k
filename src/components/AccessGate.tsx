"use client";

import type { ReactNode } from "react";

// =============================================================================
// AccessGate — passthrough (legacy)
// =============================================================================
//
// HISTÓRICO: Esta componente antes hacía el gating en CLIENTE usando
// localStorage. Se podía esquivar deshabilitando JS, manipulando localStorage,
// o usando incognito (Pablo lo detectó).
//
// AHORA el gate vive en `src/middleware.ts` y usa una cookie HttpOnly emitida
// por `/api/acceso` tras validar el código con SHA-256 server-side. Es
// imposible saltarse desde el cliente.
//
// Mantengo este componente como passthrough sin lógica para no romper los
// imports en las páginas ya existentes (page.tsx, momentum, kray, equivalente,
// jubilacion). El AccessGate nunca verá un usuario sin autenticar porque el
// middleware lo redirige a /acceso antes de servir HTML.
// =============================================================================

interface AccessGateProps {
  children: ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  return <>{children}</>;
}
