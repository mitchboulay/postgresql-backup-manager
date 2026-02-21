"""
Configuration endpoints - databases, settings, S3, encryption.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uuid

from db import database
from services.backup_service import get_backup_service
from services.s3_service import S3Service
from services.encryption_service import EncryptionService
from services.email_service import EmailService

router = APIRouter()


# =============================================================================
# Pydantic Models
# =============================================================================

class DatabaseConfig(BaseModel):
    name: str
    host: str
    port: int = 5432
    database: str
    username: str
    password: str
    schema_name: Optional[str] = None
    ssl_mode: str = "require"


class DatabaseUpdate(BaseModel):
    name: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    schema_name: Optional[str] = None
    ssl_mode: Optional[str] = None


class SettingsUpdate(BaseModel):
    encryption_enabled: Optional[bool] = None
    encryption_key: Optional[str] = None
    s3_enabled: Optional[bool] = None
    s3_bucket: Optional[str] = None
    s3_region: Optional[str] = None
    s3_access_key: Optional[str] = None
    s3_secret_key: Optional[str] = None
    s3_prefix: Optional[str] = None
    s3_auto_upload: Optional[bool] = None
    backup_path: Optional[str] = None
    retention_days: Optional[int] = None
    retention_weeks: Optional[int] = None
    retention_months: Optional[int] = None
    # Email notification settings
    email_enabled: Optional[bool] = None
    email_recipient: Optional[str] = None
    email_sender: Optional[str] = None
    aws_region: Optional[str] = None
    aws_access_key: Optional[str] = None
    aws_secret_key: Optional[str] = None


# =============================================================================
# Database Configuration Endpoints
# =============================================================================

@router.get("/databases")
async def list_databases() -> List[Dict[str, Any]]:
    """List all configured databases."""
    databases = database.get_databases()
    # Mask passwords
    for db in databases:
        if "password" in db:
            db["password"] = "********"
    return databases


@router.get("/databases/{db_id}")
async def get_database(db_id: str) -> Dict[str, Any]:
    """Get a specific database configuration."""
    db_config = database.get_database(db_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Database not found")
    # Mask password
    db_config["password"] = "********"
    return db_config


@router.post("/databases")
async def create_database(config: DatabaseConfig) -> Dict[str, Any]:
    """Create a new database configuration."""
    data = config.model_dump()
    data["id"] = str(uuid.uuid4())

    result = database.create_database(data)
    result["password"] = "********"
    return result


@router.put("/databases/{db_id}")
async def update_database(db_id: str, config: DatabaseUpdate) -> Dict[str, Any]:
    """Update a database configuration."""
    existing = database.get_database(db_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Database not found")

    data = {k: v for k, v in config.model_dump().items() if v is not None}

    result = database.update_database(db_id, data)
    if result:
        result["password"] = "********"
    return result


@router.delete("/databases/{db_id}")
async def delete_database(db_id: str) -> Dict[str, str]:
    """Delete a database configuration."""
    if database.delete_database(db_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Database not found")


@router.post("/databases/{db_id}/test")
async def test_database_connection(db_id: str) -> Dict[str, Any]:
    """Test database connection."""
    db_config = database.get_database(db_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Database not found")

    backup_service = get_backup_service()
    result = backup_service.test_connection(db_config)
    return result


@router.post("/databases/test")
async def test_new_database_connection(config: DatabaseConfig) -> Dict[str, Any]:
    """Test a new database connection (before saving)."""
    data = config.model_dump()

    backup_service = get_backup_service()
    result = backup_service.test_connection(data)
    return result


# =============================================================================
# Global Settings Endpoints
# =============================================================================

@router.get("/settings")
async def get_settings() -> Dict[str, Any]:
    """Get global settings."""
    settings = database.get_settings()
    # Mask sensitive fields
    if settings.get("encryption_key"):
        settings["encryption_key"] = "********"
    if settings.get("s3_secret_key"):
        settings["s3_secret_key"] = "********"
    if settings.get("aws_secret_key"):
        settings["aws_secret_key"] = "********"
    if settings.get("discord_webhook"):
        settings["discord_webhook"] = "********" + settings["discord_webhook"][-10:] if len(settings["discord_webhook"]) > 10 else "********"
    return settings


@router.put("/settings")
async def update_settings(config: SettingsUpdate) -> Dict[str, Any]:
    """Update global settings."""
    data = {k: v for k, v in config.model_dump().items() if v is not None}
    result = database.update_settings(data)

    # Mask sensitive fields
    if result.get("encryption_key"):
        result["encryption_key"] = "********"
    if result.get("s3_secret_key"):
        result["s3_secret_key"] = "********"

    return result


# =============================================================================
# S3 Configuration Endpoints
# =============================================================================

@router.post("/settings/s3/test")
async def test_s3_connection() -> Dict[str, Any]:
    """Test S3 connection with current settings."""
    settings = database.get_settings()

    if not settings.get("s3_bucket"):
        raise HTTPException(status_code=400, detail="S3 bucket not configured")

    s3_service = S3Service(
        bucket=settings["s3_bucket"],
        region=settings.get("s3_region", "us-east-1"),
        access_key=settings.get("s3_access_key"),
        secret_key=settings.get("s3_secret_key"),
    )

    result = s3_service.test_connection()
    return result


@router.get("/settings/s3/backups")
async def list_s3_backups() -> List[Dict[str, Any]]:
    """List backups stored in S3."""
    settings = database.get_settings()

    if not settings.get("s3_enabled") or not settings.get("s3_bucket"):
        return []

    s3_service = S3Service(
        bucket=settings["s3_bucket"],
        region=settings.get("s3_region", "us-east-1"),
        access_key=settings.get("s3_access_key"),
        secret_key=settings.get("s3_secret_key"),
    )

    return s3_service.list_backups(prefix=settings.get("s3_prefix", ""))


# =============================================================================
# Encryption Endpoints
# =============================================================================

@router.post("/settings/encryption/generate-key")
async def generate_encryption_key() -> Dict[str, str]:
    """Generate a new encryption key."""
    key = EncryptionService.generate_key()
    return {"key": key}


@router.post("/settings/encryption/validate-key")
async def validate_encryption_key(data: Dict[str, str]) -> Dict[str, bool]:
    """Validate an encryption key."""
    key = data.get("key", "")
    valid = EncryptionService.validate_key(key)
    return {"valid": valid}


# =============================================================================
# Email Notification Endpoints
# =============================================================================

@router.post("/settings/email/test")
async def test_email() -> Dict[str, Any]:
    """Send a test email to verify configuration."""
    settings = database.get_settings()

    if not settings.get("email_enabled"):
        raise HTTPException(status_code=400, detail="Email notifications not enabled")

    if not settings.get("email_recipient"):
        raise HTTPException(status_code=400, detail="Email recipient not configured")

    email_service = EmailService(settings)
    success, message = email_service.send_test_email()

    if not success:
        raise HTTPException(status_code=500, detail=message)

    return {"status": "success", "message": message}
