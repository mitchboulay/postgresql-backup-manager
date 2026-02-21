"""
Backup management endpoints.
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from typing import List, Dict, Any, Optional
from pathlib import Path

from db import database
from services.backup_service import get_backup_service
from services.encryption_service import EncryptionService
from services.s3_service import S3Service

router = APIRouter()


@router.get("")
async def list_backups(
    limit: int = 100,
    database_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """List backup history."""
    return database.get_backups(limit=limit, db_id=database_id)


@router.get("/files")
async def list_backup_files() -> List[Dict[str, Any]]:
    """List backup files on disk."""
    backup_service = get_backup_service()
    return backup_service.list_backup_files()


@router.get("/{backup_id}")
async def get_backup(backup_id: str) -> Dict[str, Any]:
    """Get backup details."""
    backups = database.get_backups(limit=1000)
    for backup in backups:
        if backup.get("id") == backup_id:
            return backup
    raise HTTPException(status_code=404, detail="Backup not found")


@router.post("/run/{database_id}")
async def run_backup(
    database_id: str,
    background_tasks: BackgroundTasks
) -> Dict[str, Any]:
    """Trigger a manual backup for a database."""
    db_config = database.get_database(database_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Database not found")

    # Run backup in background
    backup_service = get_backup_service()

    def run():
        try:
            backup_service.run_backup(db_config, manual=True)
        except Exception as e:
            database.add_log("error", f"Manual backup failed: {str(e)}")

    background_tasks.add_task(run)

    return {
        "status": "started",
        "database_id": database_id,
        "message": "Backup started in background",
    }


@router.post("/run/{database_id}/sync")
async def run_backup_sync(database_id: str) -> Dict[str, Any]:
    """Run a backup synchronously (waits for completion)."""
    db_config = database.get_database(database_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Database not found")

    backup_service = get_backup_service()

    try:
        result = backup_service.run_backup(db_config, manual=True)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{backup_id}")
async def delete_backup(backup_id: str, delete_file: bool = True) -> Dict[str, str]:
    """Delete a backup record and optionally the file."""
    backups = database.get_backups(limit=1000)
    backup = None
    for b in backups:
        if b.get("id") == backup_id:
            backup = b
            break

    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")

    # Delete file if requested
    if delete_file and backup.get("file_path"):
        backup_service = get_backup_service()
        file_path = Path(backup["file_path"])
        if file_path.exists():
            file_path.unlink()

    # Delete record
    database.delete_backup_record(backup_id)

    return {"status": "deleted"}


@router.delete("/files/{filename}")
async def delete_backup_file(filename: str) -> Dict[str, str]:
    """Delete a backup file from disk."""
    backup_service = get_backup_service()
    if backup_service.delete_backup_file(filename):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="File not found")


@router.get("/files/{filename}/download")
async def download_backup_file(filename: str):
    """Download a backup file."""
    settings = database.get_settings()
    backup_path = Path(settings.get("backup_path", "/backups"))
    file_path = backup_path / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
    )


@router.post("/files/{filename}/decrypt")
async def decrypt_backup_file(filename: str, data: Dict[str, str]) -> Dict[str, Any]:
    """Decrypt an encrypted backup file."""
    password = data.get("password")
    if not password:
        raise HTTPException(status_code=400, detail="Password required")

    settings = database.get_settings()
    backup_path = Path(settings.get("backup_path", "/backups"))
    encrypted_file = backup_path / filename

    if not encrypted_file.exists():
        raise HTTPException(status_code=404, detail="File not found")

    if not filename.endswith(".enc"):
        raise HTTPException(status_code=400, detail="File is not encrypted")

    # Decrypt to new file
    decrypted_filename = filename.replace(".enc", "")
    decrypted_file = backup_path / decrypted_filename

    try:
        EncryptionService.decrypt_file(encrypted_file, decrypted_file, password)
        return {
            "status": "decrypted",
            "filename": decrypted_filename,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Decryption failed: {str(e)}")


@router.post("/files/{filename}/upload-s3")
async def upload_to_s3(filename: str) -> Dict[str, Any]:
    """Upload a backup file to S3."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not enabled")

    backup_path = Path(settings.get("backup_path", "/backups"))
    file_path = backup_path / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    s3_service = S3Service(
        bucket=settings["s3_bucket"],
        region=settings.get("s3_region", "us-east-1"),
        access_key=settings.get("s3_access_key"),
        secret_key=settings.get("s3_secret_key"),
    )

    s3_key = f"{settings.get('s3_prefix', '')}{filename}"
    result = s3_service.upload_file(file_path, s3_key)

    if result.get("success"):
        return result
    else:
        raise HTTPException(status_code=500, detail=result.get("error", "Upload failed"))


@router.get("/s3/{s3_key:path}/download-url")
async def get_s3_download_url(s3_key: str) -> Dict[str, str]:
    """Get a presigned URL to download a backup from S3."""
    settings = database.get_settings()

    if not settings.get("s3_enabled"):
        raise HTTPException(status_code=400, detail="S3 is not enabled")

    s3_service = S3Service(
        bucket=settings["s3_bucket"],
        region=settings.get("s3_region", "us-east-1"),
        access_key=settings.get("s3_access_key"),
        secret_key=settings.get("s3_secret_key"),
    )

    url = s3_service.get_presigned_url(s3_key)
    if url:
        return {"url": url}
    raise HTTPException(status_code=500, detail="Failed to generate download URL")
