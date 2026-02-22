# Changelog

All notable changes to the HostHive Backup Manager.

## [1.1.0] - 2026-02-22

### Added

#### Database Environment Support
- Databases can now be marked as **Production** or **Development**
- Environment badges displayed in the database list (red for Production, green for Development)
- Environment field added to database create/edit form
- Automatic migration adds `environment` column to existing databases (defaults to `dev`)

#### Restore Safety Controls
- **Restore direction validation** based on source and target environments:
  - `dev → dev`: Allowed, uses stored credentials
  - `prod → dev`: Allowed, uses stored credentials
  - `dev → prod`: **Blocked** (prevents overwriting production with test data)
  - `prod → prod`: Requires manual credential entry + confirmation checkbox
- Restores to **dev** databases use stored credentials (no manual entry needed)
- Restores to **prod** databases always require manual credential entry for safety
- Visual warnings displayed for blocked or restricted restore operations

#### Restore Page Improvements
- **Search**: Filter backups by filename
- **Sort options**: Most Recent, Oldest First, Largest First, Smallest First, Name (A-Z)
- **Type filter**: All Types, Encrypted Only, Unencrypted Only
- Shows count: "Showing X of Y backups"
- Source database selector to identify backup origin for safety checks

#### Database Management
- **Edit button** added to database list (pencil icon)
- Edit form pre-fills current values (password left blank for security)
- Password field shows "(leave blank to keep current)" when editing

#### Manual Backup Options
- **Custom backup name**: Enter a custom name for manual backups (optional)
- **Storage selection**: Choose between "Local + S3" or "Local Only"
- Backup dialog appears when clicking the backup button
- Custom names are sanitized (alphanumeric, `-`, `_` only) with timestamp appended

### Changed

- Backup mutation updated to accept options object with `customName` and `localOnly`
- Restore API now accepts `target_database_id` to use stored credentials for dev targets
- Improved UX for restore flow with clearer environment indicators

### Technical Details

#### Backend Changes
- `databases` table: Added `environment TEXT DEFAULT 'dev'` column
- `backup_service.py`: Added `custom_name` and `local_only` parameters to `run_backup()`
- `routers/backups.py`: Added `BackupRequest` model with `custom_name` and `local_only`
- `routers/restore.py`: Added environment validation logic and stored credential lookup
- `routers/config.py`: Added `environment` field to `DatabaseConfig` and `DatabaseUpdate` models

#### Frontend Changes
- `pages/Databases.tsx`: Added edit functionality, backup dialog with name/storage options
- `pages/Restore.tsx`: Added search, sort, filter, environment warnings, and credential logic
- `lib/api.ts`: Updated `runBackup()` and `restoreFromS3()` function signatures

---

## [1.0.0] - Initial Release

### Features
- Database configuration management
- Scheduled and manual PostgreSQL backups
- S3 upload support
- Backup encryption
- Restore from S3
- Email notifications
- Backup retention policies
