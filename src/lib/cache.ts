import { promises as fs } from "fs";
import path from "path";

const CACHE_DIR = ".cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

function getCacheFilePath(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(CACHE_DIR, `${safeKey}.json`);
}

export async function getFromCache<T>(key: string): Promise<T | null> {
  try {
    const filePath = getCacheFilePath(key);
    const content = await fs.readFile(filePath, "utf-8");
    const entry: CacheEntry<T> = JSON.parse(content);

    if (Date.now() - entry.timestamp > CACHE_TTL) {
      await fs.unlink(filePath);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export async function saveToCache<T>(key: string, data: T): Promise<void> {
  try {
    await ensureCacheDir();
    const filePath = getCacheFilePath(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    await fs.writeFile(filePath, JSON.stringify(entry), "utf-8");
  } catch (error) {
    console.error("Error saving to cache:", error);
  }
}

export async function clearCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      await fs.unlink(path.join(CACHE_DIR, file));
    }
  } catch {
    // Cache dir might not exist
  }
}
