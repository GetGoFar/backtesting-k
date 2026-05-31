// =============================================================================
// REQUEST CONTEXT — Estado por-request usando AsyncLocalStorage
// =============================================================================
//
// Permite que módulos profundos (como `data-fetcher`) accedan a metadatos del
// request actual (qué fuente de datos elige el usuario, etc.) SIN tener que
// añadir un parámetro a cada función del stack. AsyncLocalStorage propaga el
// contexto a través de `await` automáticamente — el equivalente a thread-local
// storage en runtimes asíncronos.
//
// Uso:
//   En la API route:
//     return runWithContext({ dataSource: "eodhd" }, async () => handler())
//   En cualquier función:
//     const ctx = getRequestContext()
//     const src = ctx?.dataSource ?? "eodhd"
// =============================================================================

import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
  /** Fuente de precios. Sólo EODHD; el campo se mantiene por compat. */
  dataSource?: "eodhd";
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta una función con el contexto del request asociado. */
export function runWithContext<T>(ctx: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

/** Lee el contexto del request actual (si está dentro de `runWithContext`). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
