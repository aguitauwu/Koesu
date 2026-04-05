import { join } from "node:path";
import { getCached, setCached, getCacheDir } from "./cache.ts";

const YT_API_KEY = Deno.env.get("YOUTUBE_API_KEY") ?? "";
const YT_API = "https://www.googleapis.com/youtube/v3";

export interface ResolvedTrack {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  thumbnail: string;
  streamUrl: string;
  filePath?: string;
  cached: boolean;
}

export async function searchYoutube(query: string): Promise<string | null> {
  if (!YT_API_KEY) return searchYtdlp(query);

  const url = `${YT_API}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${YT_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return searchYtdlp(query);

  const data = await res.json();
  const id = data.items?.[0]?.id?.videoId;
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

async function searchYtdlp(query: string): Promise<string | null> {
  const cmd = new Deno.Command("yt-dlp", {
    args: ["--get-id", `ytsearch1:${query}`],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, success } = await cmd.output();
  if (!success) return null;

  const id = new TextDecoder().decode(stdout).trim();
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export async function resolveUrl(url: string): Promise<ResolvedTrack | null> {
  const videoId = extractVideoId(url);
  if (!videoId) return null;

  const cached = videoId ? getCached(videoId) : null;
  if (cached && cached.filePath) {
    return {
      videoId: cached.videoId,
      title: cached.title,
      author: cached.author,
      duration: cached.duration,
      thumbnail: cached.thumbnail,
      streamUrl: `file://${cached.filePath}`,
      filePath: cached.filePath,
      cached: true,
    };
  }

  const infoCmd = new Deno.Command("yt-dlp", {
    args: [
      "--dump-json",
      "--no-playlist",
      url,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, success } = await infoCmd.output();
  if (!success) return null;

  let info: any;
  try {
    info = JSON.parse(new TextDecoder().decode(stdout));
  } catch {
    return null;
  }

  const streamUrl = await getStreamUrl(url);
  if (!streamUrl) return null;

  const track: ResolvedTrack = {
    videoId: info.id,
    title: info.title,
    author: info.uploader ?? info.channel ?? "Unknown",
    duration: (info.duration ?? 0) * 1000,
    thumbnail: info.thumbnail ?? "",
    streamUrl,
    cached: false,
  };

  downloadAsync(url, info.id, track);

  return track;
}

async function getStreamUrl(url: string): Promise<string | null> {
  const cmd = new Deno.Command("yt-dlp", {
    args: [
      "-f", "bestaudio",
      "--get-url",
      "--no-playlist",
      url,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, success } = await cmd.output();
  if (!success) return null;

  return new TextDecoder().decode(stdout).trim() || null;
}

async function downloadAsync(
  url: string,
  videoId: string,
  track: ResolvedTrack
): Promise<void> {
  const filePath = join(getCacheDir(), `${videoId}.opus`);

  const cmd = new Deno.Command("yt-dlp", {
    args: [
      "-f", "bestaudio",
      "-x",
      "--audio-format", "opus",
      "--audio-quality", "0",
      "-o", filePath,
      "--no-playlist",
      url,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { success } = await cmd.output();
  if (!success) return;

  setCached({
    videoId,
    filePath,
    title: track.title,
    author: track.author,
    duration: track.duration,
    thumbnail: track.thumbnail,
    hits: 1,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    permanent: false,
  });

  console.log(`[cache] Descargado: ${track.title}`);
}

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match?.[1] ?? null;
}
