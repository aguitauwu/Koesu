from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class ResolvedTrack:
    video_id: str
    title: str
    author: str
    duration: int
    thumbnail: str
    stream_url: str
    source: str
    cached: bool = False
    file_path: Optional[str] = None


class BaseSource(ABC):
    @abstractmethod
    async def search(self, query: str) -> Optional[ResolvedTrack]:
        pass

    @abstractmethod
    async def resolve(self, url: str) -> Optional[ResolvedTrack]:
        pass

    @abstractmethod
    def can_handle(self, url: str) -> bool:
        pass
