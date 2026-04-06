import os
from typing import Optional
from openai import AsyncOpenAI
from .search import search_song_info
from ..logger import get_logger

log = get_logger("dj.presenter")

SYSTEM_PROMPT = """Eres un DJ profesional y carismático. Cuando te den información sobre una canción,
presenta la canción de manera entretenida e informativa en 2-3 oraciones cortas.
Menciona datos interesantes sobre la canción, el artista o el contexto cultural.
Habla en el idioma configurado. Sé conciso, el texto será convertido a voz."""


async def generate_presentation(
    title: str,
    author: str,
    source: str,
    language: str = "es",
    api_url: Optional[str] = None,
    api_key: Optional[str] = None,
    model: str = "gpt-4o-mini",
) -> Optional[str]:
    key = api_key or os.getenv("DJ_AI_API_KEY", "")
    url = api_url or os.getenv("DJ_AI_API_URL", "https://api.openai.com/v1")

    if not key:
        log.warning("no_api_key")
        return None

    try:
        info = await search_song_info(title, author)

        client = AsyncOpenAI(api_key=key, base_url=url)

        user_prompt = f"""Canción: {title}
Artista: {author}
Fuente: {source}
Idioma de respuesta: {language}
Información encontrada: {info or "No hay información adicional disponible"}

Presenta esta canción como un DJ."""

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=200,
            temperature=0.8,
        )

        text = response.choices[0].message.content
        import re
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        log.info("presentation_generated", title=title[:30])
        return text

    except Exception as e:
        log.error("presentation_failed", error=str(e))
        return None
