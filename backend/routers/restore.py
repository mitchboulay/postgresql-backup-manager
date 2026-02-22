"""
Restore API endpoints.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

from db import database
from db.database import utc_now
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
    target_db: Optional[TargetDatabase] = None  # Custom credentials (required for prod->prod)
    target_database_id: Optional[str] = None  # Use stored credentials (allowed for dev->dev, prod->dev)
    is_encrypted: bool = False
    source_database_id: Optional[str] = None  # To determine source environment
    confirm_prod_restore: bool = False  # Required for prod->prod restores


@router.get("/s3-backups")
def list_s3_backups():
    """List all backups available in S3."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not configured")

    s3_service = S3Service(settings)
    prefix = settings.get("s3_prefix", "")
    backups = s3_service.list_backups(prefix=prefix)

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
        _restore_jobs[job_id]["completed_at"] = utc_now()


def _get_environment(db_id: Optional[str]) -> str:
    """Get the environment of a database by ID."""
    if not db_id:
        return "unknown"
    db = database.get_database(db_id)
    if not db:
        return "unknown"
    return db.get("environment", "dev")


def _validate_restore_direction(
    source_env: str,
    target_env: str,
    confirm_prod_restore: bool
) -> tuple[bool, str]:
    """
    Validate if the restore direction is allowed.

    Rules:
    - prod -> dev: ALLOWED
    - dev -> dev: ALLOWED
    - dev -> prod: BLOCKED
    - prod -> prod: ALLOWED only with confirmation

    Returns: (is_allowed, error_message)
    """
    if source_env == "unknown" or target_env == "unknown":
        # If we don't know the environment, allow but warn
        return True, ""

    if source_env == "dev" and target_env == "prod":
        return False, "Cannot restore a dev backup to a production database. This could overwrite production data with test data."

    if source_env == "prod" and target_env == "prod":
        if not confirm_prod_restore:
            return False, "Restoring production data to production requires explicit confirmation. Set confirm_prod_restore=true to proceed."
        return True, ""

    # prod -> dev and dev -> dev are always allowed
    return True, ""


@router.post("/from-s3")
def restore_from_s3(request: RestoreRequest, background_tasks: BackgroundTasks):
    """Start a restore from S3 (runs in background)."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not configured")

    # Validate restore direction based on environments
    source_env = _get_environment(request.source_database_id)
    target_env = _get_environment(request.target_database_id)

    is_allowed, error_message = _validate_restore_direction(
        source_env,
        target_env,
        request.confirm_prod_restore
    )

    if not is_allowed:
        raise HTTPException(status_code=400, detail=error_message)

    # Determine target database credentials
    target_db_config = None

    if request.target_db:
        # Custom credentials provided
        target_db_config = request.target_db.model_dump()
    elif request.target_database_id:
        # Use stored credentials - only allowed for dev targets
        if target_env == "prod":
            raise HTTPException(
                status_code=400,
                detail="Restores to production databases require manually entering credentials for safety"
            )

        stored_db = database.get_database(request.target_database_id)
        if not stored_db:
            raise HTTPException(status_code=404, detail="Target database not found")

        target_db_config = {
            "host": stored_db["host"],
            "port": stored_db["port"],
            "database": stored_db["database"],
            "username": stored_db["username"],
            "password": stored_db["password"],
            "ssl_mode": stored_db.get("ssl_mode", ""),
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Either target_db or target_database_id must be provided"
        )

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
        "source_environment": source_env,
        "target_environment": target_env,
        "started_at": utc_now(),
    }

    # Run in background
    background_tasks.add_task(
        _run_restore,
        job_id,
        request.s3_key,
        target_db_config,
        request.is_encrypted,
        encryption_key,
    )

    return {
        "job_id": job_id,
        "status": "running",
        "source_environment": source_env,
        "target_environment": target_env,
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
                "environment": db.get("environment", "dev"),
            }
            for db in databases
        ]
    }
