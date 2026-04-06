import os
import asyncio
import hashlib
import aiohttp
import aiofiles
from typing import Optional
from ..logger import get_logger

log = get_logger("dj.tts")

CACHE_DIR = os.getenv("CACHE_DIR", "/root/koesu/cache/audio")
TTS_CACHE_DIR = os.path.join(CACHE_DIR, "tts")
SERVER_HOST = os.getenv("YTDLP_SERVER_HOST", "172.17.0.1")
SERVER_PORT = os.getenv("YTDLP_SERVER_PORT", "7331")


async def text_to_speech(
    text: str,
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    voice: str = "alloy",
) -> Optional[str]:
    os.makedirs(TTS_CACHE_DIR, exist_ok=True)

    text_hash = hashlib.md5(text.encode()).hexdigest()
    file_path = os.path.join(TTS_CACHE_DIR, f"{text_hash}.mp3")

    if os.path.exists(file_path):
        return _http_url(file_path)

    key = api_key or os.getenv("DJ_AI_API_KEY", "")
    url = api_url or os.getenv("DJ_AI_API_URL", "https://api.openai.com/v1")

    if not key:
        return await _flowery_tts(text, file_path)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key, base_url=url)

        response = await client.audio.speech.create(
            model="tts-1",
            voice=voice,
            input=text,
        )

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(response.content)

        log.info("tts_generated", chars=len(text))
        return _http_url(file_path)

    except Exception as e:
        log.error("tts_failed", error=str(e))
        return await _flowery_tts(text, file_path)


async def _flowery_tts(text: str, file_path: str) -> Optional[str]:
    voice = os.getenv("TTS_VOICE", "Olivia")
    url = f"https://api.flowery.pw/v1/tts?text={aiohttp.helpers.quote(text)}&voice={voice}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return None
                async with aiofiles.open(file_path, "wb") as f:
                    await f.write(await resp.read())
        return _http_url(file_path)
    except Exception as e:
        log.error("flowery_tts_failed", error=str(e))
        return None


def _http_url(path: str) -> str:
    from urllib.parse import quote
    encoded = quote(path, safe="")
    return f"http://{SERVER_HOST}:{SERVER_PORT}/audio/{encoded}"
