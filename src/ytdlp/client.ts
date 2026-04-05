import { createLogger } from "../utils/logger.js";

const log = createLogger("ytdlp:client");

const YTDLP_URL = `http://${process.env.YTDLP_HOST ?? "localhost"}:${process.env.YTDLP_SERVER_PORT ?? 7331}`;

export interface ResolvedTrack {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  streamUrl: string;
  cached: boolean;
  source: string;
  passthrough?: boolean;
}

export async function resolve(
  query: string,
  source: string = "auto",
  musicDir?: string
): Promise<ResolvedTrack | null> {
  try {
    const params = new URLSearchParams({ q: query, source });
    if (musicDir) params.set("musicDir", musicDir);

    const res = await fetch(`${YTDLP_URL}/resolve?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    return await res.json() as ResolvedTrack;
  } catch (err) {
    log.error({ err }, "Error consultando servidor ytdlp");
    return null;
  }
}

export async function scan(dir: string): Promise<{ title: string; filePath: string }[]> {
  try {
    const res = await fetch(`${YTDLP_URL}/scan?dir=${encodeURIComponent(dir)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { tracks: { title: string; filePath: string }[] };
    return data.tracks;
  } catch {
    return [];
  }
}

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${YTDLP_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
