"""
S3 service - handles backup uploads to AWS S3.
"""
import boto3
from botocore.exceptions import ClientError
from pathlib import Path
from typing import List, Dict, Any, Optional


class S3Service:
    """Handles S3 operations for backup storage."""

    def __init__(
        self,
        settings: Optional[Dict[str, Any]] = None,
        bucket: Optional[str] = None,
        region: str = "us-east-1",
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
    ):
        # Support both settings dict and individual params
        if settings:
            self.bucket = settings.get("s3_bucket", bucket)
            self.region = settings.get("s3_region", region)
            access_key = settings.get("s3_access_key", access_key)
            secret_key = settings.get("s3_secret_key", secret_key)
            self.prefix = settings.get("s3_prefix", "")
        else:
            self.bucket = bucket
            self.region = region
            self.prefix = ""

        # Create S3 client
        if access_key and secret_key:
            self.client = boto3.client(
                's3',
                region_name=self.region,
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )
        else:
            # Use default credentials (IAM role, env vars, etc.)
            self.client = boto3.client('s3', region_name=self.region)

    def upload_file(self, file_path: Path, s3_key: str) -> Dict[str, Any]:
        """
        Upload a file to S3.

        Args:
            file_path: Local file path
            s3_key: S3 object key (path in bucket)

        Returns:
            Upload result dict
        """
        try:
            self.client.upload_file(
                str(file_path),
                self.bucket,
                s3_key,
                ExtraArgs={
                    'StorageClass': 'STANDARD_IA',  # Infrequent access for backups
                }
            )
            return {
                "success": True,
                "bucket": self.bucket,
                "key": s3_key,
                "url": f"s3://{self.bucket}/{s3_key}",
            }
        except ClientError as e:
            return {
                "success": False,
                "error": str(e),
            }

    def download_file(self, s3_key: str, local_path: Path) -> Dict[str, Any]:
        """
        Download a file from S3.

        Args:
            s3_key: S3 object key
            local_path: Local destination path

        Returns:
            Download result dict
        """
        try:
            self.client.download_file(self.bucket, s3_key, str(local_path))
            return {
                "success": True,
                "path": str(local_path),
            }
        except ClientError as e:
            return {
                "success": False,
                "error": str(e),
            }

    def download_backup(self, s3_key: str, local_path: str) -> bool:
        """
        Download a backup file from S3 (simplified interface).

        Args:
            s3_key: S3 object key
            local_path: Local destination path

        Returns:
            True if successful, False otherwise
        """
        result = self.download_file(s3_key, Path(local_path))
        return result.get("success", False)

    def list_backups(self, prefix: str = "") -> List[Dict[str, Any]]:
        """
        List backup files in S3.

        Args:
            prefix: S3 key prefix to filter

        Returns:
            List of backup objects
        """
        try:
            response = self.client.list_objects_v2(
                Bucket=self.bucket,
                Prefix=prefix,
            )

            backups = []
            for obj in response.get('Contents', []):
                backups.append({
                    "key": obj['Key'],
                    "size": obj['Size'],
                    "last_modified": obj['LastModified'].isoformat(),
                    "storage_class": obj.get('StorageClass', 'STANDARD'),
                })

            return backups

        except ClientError as e:
            return []

    def delete_file(self, s3_key: str) -> Dict[str, Any]:
        """
        Delete a file from S3.

        Args:
            s3_key: S3 object key

        Returns:
            Delete result dict
        """
        try:
            self.client.delete_object(Bucket=self.bucket, Key=s3_key)
            return {"success": True}
        except ClientError as e:
            return {
                "success": False,
                "error": str(e),
            }

    def test_connection(self) -> Dict[str, Any]:
        """
        Test S3 connection and permissions.

        Returns:
            Test result dict
        """
        try:
            # Try to list objects (tests read permission)
            self.client.list_objects_v2(Bucket=self.bucket, MaxKeys=1)

            # Try to get bucket location (tests bucket access)
            location = self.client.get_bucket_location(Bucket=self.bucket)

            return {
                "success": True,
                "bucket": self.bucket,
                "region": location.get('LocationConstraint') or 'us-east-1',
            }
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            return {
                "success": False,
                "error": str(e),
                "error_code": error_code,
            }

    def get_presigned_url(self, s3_key: str, expiration: int = 3600) -> Optional[str]:
        """
        Generate a presigned URL for downloading a backup.

        Args:
            s3_key: S3 object key
            expiration: URL expiration in seconds

        Returns:
            Presigned URL or None on error
        """
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': s3_key},
                ExpiresIn=expiration,
            )
            return url
        except ClientError:
            return None
