# PG Backup Manager

A self-hosted PostgreSQL backup management system with encryption and S3 sync.

> Originally built for [HostHive](https://hosthive.io), open-sourced for the community.

## Features

- **Database Management**: Configure multiple PostgreSQL databases
- **Scheduled Backups**: Cron-based scheduling with flexible presets
- **Encryption**: AES-256 encryption for backups at rest
- **S3 Sync**: Automatic upload to AWS S3 for off-site storage
- **Restore**: Download from S3 and restore to any PostgreSQL target
- **Email Alerts**: Get notified on backup failures via AWS SES
- **Retention Policies**: Configurable daily/weekly/monthly retention
- **Web UI**: React dashboard for monitoring and management
- **Logs**: Full audit trail of all backup operations

## How It Works

Dead simple by design. No agents, no daemons on your database servers, no complex setup.

### The Backup Flow

```
1. Scheduler triggers backup (or you click "Backup Now")
        ↓
2. pg_dump connects to your database (standard PostgreSQL protocol)
        ↓
3. Dump file saved locally → encrypted with AES-256 (optional)
        ↓
4. Uploaded to S3 (optional) → old backups cleaned up per retention policy
        ↓
5. If anything fails → email alert via SES
```

### Security Model

**No secrets in code or config files.** Everything sensitive is:
- Entered via the UI and stored in SQLite (a local database file)
- Never logged or exposed in API responses (passwords are masked)
- Encrypted at rest if you enable backup encryption

**Network security:**
- The app connects *out* to your databases - no inbound ports needed on DB servers
- Database credentials never leave the backup manager container
- S3 uploads use AWS SDK with your IAM credentials

**Encryption:**
- AES-256-GCM authenticated encryption
- Key derived from your passphrase using PBKDF2 (100,000 iterations)
- Each backup file has unique salt and nonce
- **You control the key** - we never see it, can't recover it for you

### Why SQLite?

We use SQLite instead of PostgreSQL because:
- Zero dependencies - no database server to maintain
- Built-in concurrency - WAL mode handles multiple simultaneous backups
- Portable - copy one file to migrate/backup the backup manager itself
- Good enough - we're storing config and logs, not millions of rows

### What Gets Stored Where

| Data | Location | Encrypted |
|------|----------|-----------|
| Database connection configs | `data/backup_manager.db` | No (but passwords masked in API) |
| Backup schedules | `data/backup_manager.db` | No |
| Backup history/logs | `data/backup_manager.db` | No |
| Actual backup files | `/backups/` (mounted volume) | Optional (AES-256) |
| Off-site backup copies | S3 bucket | Same as local |

## Quick Start

### Prerequisites

- Docker and Docker Compose
- NFS mount to your NAS (or local storage)

### 1. Clone and Configure

```bash
cd hosthive-backup-manager

# Create data directory
mkdir -p data

# Set backup mount path (your NAS mount)
export BACKUP_MOUNT_PATH=/mnt/nas/hosthive-backups
```

### 2. Deploy

```bash
docker compose up -d
```

### 3. Access

- **Web UI**: http://localhost:3000
- **API**: http://localhost:8000

## Proxmox Deployment

### Create LXC Container

```bash
# On Proxmox host
pct create 201 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
  --hostname backup-manager \
  --memory 1024 \
  --cores 2 \
  --rootfs local-lvm:16 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1 \
  --features nesting=1

pct start 201
pct enter 201
```

### Install Docker

```bash
apt update && apt install -y curl
curl -fsSL https://get.docker.com | sh
```

### Mount NAS

```bash
apt install -y nfs-common
mkdir -p /mnt/nas/hosthive-backups
echo "192.168.1.XXX:/volume1/backups/hosthive /mnt/nas/hosthive-backups nfs defaults 0 0" >> /etc/fstab
mount -a
```

### Deploy Application

```bash
cd /opt
git clone <repo-url> backup-manager
cd backup-manager/hosthive-backup-manager

export BACKUP_MOUNT_PATH=/mnt/nas/hosthive-backups
docker compose up -d
```

## Configuration

All configuration is done through the web UI:

### Databases

1. Go to **Databases** → **Add Database**
2. Enter connection details (host, port, user, password)
3. Test connection
4. Save

### Schedules

1. Go to **Schedules** → **Add Schedule**
2. Select database and cron expression
3. Use presets for common schedules (daily, weekly, etc.)

### Encryption

1. Go to **Settings** → **Encryption**
2. Enable encryption
3. Generate or enter encryption key
4. **Save the key securely!**

### S3 Sync

1. Go to **Settings** → **S3 Backup Storage**
2. Enable S3
3. Enter bucket, region, access key, secret key
4. Test connection
5. Save

## API Reference

### Health
- `GET /api/health` - System health status
- `GET /api/health/detailed` - Detailed health with disk usage

### Databases
- `GET /api/config/databases` - List databases
- `POST /api/config/databases` - Add database
- `POST /api/config/databases/{id}/test` - Test connection
- `DELETE /api/config/databases/{id}` - Delete database

### Backups
- `GET /api/backups` - List backup history
- `GET /api/backups/files` - List backup files on disk
- `POST /api/backups/run/{db_id}` - Trigger manual backup
- `GET /api/backups/files/{name}/download` - Download backup

### Schedules
- `GET /api/schedules` - List schedules
- `POST /api/schedules` - Create schedule
- `POST /api/schedules/{id}/run` - Run immediately
- `POST /api/schedules/{id}/pause` - Pause schedule
- `POST /api/schedules/{id}/resume` - Resume schedule

### Settings
- `GET /api/config/settings` - Get settings
- `PUT /api/config/settings` - Update settings
- `POST /api/config/settings/s3/test` - Test S3 connection
- `POST /api/config/settings/encryption/generate-key` - Generate encryption key
- `POST /api/config/settings/email/test` - Send test email

### Restore
- `GET /api/restore/s3-backups` - List backups in S3
- `POST /api/restore/from-s3` - Start restore (async, returns job ID)
- `GET /api/restore/status/{job_id}` - Poll restore job status

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Docker Host                     │
│                                                  │
│  ┌──────────────┐        ┌──────────────────┐   │
│  │   Frontend   │        │     Backend      │   │
│  │  (React/Nginx)│───────│    (FastAPI)     │   │
│  │    :3000     │        │      :8000       │   │
│  └──────────────┘        └────────┬─────────┘   │
│                                   │             │
│                          ┌────────▼─────────┐   │
│                          │    SQLite        │   │
│                          │  (config/logs)   │   │
│                          └──────────────────┘   │
│                                   │             │
└───────────────────────────────────┼─────────────┘
                                    │
                           ┌────────▼─────────┐
                           │    NAS Mount     │
                           │   /backups/      │
                           └────────┬─────────┘
                                    │
                           ┌────────▼─────────┐
                           │       S3         │
                           │  (optional)      │
                           └──────────────────┘
```

## License

MIT
