"""
Logs endpoints.
"""
from fastapi import APIRouter
from typing import List, Dict, Any, Optional

from db import database

router = APIRouter()


@router.get("")
async def get_logs(
    limit: int = 200,
    level: Optional[str] = None,
    backup_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get log entries."""
    return database.get_logs(limit=limit, level=level, backup_id=backup_id)


@router.delete("")
async def clear_logs(days: int = 30) -> Dict[str, str]:
    """Clear logs older than specified days."""
    database.clear_old_logs(days=days)
    return {"status": "cleared", "older_than_days": days}


@router.get("/levels")
async def get_log_levels() -> List[str]:
    """Get available log levels."""
    return ["debug", "info", "warning", "error"]
