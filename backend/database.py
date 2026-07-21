"""
Database layer supporting both SQLite (Colab/dev) and PostgreSQL (Railway/production).

Detection: if DATABASE_URL starts with postgresql:// or postgres://, use PostgreSQL.
Otherwise use SQLite at DB_PATH.

The _Conn/_Cursor wrappers normalize:
- Parameter placeholders: SQLite uses ?, PostgreSQL uses %s
- Row access: both return dict-like objects via sqlite3.Row or psycopg2 RealDictCursor
"""

import os
import sqlite3
import logging
from typing import Generator

logger = logging.getLogger(__name__)

DATABASE_URL: str = os.getenv("DATABASE_URL", "")
_USE_PG: bool = DATABASE_URL.startswith(("postgresql://", "postgres://"))


# ──────────────────────────────────────────────────────────────
# Unified connection wrapper
# ──────────────────────────────────────────────────────────────

class _Cursor:
    """Cursor that translates ? → %s for PostgreSQL and wraps rows."""

    def __init__(self, raw_cursor, pg: bool):
        self._c = raw_cursor
        self._pg = pg

    def execute(self, sql: str, params=()):
        if self._pg:
            sql = sql.replace("?", "%s")
        self._c.execute(sql, params)
        return self

    def fetchone(self):
        return self._c.fetchone()

    def fetchall(self):
        return self._c.fetchall()

    @property
    def rowcount(self) -> int:
        return self._c.rowcount


class _Conn:
    """Connection wrapper — same interface for SQLite and PostgreSQL."""

    def __init__(self, raw_conn, pg: bool):
        self._c = raw_conn
        self._pg = pg

    def cursor(self) -> _Cursor:
        if self._pg:
            import psycopg2.extras
            return _Cursor(self._c.cursor(cursor_factory=psycopg2.extras.RealDictCursor), pg=True)
        return _Cursor(self._c.cursor(), pg=False)

    def execute(self, sql: str, params=()):
        return self.cursor().execute(sql, params)

    def commit(self):
        self._c.commit()

    def close(self):
        self._c.close()


# ──────────────────────────────────────────────────────────────
# Schema DDL — compatible with both SQLite and PostgreSQL
# ──────────────────────────────────────────────────────────────

_DDL = [
    """CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        employee_id TEXT UNIQUE,
        created_at  TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS accounts (
        id            TEXT PRIMARY KEY,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role          TEXT NOT NULL,
        user_id       TEXT,
        created_at    TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS attendance (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        timestamp  TEXT NOT NULL,
        confidence REAL NOT NULL,
        photo_path TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_att_uid  ON attendance(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_att_ts   ON attendance(timestamp)",
    "CREATE INDEX IF NOT EXISTS idx_acc_user ON accounts(username)",
    "CREATE INDEX IF NOT EXISTS idx_acc_uid  ON accounts(user_id)",
]

# SQLite-only: face embeddings table (not needed on Railway/PostgreSQL layer)
_SQLITE_EXTRA_DDL = [
    """CREATE TABLE IF NOT EXISTS face_embeddings (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL,
        embedding  BLOB NOT NULL,
        created_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_emb_uid ON face_embeddings(user_id)",
]


# ──────────────────────────────────────────────────────────────
# Connection factories
# ──────────────────────────────────────────────────────────────

def _make_pg_conn() -> _Conn:
    import psycopg2
    url = DATABASE_URL
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    raw = psycopg2.connect(url)
    raw.autocommit = False
    return _Conn(raw, pg=True)


def _make_sqlite_conn(db_path: str) -> _Conn:
    try:
        dirname = os.path.dirname(db_path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
    except OSError as e:
        import tempfile
        db_path = os.path.join(tempfile.gettempdir(), "face_scanner.db")
        logger.warning("Cannot create DB at original path (%s) — using %s", e, db_path)

    raw = sqlite3.connect(db_path, check_same_thread=False)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA journal_mode=WAL")
    return _Conn(raw, pg=False)


def init_db(db_path: str = "") -> _Conn:
    """Create tables and return connection. Called once at startup."""
    if _USE_PG:
        conn = _make_pg_conn()
        logger.info("Using PostgreSQL: %s", DATABASE_URL[:40] + "...")
    else:
        conn = _make_sqlite_conn(db_path)
        logger.info("Using SQLite: %s", db_path)

    cur = conn.cursor()
    for ddl in _DDL:
        try:
            cur.execute(ddl)
        except Exception as e:
            logger.warning("DDL warning (may be fine): %s", e)

    if not _USE_PG:
        for ddl in _SQLITE_EXTRA_DDL:
            try:
                cur.execute(ddl)
            except Exception:
                pass

    conn.commit()
    return conn


# ──────────────────────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────────────────────

_db_connection: _Conn | None = None


def get_db_connection() -> _Conn:
    global _db_connection
    if _db_connection is None:
        db_path = os.getenv("DB_PATH", "/content/drive/MyDrive/face_scanner/attendance.db")
        _db_connection = init_db(db_path)
    return _db_connection


def get_db() -> Generator[_Conn, None, None]:
    """FastAPI dependency — plain generator (no @contextmanager, Python 3.12 compat)."""
    yield get_db_connection()
