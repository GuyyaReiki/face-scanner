from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sqlite3, uuid, os, numpy as np
from datetime import datetime
from io import BytesIO
from PIL import Image
import insightface
from insightface.app import FaceAnalysis

app = FastAPI(title="Face Scanner Worker", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

DB_PATH = os.getenv("WORKER_DB_PATH", "/content/drive/MyDrive/face_scanner/embeddings.db")
THRESHOLD = float(os.getenv("FACE_THRESHOLD", "0.65"))

# Module-level face analysis app
_face_app = None


def get_face_app():
    global _face_app
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


@app.on_event("startup")
def startup():
    global _face_app
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    init_embeddings_db()
    _face_app = FaceAnalysis(name="buffalo_s", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
    _face_app.prepare(ctx_id=0, det_size=(320, 320))


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _face_app is not None,
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/register")
async def register(user_id: str, images: list[UploadFile] = File(...)):
    """Store face embeddings for a user."""
    conn = get_db()
    stored = 0
    for upload in images:
        img_bytes = await upload.read()
        emb = extract_embedding(img_bytes)
        if emb is None:
            continue
        conn.execute(
            "INSERT INTO face_embeddings (id, user_id, embedding, created_at) VALUES (?,?,?,?)",
            (str(uuid.uuid4()), user_id, emb.tobytes(), datetime.utcnow().isoformat() + "Z"),
        )
        stored += 1
    conn.commit()
    conn.close()
    if stored == 0:
        raise HTTPException(422, "No faces detected in any uploaded image")
    return {"user_id": user_id, "embeddings_stored": stored}


@app.delete("/register/{user_id}")
def delete_embeddings(user_id: str):
    """Remove all embeddings for a user."""
    conn = get_db()
    conn.execute("DELETE FROM face_embeddings WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"deleted": user_id}


@app.post("/recognize")
async def recognize(image: UploadFile = File(...)):
    """Identify a face. Returns matched user_id + confidence or null."""
    img_bytes = await image.read()
    query_emb = extract_embedding(img_bytes)
    if query_emb is None:
        return {"matched": False, "user_id": None, "confidence": None, "message": "No face detected"}

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
        return {"matched": True, "user_id": best_uid, "confidence": best_sim}
    return {
        "matched": False,
        "user_id": None,
        "confidence": best_sim if best_sim > 0 else None,
        "message": "No match above threshold",
    }
