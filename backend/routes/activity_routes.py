from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/activity-logs")
async def get_activity_logs(
    username: Optional[str] = None,
    category: Optional[str] = None,
    action: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = 200,
    current_user: dict = Depends(get_current_user)
):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can view activity logs")
    query = {}
    if username:
        query["username"] = username
    if category:
        query["category"] = category
    if action:
        query["action"] = action
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date + "T23:59:59"

    logs = await db.activity_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs


@router.get("/activity-logs/categories")
async def get_activity_categories(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can view activity logs")
    categories = await db.activity_logs.distinct("category")
    usernames = await db.activity_logs.distinct("username")
    actions = await db.activity_logs.distinct("action")
    return {"categories": sorted(categories), "usernames": sorted(usernames), "actions": sorted(actions)}
