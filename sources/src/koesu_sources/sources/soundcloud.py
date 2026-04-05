import asyncio
from typing import Optional
import yt_dlp
from yt_dlp.utils import DownloadError
from .base import BaseSource, ResolvedTrack
from ..logger import get_logger

log = get_logger("sources.soundcloud")


class SoundCloudSource(BaseSource):
    def can_handle(self, url: str) -> bool:
        return "soundcloud.com" in url

    async def search(self, query: str) -> Optional[ResolvedTrack]:
        return await asyncio.get_event_loop().run_in_executor(
            None, self._search_sync, query
        )

    async def resolve(self, url: str) -> Optional[ResolvedTrack]:
        return await asyncio.get_event_loop().run_in_executor(
            None, self._resolve_sync, url
        )

    def _search_sync(self, query: str) -> Optional[ResolvedTrack]:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "format": "bestaudio/best",
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"scsearch1:{query}", download=False)
                if not info or "entries" not in info:
                    return None
                return self._build_track(info["entries"][0])
        except (DownloadError, Exception) as e:
            log.error("search_failed", query=query, error=str(e))
            return None

    def _resolve_sync(self, url: str) -> Optional[ResolvedTrack]:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "format": "bestaudio/best",
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return None
                return self._build_track(info)
        except Exception as e:
            log.error("resolve_failed", url=url, error=str(e))
            return None

    def _build_track(self, info: dict) -> ResolvedTrack:
        formats = info.get("formats", [])
        stream_url = formats[-1].get("url", "") if formats else ""
        thumbnails = info.get("thumbnails", [])
        thumbnail = thumbnails[-1].get("url", "") if thumbnails else ""

        return ResolvedTrack(
            video_id=info.get("id", ""),
            title=info.get("title", "Unknown"),
            author=info.get("uploader") or "Unknown",
            duration=int((info.get("duration") or 0) * 1000),
            thumbnail=thumbnail,
            stream_url=stream_url,
            source="soundcloud",
        )
