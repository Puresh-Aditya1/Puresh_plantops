from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import (
    MilkStockEntry, MilkStockResponse,
    MilkWastageEntry, MilkWastageResponse,
    MilkAdjustmentEntry, MilkAdjustmentResponse
)
from activity_logger import log_activity

router = APIRouter(prefix="/api")


# ============ MILK STOCK ROUTES ============

@router.post("/milk-stock", response_model=MilkStockResponse)
async def create_milk_stock(entry: MilkStockEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create entries")
    await validate_entry_date(entry.date, current_user)
    stock_id = str(uuid.uuid4())
    fat_kg = round(entry.fat_percent * entry.quantity_kg / 100, 4)
    snf_kg = round(entry.snf_percent * entry.quantity_kg / 100, 4)
    doc = {
        "id": stock_id, "date": entry.date, "quantity_kg": entry.quantity_kg,
        "fat_percent": entry.fat_percent, "snf_percent": entry.snf_percent,
        "fat_kg": fat_kg, "snf_kg": snf_kg, "supplier": entry.supplier or "",
        "notes": entry.notes, "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.milk_stock.insert_one(doc)
    await log_activity(current_user['username'], "created", "milk", f"Milk stock: {entry.quantity_kg} kg (Fat {entry.fat_percent}%, SNF {entry.snf_percent}%)", stock_id, "milk_stock")
    return MilkStockResponse(**doc)


@router.get("/milk-stock", response_model=List[MilkStockResponse])
async def get_milk_stock(
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    entries = await db.milk_stock.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return entries


@router.put("/milk-stock/{stock_id}", response_model=MilkStockResponse)
async def update_milk_stock(stock_id: str, entry: MilkStockEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update entries")
    await validate_entry_date(entry.date, current_user)
    existing = await db.milk_stock.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk stock entry not found")
    fat_kg = round(entry.fat_percent * entry.quantity_kg / 100, 4)
    snf_kg = round(entry.snf_percent * entry.quantity_kg / 100, 4)
    update_doc = {
        "date": entry.date, "quantity_kg": entry.quantity_kg,
        "fat_percent": entry.fat_percent, "snf_percent": entry.snf_percent,
        "fat_kg": fat_kg, "snf_kg": snf_kg, "supplier": entry.supplier or "",
        "notes": entry.notes
    }
    await db.milk_stock.update_one({"id": stock_id}, {"$set": update_doc})
    updated = await db.milk_stock.find_one({"id": stock_id}, {"_id": 0})
    return MilkStockResponse(**updated)


@router.delete("/milk-stock/{stock_id}")
async def delete_milk_stock(stock_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete entries")
    existing = await db.milk_stock.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk stock entry not found")
    await db.milk_stock.delete_one({"id": stock_id})
    return {"message": "Deleted successfully"}


# ============ MILK WASTAGE ROUTES ============

@router.post("/milk-wastage", response_model=MilkWastageResponse)
async def create_milk_wastage(entry: MilkWastageEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create entries")
    wastage_id = str(uuid.uuid4())
    doc = {
        "id": wastage_id, "date": entry.date, "quantity_kg": entry.quantity_kg,
        "fat_kg": entry.fat_kg, "snf_kg": entry.snf_kg, "notes": entry.notes,
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.milk_wastage.insert_one(doc)
    return MilkWastageResponse(**doc)


@router.get("/milk-wastage", response_model=List[MilkWastageResponse])
async def get_milk_wastage(current_user: dict = Depends(get_current_user)):
    entries = await db.milk_wastage.find({}, {"_id": 0}).sort("date", -1).to_list(10000)
    return entries


@router.put("/milk-wastage/{wastage_id}", response_model=MilkWastageResponse)
async def update_milk_wastage(wastage_id: str, entry: MilkWastageEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update entries")
    existing = await db.milk_wastage.find_one({"id": wastage_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk wastage entry not found")
    update_doc = {
        "date": entry.date, "quantity_kg": entry.quantity_kg,
        "fat_kg": entry.fat_kg, "snf_kg": entry.snf_kg, "notes": entry.notes
    }
    await db.milk_wastage.update_one({"id": wastage_id}, {"$set": update_doc})
    updated = await db.milk_wastage.find_one({"id": wastage_id}, {"_id": 0})
    return MilkWastageResponse(**updated)


@router.delete("/milk-wastage/{wastage_id}")
async def delete_milk_wastage(wastage_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete entries")
    existing = await db.milk_wastage.find_one({"id": wastage_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk wastage entry not found")
    await db.milk_wastage.delete_one({"id": wastage_id})
    return {"message": "Deleted successfully"}


# ============ MILK ADJUSTMENT ROUTES ============

@router.post("/milk-adjustment", response_model=MilkAdjustmentResponse)
async def create_milk_adjustment(entry: MilkAdjustmentEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create entries")
    await validate_entry_date(entry.date, current_user)
    if entry.type not in ("gain", "loss"):
        raise HTTPException(status_code=400, detail="Type must be 'gain' or 'loss'")
    if entry.quantity_kg == 0 and entry.fat_kg == 0 and entry.snf_kg == 0:
        raise HTTPException(status_code=400, detail="At least one value must be greater than 0")
    doc = {
        "id": str(uuid.uuid4()), "date": entry.date, "type": entry.type,
        "quantity_kg": abs(entry.quantity_kg), "fat_kg": abs(entry.fat_kg),
        "snf_kg": abs(entry.snf_kg), "notes": entry.notes,
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.milk_adjustments.insert_one(doc)
    return MilkAdjustmentResponse(**doc)


@router.get("/milk-adjustment", response_model=List[MilkAdjustmentResponse])
async def get_milk_adjustments(
    start_date: str = None,
    end_date: str = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    entries = await db.milk_adjustments.find(query, {"_id": 0}).sort("date", -1).to_list(10000)
    return entries


@router.put("/milk-adjustment/{adj_id}", response_model=MilkAdjustmentResponse)
async def update_milk_adjustment(adj_id: str, entry: MilkAdjustmentEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update entries")
    await validate_entry_date(entry.date, current_user)
    if entry.type not in ("gain", "loss"):
        raise HTTPException(status_code=400, detail="Type must be 'gain' or 'loss'")
    existing = await db.milk_adjustments.find_one({"id": adj_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk adjustment entry not found")
    update_doc = {
        "date": entry.date, "type": entry.type,
        "quantity_kg": abs(entry.quantity_kg), "fat_kg": abs(entry.fat_kg),
        "snf_kg": abs(entry.snf_kg), "notes": entry.notes
    }
    await db.milk_adjustments.update_one({"id": adj_id}, {"$set": update_doc})
    updated = await db.milk_adjustments.find_one({"id": adj_id}, {"_id": 0})
    return MilkAdjustmentResponse(**updated)


@router.delete("/milk-adjustment/{adj_id}")
async def delete_milk_adjustment(adj_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete entries")
    existing = await db.milk_adjustments.find_one({"id": adj_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Milk adjustment entry not found")
    await db.milk_adjustments.delete_one({"id": adj_id})
    return {"message": "Deleted successfully"}
