import os
import logging
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "/content/drive/MyDrive/face_scanner/attendance.db")
PHOTOS_DIR = os.getenv("PHOTOS_DIR", "/content/drive/MyDrive/face_scanner/photos/")

from face_service import FaceService

face_service = FaceService(photos_dir=PHOTOS_DIR)

app = FastAPI(title="Face Scanner Attendance", version="1.0.0")

# CORS — allow all origins (required for ngrok and cross-origin dev)
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

# Serve React frontend — static assets + SPA catch-all
frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    # Serve Vite-generated assets (JS, CSS, images)
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve React SPA — return index.html for all unmatched routes."""
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        return JSONResponse(status_code=404, content={"detail": "Frontend not built. Run: cd frontend && npm run build"})
else:
    logger.info("Frontend dist not found at %s — skipping static mount.", frontend_dist)


@app.get("/health", tags=["health"])
async def health_check():
    """Health check endpoint — always accessible without API key."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.on_event("startup")
async def startup_event():
    """Initialize database and load face recognition model on startup."""
    from database import init_db, _db_connection
    import database

    logger.info("Initializing database at %s", DB_PATH)
    database._db_connection = init_db(DB_PATH)
    logger.info("Database initialized.")

    logger.info("Loading InsightFace buffalo_s model...")
    try:
        face_service.load_model()
        logger.info("InsightFace model loaded successfully.")
    except Exception as e:
        logger.error("Failed to load InsightFace model: %s", e)
        # Don't crash on startup — endpoints will return 503 until model is available


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown."""
    import database
    if database._db_connection is not None:
        database._db_connection.close()
        logger.info("Database connection closed.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=False,
        log_level="info",
    )
