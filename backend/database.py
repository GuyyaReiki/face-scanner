import sqlite3
import os
from contextlib import contextmanager
from typing import Generator


def init_db(db_path: str) -> sqlite3.Connection:
    """Initialize database with tables and WAL mode enabled."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row

    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            employee_id TEXT UNIQUE,
            created_at TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS face_embeddings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            embedding BLOB NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            confidence REAL NOT NULL,
            photo_path TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON attendance(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_face_embeddings_user_id ON face_embeddings(user_id)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
            user_id TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username)")

    conn.commit()
    return conn


_db_connection = None


def get_db_connection() -> sqlite3.Connection:
    """Get the global database connection."""
    global _db_connection
    if _db_connection is None:
        db_path = os.getenv("DB_PATH", "/content/drive/MyDrive/face_scanner/attendance.db")
        _db_connection = init_db(db_path)
    return _db_connection


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    """FastAPI dependency that provides database connection."""
    conn = get_db_connection()
    try:
        yield conn
    finally:
        pass
