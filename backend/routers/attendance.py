import uuid
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query

from database import get_db
from models import AttendanceRecord, CheckInResult
from face_service import FaceService, FaceServiceError
from dependencies import get_current_user, require_admin

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

DUPLICATE_CHECKIN_HOURS = 8


def get_face_service() -> FaceService:
    from main import face_service
    return face_service


@router.post("/check", response_model=CheckInResult)
async def check_in(
    image: UploadFile = File(...),
    force: bool = Query(default=False, description="Override duplicate check-in guard"),
    db: sqlite3.Connection = Depends(get_db),
    face_svc: FaceService = Depends(get_face_service),
):
    """Identify a face from uploaded image and record attendance if matched."""
    img_bytes = await image.read()

    try:
        user_id, confidence = face_svc.identify(db, img_bytes)
    except FaceServiceError as e:
        raise HTTPException(status_code=503, detail=f"Face service unavailable: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face recognition error: {str(e)}")

    if user_id is None:
        return CheckInResult(
            matched=False,
            user_id=None,
            user_name=None,
            confidence=confidence,
            timestamp=None,
            message="Face not recognized. No matching user found.",
        )

    # Fetch user name
    cursor = db.cursor()
    cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
    user_row = cursor.fetchone()
    if not user_row:
        return CheckInResult(
            matched=False,
            user_id=None,
            user_name=None,
            confidence=confidence,
            timestamp=None,
            message="Matched user no longer exists in the system.",
        )
    user_name = user_row[0]

    now = datetime.utcnow()
    timestamp = now.isoformat() + "Z"

    # Duplicate check-in guard (within 8 hours)
    if not force:
        cutoff = (now - timedelta(hours=DUPLICATE_CHECKIN_HOURS)).isoformat() + "Z"
        cursor.execute(
            "SELECT timestamp FROM attendance WHERE user_id = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT 1",
            (user_id, cutoff),
        )
        recent = cursor.fetchone()
        if recent:
            return CheckInResult(
                matched=True,
                user_id=user_id,
                user_name=user_name,
                confidence=confidence,
                timestamp=recent[0],
                message=f"Already checked in within the last {DUPLICATE_CHECKIN_HOURS} hours. Use force=true to override.",
            )

    # Save check-in photo
    photo_path = None
    try:
        label = f"checkin_{now.strftime('%Y%m%d_%H%M%S')}"
        photo_path = await face_svc.save_photo(user_id, img_bytes, label)
    except Exception:
        pass  # Photo saving failure is non-fatal

    # Record attendance
    attendance_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO attendance (id, user_id, timestamp, confidence, photo_path) VALUES (?, ?, ?, ?, ?)",
        (attendance_id, user_id, timestamp, confidence, photo_path),
    )
    db.commit()

    return CheckInResult(
        matched=True,
        user_id=user_id,
        user_name=user_name,
        confidence=confidence,
        timestamp=timestamp,
        message=f"Check-in successful for {user_name}.",
    )


@router.get("", response_model=List[AttendanceRecord])
async def list_attendance(
    date: Optional[str] = Query(default=None, description="Filter by date (YYYY-MM-DD)"),
    user_id: Optional[str] = Query(default=None, description="Filter by user ID"),
    limit: int = Query(default=100, ge=1, le=1000),
    admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
):
    """List all attendance records with optional filters."""
    query = """
        SELECT a.id, a.user_id, u.name, a.timestamp, a.confidence
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE 1=1
    """
    params: list = []

    if date:
        query += " AND DATE(a.timestamp) = ?"
        params.append(date)
    if user_id:
        query += " AND a.user_id = ?"
        params.append(user_id)

    query += " ORDER BY a.timestamp DESC LIMIT ?"
    params.append(limit)

    cursor = db.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()

    return [
        AttendanceRecord(
            id=row[0],
            user_id=row[1],
            user_name=row[2],
            timestamp=row[3],
            confidence=row[4],
        )
        for row in rows
    ]


@router.get("/{user_id}", response_model=List[AttendanceRecord])
async def get_user_attendance(
    user_id: str,
    date: Optional[str] = Query(default=None, description="Filter by date (YYYY-MM-DD)"),
    limit: int = Query(default=100, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    """Get attendance history for a specific user. Admin can see any user, employee can only see their own."""
    # Role-based access: admin can see any user, employee can only see their own
    if current_user.get("role") != "admin" and current_user.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="ไม่มีสิทธิ์เข้าถึงข้อมูลของผู้ใช้นี้")

    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    query = """
        SELECT a.id, a.user_id, u.name, a.timestamp, a.confidence
        FROM attendance a
        JOIN users u ON a.user_id = u.id
        WHERE a.user_id = ?
    """
    params: list = [user_id]

    if date:
        query += " AND DATE(a.timestamp) = ?"
        params.append(date)

    query += " ORDER BY a.timestamp DESC LIMIT ?"
    params.append(limit)

    cursor.execute(query, params)
    rows = cursor.fetchall()

    return [
        AttendanceRecord(
            id=row[0],
            user_id=row[1],
            user_name=row[2],
            timestamp=row[3],
            confidence=row[4],
        )
        for row in rows
    ]
