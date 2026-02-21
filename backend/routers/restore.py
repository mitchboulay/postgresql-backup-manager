"""
Restore API endpoints.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

from db import database
from services.s3_service import S3Service
from services.restore_service import RestoreService

router = APIRouter(prefix="/restore", tags=["restore"])

# In-memory store for restore jobs (simple approach)
_restore_jobs = {}


class TargetDatabase(BaseModel):
    host: str
    port: int = 5432
    database: str
    username: str
    password: str
    ssl_mode: Optional[str] = ""


class RestoreRequest(BaseModel):
    s3_key: str
    target_db: TargetDatabase
    is_encrypted: bool = False


@router.get("/s3-backups")
def list_s3_backups():
    """List all backups available in S3."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not configured")

    s3_service = S3Service(settings)
    backups = s3_service.list_backups()

    return {
        "backups": backups,
        "count": len(backups),
    }


def _run_restore(job_id: str, s3_key: str, target_db: dict, is_encrypted: bool, encryption_key: Optional[str]):
    """Background task to run restore."""
    try:
        settings = database.get_settings()
        s3_service = S3Service(settings)
        restore_service = RestoreService(s3_service, encryption_key)

        result = restore_service.restore_from_s3(
            s3_key=s3_key,
            target_db=target_db,
            is_encrypted=is_encrypted,
        )

        _restore_jobs[job_id].update(result)
        _restore_jobs[job_id]["status"] = result.get("status", "completed")

    except Exception as e:
        _restore_jobs[job_id]["status"] = "failed"
        _restore_jobs[job_id]["error"] = str(e)
        _restore_jobs[job_id]["completed_at"] = datetime.utcnow().isoformat()


@router.post("/from-s3")
def restore_from_s3(request: RestoreRequest, background_tasks: BackgroundTasks):
    """Start a restore from S3 (runs in background)."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not configured")

    encryption_key = None
    if request.is_encrypted:
        if not settings.get("encryption_enabled") or not settings.get("encryption_key"):
            raise HTTPException(
                status_code=400,
                detail="Backup is encrypted but encryption is not configured"
            )
        encryption_key = settings.get("encryption_key")

    # Create job
    job_id = str(uuid.uuid4())
    _restore_jobs[job_id] = {
        "id": job_id,
        "status": "running",
        "s3_key": request.s3_key,
        "started_at": datetime.utcnow().isoformat(),
    }

    # Run in background
    background_tasks.add_task(
        _run_restore,
        job_id,
        request.s3_key,
        request.target_db.model_dump(),
        request.is_encrypted,
        encryption_key,
    )

    return {
        "job_id": job_id,
        "status": "running",
        "message": "Restore started. Poll /restore/status/{job_id} for progress.",
    }


@router.get("/status/{job_id}")
def get_restore_status(job_id: str):
    """Get the status of a restore job."""
    if job_id not in _restore_jobs:
        raise HTTPException(status_code=404, detail="Restore job not found")

    return _restore_jobs[job_id]


@router.get("/databases")
def list_target_databases():
    """List all configured databases as potential restore targets."""
    databases = database.get_databases()
    return {
        "databases": [
            {
                "id": db["id"],
                "name": db["name"],
                "host": db["host"],
                "port": db["port"],
                "database": db["database"],
            }
            for db in databases
        ]
    }
