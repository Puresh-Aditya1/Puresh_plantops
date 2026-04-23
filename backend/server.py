from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import asyncio
import logging

from database import db
from auth import hash_password

# Import all route modules
from routes.auth_routes import router as auth_router
from routes.admin_routes import router as admin_router, run_scheduled_backup, backup_scheduler
from routes.batch_routes import router as batch_router
from routes.semi_finished_routes import router as semi_finished_router
from routes.finished_product_routes import router as finished_product_router
from routes.dispatch_routes import router as dispatch_router
from routes.raw_material_routes import router as raw_material_router
from routes.milk_routes import router as milk_router
from routes.suppliers_silos_routes import router as suppliers_silos_router
from routes.reports_routes import router as reports_router
from routes.activity_routes import router as activity_router
from routes.archive_routes import router as archive_router, cleanup_old_activity_logs

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Puresh Daily")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(batch_router)
app.include_router(semi_finished_router)
app.include_router(finished_product_router)
app.include_router(dispatch_router)
app.include_router(raw_material_router)
app.include_router(milk_router)
app.include_router(suppliers_silos_router)
app.include_router(reports_router)
app.include_router(activity_router)
app.include_router(archive_router)


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.on_event("startup")
async def create_default_admin():
    admin = await db.users.find_one({"username": "admin"}, {"_id": 0})
    if not admin:
        admin_doc = {
            "id": "admin-default-id",
            "username": "admin",
            "password_hash": hash_password("admin123"),
            "role": "admin",
            "full_name": "System Admin",
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(admin_doc)
        logger.info("Default admin user created")


@app.on_event("startup")
async def start_backup_scheduler():
    asyncio.create_task(run_scheduled_backup())
    asyncio.create_task(backup_scheduler())


@app.on_event("startup")
async def start_activity_log_cleanup():
    """Run activity log cleanup on startup and daily"""
    async def daily_cleanup():
        while True:
            try:
                deleted = await cleanup_old_activity_logs()
                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} old activity logs")
            except Exception as e:
                logger.error(f"Activity log cleanup failed: {e}")
            # Wait 24 hours
            await asyncio.sleep(86400)
    
    # Initial cleanup
    try:
        deleted = await cleanup_old_activity_logs()
        if deleted > 0:
            logger.info(f"Initial cleanup: removed {deleted} old activity logs")
    except Exception as e:
        logger.error(f"Initial activity log cleanup failed: {e}")
    
    # Schedule daily cleanup
    asyncio.create_task(daily_cleanup())


@app.on_event("shutdown")
async def shutdown_db_client():
    from database import client
    client.close()
