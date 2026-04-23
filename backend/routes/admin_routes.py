from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import JSONResponse, FileResponse
from datetime import datetime, timezone
from pathlib import Path
import uuid
import json
import asyncio
import logging

from database import db
from auth import get_current_user, validate_entry_date
from activity_logger import log_activity

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

ROOT_DIR = Path(__file__).parent.parent
BACKUP_DIR = ROOT_DIR / "backups"
BACKUP_DIR.mkdir(exist_ok=True)


# ============ RESET ALL DATA ============

@router.post("/admin/reset-data")
async def reset_all_data(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can reset data")
    if body.get("confirm") != "RESET ALL DATA":
        raise HTTPException(status_code=400, detail="Confirmation text does not match")
    admin_user = await db.users.find_one({"username": "admin"}, {"_id": 0})
    collections = await db.list_collection_names()
    dropped = []
    for col in collections:
        if col != "users":
            await db[col].drop()
            dropped.append(col)
    await db.users.delete_many({"username": {"$ne": "admin"}})
    await log_activity(current_user['username'], "reset_data", "admin", f"All data reset. Dropped: {', '.join(dropped)}")
    return {"message": "All data has been reset", "dropped_collections": dropped, "admin_preserved": True}


# ============ INITIAL STOCK ============

@router.get("/initial-stocks")
async def get_initial_stocks(current_user: dict = Depends(get_current_user)):
    stocks = await db.initial_stocks.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return stocks


@router.post("/initial-stocks")
async def create_initial_stock(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can set initial stocks")
    stock_type = body.get("type")
    name = body.get("name")
    quantity = float(body.get("quantity", 0))
    date = body.get("date")
    unit = body.get("unit", "")
    if not stock_type or not name or not date or quantity <= 0:
        raise HTTPException(status_code=400, detail="Type, name, date and quantity (>0) are required")
    existing = await db.initial_stocks.find_one({"type": stock_type, "name": name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"Initial stock for {name} already exists. Use edit to update.")
    stock_id = str(uuid.uuid4())
    doc = {
        "id": stock_id, "type": stock_type, "name": name, "quantity": quantity,
        "date": date, "unit": unit, "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.initial_stocks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/initial-stocks/{stock_id}")
async def update_initial_stock(stock_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can update initial stocks")
    existing = await db.initial_stocks.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Initial stock entry not found")
    update_fields = {}
    if "quantity" in body:
        update_fields["quantity"] = float(body["quantity"])
    if "date" in body:
        update_fields["date"] = body["date"]
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.initial_stocks.update_one({"id": stock_id}, {"$set": update_fields})
    updated = await db.initial_stocks.find_one({"id": stock_id}, {"_id": 0})
    return updated


@router.delete("/initial-stocks/{stock_id}")
async def delete_initial_stock(stock_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete initial stocks")
    result = await db.initial_stocks.delete_one({"id": stock_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Initial stock entry not found")
    return {"message": "Initial stock deleted"}


# ============ SETTINGS / LOCK DATE ============

@router.get("/settings/lock-date")
async def get_lock_date(current_user: dict = Depends(get_current_user)):
    settings = await db.settings.find_one({"key": "lock_date"}, {"_id": 0})
    return {"lock_date": settings.get("value", "") if settings else ""}


@router.put("/settings/lock-date")
async def set_lock_date(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can set lock date")
    lock_date = body.get("lock_date", "")
    await db.settings.update_one(
        {"key": "lock_date"},
        {"$set": {"key": "lock_date", "value": lock_date}},
        upsert=True
    )
    await log_activity(current_user['username'], "updated", "admin", f"Lock date {'set to ' + lock_date if lock_date else 'cleared'}")
    return {"message": f"Lock date set to {lock_date}" if lock_date else "Lock date cleared", "lock_date": lock_date}


# ============ BACKUP / RESTORE ============

@router.get("/backup/download")
async def download_backup(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can download backups")
    collections = await db.list_collection_names()
    backup = {"_backup_meta": {"created_at": datetime.now(timezone.utc).isoformat(), "created_by": current_user['username']}}
    for col_name in collections:
        docs = await db[col_name].find({}, {"_id": 0}).to_list(100000)
        backup[col_name] = docs
    return JSONResponse(content=backup)


@router.post("/backup/restore")
async def restore_backup(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can restore backups")
    try:
        content = await file.read()
        backup = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid backup file")
    restored = []
    for col_name, docs in backup.items():
        if col_name.startswith("_") or not isinstance(docs, list):
            continue
        await db[col_name].delete_many({})
        if docs:
            await db[col_name].insert_many(docs)
        restored.append(f"{col_name}: {len(docs)} records")
    return {"message": "Backup restored successfully", "collections": restored}


# ============ SCHEDULED BACKUP ============

async def run_scheduled_backup():
    """Perform a daily backup and save to disk"""
    try:
        collections = await db.list_collection_names()
        backup = {"_backup_meta": {"created_at": datetime.now(timezone.utc).isoformat(), "type": "scheduled"}}
        for col_name in collections:
            docs = await db[col_name].find({}, {"_id": 0}).to_list(100000)
            backup[col_name] = docs
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"backup_{timestamp}.json"
        filepath = BACKUP_DIR / filename
        with open(filepath, "w") as f:
            json.dump(backup, f, default=str)
        await db.backup_history.insert_one({
            "id": str(uuid.uuid4()), "filename": filename,
            "size_bytes": filepath.stat().st_size, "type": "scheduled",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        all_backups = sorted(BACKUP_DIR.glob("backup_*.json"), key=lambda p: p.stat().st_mtime)
        if len(all_backups) > 30:
            for old_file in all_backups[:-30]:
                old_file.unlink()
            keep_filenames = [f.name for f in all_backups[-30:]]
            await db.backup_history.delete_many({"filename": {"$nin": keep_filenames}})
        logger.info(f"Scheduled backup completed: {filename} ({filepath.stat().st_size} bytes)")
    except Exception as e:
        logger.error(f"Scheduled backup failed: {e}")


async def backup_scheduler():
    """Run backup every 24 hours"""
    while True:
        await asyncio.sleep(86400)
        await run_scheduled_backup()


@router.get("/backup/history")
async def get_backup_history(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can view backup history")
    backups = await db.backup_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return backups


@router.post("/backup/run-now")
async def run_backup_now(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can trigger backups")
    await run_scheduled_backup()
    return {"message": "Backup completed successfully"}


@router.get("/backup/download/{filename}")
async def download_backup_file(filename: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can download backups")
    filepath = BACKUP_DIR / filename
    if not filepath.exists() or not filepath.name.startswith("backup_"):
        raise HTTPException(status_code=404, detail="Backup file not found")
    return FileResponse(path=str(filepath), filename=filename, media_type="application/json")


@router.delete("/backup/{backup_id}")
async def delete_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete backups")
    backup = await db.backup_history.find_one({"id": backup_id}, {"_id": 0})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    filepath = BACKUP_DIR / backup['filename']
    if filepath.exists():
        filepath.unlink()
    await db.backup_history.delete_one({"id": backup_id})
    return {"message": "Backup deleted"}



# ============ TRANSACTION LOGS (for admin monitoring) ============

@router.get("/transaction-logs")
async def get_transaction_logs(
    limit: int = 50,
    status: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Get recent transaction logs for monitoring atomicity"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can view transaction logs")
    
    query = {}
    if status:
        query['status'] = status
    
    logs = await db.transaction_logs.find(query, {"_id": 0}).sort("logged_at", -1).limit(limit).to_list(limit)
    
    # Ensure logged_at has UTC indicator for correct frontend display
    for log in logs:
        if log.get('logged_at'):
            ts = log['logged_at']
            if hasattr(ts, 'isoformat'):
                log['logged_at'] = ts.isoformat() + ('Z' if not str(ts).endswith('+00:00') else '')
    
    # Add summary stats
    total = await db.transaction_logs.count_documents({})
    failed = await db.transaction_logs.count_documents({"status": "failed"})
    rolled_back = await db.transaction_logs.count_documents({"status": "rolled_back"})
    
    return {
        "logs": logs,
        "summary": {
            "total": total,
            "failed": failed,
            "rolled_back": rolled_back
        }
    }


@router.delete("/transaction-logs/cleanup")
async def cleanup_transaction_logs(days: int = 30, current_user: dict = Depends(get_current_user)):
    """Delete old completed transaction logs"""
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can cleanup logs")
    
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    
    result = await db.transaction_logs.delete_many({
        "status": "completed",
        "logged_at": {"$lt": cutoff}
    })
    
    return {"deleted": result.deleted_count, "cutoff_date": cutoff.isoformat()}
