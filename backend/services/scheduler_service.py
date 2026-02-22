"""
Scheduler service - handles cron-based backup scheduling.
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.pool import ThreadPoolExecutor
from typing import Dict, Any, List, Optional
from datetime import datetime

from db import database
from db.database import utc_now


class SchedulerService:
    """Manages scheduled backup jobs."""

    def __init__(self):
        # Allow up to 10 concurrent backups across different databases
        executors = {
            'default': ThreadPoolExecutor(max_workers=10)
        }

        self.scheduler = BackgroundScheduler(
            jobstores={'default': MemoryJobStore()},
            executors=executors,
            job_defaults={
                'coalesce': True,
                'max_instances': 1,  # Prevent same job from overlapping with itself
            }
        )
        self._load_schedules()

    def _load_schedules(self):
        """Load schedules from database."""
        schedules = database.get_schedules()
        for schedule in schedules:
            if schedule.get("enabled", True):
                self._add_job(schedule)

    def _add_job(self, schedule: Dict[str, Any]):
        """Add a job to the scheduler."""
        try:
            trigger = CronTrigger.from_crontab(schedule["cron_expression"])

            self.scheduler.add_job(
                func=self._run_backup,
                trigger=trigger,
                id=schedule["id"],
                name=schedule.get("name", schedule["id"]),
                kwargs={"schedule_id": schedule["id"]},
                replace_existing=True,
            )

            database.add_log("info", f"Scheduled job added: {schedule.get('name', schedule['id'])}")

        except Exception as e:
            database.add_log("error", f"Failed to add schedule {schedule['id']}: {str(e)}")

    def _run_backup(self, schedule_id: str):
        """Execute a scheduled backup."""
        from services.backup_service import get_backup_service

        schedule = database.get_schedule(schedule_id)
        if not schedule:
            database.add_log("error", f"Schedule not found: {schedule_id}")
            return

        db_config = database.get_database(schedule["database_id"])
        if not db_config:
            database.add_log("error", f"Database not found for schedule: {schedule_id}")
            return

        database.add_log("info", f"Running scheduled backup: {schedule.get('name', schedule_id)}")

        try:
            backup_service = get_backup_service()
            backup_service.run_backup(db_config, manual=False)

            # Update last run time
            database.update_schedule(schedule_id, {
                "last_run": utc_now(),
                "last_status": "success",
            })

        except Exception as e:
            database.update_schedule(schedule_id, {
                "last_run": utc_now(),
                "last_status": "failed",
                "last_error": str(e),
            })

    def start(self):
        """Start the scheduler."""
        if not self.scheduler.running:
            self.scheduler.start()
            database.add_log("info", "Scheduler started")

    def shutdown(self):
        """Shutdown the scheduler."""
        if self.scheduler.running:
            self.scheduler.shutdown()
            database.add_log("info", "Scheduler stopped")

    def add_schedule(self, schedule: Dict[str, Any]):
        """Add a new schedule."""
        self._add_job(schedule)

    def remove_schedule(self, schedule_id: str):
        """Remove a schedule."""
        try:
            self.scheduler.remove_job(schedule_id)
            database.add_log("info", f"Schedule removed: {schedule_id}")
        except Exception:
            pass

    def update_schedule(self, schedule: Dict[str, Any]):
        """Update an existing schedule."""
        self.remove_schedule(schedule["id"])
        if schedule.get("enabled", True):
            self._add_job(schedule)

    def get_jobs(self) -> List[Dict[str, Any]]:
        """Get all scheduled jobs."""
        jobs = []
        for job in self.scheduler.get_jobs():
            next_run = job.next_run_time
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": next_run.isoformat() if next_run else None,
            })
        return jobs

    def run_now(self, schedule_id: str):
        """Trigger a scheduled job immediately."""
        job = self.scheduler.get_job(schedule_id)
        if job:
            job.modify(next_run_time=datetime.now())
            database.add_log("info", f"Triggered immediate run: {schedule_id}")
            return True
        return False

    def pause_schedule(self, schedule_id: str):
        """Pause a schedule."""
        try:
            self.scheduler.pause_job(schedule_id)
            database.add_log("info", f"Schedule paused: {schedule_id}")
            return True
        except Exception:
            return False

    def resume_schedule(self, schedule_id: str):
        """Resume a paused schedule."""
        try:
            self.scheduler.resume_job(schedule_id)
            database.add_log("info", f"Schedule resumed: {schedule_id}")
            return True
        except Exception:
            return False
