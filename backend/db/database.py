"""
SQLite database for configuration and backup history.
Thread-safe with built-in concurrency handling.
"""
import os
import sqlite3
import json
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from contextlib import contextmanager


def utc_now() -> str:
    """Return current UTC time as ISO string with Z suffix for proper JS parsing."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

# Database path
DB_PATH = os.getenv("DB_PATH", "/data/backup_manager.db")


def dict_factory(cursor, row):
    """Convert SQLite rows to dictionaries."""
    fields = [column[0] for column in cursor.description]
    return {key: value for key, value in zip(fields, row)}


@contextmanager
def get_db():
    """Get database connection with automatic cleanup."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = dict_factory
    conn.execute("PRAGMA journal_mode=WAL")  # Better concurrency
    conn.execute("PRAGMA busy_timeout=30000")  # Wait up to 30s for locks
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initialize database with tables."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Databases table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS databases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER DEFAULT 5432,
                database TEXT NOT NULL,
                username TEXT NOT NULL,
                password TEXT NOT NULL,
                schema_name TEXT,
                ssl_mode TEXT DEFAULT 'require',
                environment TEXT DEFAULT 'dev',
                created_at TEXT,
                updated_at TEXT
            )
        """)

        # Add environment column if it doesn't exist (migration for existing DBs)
        try:
            cursor.execute("ALTER TABLE databases ADD COLUMN environment TEXT DEFAULT 'dev'")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Backups table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backups (
                id TEXT PRIMARY KEY,
                database_id TEXT,
                database_name TEXT,
                status TEXT,
                file_name TEXT,
                file_size INTEGER,
                s3_uploaded INTEGER DEFAULT 0,
                encrypted INTEGER DEFAULT 0,
                started_at TEXT,
                completed_at TEXT,
                error TEXT,
                created_at TEXT
            )
        """)

        # Schedules table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                name TEXT,
                database_id TEXT,
                cron_expression TEXT,
                enabled INTEGER DEFAULT 1,
                description TEXT,
                last_run TEXT,
                last_status TEXT,
                last_error TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)

        # Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                id TEXT PRIMARY KEY,
                encryption_enabled INTEGER DEFAULT 0,
                encryption_key TEXT,
                s3_enabled INTEGER DEFAULT 0,
                s3_bucket TEXT,
                s3_region TEXT DEFAULT 'us-east-1',
                s3_access_key TEXT,
                s3_secret_key TEXT,
                s3_prefix TEXT DEFAULT 'pg-backups/',
                backup_path TEXT DEFAULT '/backups',
                retention_days INTEGER DEFAULT 30,
                retention_weeks INTEGER DEFAULT 4,
                retention_months INTEGER DEFAULT 12,
                email_enabled INTEGER DEFAULT 0,
                email_recipient TEXT,
                email_sender TEXT,
                aws_region TEXT DEFAULT 'us-east-1',
                aws_access_key TEXT,
                aws_secret_key TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)

        # Logs table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                level TEXT,
                message TEXT,
                backup_id TEXT,
                extra TEXT
            )
        """)

        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_backups_database_id ON backups(database_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_backups_started_at ON backups(started_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level)")

        # Initialize default settings if not exist
        cursor.execute("SELECT id FROM settings WHERE id = 'global'")
        if not cursor.fetchone():
            now = utc_now()
            cursor.execute("""
                INSERT INTO settings (id, created_at, updated_at)
                VALUES ('global', ?, ?)
            """, (now, now))


# =============================================================================
# Database Connections CRUD
# =============================================================================

def get_databases() -> List[Dict[str, Any]]:
    """Get all configured databases."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM databases ORDER BY name")
        return cursor.fetchall()


