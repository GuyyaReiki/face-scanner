"""
Photo storage service — uploads check-in photos to Supabase Storage.
Requires env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
Bucket name: attendance-photos (create as public bucket in Supabase dashboard)
"""

import os
import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
BUCKET = "attendance-photos"


def _enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


async def upload_photo(user_id: str, img_bytes: bytes, timestamp: str) -> str | None:
    """
    Upload a check-in photo to Supabase Storage.
    Returns the public URL, or None if storage is not configured / upload fails.
    """
    if not _enabled():
        return None

    safe_ts = timestamp.replace(":", "-").replace(".", "-")[:19]
    object_path = f"{user_id}/{safe_ts}.jpg"
    upload_url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{object_path}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                upload_url,
                content=img_bytes,
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "image/jpeg",
                    "x-upsert": "true",
                },
            )
            if resp.status_code in (200, 201):
                public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{object_path}"
                return public_url
            else:
                logger.warning("Photo upload failed %s: %s", resp.status_code, resp.text[:200])
                return None
    except Exception as e:
        logger.warning("Photo upload error: %s", e)
        return None
