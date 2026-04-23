from datetime import datetime, timezone
from database import db


async def log_activity(
    username: str,
    action: str,
    category: str,
    details: str = "",
    entity_id: str = "",
    entity_type: str = ""
):
    """Log a user activity to the activity_logs collection.
    
    Args:
        username: Who performed the action
        action: What was done (e.g., "created", "updated", "deleted", "disabled")
        category: Module area (e.g., "batch", "dispatch", "user", "packing")
        details: Human-readable description
        entity_id: ID of the affected entity
        entity_type: Type of entity (e.g., "batch", "user", "dispatch")
    """
    doc = {
        "username": username,
        "action": action,
        "category": category,
        "details": details,
        "entity_id": entity_id,
        "entity_type": entity_type,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.activity_logs.insert_one(doc)
