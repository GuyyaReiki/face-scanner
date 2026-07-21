from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import sqlite3, uuid, os, numpy as np
from datetime import datetime
from io import BytesIO
from pathlib import Path
from PIL import Image

app = FastAPI(title="Face Scanner Worker", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_PATH     = os.getenv("WORKER_DB_PATH", "/content/drive/MyDrive/face_scanner/embeddings.db")
PHOTOS_DIR  = os.getenv("WORKER_PHOTOS_DIR", "/content/drive/MyDrive/face_scanner/photos")
THRESHOLD   = float(os.getenv("FACE_THRESHOLD", "0.65"))

_face_app = None


def get_face_app():
    if _face_app is None:
        raise HTTPException(503, "Model not loaded yet")
    return _face_app


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_embeddings_db():
    conn = get_db()
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            embedding BLOB NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_emb_user ON face_embeddings(user_id)")
    conn.commit()
    conn.close()


def extract_embedding(img_bytes: bytes) -> np.ndarray | None:
    fa = get_face_app()
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    arr = np.array(img)
    faces = fa.get(arr)
    if not faces:
        return None
    best = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return best.normed_embedding.astype(np.float32)


def save_photo_to_drive(user_id: str, img_bytes: bytes, label: str) -> str:
    """Save JPEG to PHOTOS_DIR/{user_id}/{label}.jpg. Returns relative path."""
    user_dir = Path(PHOTOS_DIR) / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{label}.jpg"
    file_path = user_dir / filename
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=85)
    file_path.write_bytes(buf.getvalue())
    return f"{user_id}/{filename}"


@app.on_event("startup")
def startup():
    global _face_app
    from insightface.app import FaceAnalysis
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    os.makedirs(PHOTOS_DIR, exist_ok=True)
    init_embeddings_db()
    _face_app = FaceAnalysis(name="buffalo_s", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    _face_app.prepare(ctx_id=0, det_size=(320, 320))


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _face_app is not None, "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.post("/register")
async def register(user_id: str, images: list[UploadFile] = File(...)):
    conn = get_db()
    stored = 0
    for i, upload in enumerate(images):
        img_bytes = await upload.read()
        emb = extract_embedding(img_bytes)
        if emb is None:
            continue
        conn.execute(
            "INSERT INTO face_embeddings (id, user_id, embedding, created_at) VALUES (?,?,?,?)",
            (str(uuid.uuid4()), user_id, emb.tobytes(), datetime.utcnow().isoformat() + "Z"),
        )
        # Save enrollment photo to Drive
        try:
            save_photo_to_drive(user_id, img_bytes, f"enroll_{i:02d}")
        except Exception:
            pass
        stored += 1
    conn.commit()
    conn.close()
    if stored == 0:
        raise HTTPException(422, "No faces detected in any uploaded image")
    return {"user_id": user_id, "embeddings_stored": stored}


@app.delete("/register/{user_id}")
def delete_embeddings(user_id: str):
    conn = get_db()
    conn.execute("DELETE FROM face_embeddings WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"deleted": user_id}


@app.post("/recognize")
async def recognize(image: UploadFile = File(...)):
    """Identify a face. Saves check-in photo to Drive. Returns match result + photo_path."""
    img_bytes = await image.read()
    query_emb = extract_embedding(img_bytes)
    if query_emb is None:
        return {"matched": False, "user_id": None, "confidence": None,
                "photo_path": None, "message": "No face detected"}

    query_norm = query_emb / (np.linalg.norm(query_emb) + 1e-10)

    conn = get_db()
    rows = conn.execute("SELECT user_id, embedding FROM face_embeddings").fetchall()
    conn.close()

    best_uid, best_sim = None, -1.0
    for row in rows:
        stored = np.frombuffer(row["embedding"], dtype=np.float32)
        stored_norm = stored / (np.linalg.norm(stored) + 1e-10)
        sim = float(np.dot(query_norm, stored_norm))
        if sim > best_sim:
            best_sim, best_uid = sim, row["user_id"]

    if best_sim >= THRESHOLD:
        # Save check-in photo to Google Drive
        label = f"checkin_{datetime.utcnow().strftime('%Y%m%dT%H%M%S')}"
        photo_path = None
        try:
            photo_path = save_photo_to_drive(best_uid, img_bytes, label)
        except Exception:
            pass
        return {"matched": True, "user_id": best_uid, "confidence": best_sim, "photo_path": photo_path}

    return {"matched": False, "user_id": None,
            "confidence": best_sim if best_sim > 0 else None,
            "photo_path": None, "message": "No match above threshold"}


@app.get("/photos/{photo_path:path}")
def serve_photo(photo_path: str):
    """Serve a photo from Google Drive. Called by Railway proxy."""
    full_path = Path(PHOTOS_DIR) / photo_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(404, "Photo not found")
    # Security: ensure path stays inside PHOTOS_DIR
    try:
        full_path.resolve().relative_to(Path(PHOTOS_DIR).resolve())
    except ValueError:
        raise HTTPException(403, "Forbidden")
    return FileResponse(str(full_path), media_type="image/jpeg")
