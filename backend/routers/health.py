"""
Health check endpoints.
"""
from fastapi import APIRouter, Request
from datetime import datetime
from typing import Dict, Any

from db import database

router = APIRouter()


@router.get("")
async def health_check(request: Request) -> Dict[str, Any]:
    """Get system health status."""
    settings = database.get_settings()
    databases = database.get_databases()
    schedules = database.get_schedules()

    # Get scheduler info
    scheduler = request.app.state.scheduler
    jobs = scheduler.get_jobs() if scheduler else []

    # Get recent backup status
    recent_backups = database.get_backups(limit=5)
    last_backup = recent_backups[0] if recent_backups else None

    # Calculate health
    failed_backups = sum(1 for b in recent_backups if b.get("status") == "failed")
    health_status = "healthy" if failed_backups == 0 else "degraded" if failed_backups < 3 else "unhealthy"

    return {
        "status": health_status,
        "timestamp": datetime.utcnow().isoformat(),
        "databases_configured": len(databases),
        "schedules_active": len([s for s in schedules if s.get("enabled", True)]),
        "jobs_scheduled": len(jobs),
        "last_backup": {
            "id": last_backup.get("id") if last_backup else None,
            "status": last_backup.get("status") if last_backup else None,
            "completed_at": last_backup.get("completed_at") if last_backup else None,
        } if last_backup else None,
        "recent_failures": failed_backups,
        "encryption_enabled": settings.get("encryption_enabled", False),
        "s3_enabled": settings.get("s3_enabled", False),
    }


@router.get("/detailed")
async def detailed_health(request: Request) -> Dict[str, Any]:
    """Get detailed health information."""
    basic = await health_check(request)

    # Add disk usage
    import shutil
    settings = database.get_settings()
    backup_path = settings.get("backup_path", "/backups")

    try:
        disk = shutil.disk_usage(backup_path)
        disk_info = {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent_used": round((disk.used / disk.total) * 100, 1),
        }
    except Exception:
        disk_info = None

    # Get backup statistics
    all_backups = database.get_backups(limit=1000)
    stats = {
        "total_backups": len(all_backups),
        "successful": sum(1 for b in all_backups if b.get("status") == "completed"),
        "failed": sum(1 for b in all_backups if b.get("status") == "failed"),
        "total_size": sum(b.get("file_size", 0) for b in all_backups if b.get("status") == "completed"),
    }

    return {
        **basic,
        "disk": disk_info,
        "backup_stats": stats,
    }
