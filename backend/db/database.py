"""
TinyDB database for configuration and backup history.
"""
import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from tinydb import TinyDB, Query
from tinydb.table import Document

# Database path
DB_PATH = os.getenv("DB_PATH", "/data/backup_manager.json")


def get_db() -> TinyDB:
    """Get database instance."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return TinyDB(DB_PATH)


def init_db():
    """Initialize database with default tables."""
    db = get_db()

    # Ensure tables exist
    db.table("databases")
    db.table("backups")
    db.table("schedules")
    db.table("settings")
    db.table("logs")

    # Initialize default settings if not exist
    settings = db.table("settings")
    if not settings.all():
        settings.insert({
            "id": "global",
            "encryption_enabled": False,
            "encryption_key": None,
            "s3_enabled": False,
            "s3_bucket": None,
            "s3_region": "us-east-1",
            "s3_access_key": None,
            "s3_secret_key": None,
            "s3_prefix": "pg-backups/",
            "backup_path": "/backups",
            "retention_days": 30,
            "retention_weeks": 4,
            "retention_months": 12,
            "notifications_enabled": False,
            "discord_webhook": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        })

    db.close()


# =============================================================================
# Database Connections CRUD
# =============================================================================

def get_databases() -> List[Dict[str, Any]]:
    """Get all configured databases."""
    db = get_db()
    result = db.table("databases").all()
    db.close()
    return result


def get_database(db_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific database configuration."""
    db = get_db()
    DBQuery = Query()
    result = db.table("databases").get(DBQuery.id == db_id)
    db.close()
    return result


def create_database(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new database configuration."""
    db = get_db()
    data["created_at"] = datetime.utcnow().isoformat()
    data["updated_at"] = datetime.utcnow().isoformat()
    db.table("databases").insert(data)
    db.close()
    return data


def update_database(db_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a database configuration."""
    db = get_db()
    DBQuery = Query()
    data["updated_at"] = datetime.utcnow().isoformat()
    db.table("databases").update(data, DBQuery.id == db_id)
    result = db.table("databases").get(DBQuery.id == db_id)
    db.close()
    return result


def delete_database(db_id: str) -> bool:
    """Delete a database configuration."""
    db = get_db()
    DBQuery = Query()
    removed = db.table("databases").remove(DBQuery.id == db_id)
    db.close()
    return len(removed) > 0


# =============================================================================
# Backup History CRUD
# =============================================================================

def get_backups(limit: int = 100, db_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get backup history."""
    db = get_db()
    table = db.table("backups")

    if db_id:
        DBQuery = Query()
        result = table.search(DBQuery.database_id == db_id)
    else:
        result = table.all()

    # Sort by date descending
    result = sorted(result, key=lambda x: x.get("started_at", ""), reverse=True)
    db.close()
    return result[:limit]


def create_backup_record(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new backup record."""
    db = get_db()
    data["created_at"] = datetime.utcnow().isoformat()
    db.table("backups").insert(data)
    db.close()
    return data


def update_backup_record(backup_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a backup record."""
    db = get_db()
    DBQuery = Query()
    db.table("backups").update(data, DBQuery.id == backup_id)
    result = db.table("backups").get(DBQuery.id == backup_id)
    db.close()
    return result


def delete_backup_record(backup_id: str) -> bool:
    """Delete a backup record."""
    db = get_db()
    DBQuery = Query()
    removed = db.table("backups").remove(DBQuery.id == backup_id)
    db.close()
    return len(removed) > 0


# =============================================================================
# Schedule CRUD
# =============================================================================

def get_schedules() -> List[Dict[str, Any]]:
    """Get all schedules."""
    db = get_db()
    result = db.table("schedules").all()
    db.close()
    return result


def get_schedule(schedule_id: str) -> Optional[Dict[str, Any]]:
    """Get a specific schedule."""
    db = get_db()
    DBQuery = Query()
    result = db.table("schedules").get(DBQuery.id == schedule_id)
    db.close()
    return result


def create_schedule(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new schedule."""
    db = get_db()
    data["created_at"] = datetime.utcnow().isoformat()
    data["updated_at"] = datetime.utcnow().isoformat()
    db.table("schedules").insert(data)
    db.close()
    return data


def update_schedule(schedule_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update a schedule."""
    db = get_db()
    DBQuery = Query()
    data["updated_at"] = datetime.utcnow().isoformat()
    db.table("schedules").update(data, DBQuery.id == schedule_id)
    result = db.table("schedules").get(DBQuery.id == schedule_id)
    db.close()
    return result


def delete_schedule(schedule_id: str) -> bool:
    """Delete a schedule."""
    db = get_db()
    DBQuery = Query()
    removed = db.table("schedules").remove(DBQuery.id == schedule_id)
    db.close()
    return len(removed) > 0


# =============================================================================
# Settings CRUD
# =============================================================================

def get_settings() -> Dict[str, Any]:
    """Get global settings."""
    db = get_db()
    settings = db.table("settings").all()
    db.close()
    return settings[0] if settings else {}


def update_settings(data: Dict[str, Any]) -> Dict[str, Any]:
    """Update global settings."""
    db = get_db()
    DBQuery = Query()
    data["updated_at"] = datetime.utcnow().isoformat()
    db.table("settings").update(data, DBQuery.id == "global")
    result = db.table("settings").get(DBQuery.id == "global")
    db.close()
    return result


# =============================================================================
# Logs CRUD
# =============================================================================

def add_log(level: str, message: str, backup_id: Optional[str] = None, extra: Optional[Dict] = None):
    """Add a log entry."""
    db = get_db()
    db.table("logs").insert({
        "timestamp": datetime.utcnow().isoformat(),
        "level": level,
        "message": message,
        "backup_id": backup_id,
        "extra": extra or {},
    })
    db.close()


def get_logs(limit: int = 200, level: Optional[str] = None, backup_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get log entries."""
    db = get_db()
    table = db.table("logs")

    if level and backup_id:
        DBQuery = Query()
        result = table.search((DBQuery.level == level) & (DBQuery.backup_id == backup_id))
    elif level:
        DBQuery = Query()
        result = table.search(DBQuery.level == level)
    elif backup_id:
        DBQuery = Query()
        result = table.search(DBQuery.backup_id == backup_id)
    else:
        result = table.all()

    # Sort by timestamp descending
    result = sorted(result, key=lambda x: x.get("timestamp", ""), reverse=True)
    db.close()
    return result[:limit]


def clear_old_logs(days: int = 30):
    """Clear logs older than specified days."""
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()

    db = get_db()
    DBQuery = Query()
    db.table("logs").remove(DBQuery.timestamp < cutoff)
    db.close()
