import os
import subprocess
from pathlib import Path
from typing import Optional, List
from .base import BaseSource, ResolvedTrack
from ..logger import get_logger

log = get_logger("sources.local")

SUPPORTED_EXTENSIONS = {".opus", ".mp3", ".flac", ".ogg", ".wav", ".m4a", ".webm"}
MUSIC_DIR = os.getenv("MUSIC_DIR", "/root/musica")
SERVER_PORT = os.getenv("KOESU_HTTP_PORT", "7332")
SERVER_HOST = os.getenv("YTDLP_SERVER_HOST", "172.17.0.1")


def get_duration(path: str) -> int:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=5
        )
        return int(float(result.stdout.strip()) * 1000)
    except Exception:
        return 0


class LocalSource(BaseSource):
    def can_handle(self, url: str) -> bool:
        return url.startswith("file://") or url.startswith("/")

    async def search(self, query: str, music_dir: str = MUSIC_DIR) -> Optional[ResolvedTrack]:
        tracks = self.scan(music_dir)
        q = query.lower()
        match = next((t for t in tracks if q in t.title.lower()), None)
        return match

    async def resolve(self, url: str) -> Optional[ResolvedTrack]:
        path = url.replace("file://", "")
        if not os.path.exists(path):
            return None
        name = Path(path).stem
        return ResolvedTrack(
            video_id=name,
            title=name,
            author="Local",
            duration=get_duration(path),
            thumbnail="",
            stream_url=self._http_url(path),
            source="local",
            file_path=path,
        )

    def scan(self, music_dir: str = MUSIC_DIR) -> List[ResolvedTrack]:
        tracks = []
        try:
            for root, _, files in os.walk(music_dir):
                for file in files:
                    ext = Path(file).suffix.lower()
                    if ext not in SUPPORTED_EXTENSIONS:
                        continue
                    full_path = os.path.join(root, file)
                    name = Path(file).stem
                    tracks.append(ResolvedTrack(
                        video_id=name,
                        title=name,
                        author="Local",
                        duration=get_duration(full_path),
                        thumbnail="",
                        stream_url=self._http_url(full_path),
                        source="local",
                        file_path=full_path,
                    ))
        except Exception as e:
            log.error("scan_failed", dir=music_dir, error=str(e))
        return tracks

    def _http_url(self, path: str) -> str:
        from urllib.parse import quote
        encoded = quote(path, safe="")
        return f"http://{SERVER_HOST}:{SERVER_PORT}/audio/{encoded}"
