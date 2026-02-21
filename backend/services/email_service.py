"""
Email notification service using AWS SES.
"""

import boto3
from botocore.exceptions import ClientError
from datetime import datetime, timezone
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self, settings: dict):
        self.enabled = settings.get("email_enabled", False)
        self.recipient = settings.get("email_recipient", "")
        self.sender = settings.get("email_sender", "no-reply@example.com")
        self.region = settings.get("aws_region", "us-east-1")
        self.aws_access_key = settings.get("aws_access_key", "")
        self.aws_secret_key = settings.get("aws_secret_key", "")

    def _get_client(self):
        """Get SES client with credentials."""
        if self.aws_access_key and self.aws_secret_key:
            return boto3.client(
                "ses",
                region_name=self.region,
                aws_access_key_id=self.aws_access_key,
                aws_secret_access_key=self.aws_secret_key,
            )
        return boto3.client("ses", region_name=self.region)

    def send_backup_failure_email(
        self,
        database_name: str,
        error_message: str,
        backup_id: Optional[str] = None,
    ) -> bool:
        """Send backup failure notification."""
        if not self.enabled:
            logger.info("Email notifications disabled, skipping failure email")
            return False

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"[BACKUP FAILED] {database_name}"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
            color: white;
            padding: 24px;
            border-radius: 12px 12px 0 0;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 12px 12px;
            padding: 24px;
        }}
        .error-box {{
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 16px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 13px;
            white-space: pre-wrap;
            word-break: break-all;
            color: #991b1b;
        }}
        .footer {{
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
            margin-top: 24px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Backup Failed</h1>
    </div>
    <div class="content">
        <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <strong style="color: #6b7280;">Database:</strong>
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    {database_name}
                </td>
            </tr>
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    <strong style="color: #6b7280;">Time:</strong>
                </td>
                <td style="padding: 12px 0; border-bottom: 1px solid #f3f4f6;">
                    {timestamp}
                </td>
            </tr>
            {f'''<tr>
                <td style="padding: 12px 0;">
                    <strong style="color: #6b7280;">Backup ID:</strong>
                </td>
                <td style="padding: 12px 0;">
                    {backup_id}
                </td>
            </tr>''' if backup_id else ''}
        </table>

        <div class="error-box">
            <strong>Error Details:</strong><br><br>{error_message}
        </div>
    </div>
    <div class="footer">
        <p>This is an automated notification from HostHive Backup Manager</p>
    </div>
</body>
</html>
"""

        text_body = f"""
Backup Failed
=============

Database:   {database_name}
Time:       {timestamp}
{f"Backup ID:  {backup_id}" if backup_id else ""}

Error Details:
{error_message}

---
This is an automated notification from HostHive Backup Manager
"""

        return self._send_email(subject, html_body, text_body)

    def send_test_email(self) -> tuple[bool, str]:
        """Send a test email to verify configuration."""
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = "[TEST] HostHive Backup Manager Email Test"

        html_body = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }}
        .header {{
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 24px;
            border-radius: 12px 12px 0 0;
            text-align: center;
        }}
        .header h1 {{
            margin: 0;
            font-size: 24px;
        }}
        .content {{
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-top: none;
            border-radius: 0 0 12px 12px;
            padding: 24px;
            text-align: center;
        }}
        .success-icon {{
            font-size: 48px;
            margin-bottom: 16px;
        }}
        .footer {{
            text-align: center;
            color: #9ca3af;
            font-size: 12px;
            margin-top: 24px;
        }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Email Test Successful</h1>
    </div>
    <div class="content">
        <div class="success-icon">&#9989;</div>
        <p>Your email notifications are configured correctly.</p>
        <p style="color: #6b7280; font-size: 14px;">Test sent at: {timestamp}</p>
    </div>
    <div class="footer">
        <p>HostHive Backup Manager</p>
    </div>
</body>
</html>
"""

        text_body = f"""
Email Test Successful
=====================

Your email notifications are configured correctly.

Test sent at: {timestamp}

---
HostHive Backup Manager
"""

        success = self._send_email(subject, html_body, text_body)
        if success:
            return True, "Test email sent successfully"
        return False, "Failed to send test email"

    def _send_email(self, subject: str, html_body: str, text_body: str) -> bool:
        """Send email via SES."""
        try:
            client = self._get_client()
            response = client.send_email(
                Source=f'"HostHive Backup Manager" <{self.sender}>',
                Destination={
                    "ToAddresses": [self.recipient],
                },
                Message={
                    "Subject": {
                        "Data": subject,
                        "Charset": "UTF-8",
                    },
                    "Body": {
                        "Text": {
                            "Data": text_body,
                            "Charset": "UTF-8",
                        },
                        "Html": {
                            "Data": html_body,
                            "Charset": "UTF-8",
                        },
                    },
                },
            )
            logger.info(f"Email sent successfully. Message ID: {response['MessageId']}")
            return True
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(f"Failed to send email: {error_code} - {error_message}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}")
            return False
