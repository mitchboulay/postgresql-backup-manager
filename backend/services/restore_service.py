"""
Database restore service - downloads from S3 and restores to target database.
"""

import subprocess
import tempfile
import os
from pathlib import Path
from datetime import datetime
from typing import Optional
import logging

from services.s3_service import S3Service
from services.encryption_service import EncryptionService
from db import database

logger = logging.getLogger(__name__)


class RestoreService:
    def __init__(self, s3_service: S3Service, encryption_key: Optional[str] = None):
        self.s3_service = s3_service
        self.encryption_key = encryption_key

    def list_s3_backups(self) -> list[dict]:
        """List all backups available in S3."""
        return self.s3_service.list_backups()

    def restore_from_s3(
        self,
        s3_key: str,
        target_db: dict,
        is_encrypted: bool = False,
    ) -> dict:
        """
        Download backup from S3 and restore to target database.

        Args:
            s3_key: S3 object key for the backup file
            target_db: Target database connection info
            is_encrypted: Whether the backup file is encrypted

        Returns:
            dict with restore status and details
        """
        restore_id = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        started_at = datetime.utcnow()

        database.add_log("info", f"Starting restore from S3: {s3_key}")

        try:
            # Create temp directory for downloaded file
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_path = Path(temp_dir)

                # Download from S3
                local_filename = os.path.basename(s3_key)
                local_file = temp_path / local_filename

                logger.info(f"Downloading {s3_key} from S3...")
                database.add_log("info", f"Downloading {s3_key} from S3")

                if not self.s3_service.download_backup(s3_key, str(local_file)):
                    raise Exception(f"Failed to download {s3_key} from S3")

                # Decrypt if needed
                restore_file = local_file
                if is_encrypted and self.encryption_key:
                    if not local_filename.endswith('.enc'):
                        logger.warning("File marked as encrypted but doesn't have .enc extension")

                    decrypted_file = temp_path / local_filename.replace('.enc', '')
                    logger.info("Decrypting backup file...")
                    database.add_log("info", "Decrypting backup file")

                    try:
                        EncryptionService.decrypt_file(local_file, decrypted_file, self.encryption_key)
                    except Exception as e:
                        raise Exception(f"Failed to decrypt backup file: {e}")

                    restore_file = decrypted_file

                # Build connection string for target
                target_host = target_db.get("host", "localhost")
                target_port = target_db.get("port", 5432)
                target_name = target_db.get("database", "postgres")
                target_user = target_db.get("username", "postgres")
                target_password = target_db.get("password", "")
                target_ssl = target_db.get("ssl_mode", "")

                # Set password in environment
                env = os.environ.copy()
                env["PGPASSWORD"] = target_password

                # Build pg_restore command
                cmd = [
                    "pg_restore",
                    "-h", target_host,
                    "-p", str(target_port),
                    "-U", target_user,
                    "-d", target_name,
                    "--no-owner",
                    "--no-privileges",
                    "--clean",
                    "--if-exists",
                    "-v",
                    str(restore_file),
                ]

                # Add SSL mode if specified
                if target_ssl:
                    env["PGSSLMODE"] = target_ssl

                logger.info(f"Running pg_restore to {target_host}:{target_port}/{target_name}")
                database.add_log("info", f"Restoring to {target_host}:{target_port}/{target_name}")

                result = subprocess.run(
                    cmd,
                    env=env,
                    capture_output=True,
                    text=True,
                    timeout=3600,  # 1 hour timeout
                )

                completed_at = datetime.utcnow()
                duration = (completed_at - started_at).total_seconds()

                if result.returncode != 0:
                    # pg_restore often returns non-zero even on success due to warnings
                    # Check if there are actual errors
                    stderr = result.stderr or ""
                    if "error" in stderr.lower() and "warning" not in stderr.lower():
                        raise Exception(f"pg_restore failed: {stderr}")
                    else:
                        logger.warning(f"pg_restore completed with warnings: {stderr}")

                database.add_log(
                    "info",
                    f"Restore completed successfully in {duration:.1f}s"
                )

                return {
                    "id": restore_id,
                    "status": "completed",
                    "s3_key": s3_key,
                    "target_database": f"{target_host}:{target_port}/{target_name}",
                    "started_at": started_at.isoformat(),
                    "completed_at": completed_at.isoformat(),
                    "duration_seconds": duration,
                    "warnings": result.stderr if result.returncode != 0 else None,
                }

        except subprocess.TimeoutExpired:
            error_msg = "Restore timed out after 1 hour"
            logger.error(error_msg)
            database.add_log("error", error_msg)
            return {
                "id": restore_id,
                "status": "failed",
                "s3_key": s3_key,
                "error": error_msg,
                "started_at": started_at.isoformat(),
            }
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Restore failed: {error_msg}")
            database.add_log("error", f"Restore failed: {error_msg}")
            return {
                "id": restore_id,
                "status": "failed",
                "s3_key": s3_key,
                "error": error_msg,
                "started_at": started_at.isoformat(),
            }
