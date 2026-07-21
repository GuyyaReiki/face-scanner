import uuid
import sqlite3
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from database import get_db
from models import UserOut
from face_service import FaceService, FaceServiceError
from dependencies import require_admin

router = APIRouter(prefix="/api/users", tags=["users"])


def get_face_service() -> FaceService:
    from main import face_service
    return face_service


@router.get("", response_model=List[UserOut])
async def list_users(admin: dict = Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """List all users with their embedding count."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            u.id,
            u.name,
            u.employee_id,
            u.created_at,
            COUNT(fe.id) as embedding_count
        FROM users u
        LEFT JOIN face_embeddings fe ON u.id = fe.user_id
        GROUP BY u.id, u.name, u.employee_id, u.created_at
        ORDER BY u.created_at DESC
    """)
    rows = cursor.fetchall()
    return [
        UserOut(
            id=row[0],
            name=row[1],
            employee_id=row[2],
            created_at=row[3],
            embedding_count=row[4],
        )
        for row in rows
    ]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    name: str = Form(...),
    employee_id: Optional[str] = Form(None),
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    images: List[UploadFile] = File(...),
    admin: dict = Depends(require_admin),
    db: sqlite3.Connection = Depends(get_db),
    face_svc: FaceService = Depends(get_face_service),
):
    """Create a new user and register face embeddings from uploaded images."""
    if len(images) < 3:
        raise HTTPException(status_code=422, detail="At least 3 face images are required.")
    if len(images) > 10:
        raise HTTPException(status_code=422, detail="At most 10 face images are allowed.")

    # Check duplicate employee_id
    if employee_id:
        cursor = db.cursor()
        cursor.execute("SELECT id FROM users WHERE employee_id = ?", (employee_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail=f"Employee ID '{employee_id}' already exists.")

    user_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat() + "Z"

    # Read all image bytes
    image_bytes_list = []
    for upload in images:
        content = await upload.read()
        image_bytes_list.append(content)

    # Register embeddings
    try:
        stored_count = face_svc.register_user(db, user_id, image_bytes_list)
    except FaceServiceError as e:
        raise HTTPException(status_code=503, detail=f"Face service unavailable: {str(e)}")

    if stored_count == 0:
        raise HTTPException(
            status_code=422,
            detail="No faces detected in any of the provided images. Please upload clear face photos.",
        )

    # Insert user record
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO users (id, name, employee_id, created_at) VALUES (?, ?, ?, ?)",
        (user_id, name, employee_id, created_at),
    )

    # Optionally create an employee account
    if username and password:
        from auth_service import hash_password as hp
        import uuid as _uuid
        acct_id = str(_uuid.uuid4())
        cursor.execute(
            "INSERT INTO accounts (id, username, password_hash, role, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (acct_id, username, hp(password), "employee", user_id, created_at),
        )

    db.commit()

    # Save registration photos
    for idx, img_bytes in enumerate(image_bytes_list):
        try:
            await face_svc.save_photo(user_id, img_bytes, f"register_{idx:02d}")
        except Exception:
            pass  # Photo saving failure is non-fatal

    return UserOut(
        id=user_id,
        name=name,
        employee_id=employee_id,
        created_at=created_at,
        embedding_count=stored_count,
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, admin: dict = Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Get a single user with embedding count."""
    cursor = db.cursor()
    cursor.execute("""
        SELECT
            u.id,
            u.name,
            u.employee_id,
            u.created_at,
            COUNT(fe.id) as embedding_count
        FROM users u
        LEFT JOIN face_embeddings fe ON u.id = fe.user_id
        WHERE u.id = ?
        GROUP BY u.id, u.name, u.employee_id, u.created_at
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")
    return UserOut(
        id=row[0],
        name=row[1],
        employee_id=row[2],
        created_at=row[3],
        embedding_count=row[4],
    )


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: dict = Depends(require_admin), db: sqlite3.Connection = Depends(get_db)):
    """Delete a user along with their embeddings and attendance records."""
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found.")

    cursor.execute("DELETE FROM attendance WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM face_embeddings WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return JSONResponse(status_code=204, content=None)
