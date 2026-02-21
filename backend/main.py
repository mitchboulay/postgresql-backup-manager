"""
HostHive Backup Manager - API Server
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import backups, config, logs, health, schedules, restore
from services.scheduler_service import SchedulerService
from db.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Initialize database
    init_db()

    # Start scheduler
    scheduler = SchedulerService()
    scheduler.start()
    app.state.scheduler = scheduler

    yield

    # Shutdown scheduler
    scheduler.shutdown()


app = FastAPI(
    title="HostHive Backup Manager",
    description="PostgreSQL backup management with encryption and S3 sync",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api/health", tags=["Health"])
app.include_router(config.router, prefix="/api/config", tags=["Configuration"])
app.include_router(backups.router, prefix="/api/backups", tags=["Backups"])
app.include_router(schedules.router, prefix="/api/schedules", tags=["Schedules"])
app.include_router(logs.router, prefix="/api/logs", tags=["Logs"])
app.include_router(restore.router, prefix="/api", tags=["Restore"])


@app.get("/")
async def root():
    return {"name": "HostHive Backup Manager", "status": "running"}
