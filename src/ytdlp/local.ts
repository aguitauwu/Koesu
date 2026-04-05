import { readdirSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const SUPPORTED = [".opus", ".mp3", ".flac", ".ogg", ".wav", ".m4a", ".webm"];

export interface LocalTrack {
  title: string;
  filePath: string;
  ext: string;
  sizeBytes: number;
}

export function scanLocalDir(dir: string): LocalTrack[] {
  const tracks: LocalTrack[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        tracks.push(...scanLocalDir(fullPath));
        continue;
      }

      const ext = extname(entry.name).toLowerCase();
      if (!SUPPORTED.includes(ext)) continue;

      const stat = statSync(fullPath);
      tracks.push({
        title: basename(entry.name, ext),
        filePath: fullPath,
        ext,
        sizeBytes: stat.size,
      });
    }
  } catch (err) {
    console.error(`[local] Error escaneando ${dir}:`, err);
  }

  return tracks;
}

export function findLocal(query: string, dir: string): LocalTrack | null {
  const tracks = scanLocalDir(dir);
  const q = query.toLowerCase();

  return tracks.find((t) => t.title.toLowerCase().includes(q)) ?? null;
}
