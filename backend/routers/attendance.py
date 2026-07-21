import uuid
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query

from database import get_db
from models import AttendanceRecord, CheckInResult
from dependencies import get_current_user, require_admin
import remote_recognizer

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

DUPLICATE_CHECKIN_HOURS = 8


@router.post("/check", response_model=CheckInResult)
async def check_in(
    image: UploadFile = File(...),
    force: bool = Query(default=False),
    db=Depends(get_db),
):
    """Public endpoint — identify face and record attendance."""
    img_bytes = await image.read()

    result = await remote_recognizer.recognize(img_bytes)

    if not result.get("matched"):
        return CheckInResult(
            matched=False, user_id=None, user_name=None,
            confidence=result.get("confidence"),
            timestamp=None, message=result.get("message", "Face not recognized."),
        )

    user_id = result["user_id"]
    confidence = result["confidence"]

    cursor = db.cursor()
    cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        return CheckInResult(
            matched=False, user_id=None, user_name=None,
            confidence=confidence, timestamp=None,
            message="Matched user no longer exists.",
        )
    user_name = user_row["name"]

    now = datetime.utcnow()
    timestamp = now.isoformat() + "Z"

    if not force:
        cutoff = (now - timedelta(hours=DUPLICATE_CHECKIN_HOURS)).isoformat() + "Z"
        cursor.execute(
            "SELECT timestamp FROM attendance WHERE user_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT 1",
            (user_id, cutoff),
        )
        recent = cursor.fetchone()
        if recent:
            return CheckInResult(
                matched=True, user_id=user_id, user_name=user_name,
                confidence=confidence, timestamp=recent["timestamp"],
                message=f"Already checked in within {DUPLICATE_CHECKIN_HOURS}h. Use force=true to override.",
            )

    # photo_path comes from Colab worker (saved to Google Drive)
    photo_path = result.get("photo_path")  # e.g. "user_id/checkin_TIMESTAMP.jpg"

    cursor.execute(
        "INSERT INTO attendance (id, user_id, timestamp, confidence, photo_path) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), user_id, timestamp, confidence, photo_path),
    )
    db.commit()

    return CheckInResult(
        matched=True, user_id=user_id, user_name=user_name,
        confidence=confidence, timestamp=timestamp,
        message=f"Check-in successful for {user_name}.",
    )


@router.get("", response_model=List[AttendanceRecord])
async def list_attendance(
    date: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    admin: dict = Depends(require_admin),
    db=Depends(get_db),
):
    query = """
        SELECT a.id, a.user_id, u.name, a.timestamp, a.confidence, a.photo_path
        FROM attendance a JOIN users u ON a.user_id = u.id WHERE 1=1
    """
    params: list = []
    if date:
        query += " AND DATE(a.timestamp) = ?"; params.append(date)
    if user_id:
        query += " AND a.user_id = ?"; params.append(user_id)
    query += " ORDER BY a.timestamp DESC LIMIT ?"; params.append(limit)

    cursor = db.cursor()
    cursor.execute(query, params)
    return [AttendanceRecord(id=r["id"], user_id=r["user_id"], user_name=r["name"],
                             timestamp=r["timestamp"], confidence=r["confidence"],
                             photo_url=f"/api/photos/{r['photo_path']}" if r["photo_path"] else None)
            for r in cursor.fetchall()]


@router.get("/{user_id}", response_model=List[AttendanceRecord])
async def get_user_attendance(
    user_id: str,
    date: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    if current_user.get("role") != "admin" and current_user.get("user_id") != user_id:
        raise HTTPException(403, "Access denied.")

    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(404, f"User '{user_id}' not found.")

    query = """
        SELECT a.id, a.user_id, u.name, a.timestamp, a.confidence, a.photo_path
        FROM attendance a JOIN users u ON a.user_id = u.id WHERE a.user_id = ?
    """
    params: list = [user_id]
    if date:
        query += " AND DATE(a.timestamp) = ?"; params.append(date)
    query += " ORDER BY a.timestamp DESC LIMIT ?"; params.append(limit)

    cursor.execute(query, params)
    return [AttendanceRecord(id=r["id"], user_id=r["user_id"], user_name=r["name"],
                             timestamp=r["timestamp"], confidence=r["confidence"],
                             photo_url=f"/api/photos/{r['photo_path']}" if r["photo_path"] else None)
            for r in cursor.fetchall()]
