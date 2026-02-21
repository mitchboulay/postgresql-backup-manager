#!/bin/bash
# Quick deploy script for hosthive-backup-manager updates
# Usage: ./deploy-update.sh

set -e

LXC_IP="${1:?Usage: ./deploy-update.sh <target-ip>}"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="/opt/backup-manager"

echo "Deploying to $LXC_IP..."

# Ensure rsync is installed on target
ssh root@$LXC_IP "command -v rsync || apt-get update && apt-get install -y rsync"

# Copy files using rsync to exclude data directory (preserves server data)
rsync -av --exclude='data/' --exclude='backups/' --exclude='.git/' "$LOCAL_DIR"/ root@$LXC_IP:$APP_DIR/

# Rebuild and restart
ssh root@$LXC_IP "cd $APP_DIR && docker compose down && docker compose up -d --build && docker compose ps"

echo "Done! UI at http://$LXC_IP:3000"
