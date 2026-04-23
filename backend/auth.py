from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import os

from database import db

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str, username: str, role: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        'user_id': user_id,
        'username': username,
        'role': role,
        'exp': expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload.get('user_id')}, {"_id": 0})
        if user and not user.get('is_active', True):
            raise HTTPException(status_code=401, detail="Account disabled")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def validate_entry_date(entry_date: str, current_user: dict):
    """Validate entry date: no future dates, respect lock date for non-admins"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if entry_date > today:
        raise HTTPException(status_code=400, detail="Future dates are not allowed")
    if current_user['role'] != 'admin':
        settings = await db.settings.find_one({"key": "lock_date"}, {"_id": 0})
        if settings and settings.get("value") and entry_date <= settings["value"]:
            raise HTTPException(status_code=403, detail=f"Entries on or before {settings['value']} are locked by admin")
