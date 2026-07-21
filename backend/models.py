from pydantic import BaseModel
from typing import Optional


class UserCreate(BaseModel):
    name: str
    employee_id: Optional[str] = None


class UserOut(BaseModel):
    id: str
    name: str
    employee_id: Optional[str]
    created_at: str
    embedding_count: int = 0


class AttendanceRecord(BaseModel):
    id: str
    user_id: str
    user_name: str
    timestamp: str
    confidence: float
    photo_url: Optional[str] = None


class CheckInResult(BaseModel):
    matched: bool
    user_id: Optional[str]
    user_name: Optional[str]
    confidence: Optional[float]
    timestamp: Optional[str]
    message: str
