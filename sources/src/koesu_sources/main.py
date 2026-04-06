import asyncio
import json
import os
from aiohttp import web
from .resolver import resolve
from .sources.local import LocalSource
from .logger import get_logger

log = get_logger("main")

PORT = int(os.getenv("YTDLP_SERVER_PORT", "7331"))
MUSIC_DIR = os.getenv("MUSIC_DIR", "/root/musica")
CACHE_DIR = os.getenv("CACHE_DIR", "/root/koesu/cache/audio")

local_source = LocalSource()
routes = web.RouteTableDef()


@routes.get("/health")
async def health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "port": PORT})


@routes.get("/resolve")
async def resolve_handler(request: web.Request) -> web.Response:
    query = request.rel_url.query.get("q")
    source = request.rel_url.query.get("source", "auto")
    music_dir = request.rel_url.query.get("musicDir", MUSIC_DIR)

    if not query:
        return web.json_response({"error": "q requerido"}, status=400)

    result = await resolve(query, source, music_dir)

    if not result:
        return web.json_response({"error": "No se encontro resultado"}, status=404)

    return web.json_response({
        "videoId": result.video_id,
        "title": result.title,
        "author": result.author,
        "duration": result.duration,
        "thumbnail": result.thumbnail,
        "streamUrl": result.stream_url,
        "source": result.source,
        "cached": result.cached,
        "filePath": result.file_path,
    })


@routes.get("/scan")
async def scan_handler(request: web.Request) -> web.Response:
    music_dir = request.rel_url.query.get("dir", MUSIC_DIR)
    tracks = local_source.scan(music_dir)
    return web.json_response({
        "tracks": [
            {
                "title": t.title,
                "filePath": t.file_path,
                "streamUrl": t.stream_url,
                "source": t.source,
            }
            for t in tracks
        ]
    })


@routes.get("/audio/{path:.+}")
async def serve_audio(request: web.Request) -> web.Response:
    from urllib.parse import unquote
    path = unquote(request.match_info["path"])

    if not os.path.exists(path):
        return web.json_response({"error": "Archivo no encontrado"}, status=404)

    ext = os.path.splitext(path)[1].lower().lstrip(".")
    mime_map = {
        "opus": "audio/ogg",
        "mp3": "audio/mpeg",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "wav": "audio/wav",
        "m4a": "audio/mp4",
        "webm": "audio/webm",
    }
    content_type = mime_map.get(ext, "audio/ogg")

    stat = os.stat(path)
    return web.FileResponse(
        path,
        headers={
            "Content-Type": content_type,
            "Content-Length": str(stat.st_size),
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
            "X-Content-Duration": "0",
        }
    )



@routes.post("/dj/present")
async def dj_present(request: web.Request) -> web.Response:
    from .dj import generate_presentation, text_to_speech
    body = await request.json()
    title = body.get("title", "")
    author = body.get("author", "")
    source = body.get("source", "unknown")
    language = body.get("language", "es")
    api_url = body.get("apiUrl")
    api_key = body.get("apiKey")
    voice = body.get("voice", "alloy")
    model = body.get("model", "gpt-4o-mini")

    text = await generate_presentation(title, author, source, language, api_url, api_key, model)
    if not text:
        return web.json_response({"error": "No se pudo generar presentacion"}, status=500)

    tts_url = await text_to_speech(text, api_url, api_key, voice)
    return web.json_response({"text": text, "audioUrl": tts_url})

async def main() -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    app = web.Application()
    app.add_routes(routes)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    log.info("server_started", port=PORT)
    await asyncio.Event().wait()


if __name__ == "__main__":
    import uvloop
    uvloop.run(main())
