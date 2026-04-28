import asyncio
import os
from typing import Optional
import yt_dlp
from yt_dlp.utils import DownloadError, ExtractorError
from .base import BaseSource, ResolvedTrack
from ..logger import get_logger

log = get_logger("sources.youtube")

CACHE_DIR = os.getenv("CACHE_DIR", "/root/koesu/cache/audio")
YDL_OPTS_BASE = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
    "nocheckcertificate": False,
    "ignoreerrors": False,
    "geo_bypass": True,
    "source_address": "0.0.0.0",
}


class YouTubeSource(BaseSource):
    def can_handle(self, url: str) -> bool:
        return "youtube.com" in url or "youtu.be" in url

    async def search(self, query: str) -> Optional[ResolvedTrack]:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._search_sync, query
        )

    async def resolve(self, url: str) -> Optional[ResolvedTrack]:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._resolve_sync, url
        )

    def _search_sync(self, query: str) -> Optional[ResolvedTrack]:
        opts = {
            **YDL_OPTS_BASE,
            "default_search": "ytsearch1",
            "skip_download": True,
            "format": "bestaudio/best",
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"ytsearch1:{query}", download=False)
                if not info or "entries" not in info:
                    return None
                entry = info["entries"][0]
                return self._build_track(entry)
        except (DownloadError, ExtractorError) as e:
            log.error("search_failed", query=query, error=str(e))
            return None

    def _resolve_sync(self, url: str) -> Optional[ResolvedTrack]:
        opts = {
            **YDL_OPTS_BASE,
            "skip_download": True,
            "format": "bestaudio/best",
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return None
                return self._build_track(info)
        except (DownloadError, ExtractorError) as e:
            log.error("resolve_failed", url=url, error=str(e))
            return None

    def _build_track(self, info: dict) -> ResolvedTrack:
        formats = info.get("formats", [])
        stream_url = ""

        audio_formats = [
            f for f in formats
            if f.get("vcodec") == "none" and f.get("acodec") != "none"
        ]

        if audio_formats:
            best = max(audio_formats, key=lambda f: f.get("abr") or 0)
            stream_url = best.get("url", "")
        elif formats:
            stream_url = formats[-1].get("url", "")

        thumbnail = ""
        thumbnails = info.get("thumbnails", [])
        if thumbnails:
            thumbnail = thumbnails[-1].get("url", "")

        return ResolvedTrack(
            video_id=info.get("id", ""),
            title=info.get("title", "Unknown"),
            author=info.get("uploader") or info.get("channel") or "Unknown",
            duration=int((info.get("duration") or 0) * 1000),
            thumbnail=thumbnail,
            stream_url=stream_url,
            source="youtube",
        )

    async def download(self, url: str, video_id: str) -> Optional[str]:
        return await asyncio.get_running_loop().run_in_executor(
            None, self._download_sync, url, video_id
        )

    def _download_sync(self, url: str, video_id: str) -> Optional[str]:
        os.makedirs(CACHE_DIR, exist_ok=True)
        out_path = os.path.join(CACHE_DIR, f"{video_id}.opus")

        if os.path.exists(out_path):
            return out_path

        opts = {
            **YDL_OPTS_BASE,
            "format": "bestaudio/best",
            "outtmpl": out_path.replace(".opus", ".%(ext)s"),
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "opus",
                    "preferredquality": "0",
                }
            ],
        }

        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
            return out_path if os.path.exists(out_path) else None
        except Exception as e:
            log.error("download_failed", url=url, error=str(e))
            return None
