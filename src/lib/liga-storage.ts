// =============================================================================
// LIGA SNAPSHOT — almacenamiento
// =============================================================================
//
// Persiste el último snapshot entre invocaciones. Estrategia por orden de
// preferencia:
//   1. Upstash Redis  — si KV_REST_API_URL/TOKEN o UPSTASH_REDIS_REST_*
//   2. Fichero local  — solo en dev (NODE_ENV !== 'production'), bajo
//      ~/.next/cache/liga-snapshot.json o equivalente
//   3. Memoria         — solo válido dentro de la misma invocación
//
// En producción serverless el fichero local NO es viable (cold starts en
// distintas máquinas), así que Redis es prácticamente requerido. En dev
// sin Redis, el fichero permite que /api/liga/refresh y /api/liga/snapshot
// compartan estado aunque Next.js los compile como módulos separados.
//
// =============================================================================

import { promises as fs } from "fs";
import { join } from "path";
import type { SnapshotLiga } from "./liga-engine";

const REDIS_KEY = "liga-fondos-basura:snapshot";
const REDIS_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 días
const FILE_PATH = join(process.cwd(), ".next", "cache", "liga-snapshot.json");

let memoria: SnapshotLiga | null = null;

async function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function modoDesarrollo(): boolean {
  return process.env.NODE_ENV !== "production";
}

async function leerFichero(): Promise<SnapshotLiga | null> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    return JSON.parse(raw) as SnapshotLiga;
  } catch {
    return null;
  }
}

async function escribirFichero(snap: SnapshotLiga): Promise<void> {
  try {
    await fs.mkdir(join(process.cwd(), ".next", "cache"), { recursive: true });
    await fs.writeFile(FILE_PATH, JSON.stringify(snap), "utf-8");
  } catch (err) {
    console.warn("[liga-storage] error escribiendo fichero:", err);
  }
}

export async function leerSnapshot(): Promise<SnapshotLiga | null> {
  try {
    const redis = await getRedis();
    if (redis) {
      const v = await redis.get<SnapshotLiga>(REDIS_KEY);
      if (v) return v;
    }
  } catch (err) {
    console.warn("[liga-storage] error leyendo Redis:", err);
  }
  if (modoDesarrollo()) {
    const desdeFichero = await leerFichero();
    if (desdeFichero) return desdeFichero;
  }
  return memoria;
}

export async function escribirSnapshot(snap: SnapshotLiga): Promise<void> {
  memoria = snap;
  try {
    const redis = await getRedis();
    if (redis) {
      await redis.set(REDIS_KEY, snap, { ex: REDIS_TTL_SECONDS });
    } else if (modoDesarrollo()) {
      await escribirFichero(snap);
    }
  } catch (err) {
    console.warn("[liga-storage] error escribiendo Redis:", err);
  }
}
