"""
Schedule management endpoints.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uuid

from db import database

router = APIRouter()


class ScheduleCreate(BaseModel):
    name: str
    database_id: str
    cron_expression: str  # e.g., "0 3 * * *" for 3 AM daily
    enabled: bool = True
    description: Optional[str] = None


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    database_id: Optional[str] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None


@router.get("")
async def list_schedules() -> List[Dict[str, Any]]:
    """List all schedules."""
    schedules = database.get_schedules()

    # Enrich with database names
    databases = {db["id"]: db["name"] for db in database.get_databases()}
    for schedule in schedules:
        schedule["database_name"] = databases.get(schedule.get("database_id"), "Unknown")

    return schedules


@router.get("/jobs")
async def list_jobs(request: Request) -> List[Dict[str, Any]]:
    """List active scheduler jobs."""
    scheduler = request.app.state.scheduler
    if scheduler:
        return scheduler.get_jobs()
    return []


@router.get("/{schedule_id}")
async def get_schedule(schedule_id: str) -> Dict[str, Any]:
    """Get a specific schedule."""
    schedule = database.get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Enrich with database name
    db_config = database.get_database(schedule.get("database_id"))
    schedule["database_name"] = db_config["name"] if db_config else "Unknown"

    return schedule


@router.post("")
async def create_schedule(config: ScheduleCreate, request: Request) -> Dict[str, Any]:
    """Create a new schedule."""
    # Validate database exists
    db_config = database.get_database(config.database_id)
    if not db_config:
        raise HTTPException(status_code=400, detail="Database not found")

    # Validate cron expression
    try:
        from apscheduler.triggers.cron import CronTrigger
        CronTrigger.from_crontab(config.cron_expression)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid cron expression: {str(e)}")

    data = config.model_dump()
    data["id"] = str(uuid.uuid4())
    data["last_run"] = None
    data["last_status"] = None

    result = database.create_schedule(data)

    # Add to scheduler
    scheduler = request.app.state.scheduler
    if scheduler and config.enabled:
        scheduler.add_schedule(result)

    return result


@router.put("/{schedule_id}")
async def update_schedule(schedule_id: str, config: ScheduleUpdate, request: Request) -> Dict[str, Any]:
    """Update a schedule."""
    existing = database.get_schedule(schedule_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Schedule not found")

    data = {k: v for k, v in config.model_dump().items() if v is not None}

    # Validate cron if provided
    if "cron_expression" in data:
        try:
            from apscheduler.triggers.cron import CronTrigger
            CronTrigger.from_crontab(data["cron_expression"])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid cron expression: {str(e)}")

    result = database.update_schedule(schedule_id, data)

    # Update scheduler
    scheduler = request.app.state.scheduler
    if scheduler:
        updated = {**existing, **data}
        scheduler.update_schedule(updated)

    return result


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, request: Request) -> Dict[str, str]:
    """Delete a schedule."""
    # Remove from scheduler
    scheduler = request.app.state.scheduler
    if scheduler:
        scheduler.remove_schedule(schedule_id)

    if database.delete_schedule(schedule_id):
        return {"status": "deleted"}
    raise HTTPException(status_code=404, detail="Schedule not found")


@router.post("/{schedule_id}/run")
async def run_schedule_now(schedule_id: str, request: Request) -> Dict[str, str]:
    """Trigger a scheduled backup immediately."""
    schedule = database.get_schedule(schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")

    scheduler = request.app.state.scheduler
    if scheduler and scheduler.run_now(schedule_id):
        return {"status": "triggered"}

    raise HTTPException(status_code=500, detail="Failed to trigger schedule")


@router.post("/{schedule_id}/pause")
async def pause_schedule(schedule_id: str, request: Request) -> Dict[str, str]:
    """Pause a schedule."""
    scheduler = request.app.state.scheduler
    if scheduler and scheduler.pause_schedule(schedule_id):
        database.update_schedule(schedule_id, {"enabled": False})
        return {"status": "paused"}
    raise HTTPException(status_code=500, detail="Failed to pause schedule")


@router.post("/{schedule_id}/resume")
async def resume_schedule(schedule_id: str, request: Request) -> Dict[str, str]:
    """Resume a paused schedule."""
    scheduler = request.app.state.scheduler
    if scheduler and scheduler.resume_schedule(schedule_id):
        database.update_schedule(schedule_id, {"enabled": True})
        return {"status": "resumed"}
    raise HTTPException(status_code=500, detail="Failed to resume schedule")


# =============================================================================
# Cron Expression Helpers
# =============================================================================

@router.get("/cron/presets")
async def get_cron_presets() -> List[Dict[str, str]]:
    """Get common cron expression presets."""
    return [
        {"name": "Every hour", "expression": "0 * * * *"},
        {"name": "Every 6 hours", "expression": "0 */6 * * *"},
        {"name": "Daily at midnight", "expression": "0 0 * * *"},
        {"name": "Daily at 3 AM", "expression": "0 3 * * *"},
        {"name": "Daily at 6 AM", "expression": "0 6 * * *"},
        {"name": "Weekly (Sunday midnight)", "expression": "0 0 * * 0"},
        {"name": "Weekly (Monday 3 AM)", "expression": "0 3 * * 1"},
        {"name": "Monthly (1st at midnight)", "expression": "0 0 1 * *"},
        {"name": "Every 15 minutes", "expression": "*/15 * * * *"},
        {"name": "Every 30 minutes", "expression": "*/30 * * * *"},
    ]


@router.post("/cron/validate")
async def validate_cron(data: Dict[str, str]) -> Dict[str, Any]:
    """Validate a cron expression and show next runs."""
    expression = data.get("expression", "")

    try:
        from apscheduler.triggers.cron import CronTrigger
        from datetime import datetime

        trigger = CronTrigger.from_crontab(expression)

        # Get next 5 run times
        next_runs = []
        current = datetime.now()
        for _ in range(5):
            next_run = trigger.get_next_fire_time(None, current)
            if next_run:
                next_runs.append(next_run.isoformat())
                current = next_run

        return {
            "valid": True,
            "next_runs": next_runs,
        }
    except Exception as e:
        return {
            "valid": False,
            "error": str(e),
        }
