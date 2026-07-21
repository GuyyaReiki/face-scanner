"""
Remote face recognition client.
Calls the Colab inference worker instead of running InsightFace locally.
Set RECOGNIZER_URL env var to the Colab worker's ngrok URL.
"""

import os
import logging
import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# Mutable — updated at runtime via POST /api/internal/register-worker
_recognizer_url: str | None = None


def get_url() -> str:
    url = os.getenv("RECOGNIZER_URL") or _recognizer_url
    if not url:
        raise HTTPException(
            status_code=503,
            detail="Face recognition service unavailable. Start the Colab worker and register its URL.",
        )
    return url.rstrip("/")


def set_url(url: str) -> None:
    global _recognizer_url
    _recognizer_url = url
    logger.info("Recognizer URL updated to %s", url)


async def recognize(image_bytes: bytes) -> dict:
    """Send image to worker, return {matched, user_id, confidence, message}."""
    url = get_url()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{url}/recognize",
                files={"image": ("capture.jpg", image_bytes, "image/jpeg")},
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Face recognition worker timed out.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Worker error: {e.response.text[:200]}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach recognition worker: {e}")


async def register_user(user_id: str, image_bytes_list: list[bytes]) -> int:
    """Send images to worker for enrollment. Returns count stored."""
    url = get_url()
    files = [
        ("images", (f"img_{i}.jpg", img, "image/jpeg"))
        for i, img in enumerate(image_bytes_list)
    ]
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{url}/register",
                params={"user_id": user_id},
                files=files,
            )
            resp.raise_for_status()
            return resp.json().get("embeddings_stored", 0)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Worker timed out during enrollment.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Worker enrollment error: {e.response.text[:200]}")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach recognition worker: {e}")


async def get_photo(photo_path: str) -> bytes:
    """Proxy a photo from the Colab worker's Google Drive storage."""
    url = get_url()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{url}/photos/{photo_path}")
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Photo not found on worker.")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot reach recognition worker: {e}")
    """Tell worker to remove all embeddings for this user."""
    url = get_url()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(f"{url}/register/{user_id}")
            resp.raise_for_status()
    except Exception as e:
        logger.warning("Failed to delete embeddings from worker for %s: %s", user_id, e)
