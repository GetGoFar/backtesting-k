import { afterEach, describe, expect, it, vi } from "vitest";
import { ESTADO_SERVIDOR_INICIAL, EstadoAnticuado, SinIdentidad, accionAlCambiar, cargarEstado, estaVacio, guardadoEn, guardarEstado, mandaElServidor } from "./sync";
import type { Datos } from "./store";

const vacio: Datos = { version: 2, movimientos: [] };
const conCartera = (guardado?: string): Datos => ({
  version: 2,
  movimientos: [],
  cartera: { posiciones: [{ id: "a", nombre: "A", isin: "IE00A", categoria: "rv", parte: "nucleo", valor: 100 }], plan: { objetivo: {} }, aportado: 0 },
  ...(guardado ? { guardado } : {}),
});

describe("estaVacio", () => {
  it("solo es vacío sin perfil, sin cartera y sin movimientos", () => {
    expect(estaVacio(vacio)).toBe(true);
    expect(estaVacio({ ...vacio, guardado: "2026-09-26T10:00:00.000Z" })).toBe(true);
    expect(estaVacio(conCartera())).toBe(false);
    expect(estaVacio({ ...vacio, movimientos: [{ fecha: "x", tipo: "revision", total: 0 }] })).toBe(false);
  });
});

describe("mandaElServidor", () => {
  it("con sello en los dos, manda el más reciente", () => {
    expect(mandaElServidor(conCartera("2026-09-26T10:00:00.000Z"), conCartera("2026-09-25T10:00:00.000Z"))).toBe(true);
    expect(mandaElServidor(conCartera("2026-09-24T10:00:00.000Z"), conCartera("2026-09-25T10:00:00.000Z"))).toBe(false);
    expect(mandaElServidor(conCartera("2026-09-25T10:00:00.000Z"), conCartera("2026-09-25T10:00:00.000Z"))).toBe(false);
  });
  it("un borrado reciente (local vacío pero sellado) no resucita lo del servidor", () => {
    expect(mandaElServidor(conCartera("2026-09-20T10:00:00.000Z"), { ...vacio, guardado: "2026-09-26T10:00:00.000Z" })).toBe(false);
  });
  it("si aquí no hay nada, manda el servidor cuando tiene algo", () => {
    expect(mandaElServidor(conCartera("2026-09-26T10:00:00.000Z"), vacio)).toBe(true);
    expect(mandaElServidor(conCartera(), vacio)).toBe(true);
    expect(mandaElServidor(vacio, vacio)).toBe(false);
  });
  it("si aquí hay datos y falta algún sello, se queda lo local", () => {
    expect(mandaElServidor(conCartera(), conCartera())).toBe(false);
    expect(mandaElServidor(conCartera("2026-09-26T10:00:00.000Z"), conCartera())).toBe(false);
    expect(mandaElServidor(conCartera(), conCartera("2026-09-26T10:00:00.000Z"))).toBe(false);
  });
});

describe("guardadoEn (dónde vive la cartera)", () => {
  it("sin confirmar mientras el GET no haya respondido bien", () => {
    expect(guardadoEn(ESTADO_SERVIDOR_INICIAL)).toBe("sin-confirmar");
    expect(guardadoEn({ confirmado: false, sinIdentidad: false, ultimoPut: "ok" })).toBe("sin-confirmar");
  });
  it("servidor con GET confirmado e identidad, y el último PUT bien o ninguno aún", () => {
    expect(guardadoEn({ confirmado: true, sinIdentidad: false, ultimoPut: null })).toBe("servidor");
    expect(guardadoEn({ confirmado: true, sinIdentidad: false, ultimoPut: "ok" })).toBe("servidor");
  });
  it("navegador sin identidad o cuando el PUT falla (503 u otros)", () => {
    expect(guardadoEn({ confirmado: true, sinIdentidad: true, ultimoPut: null })).toBe("navegador");
    expect(guardadoEn({ confirmado: true, sinIdentidad: false, ultimoPut: "fallo" })).toBe("navegador");
  });
});

