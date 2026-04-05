import { searchYoutube, resolveUrl } from "./youtube.ts";
import { findLocal, scanLocalDir } from "./local.ts";
import { initCache } from "./cache.ts";

const PORT = Number(Deno.env.get("YTDLP_SERVER_PORT") ?? 7331);
const MUSIC_DIR = Deno.env.get("MUSIC_DIR") ?? "/root/música";

initCache();

const SOURCES = ["youtube", "local", "soundcloud", "spotify", "applemusic", "deezer"];

Deno.serve({ port: PORT }, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/resolve" && req.method === "GET") {
    const query = url.searchParams.get("q");
    const source = url.searchParams.get("source") ?? "auto";
    const guildMusicDir = url.searchParams.get("musicDir") ?? MUSIC_DIR;

    if (!query) {
      return Response.json({ error: "q requerido" }, { status: 400 });
    }

    const result = await resolveAuto(query, source, guildMusicDir);
    if (!result) {
      return Response.json({ error: "No se encontro resultado" }, { status: 404 });
    }

    return Response.json(result);
  }

  if (url.pathname === "/scan" && req.method === "GET") {
    const dir = url.searchParams.get("dir") ?? MUSIC_DIR;
    const tracks = scanLocalDir(dir);
    return Response.json({ tracks });
  }

  if (url.pathname === "/health") {
    return Response.json({ status: "ok", port: PORT });
  }

  if (url.pathname.startsWith("/audio/")) {
    const filePath = decodeURIComponent(url.pathname.replace("/audio/", ""));
    try {
      const file = await Deno.readFile(filePath);
      const ext = filePath.split(".").pop() ?? "opus";
      const mime: Record<string, string> = {
        opus: "audio/ogg",
        mp3: "audio/mpeg",
        flac: "audio/flac",
        ogg: "audio/ogg",
        wav: "audio/wav",
        m4a: "audio/mp4",
        webm: "audio/webm",
      };
      return new Response(file, {
        headers: { "Content-Type": mime[ext] ?? "audio/ogg" },
      });
    } catch {
      return Response.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
});

console.log(`[ytdlp] Servidor corriendo en puerto ${PORT}`);

async function resolveAuto(
  query: string,
  source: string,
  musicDir: string
): Promise<unknown> {
  const isUrl = query.startsWith("http");

  if (source !== "auto") {
    return await resolveBySource(query, source, musicDir);
  }

  const order = isUrl
    ? detectSourceFromUrl(query)
    : ["youtube", "local", "soundcloud"];

  for (const src of order) {
    const result = await resolveBySource(query, src, musicDir);
    if (result) return result;
  }

  return null;
}

async function resolveBySource(
  query: string,
  source: string,
  musicDir: string
): Promise<unknown> {
  try {
    switch (source) {
      case "youtube": {
        const url = query.startsWith("http") ? query : await searchYoutube(query);
        if (!url) return null;
        return await resolveUrl(url);
      }
      case "local": {
        const track = findLocal(query, musicDir);
        if (!track) return null;
        return {
          videoId: track.title,
          title: track.title,
          author: "Local",
          duration: 0,
          thumbnail: "",
          streamUrl: `http://localhost:${PORT}/audio/${encodeURIComponent(track.filePath)}`,
          cached: true,
          source: "local",
        };
      }
      case "soundcloud":
        return { passthrough: true, source: "soundcloud", query };
      case "spotify":
        return { passthrough: true, source: "spotify", query };
      case "applemusic":
        return { passthrough: true, source: "applemusic", query };
      case "deezer":
        return { passthrough: true, source: "deezer", query };
      default:
        return null;
    }
  } catch (err) {
    console.error(`[ytdlp] Error con fuente ${source}:`, err);
    return null;
  }
}

function detectSourceFromUrl(url: string): string[] {
  if (url.includes("youtube.com") || url.includes("youtu.be"))
    return ["youtube", "local", "soundcloud"];
  if (url.includes("soundcloud.com"))
    return ["soundcloud", "youtube", "local"];
  if (url.includes("spotify.com"))
    return ["spotify", "youtube", "local"];
  if (url.includes("music.apple.com"))
    return ["applemusic", "youtube", "local"];
  if (url.includes("deezer.com"))
    return ["deezer", "youtube", "local"];
  return ["youtube", "local", "soundcloud"];
}
