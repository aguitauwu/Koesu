import os
from typing import Optional
from .sources.base import ResolvedTrack
from .sources.youtube import YouTubeSource
from .sources.local import LocalSource
from .sources.soundcloud import SoundCloudSource
from .logger import get_logger

log = get_logger("resolver")

youtube = YouTubeSource()
local = LocalSource()
soundcloud = SoundCloudSource()

MUSIC_DIR = os.getenv("MUSIC_DIR", "/root/musica")

SOURCE_ORDER = ["youtube", "local", "soundcloud"]


async def resolve(
    query: str,
    source: str = "auto",
    music_dir: str = MUSIC_DIR,
) -> Optional[ResolvedTrack]:
    is_url = query.startswith("http")

    if source != "auto":
        return await resolve_by_source(query, source, music_dir)

    order = detect_order(query) if is_url else SOURCE_ORDER

    for src in order:
        try:
            result = await resolve_by_source(query, src, music_dir)
            if result:
                log.info("resolved", query=query[:50], source=src)
                return result
        except Exception as e:
            log.warning("source_failed", source=src, error=str(e))
            continue

    return None


async def resolve_by_source(
    query: str,
    source: str,
    music_dir: str,
) -> Optional[ResolvedTrack]:
    is_url = query.startswith("http")

    match source:
        case "youtube":
            if is_url and youtube.can_handle(query):
                return await youtube.resolve(query)
            return await youtube.search(query)

        case "local":
            if is_url and local.can_handle(query):
                return await local.resolve(query)
            return await local.search(query)

        case "soundcloud":
            if is_url and soundcloud.can_handle(query):
                return await soundcloud.resolve(query)
            return await soundcloud.search(query)

        case _:
            return None


def detect_order(url: str) -> list[str]:
    if "youtube.com" in url or "youtu.be" in url:
        return ["youtube", "local", "soundcloud"]
    if "soundcloud.com" in url:
        return ["soundcloud", "youtube", "local"]
    return SOURCE_ORDER
