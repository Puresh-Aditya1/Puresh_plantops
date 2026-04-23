from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, hash_password, verify_password, create_token
from models import UserCreate, UserResponse, LoginRequest, LoginResponse
from activity_logger import log_activity

router = APIRouter(prefix="/api")


@router.post("/auth/register", response_model=UserResponse)
async def register(user: UserCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can create users")
    existing = await db.users.find_one({"username": user.username}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "username": user.username,
        "password_hash": hash_password(user.password),
        "role": user.role,
        "full_name": user.full_name,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    return UserResponse(
        id=user_id, username=user.username, role=user.role,
        full_name=user.full_name, created_at=user_doc['created_at']
    )


@router.post("/auth/login", response_model=LoginResponse)
async def login(login_req: LoginRequest):
    user = await db.users.find_one({"username": login_req.username}, {"_id": 0})
    if not user or not verify_password(login_req.password, user['password_hash']):
        await log_activity(login_req.username, "login_failed", "auth", "Failed login attempt")
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.get('is_active', True):
        await log_activity(login_req.username, "login_blocked", "auth", "Disabled account login attempt")
        raise HTTPException(status_code=403, detail="Account disabled. Contact admin.")
    token = create_token(user['id'], user['username'], user['role'])
    await log_activity(user['username'], "login", "auth", f"User logged in")
    return LoginResponse(
        token=token,
        user=UserResponse(
            id=user['id'], username=user['username'], role=user['role'],
            full_name=user.get('full_name'), created_at=user['created_at']
        )
    )


@router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can view users")
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(10000)
    return users


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can update users")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    update_fields = {}
    if body.get("username") and body["username"] != existing["username"]:
        dup = await db.users.find_one({"username": body["username"], "id": {"$ne": user_id}}, {"_id": 0})
        if dup:
            raise HTTPException(status_code=400, detail="Username already exists")
        update_fields["username"] = body["username"]
    if body.get("password"):
        update_fields["password_hash"] = hash_password(body["password"])
    if "full_name" in body:
        update_fields["full_name"] = body["full_name"]
    if body.get("role") and existing["username"] != "admin":
        update_fields["role"] = body["role"]
    if not update_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    await db.users.update_one({"id": user_id}, {"$set": update_fields})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    await log_activity(current_user['username'], "updated", "user", f"Updated user '{existing['username']}'", user_id, "user")
    return updated


@router.put("/users/{user_id}/toggle-status")
async def toggle_user_status(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can toggle user status")
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    if existing.get('username') == 'admin':
        raise HTTPException(status_code=400, detail="Cannot disable the admin account")
    new_status = not existing.get('is_active', True)
    await db.users.update_one({"id": user_id}, {"$set": {"is_active": new_status}})
    updated = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    status_word = "enabled" if new_status else "disabled"
    await log_activity(current_user['username'], status_word, "user", f"User '{existing['username']}' {status_word}", user_id, "user")
    return updated


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete users")
    result = await db.users.delete_one({"id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await log_activity(current_user['username'], "deleted", "user", f"Deleted user", user_id, "user")
    return {"message": "User deleted successfully"}
