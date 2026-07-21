import os
import uuid
import numpy as np
import sqlite3
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Optional

import aiofiles
from PIL import Image


class FaceServiceError(Exception):
    pass


class FaceService:
    def __init__(self, photos_dir: str):
        self.photos_dir = photos_dir
        self._app = None
        self._model_loaded = False

    def load_model(self) -> None:
        """Load InsightFace buffalo_s model with det_size=(320,320)."""
        import insightface
        from insightface.app import FaceAnalysis

        self._app = FaceAnalysis(name="buffalo_s", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        self._app.prepare(ctx_id=0, det_size=(320, 320))
        self._model_loaded = True

    def _require_model(self) -> None:
        if not self._model_loaded or self._app is None:
            raise FaceServiceError("InsightFace model is not loaded")

    def extract_embedding(self, img_bytes: bytes) -> Optional[np.ndarray]:
        """Extract ArcFace 512-dim embedding from image bytes. Returns None if no face found."""
        self._require_model()

        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        img_array = np.array(img)

        faces = self._app.get(img_array)
        if not faces:
            return None

        # Pick the face with the largest bounding box area
        best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        embedding = best_face.normed_embedding
        return embedding.astype(np.float32)

    def register_user(self, db: sqlite3.Connection, user_id: str, image_bytes_list: list) -> int:
        """
        Store each embedding separately (NOT averaged).
        Returns the count of embeddings stored.
        """
        self._require_model()

        stored_count = 0
        cursor = db.cursor()

        for img_bytes in image_bytes_list:
            embedding = self.extract_embedding(img_bytes)
            if embedding is None:
                continue

            embedding_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat() + "Z"
            embedding_blob = embedding.tobytes()

            cursor.execute(
                "INSERT INTO face_embeddings (id, user_id, embedding, created_at) VALUES (?, ?, ?, ?)",
                (embedding_id, user_id, embedding_blob, timestamp),
            )
            stored_count += 1

        db.commit()
        return stored_count

    def identify(
        self, db: sqlite3.Connection, img_bytes: bytes, threshold: float = 0.65
    ) -> tuple:
        """
        Identify a face against all stored embeddings using cosine similarity.
        Returns (user_id, similarity) if similarity >= threshold, else (None, best_similarity).
        """
        self._require_model()

        query_embedding = self.extract_embedding(img_bytes)
        if query_embedding is None:
            return (None, None)

        query_norm = query_embedding / (np.linalg.norm(query_embedding) + 1e-10)

        cursor = db.cursor()
        cursor.execute("SELECT user_id, embedding FROM face_embeddings")
        rows = cursor.fetchall()

        best_user_id = None
        best_similarity = -1.0

        for row in rows:
            user_id = row[0]
            embedding_blob = row[1]

            stored_embedding = np.frombuffer(embedding_blob, dtype=np.float32)
            stored_norm = stored_embedding / (np.linalg.norm(stored_embedding) + 1e-10)

            similarity = float(np.dot(query_norm, stored_norm))

            if similarity > best_similarity:
                best_similarity = similarity
                best_user_id = user_id

        if best_similarity >= threshold:
            return (best_user_id, best_similarity)
        return (None, best_similarity if best_similarity > 0 else None)

    async def save_photo(self, user_id: str, img_bytes: bytes, label: str) -> str:
        """
        Save JPEG to photos_dir/{user_id}/{label}.jpg.
        Returns relative path: {user_id}/{label}.jpg
        """
        user_photo_dir = Path(self.photos_dir) / user_id
        user_photo_dir.mkdir(parents=True, exist_ok=True)

        filename = f"{label}.jpg"
        full_path = user_photo_dir / filename

        # Convert to JPEG if needed
        img = Image.open(BytesIO(img_bytes)).convert("RGB")
        jpeg_buffer = BytesIO()
        img.save(jpeg_buffer, format="JPEG", quality=90)
        jpeg_bytes = jpeg_buffer.getvalue()

        async with aiofiles.open(str(full_path), "wb") as f:
            await f.write(jpeg_bytes)

        return f"{user_id}/{filename}"