def get_database(db_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific database configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM databases WHERE id = ?", (db_id,))
        return cursor.fetchone()


def create_database(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new database configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        now = utc_now()
        data["created_at"] = now
        data["updated_at"] = now

        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        cursor.execute(
            f"INSERT INTO databases ({columns}) VALUES ({placeholders})",
            list(data.values())
        )
        return data


def update_database(db_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a database configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        data["updated_at"] = utc_now()

        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        cursor.execute(
            f"UPDATE databases SET {set_clause} WHERE id = ?",
            list(data.values()) + [db_id]
        )

        cursor.execute("SELECT * FROM databases WHERE id = ?", (db_id,))
        return cursor.fetchone()


def delete_database(db_id: str) -> bool:
    """Delete a database configuration."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM databases WHERE id = ?", (db_id,))
        return cursor.rowcount > 0


# =============================================================================
# Backup History CRUD
# =============================================================================

def get_backups(limit: int = 100, db_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get backup history."""
    with get_db() as conn:
        cursor = conn.cursor()

        if db_id:
            cursor.execute(
                "SELECT * FROM backups WHERE database_id = ? ORDER BY started_at DESC LIMIT ?",
                (db_id, limit)
            )
        else:
            cursor.execute(
                "SELECT * FROM backups ORDER BY started_at DESC LIMIT ?",
                (limit,)
            )

        results = cursor.fetchall()
        # Convert integer booleans back to Python bools
        for r in results:
            r["s3_uploaded"] = bool(r.get("s3_uploaded"))
            r["encrypted"] = bool(r.get("encrypted"))
        return results


def create_backup_record(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new backup record."""
    with get_db() as conn:
        cursor = conn.cursor()
        data["created_at"] = utc_now()

        # Convert booleans to integers for SQLite
        if "s3_uploaded" in data:
            data["s3_uploaded"] = int(data["s3_uploaded"])
        if "encrypted" in data:
            data["encrypted"] = int(data["encrypted"])

        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        cursor.execute(
            f"INSERT INTO backups ({columns}) VALUES ({placeholders})",
            list(data.values())
        )
        return data


def update_backup_record(backup_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a backup record."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Convert booleans to integers for SQLite
        if "s3_uploaded" in data:
            data["s3_uploaded"] = int(data["s3_uploaded"])
        if "encrypted" in data:
            data["encrypted"] = int(data["encrypted"])

        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        cursor.execute(
            f"UPDATE backups SET {set_clause} WHERE id = ?",
            list(data.values()) + [backup_id]
        )

        cursor.execute("SELECT * FROM backups WHERE id = ?", (backup_id,))
        result = cursor.fetchone()
        if result:
            result["s3_uploaded"] = bool(result.get("s3_uploaded"))
            result["encrypted"] = bool(result.get("encrypted"))
        return result


def delete_backup_record(backup_id: str) -> bool:
    """Delete a backup record."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM backups WHERE id = ?", (backup_id,))
        return cursor.rowcount > 0


# =============================================================================
# Schedule CRUD
# =============================================================================

def get_schedules() -> List[Dict[str, Any]]:
    """Get all schedules."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM schedules ORDER BY name")
        results = cursor.fetchall()
        for r in results:
            r["enabled"] = bool(r.get("enabled", 1))
        return results


def get_schedule(schedule_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific schedule."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM schedules WHERE id = ?", (schedule_id,))
        result = cursor.fetchone()
        if result:
            result["enabled"] = bool(result.get("enabled", 1))
        return result


def create_schedule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new schedule."""
    with get_db() as conn:
        cursor = conn.cursor()
        now = utc_now()
        data["created_at"] = now
        data["updated_at"] = now

        if "enabled" in data:
            data["enabled"] = int(data["enabled"])

        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        cursor.execute(
            f"INSERT INTO schedules ({columns}) VALUES ({placeholders})",
            list(data.values())
        )
        return data


def update_schedule(schedule_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a schedule."""
    with get_db() as conn:
        cursor = conn.cursor()
        data["updated_at"] = utc_now()

        if "enabled" in data:
            data["enabled"] = int(data["enabled"])

        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        cursor.execute(
            f"UPDATE schedules SET {set_clause} WHERE id = ?",
            list(data.values()) + [schedule_id]
        )

        cursor.execute("SELECT * FROM schedules WHERE id = ?", (schedule_id,))
        result = cursor.fetchone()
        if result:
            result["enabled"] = bool(result.get("enabled", 1))
        return result


def delete_schedule(schedule_id: str) -> bool:
    """Delete a schedule."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
        return cursor.rowcount > 0


# =============================================================================
# Settings CRUD
# =============================================================================

def get_settings() -> Dict[str, Any]:
    """Get global settings."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settings WHERE id = 'global'")
        result = cursor.fetchone()
        if result:
            # Convert integer booleans
            result["encryption_enabled"] = bool(result.get("encryption_enabled"))
            result["s3_enabled"] = bool(result.get("s3_enabled"))
            result["email_enabled"] = bool(result.get("email_enabled"))
        return result or {}


def update_settings(data: Dict[str, Any]) -> Dict[str, Any]:
    """Update global settings."""
    with get_db() as conn:
        cursor = conn.cursor()
        data["updated_at"] = utc_now()

        # Convert booleans to integers
        for key in ["encryption_enabled", "s3_enabled", "email_enabled"]:
            if key in data:
                data[key] = int(data[key])

        set_clause = ", ".join([f"{k} = ?" for k in data.keys()])
        cursor.execute(
            f"UPDATE settings SET {set_clause} WHERE id = 'global'",
            list(data.values())
        )

        cursor.execute("SELECT * FROM settings WHERE id = 'global'")
        result = cursor.fetchone()
        if result:
            result["encryption_enabled"] = bool(result.get("encryption_enabled"))
            result["s3_enabled"] = bool(result.get("s3_enabled"))
            result["email_enabled"] = bool(result.get("email_enabled"))
        return result or {}


# =============================================================================
# Logs CRUD
# =============================================================================

def add_log(level: str, message: str, backup_id: Optional[str] = None, extra: Optional[Dict] = None):
    """Add a log entry."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO logs (timestamp, level, message, backup_id, extra) VALUES (?, ?, ?, ?, ?)",
            (
                utc_now(),
                level,
                message,
                backup_id,
                json.dumps(extra) if extra else None
            )
        )


def get_logs(limit: int = 200, level: Optional[str] = None, backup_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get log entries."""
    with get_db() as conn:
        cursor = conn.cursor()

        query = "SELECT * FROM logs WHERE 1=1"
        params = []

        if level:
            query += " AND level = ?"
            params.append(level)
        if backup_id:
            query += " AND backup_id = ?"
            params.append(backup_id)

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, params)
        results = cursor.fetchall()

        # Parse extra JSON
        for r in results:
            if r.get("extra"):
                try:
                    r["extra"] = json.loads(r["extra"])
                except json.JSONDecodeError:
                    r["extra"] = {}
            else:
                r["extra"] = {}

        return results


def clear_old_logs(days: int = 30):
    """Clear logs older than specified days."""
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM logs WHERE timestamp < ?", (cutoff,))
