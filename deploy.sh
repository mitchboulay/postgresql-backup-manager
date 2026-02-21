#!/bin/bash
# =============================================================================
# HostHive Backup Manager - One-Swing Deploy to Proxmox LXC
# =============================================================================
#
# Usage: ./deploy.sh
#
# Prerequisites:
#   - LXC container 120 running with Docker installed (tteck script)
#   - SSH access to Proxmox host
#
# =============================================================================

set -e

# Configuration
LXC_IP="${1:-}"              # Pass as first argument, or will prompt
NAS_IP="${NAS_IP:?Set NAS_IP environment variable}"
NAS_SHARE="/volume1/backups/hosthive"  # Change to your NAS share path
APP_DIR="/opt/backup-manager"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=============================================="
echo "HostHive Backup Manager - Deploy to LXC"
echo "=============================================="
echo ""
echo "Local source: $LOCAL_DIR"
echo "NAS: $NAS_IP:$NAS_SHARE"
echo ""

# Get LXC IP if not provided
if [ -z "$LXC_IP" ]; then
    echo "Enter the LXC container IP address:"
    read -r LXC_IP
fi
echo "LXC IP: $LXC_IP"

if [ -z "$LXC_IP" ]; then
    echo "ERROR: Could not get LXC IP. Is container $LXC_ID running?"
    exit 1
fi

echo ""
echo "Step 1: Copying files to LXC..."
echo "----------------------------------------------"

# Create app directory and copy files
ssh root@$LXC_IP "mkdir -p $APP_DIR && mkdir -p /mnt/nas/hosthive-backups && mkdir -p $APP_DIR/data"

# Copy all files
scp -r "$LOCAL_DIR"/* root@$LXC_IP:$APP_DIR/

echo ""
echo "Step 2: Setting up NAS mount..."
echo "----------------------------------------------"

ssh root@$LXC_IP << ENDSSH
# Install NFS if needed
if ! command -v mount.nfs &> /dev/null; then
    apt-get update && apt-get install -y nfs-common
fi

# Add to fstab if not already there
if ! grep -q "$NAS_IP:$NAS_SHARE" /etc/fstab; then
    echo "$NAS_IP:$NAS_SHARE /mnt/nas/hosthive-backups nfs defaults,_netdev 0 0" >> /etc/fstab
fi

# Mount
mount -a || echo "Mount failed - check NAS settings"

# Verify mount
if mountpoint -q /mnt/nas/hosthive-backups; then
    echo "NAS mounted successfully!"
    df -h /mnt/nas/hosthive-backups
else
    echo "WARNING: NAS not mounted. You may need to configure this manually."
fi
ENDSSH

echo ""
echo "Step 3: Building and starting Docker containers..."
echo "----------------------------------------------"

ssh root@$LXC_IP << ENDSSH
cd $APP_DIR

# Set backup mount path
export BACKUP_MOUNT_PATH=/mnt/nas/hosthive-backups

# Build and start
docker compose up -d --build

# Wait for startup
sleep 5

# Check status
docker compose ps
ENDSSH

echo ""
echo "=============================================="
echo "DEPLOYMENT COMPLETE!"
echo "=============================================="
echo ""
echo "Access the UI at: http://$LXC_IP:3000"
echo "API available at: http://$LXC_IP:8000"
echo ""
echo "Next steps:"
echo "  1. Open http://$LXC_IP:3000 in your browser"
echo "  2. Go to Databases → Add your Supabase connection"
echo "  3. Go to Settings → Configure encryption & S3"
echo "  4. Go to Schedules → Set up automatic backups"
echo ""
