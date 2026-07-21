import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from database import get_db
from models import UserOut
from dependencies import require_admin
import remote_recognizer

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=List[UserOut])
async def list_users(admin: dict = Depends(require_admin), db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, name, employee_id, created_at FROM users ORDER BY created_at DESC")
    rows = cursor.fetchall()
    return [
        UserOut(id=r["id"], name=r["name"], employee_id=r["employee_id"],
                created_at=r["created_at"], embedding_count=0)
        for r in rows
    ]


@router.post("", response_model=UserOut, status_code=201)
async def create_user(
    name: str = Form(...),
    employee_id: Optional[str] = Form(None),
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
    images: List[UploadFile] = File(...),
    admin: dict = Depends(require_admin),
    db=Depends(get_db),
):
    if len(images) < 3:
        raise HTTPException(422, "At least 3 face images are required.")
    if len(images) > 10:
        raise HTTPException(422, "At most 10 face images are allowed.")

    if employee_id:
        cursor = db.cursor()
        cursor.execute("SELECT id FROM users WHERE employee_id = ?", (employee_id,))
        if cursor.fetchone():
            raise HTTPException(409, f"Employee ID '{employee_id}' already exists.")

    user_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat() + "Z"

    image_bytes_list = [await img.read() for img in images]

    # Send to Colab worker for face embedding
    stored_count = await remote_recognizer.register_user(user_id, image_bytes_list)
    if stored_count == 0:
        raise HTTPException(422, "No faces detected in any of the provided images.")

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO users (id, name, employee_id, created_at) VALUES (?, ?, ?, ?)",
        (user_id, name, employee_id, created_at),
    )

    if username and password:
        from auth_service import hash_password
        cursor.execute(
            "INSERT INTO accounts (id, username, password_hash, role, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), username, hash_password(password), "employee", user_id, created_at),
        )

    db.commit()
    return UserOut(id=user_id, name=name, employee_id=employee_id,
                   created_at=created_at, embedding_count=stored_count)


@router.get("/{user_id}", response_model=UserOut)
async def get_user(user_id: str, admin: dict = Depends(require_admin), db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id, name, employee_id, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(404, f"User '{user_id}' not found.")
    return UserOut(id=row["id"], name=row["name"], employee_id=row["employee_id"],
                   created_at=row["created_at"], embedding_count=0)


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, admin: dict = Depends(require_admin), db=Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
    if not cursor.fetchone():
        raise HTTPException(404, f"User '{user_id}' not found.")

    # Remove embeddings from Colab worker
    await remote_recognizer.delete_user(user_id)

    cursor.execute("DELETE FROM attendance WHERE user_id = ?", (user_id,))
    cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return JSONResponse(status_code=204, content=None)
