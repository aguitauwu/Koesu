import os
import hashlib
import aiohttp
import aiofiles
from typing import Optional
from ..logger import get_logger

log = get_logger("dj.tts")

CACHE_DIR = os.getenv("CACHE_DIR", "/root/koesu/cache/audio")
TTS_CACHE_DIR = os.path.abspath(os.path.join(CACHE_DIR, "tts"))
SERVER_HOST = os.getenv("YTDLP_SERVER_HOST", "172.17.0.1")
SERVER_PORT = os.getenv("KOESU_HTTP_PORT", "7332")

DEFAULT_TTS_MODEL = "canopylabs/orpheus-v1-english"
DEFAULT_TTS_VOICE = "troy"


async def text_to_speech(
    text: str,
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    voice: str = "",
) -> Optional[str]:
    os.makedirs(TTS_CACHE_DIR, exist_ok=True)

    text_hash = hashlib.md5(text.encode()).hexdigest()
    file_path = os.path.join(TTS_CACHE_DIR, f"{text_hash}.wav")

    if os.path.exists(file_path):
        return _http_url(file_path)

    key = api_key or os.getenv("DJ_AI_API_KEY", "")
    url = api_url or os.getenv("DJ_AI_API_URL", "https://api.groq.com/openai/v1")

    if not key:
        return await _flowery_tts(text, file_path)

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=key, base_url=url)

        tts_model = os.getenv("DJ_TTS_MODEL", DEFAULT_TTS_MODEL)
        tts_voice = os.getenv("DJ_TTS_VOICE") or voice or DEFAULT_TTS_VOICE

        response = await client.audio.speech.create(
            model=tts_model,
            voice=tts_voice,
            input=text,
            response_format="wav",
        )

        async with aiofiles.open(file_path, "wb") as f:
            await f.write(response.content)

        log.info("tts_generated", chars=len(text))
        return _http_url(file_path)

    except Exception as e:
        log.error("tts_failed", error=str(e))
        return await _flowery_tts(text, file_path)


async def _flowery_tts(text: str, file_path: str) -> Optional[str]:
    mp3_path = file_path.replace(".wav", ".mp3")
    voice = os.getenv("TTS_VOICE", "Olivia")
    url = f"https://api.flowery.pw/v1/tts?text={aiohttp.helpers.quote(text)}&voice={voice}"

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return None
                async with aiofiles.open(mp3_path, "wb") as f:
                    await f.write(await resp.read())
        return _http_url(mp3_path)
    except Exception as e:
        log.error("flowery_tts_failed", error=str(e))
        return None


def _http_url(path: str) -> str:
    filename = os.path.basename(path)
    return f"http://{SERVER_HOST}:{SERVER_PORT}/audio/tts/{filename}"
