// Identidad del socio (cookie epk-socio): firma y verificación con Web Crypto.
// El módulo lee ATARAXIA_LAB_SECRET al cargar, así que el secreto se fija antes
// del import dinámico. No toca Redis ni la tabla de códigos.

import { beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.ATARAXIA_LAB_SECRET = "secreto-de-pruebas-laboratorio-k-0123456789";

// vitest no resuelve el alias "@/…" (solo tsconfig lo conoce) y la tabla de códigos no pinta
// nada aquí: se sustituye por una vacía.
vi.mock("@/lib/access-codes", () => ({ ACCESS_CODES: [] }));

type LabAuth = typeof import("./lab-auth");
let lab: LabAuth;

beforeAll(async () => {
  lab = await import("./lab-auth");
});

const ID_SOCIO = "0123456789abcdef0123456789abcdef";

function peticion(cookie?: string): NextRequest {
  return new NextRequest("https://backtesting-k.vercel.app/api/cartera/estado", {
    headers: cookie ? { cookie } : {},
  });
}

describe("idValido", () => {
  it("acepta el hash anónimo del portal (32 hex) y a pablo", () => {
    expect(lab.idValido(ID_SOCIO)).toBe(true);
    expect(lab.idValido("pablo")).toBe(true);
  });
  it("rechaza cualquier otra forma", () => {
    expect(lab.idValido("socio")).toBe(false);
    expect(lab.idValido("")).toBe(false);
    expect(lab.idValido(ID_SOCIO.toUpperCase())).toBe(false);
    expect(lab.idValido(ID_SOCIO + "0")).toBe(false);
    expect(lab.idValido("pablo.x")).toBe(false);
  });
});

describe("firmarIdentidad", () => {
  it("devuelve '<id>.<firma>' con firma base64url", async () => {
    const v = await lab.firmarIdentidad(ID_SOCIO);
    expect(v).not.toBeNull();
    const [id, firma, ...resto] = (v as string).split(".");
    expect(id).toBe(ID_SOCIO);
    expect(resto).toHaveLength(0);
    expect(firma).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("es determinista y distinta por id", async () => {
    const a = await lab.firmarIdentidad(ID_SOCIO);
    const b = await lab.firmarIdentidad(ID_SOCIO);
    const p = await lab.firmarIdentidad("pablo");
    expect(a).toBe(b);
    expect(p).not.toBeNull();
    expect((p as string).split(".")[1]).not.toBe((a as string).split(".")[1]);
  });
  it("no firma un id que no vale", async () => {
    expect(await lab.firmarIdentidad("socio")).toBeNull();
    expect(await lab.firmarIdentidad("")).toBeNull();
  });
});

describe("identidadDe", () => {
  it("recupera el id de una cookie bien firmada", async () => {
    const v = (await lab.firmarIdentidad(ID_SOCIO)) as string;
    expect(await lab.identidadDe(peticion(`${lab.COOKIE_SOCIO}=${v}`))).toBe(ID_SOCIO);
    const p = (await lab.firmarIdentidad("pablo")) as string;
    expect(await lab.identidadDe(peticion(`epk-access=abc; ${lab.COOKIE_SOCIO}=${p}`))).toBe("pablo");
  });
  it("devuelve null sin cookie, con firma manipulada o con id cambiado", async () => {
    const v = (await lab.firmarIdentidad(ID_SOCIO)) as string;
    const [id, firma] = v.split(".") as [string, string];
    expect(await lab.identidadDe(peticion())).toBeNull();
    expect(await lab.identidadDe(peticion(`${lab.COOKIE_SOCIO}=${id}`))).toBeNull();
    expect(await lab.identidadDe(peticion(`${lab.COOKIE_SOCIO}=${id}.${firma.slice(0, -1)}A`))).toBeNull();
    expect(await lab.identidadDe(peticion(`${lab.COOKIE_SOCIO}=pablo.${firma}`))).toBeNull();
    expect(await lab.identidadDe(peticion(`${lab.COOKIE_SOCIO}=socio.${firma}`))).toBeNull();
  });
});

describe("cabeceras Set-Cookie", () => {
  it("la identidad va un año, HttpOnly, SameSite=None y Partitioned como epk-access", () => {
    const c = lab.cookieIdentidad("pablo.firma");
    expect(c.startsWith(`${lab.COOKIE_SOCIO}=pablo.firma;`)).toBe(true);
    expect(c).toContain("Max-Age=31536000");
    for (const atributo of ["Path=/", "HttpOnly", "Secure", "SameSite=None", "Partitioned"]) {
      expect(c).toContain(atributo);
    }
  });
  it("el borrado deja la cookie vacía con Max-Age=0 y los mismos atributos", () => {
    const c = lab.cookieIdentidadBorrar();
    expect(c.startsWith(`${lab.COOKIE_SOCIO}=;`)).toBe(true);
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("Partitioned");
  });
});
