"""
Backup service - handles pg_dump, encryption, and file management.
"""
import os
import subprocess
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path

from db import database
from db.database import utc_now
from services.encryption_service import EncryptionService
from services.s3_service import S3Service
from services.email_service import EmailService


class BackupService:
    """Handles PostgreSQL backups."""

    def __init__(self):
        self.settings = database.get_settings()
        self.backup_path = Path(self.settings.get("backup_path", "/backups"))
        self.backup_path.mkdir(parents=True, exist_ok=True)

    def refresh_settings(self):
        """Reload settings from database."""
        self.settings = database.get_settings()
        self.backup_path = Path(self.settings.get("backup_path", "/backups"))

    def run_backup(self, db_config: Dict[str, Any], manual: bool = False) -> Dict[str, Any]:
        """
        Run a backup for the specified database.

        Args:
            db_config: Database configuration dict
            manual: Whether this is a manual trigger

        Returns:
            Backup result dict
        """
        self.refresh_settings()

        backup_id = str(uuid.uuid4())
        db_id = db_config["id"]
        db_name = db_config.get("name", db_id)
        timestamp = datetime.utcnow()
        timestamp_str = timestamp.strftime("%Y%m%d_%H%M%S")

        # Create backup record
        backup_record = {
            "id": backup_id,
            "database_id": db_id,
            "database_name": db_name,
            "status": "running",
            "started_at": utc_now(),
            "completed_at": None,
            "file_name": None,
            "file_size": None,
            "encrypted": False,
            "s3_uploaded": False,
            "error": None,
        }
        database.create_backup_record(backup_record)
        database.add_log("info", f"Starting backup for {db_name}", backup_id)

        try:
            # Build file paths
            base_filename = f"{db_name}_{timestamp_str}"
            dump_file = self.backup_path / f"{base_filename}.dump"
            final_file = dump_file

            # Run pg_dump
            database.add_log("info", f"Running pg_dump for {db_name}", backup_id)
            self._run_pg_dump(db_config, dump_file)

            # Encrypt if enabled
            if self.settings.get("encryption_enabled") and self.settings.get("encryption_key"):
                database.add_log("info", "Encrypting backup", backup_id)
                encrypted_file = self.backup_path / f"{base_filename}.dump.enc"
                EncryptionService.encrypt_file(
                    dump_file,
                    encrypted_file,
                    self.settings["encryption_key"]
                )
                # Remove unencrypted file
                dump_file.unlink()
                final_file = encrypted_file
                backup_record["encrypted"] = True

            # Get file size
            file_size = final_file.stat().st_size
            backup_record["file_name"] = final_file.name
            backup_record["file_size"] = file_size

            # Upload to S3 if enabled
            if self.settings.get("s3_enabled"):
                database.add_log("info", "Uploading to S3", backup_id)
                try:
                    s3_service = S3Service(self.settings)
                    s3_key = f"{self.settings.get('s3_prefix', '')}{final_file.name}"
                    result = s3_service.upload_file(final_file, s3_key)
                    if result.get("success"):
                        backup_record["s3_uploaded"] = True
                        database.add_log("info", f"Uploaded to S3: {s3_key}", backup_id)
                    else:
                        database.add_log("error", f"S3 upload failed: {result.get('error')}", backup_id)
                except Exception as s3_error:
                    database.add_log("error", f"S3 upload exception: {str(s3_error)}", backup_id)

            # Update record as success
            backup_record["status"] = "completed"
            backup_record["completed_at"] = utc_now()
            database.update_backup_record(backup_id, backup_record)
            database.add_log("info", f"Backup completed: {final_file.name} ({self._format_size(file_size)})", backup_id)

            # Cleanup old backups
            self._cleanup_old_backups(db_name)

            return backup_record

        except Exception as e:
            error_msg = str(e)
            backup_record["status"] = "failed"
            backup_record["error"] = error_msg
            backup_record["completed_at"] = utc_now()
            database.update_backup_record(backup_id, backup_record)
            database.add_log("error", f"Backup failed: {error_msg}", backup_id)

            # Send failure notification email
            try:
                email_service = EmailService(self.settings)
                email_service.send_backup_failure_email(
                    database_name=db_name,
                    error_message=error_msg,
                    backup_id=backup_id,
                )
            except Exception as email_error:
                database.add_log("warning", f"Failed to send failure notification: {email_error}", backup_id)

            raise

    def _run_pg_dump(self, db_config: Dict[str, Any], output_file: Path):
        """Run pg_dump command."""
        env = os.environ.copy()
        env["PGPASSWORD"] = db_config["password"]
        env["PGSSLMODE"] = db_config.get("ssl_mode", "require")

        cmd = [
            "pg_dump",
            "-h", db_config["host"],
            "-p", str(db_config.get("port", 5432)),
            "-U", db_config["username"],
            "-d", db_config["database"],
            "--no-owner",
            "--no-acl",
            "-Fc",
            "-f", str(output_file),
        ]

        # Add schema filter if specified
        if db_config.get("schema_name"):
            cmd.extend(["-n", db_config["schema_name"]])

        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            raise Exception(f"pg_dump failed: {result.stderr}")

    def _cleanup_old_backups(self, db_name: str):
        """Remove old backups based on retention settings."""
        retention_days = self.settings.get("retention_days", 30)

        # Find old backup files
        cutoff = datetime.utcnow().timestamp() - (retention_days * 86400)

        for file in self.backup_path.glob(f"{db_name}_*.dump*"):
            if file.stat().st_mtime < cutoff:
                file.unlink()
                database.add_log("info", f"Deleted old backup: {file.name}")

    def _format_size(self, size_bytes: int) -> str:
        """Format file size for display."""
        for unit in ["B", "KB", "MB", "GB"]:
            if size_bytes < 1024:
                return f"{size_bytes:.2f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.2f} TB"

    def list_backup_files(self) -> List[Dict[str, Any]]:
        """List all backup files on disk."""
        files = []
        for file in sorted(self.backup_path.glob("*.dump*"), key=lambda f: f.stat().st_mtime, reverse=True):
            stat = file.stat()
            files.append({
                "name": file.name,
                "path": str(file),
                "size": stat.st_size,
                "size_formatted": self._format_size(stat.st_size),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "encrypted": file.suffix == ".enc",
            })
        return files

    def delete_backup_file(self, filename: str) -> bool:
        """Delete a backup file."""
        file_path = self.backup_path / filename
        if file_path.exists() and file_path.is_file():
            file_path.unlink()
            database.add_log("info", f"Deleted backup file: {filename}")
            return True
        return False

    def test_connection(self, db_config: Dict[str, Any]) -> Dict[str, Any]:
        """Test database connection."""
        import psycopg2

        try:
            conn = psycopg2.connect(
                host=db_config["host"],
                port=db_config.get("port", 5432),
                user=db_config["username"],
                password=db_config["password"],
                database=db_config["database"],
                sslmode=db_config.get("ssl_mode", "require"),
                connect_timeout=10,
            )

            cursor = conn.cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()[0]

            cursor.execute("""
                SELECT schemaname, tablename
                FROM pg_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                LIMIT 10;
            """)
            tables = cursor.fetchall()

            cursor.close()
            conn.close()

            return {
                "success": True,
                "version": version,
                "tables": [{"schema": t[0], "table": t[1]} for t in tables],
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }


# Singleton instance
_backup_service = None


def get_backup_service() -> BackupService:
    """Get backup service singleton."""
    global _backup_service
    if _backup_service is None:
        _backup_service = BackupService()
    return _backup_service
