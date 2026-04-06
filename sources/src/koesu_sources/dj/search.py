import os
from typing import Optional
from ..logger import get_logger

log = get_logger("dj.search")


async def search_song_info(title: str, author: str) -> Optional[str]:
    query = f"{title} {author} song history"
    engine = os.getenv("DJ_SEARCH_ENGINE", "duckduckgo")

    if engine == "tavily":
        return await _search_tavily(query)
    return await _search_duckduckgo(query)


async def _search_duckduckgo(query: str) -> Optional[str]:
    try:
        from ddgs import DDGS
        import asyncio

        def _sync():
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=3))
                if not results:
                    return None
                return " ".join(r.get("body", "") for r in results[:3])

        return await asyncio.get_event_loop().run_in_executor(None, _sync)
    except Exception as e:
        log.error("duckduckgo_failed", error=str(e))
        return None


async def _search_tavily(query: str) -> Optional[str]:
    try:
        from tavily import AsyncTavilyClient
        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return await _search_duckduckgo(query)

        client = AsyncTavilyClient(api_key=api_key)
        result = await client.search(query, max_results=3)
        results = result.get("results", [])
        return " ".join(r.get("content", "") for r in results[:3])
    except Exception as e:
        log.error("tavily_failed", error=str(e))
        return await _search_duckduckgo(query)
