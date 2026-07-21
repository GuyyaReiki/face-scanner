import sqlite3
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from pydantic import BaseModel

from auth_service import hash_password, verify_password, create_access_token, decode_token
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    username: str
    password: str


class SetupAdminRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(req: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute(
        "SELECT id, username, password_hash, role, user_id FROM accounts WHERE username = ?",
        (req.username,),
    )
    account = cursor.fetchone()

    if not account or not verify_password(req.password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    token = create_access_token({
        "account_id": account["id"],
        "username": account["username"],
        "role": account["role"],
        "user_id": account["user_id"],
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": account["role"],
        "user_id": account["user_id"],
        "username": account["username"],
    }


@router.post("/setup")
def setup_admin(req: SetupAdminRequest, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM accounts")
    if cursor.fetchone()["count"] > 0:
        raise HTTPException(status_code=400, detail="มี admin account อยู่แล้ว")

    if len(req.password) < 8:
        raise HTTPException(status_code=422, detail="รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")

    account_id = str(uuid.uuid4())
    cursor.execute(
        "INSERT INTO accounts (id, username, password_hash, role, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (account_id, req.username, hash_password(req.password), "admin", None, datetime.utcnow().isoformat() + "Z"),
    )
    db.commit()

    token = create_access_token({
        "account_id": account_id,
        "username": req.username,
        "role": "admin",
        "user_id": None,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": "admin",
        "user_id": None,
        "username": req.username,
    }


@router.get("/me")
def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
        return {
            "account_id": payload.get("account_id"),
            "username": payload.get("username"),
            "role": payload.get("role"),
            "user_id": payload.get("user_id"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Token หมดอายุหรือไม่ถูกต้อง")


@router.post("/change-password")
def change_password(
    body: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: sqlite3.Connection = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(credentials.credentials)
    except JWTError:
        raise HTTPException(status_code=401, detail="Token ไม่ถูกต้อง")

    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "")

    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร")

    cursor = db.cursor()
    cursor.execute("SELECT password_hash FROM accounts WHERE id = ?", (payload["account_id"],))
    account = cursor.fetchone()
    if not account or not verify_password(old_password, account["password_hash"]):
        raise HTTPException(status_code=401, detail="รหัสผ่านเดิมไม่ถูกต้อง")

    cursor.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (hash_password(new_password), payload["account_id"]),
    )
    db.commit()
    return {"message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"}
