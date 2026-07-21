import os
import logging
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "/content/drive/MyDrive/face_scanner/attendance.db")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")

app = FastAPI(title="Face Scanner Attendance", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import users as users_router
from routers import attendance as attendance_router
from routers import auth as auth_router

app.include_router(users_router.router)
app.include_router(attendance_router.router)
app.include_router(auth_router.router)


# ── Internal endpoint — Colab worker registers its URL here ─────
class _WorkerReg(BaseModel):
    url: str
    secret: str = ""

@app.post("/api/internal/register-worker", include_in_schema=False)
async def register_worker(reg: _WorkerReg):
    """Called by Colab worker on startup to advertise its ngrok URL."""
    if WORKER_SECRET and reg.secret != WORKER_SECRET:
        raise HTTPException(status_code=403, detail="Invalid worker secret")
    import remote_recognizer
    remote_recognizer.set_url(reg.url)
    logger.info("Worker registered: %s", reg.url)
    return {"status": "ok", "url": reg.url}


# ── Photo proxy — fetches from Colab worker's Google Drive storage ─
@app.get("/api/photos/{photo_path:path}", include_in_schema=False)
async def proxy_photo(photo_path: str):
    """Proxy check-in photos stored on Google Drive via Colab worker."""
    import remote_recognizer
    from fastapi.responses import Response
    img_bytes = await remote_recognizer.get_photo(photo_path)
    return Response(content=img_bytes, media_type="image/jpeg")


# ── Health ───────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    import remote_recognizer
    worker_url = os.getenv("RECOGNIZER_URL") or remote_recognizer._recognizer_url
    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "worker_url": worker_url or "not configured",
    }


# ── Serve React SPA (registered last so /api/* routes take priority) ─
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return JSONResponse(status_code=404, content={"detail": "Frontend not built."})
else:
    logger.info("Frontend dist not found at %s — skipping.", frontend_dist)


# ── Startup / shutdown ───────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    import database
    logger.info("Initializing database...")
    try:
        database._db_connection = database.init_db(DB_PATH)
        logger.info("Database ready.")
    except Exception as e:
        logger.error(
            "DB init failed at startup: %s\n"
            "If using Supabase, ensure DATABASE_URL uses the POOLER connection string "
            "(port 6543, IPv4) not the direct connection (port 5432, IPv6).\n"
            "Supabase → Settings → Database → Connection pooling → Transaction mode.",
            e,
        )
        # Don't crash — requests will retry init via get_db_connection()
        # Health check will still pass so Railway knows the container is up

    import remote_recognizer
    url = os.getenv("RECOGNIZER_URL") or remote_recognizer._recognizer_url
    if url:
        logger.info("Recognizer URL: %s", url)
    else:
        logger.warning("RECOGNIZER_URL not set — face recognition returns 503 until Colab worker registers.")


@app.on_event("shutdown")
async def shutdown_event():
    import database
    if database._db_connection is not None:
        database._db_connection.close()
        logger.info("Database connection closed.")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), log_level="info")
