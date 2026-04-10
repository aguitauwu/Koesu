import asyncio
import os
from aiohttp import web
from .resolver import resolve
from .logger import get_logger

log = get_logger("main")

PORT = int(os.getenv("YTDLP_SERVER_PORT", "7331"))
MUSIC_DIR = os.getenv("MUSIC_DIR", "/root/musica")
CACHE_DIR = os.getenv("CACHE_DIR", "/root/koesu/cache/audio")

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