describe("accionAlCambiar (sin GET no hay PUT)", () => {
  it("con el GET sin confirmar, un cambio no sube nada: vuelve a consultar", () => {
    expect(accionAlCambiar(ESTADO_SERVIDOR_INICIAL)).toBe("consultar");
    expect(accionAlCambiar({ confirmado: false, sinIdentidad: false, ultimoPut: "fallo" })).toBe("consultar");
  });
  it("confirmado, se sube; sin identidad, nada", () => {
    expect(accionAlCambiar({ confirmado: true, sinIdentidad: false, ultimoPut: null })).toBe("subir");
    expect(accionAlCambiar({ confirmado: true, sinIdentidad: false, ultimoPut: "fallo" })).toBe("subir");
    expect(accionAlCambiar({ confirmado: true, sinIdentidad: true, ultimoPut: null })).toBe("nada");
  });
});

describe("cargarEstado", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("devuelve los datos del servidor con 200 {datos}", async () => {
    const remoto = conCartera("2026-09-26T10:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datos: remoto }), { status: 200 })));
    expect(await cargarEstado()).toEqual(remoto);
  });
  it("devuelve null si el socio está identificado pero no tiene nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datos: null, identidad: true }), { status: 200 })));
    expect(await cargarEstado()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datos: null }), { status: 200 })));
    expect(await cargarEstado()).toBeNull();
  });
  it("sin identidad según la ruta real (200 {datos: null, identidad: false}) lanza SinIdentidad", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datos: null, identidad: false }), { status: 200 })));
    await expect(cargarEstado()).rejects.toBeInstanceOf(SinIdentidad);
  });
  it("descarta un cuerpo que no es un Datos v2", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ datos: { version: 1 } }), { status: 200 })));
    expect(await cargarEstado()).toBeNull();
  });
  it("sin identidad (204, {} o 401) lanza SinIdentidad", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    await expect(cargarEstado()).rejects.toBeInstanceOf(SinIdentidad);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    await expect(cargarEstado()).rejects.toBeInstanceOf(SinIdentidad);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "sin_acceso" }), { status: 401 })));
    await expect(cargarEstado()).rejects.toBeInstanceOf(SinIdentidad);
  });
  it("un fallo del almacén (503 {error: 'almacen'}) es un error, no vacío ni sin identidad", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "almacen" }), { status: 503 })));
    const e = await cargarEstado().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(SinIdentidad);
    expect(e).not.toBeNull();
  });
  it("otro fallo lanza un Error corriente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const e = await cargarEstado().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(SinIdentidad);
  });
  it("una red caída (fetch que lanza) tampoco se toma por vacío", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(cargarEstado()).rejects.toBeInstanceOf(Error);
  });
});

describe("guardarEstado", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hace PUT con {datos} y no devuelve nada si va bien", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, guardado: "2026-09-26T10:00:00.000Z" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const d = conCartera("2026-09-26T10:00:00.000Z");
    await expect(guardarEstado(d)).resolves.toBeUndefined();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/cartera/estado");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ datos: d });
  });
  it("401/403 lanzan SinIdentidad", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 403 })));
    await expect(guardarEstado(vacio)).rejects.toBeInstanceOf(SinIdentidad);
  });
  it("409 anticuado lanza EstadoAnticuado con los datos del servidor, que mandan sobre lo enviado", async () => {
    const enviado = conCartera("2026-09-25T10:00:00.000Z");
    const servidor = conCartera("2026-09-26T10:00:00.000Z");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "anticuado", guardado: servidor.guardado, datos: servidor }), { status: 409 })));
    const e = await guardarEstado(enviado).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(EstadoAnticuado);
    const a = e as EstadoAnticuado;
    expect(a.datos).toEqual(servidor);
    expect(a.guardado).toBe("2026-09-26T10:00:00.000Z");
    // El cliente adopta lo del servidor en vez de insistir.
    expect(mandaElServidor(a.datos, enviado)).toBe(true);
  });
  it("409 sin datos válidos es un Error corriente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "anticuado" }), { status: 409 })));
    const e = await guardarEstado(vacio).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(EstadoAnticuado);
    expect(e).not.toBeInstanceOf(SinIdentidad);
  });
  it("503 sin almacén es un Error corriente (no SinIdentidad)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "sin_almacen" }), { status: 503 })));
    const e = await guardarEstado(vacio).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(SinIdentidad);
  });
});
