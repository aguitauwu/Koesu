import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface CacheEntry {
  videoId: string;
  filePath: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  hits: number;
  createdAt: number;
  lastAccessed: number;
  permanent: boolean;
}

const CACHE_DIR = Deno.env.get("CACHE_DIR") ?? "./cache/audio";
const MAX_MB = Number(Deno.env.get("CACHE_MAX_MB") ?? 500);
const TTL_1 = 1000 * 60 * 60 * 12;
const TTL_20 = 1000 * 60 * 60 * 48;

const index = new Map<string, CacheEntry>();

export function initCache(): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[cache] Inicializado en ${CACHE_DIR} (max ${MAX_MB}MB)`);
}

export function getCached(videoId: string): CacheEntry | null {
  const entry = index.get(videoId);
  if (!entry) return null;

  if (!entry.permanent) {
    const ttl = entry.hits >= 40 ? Infinity
      : entry.hits >= 20 ? TTL_20
      : TTL_1;

    if (Date.now() - entry.createdAt > ttl) {
      evict(videoId);
      return null;
    }
  }

  entry.hits++;
  entry.lastAccessed = Date.now();

  if (entry.hits >= 40 && !entry.permanent) {
    entry.permanent = true;
    console.log(`[cache] Cancion guardada permanentemente: ${entry.title}`);
  }

  return entry;
}

export function setCached(entry: CacheEntry): void {
  index.set(entry.videoId, entry);
  enforceLimit();
}

export function evict(videoId: string): void {
  const entry = index.get(videoId);
  if (!entry) return;

  try {
    if (existsSync(entry.filePath)) {
      Deno.removeSync(entry.filePath);
    }
  } catch { /* ignore */ }

  index.delete(videoId);
}

function enforceLimit(): void {
  const maxBytes = MAX_MB * 1024 * 1024;
  let total = 0;

  for (const entry of index.values()) {
    try {
      const stat = Deno.statSync(entry.filePath);
      total += stat.size;
    } catch { /* ignore */ }
  }

  if (total <= maxBytes) return;

  const sorted = [...index.values()]
    .filter((e) => !e.permanent)
    .sort((a, b) => a.lastAccessed - b.lastAccessed);

  for (const entry of sorted) {
    if (total <= maxBytes) break;
    try {
      const stat = Deno.statSync(entry.filePath);
      total -= stat.size;
    } catch { /* ignore */ }
    evict(entry.videoId);
  }
}

export function getCacheDir(): string {
  return CACHE_DIR;
}
