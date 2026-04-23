from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import (
    FinishedProductReceiveCreate, FinishedProductReceiveResponse,
    FinishedProductRepackCreate, FinishedProductRepackResponse,
    FinishedProductWastageCreate, FinishedProductWastageResponse
)
from activity_logger import log_activity

router = APIRouter(prefix="/api")


# ============ FINISHED PRODUCT RECEIVE ROUTES ============

@router.post("/finished-product-receive", response_model=FinishedProductReceiveResponse)
async def create_finished_product_receive(entry: FinishedProductReceiveCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create receive entries")
    await validate_entry_date(entry.receive_date, current_user)
    finished_master = await db.finished_product_masters.find_one({"sku_name": entry.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {entry.sku}")
    receive_id = str(uuid.uuid4())
    total_cost = round(entry.quantity * (entry.cost_per_unit or 0), 2)
    receive_doc = {
        "id": receive_id, "sku": entry.sku, "quantity": entry.quantity,
        "unit": finished_master['uom'], "source_name": entry.source_name,
        "cost_per_unit": entry.cost_per_unit or 0, "total_cost": total_cost,
        "date": entry.receive_date, "notes": entry.notes or "",
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_product_receives.insert_one(receive_doc)
    fp_doc = {
        "id": str(uuid.uuid4()), "semi_finished_id": "", "batch_id": "",
        "batch_number": "", "sku": entry.sku, "quantity": entry.quantity,
        "quantity_wasted": 0, "unit": finished_master['uom'],
        "current_stock": entry.quantity, "source": "receive",
        "source_receive_id": receive_id, "date": entry.receive_date,
        "notes": entry.notes or "", "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_products.insert_one(fp_doc)
    await log_activity(current_user['username'], "created", "receive", f"Received {entry.quantity} {entry.sku} from {entry.source_name}", receive_id, "receive")
    return FinishedProductReceiveResponse(**receive_doc)


@router.get("/finished-product-receives")
async def get_finished_product_receives(current_user: dict = Depends(get_current_user)):
    receives = await db.finished_product_receives.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return receives


@router.put("/finished-product-receive/{receive_id}", response_model=FinishedProductReceiveResponse)
async def update_finished_product_receive(receive_id: str, entry: FinishedProductReceiveCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update receive entries")
    await validate_entry_date(entry.receive_date, current_user)
    existing = await db.finished_product_receives.find_one({"id": receive_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Receive entry not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be edited. They are system-generated.")
    
    finished_master = await db.finished_product_masters.find_one({"sku_name": entry.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {entry.sku}")
    total_cost = round(entry.quantity * (entry.cost_per_unit or 0), 2)
    update_doc = {
        "sku": entry.sku, "quantity": entry.quantity, "unit": finished_master['uom'],
        "source_name": entry.source_name, "cost_per_unit": entry.cost_per_unit or 0,
        "total_cost": total_cost, "date": entry.receive_date, "notes": entry.notes or ""
    }
    await db.finished_product_receives.update_one({"id": receive_id}, {"$set": update_doc})
    await db.finished_products.update_many({"source_receive_id": receive_id}, {"$set": {
        "sku": entry.sku, "quantity": entry.quantity, "current_stock": entry.quantity,
        "unit": finished_master['uom'], "date": entry.receive_date, "notes": entry.notes or ""
    }})
    updated = await db.finished_product_receives.find_one({"id": receive_id}, {"_id": 0})
    return FinishedProductReceiveResponse(**updated)


@router.delete("/finished-product-receive/{receive_id}")
async def delete_finished_product_receive(receive_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete receive entries")
    existing = await db.finished_product_receives.find_one({"id": receive_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Receive entry not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be deleted. They are system-generated.")
    
    await db.finished_products.delete_many({"source_receive_id": receive_id})
    await db.finished_product_receives.delete_one({"id": receive_id})
    return {"message": "Receive entry deleted successfully"}


# ============ FINISHED PRODUCT REPACK ROUTES ============

@router.post("/finished-product-repack", response_model=FinishedProductRepackResponse)
async def create_finished_product_repack(entry: FinishedProductRepackCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create repack entries")
    await validate_entry_date(entry.repack_date, current_user)
    source_master = await db.finished_product_masters.find_one({"sku_name": entry.source_sku}, {"_id": 0})
    if not source_master:
        raise HTTPException(status_code=404, detail=f"Source SKU {entry.source_sku} not found in master")
    target_master = await db.finished_product_masters.find_one({"sku_name": entry.target_sku}, {"_id": 0})
    if not target_master:
        raise HTTPException(status_code=404, detail=f"Target SKU {entry.target_sku} not found in master")
    source_records = await db.finished_products.find(
        {"sku": entry.source_sku, "current_stock": {"$gt": 0}}, {"_id": 0}
    ).sort("created_at", 1).to_list(10000)
    total_available = sum(r['current_stock'] for r in source_records)
    total_needed = entry.quantity_used
    if total_available < total_needed:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {entry.source_sku}. Available: {round(total_available, 2)}, Required: {round(total_needed, 2)}")
    remaining = total_needed
    for record in source_records:
        if remaining <= 0:
            break
        deduct = min(record['current_stock'], remaining)
        await db.finished_products.update_one(
            {"id": record['id']},
            {"$set": {"current_stock": round(record['current_stock'] - deduct, 4)}}
        )
        remaining -= deduct
    mm = entry.repack_date[5:7]
    yy = entry.repack_date[2:4]
    dd = entry.repack_date[8:10]
    date_prefix = f"R-{mm}{yy}{dd}"
    existing_count = await db.finished_product_repacks.count_documents({"date": entry.repack_date})
    letter = chr(65 + existing_count)
    repack_batch_number = f"{date_prefix}{letter}"
    repack_id = str(uuid.uuid4())
    repack_doc = {
        "id": repack_id, "repack_batch_number": repack_batch_number,
        "source_sku": entry.source_sku, "target_sku": entry.target_sku,
        "quantity_used": entry.quantity_used, "quantity_produced": entry.quantity_produced,
        "quantity_wasted": entry.quantity_wasted, "date": entry.repack_date,
        "notes": entry.notes or "", "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_product_repacks.insert_one(repack_doc)
    fp_doc = {
        "id": str(uuid.uuid4()), "semi_finished_id": "", "batch_id": "",
        "batch_number": repack_batch_number, "sku": entry.target_sku,
        "quantity": entry.quantity_produced, "quantity_wasted": entry.quantity_wasted,
        "unit": target_master['uom'], "current_stock": entry.quantity_produced,
        "source": "repack", "source_repack_id": repack_id,
        "date": entry.repack_date, "notes": entry.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_products.insert_one(fp_doc)
    await log_activity(current_user['username'], "created", "repack", f"Repack {repack_batch_number}: {entry.source_sku} -> {entry.target_sku}", repack_id, "repack")
    return FinishedProductRepackResponse(**repack_doc)


@router.get("/finished-product-repacks")
async def get_finished_product_repacks(current_user: dict = Depends(get_current_user)):
    repacks = await db.finished_product_repacks.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return repacks


@router.put("/finished-product-repack/{repack_id}", response_model=FinishedProductRepackResponse)
async def update_finished_product_repack(repack_id: str, entry: FinishedProductRepackCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update repack entries")
    await validate_entry_date(entry.repack_date, current_user)
    existing = await db.finished_product_repacks.find_one({"id": repack_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Repack entry not found")
    old_restore = existing['quantity_used']
    source_records = await db.finished_products.find({"sku": existing['source_sku']}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    for record in source_records:
        if old_restore <= 0:
            break
        can_restore = min(old_restore, record['quantity'] - record['current_stock'])
        if can_restore > 0:
            await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": can_restore}})
            old_restore -= can_restore
    await db.finished_products.delete_many({"source_repack_id": repack_id})
    source_master = await db.finished_product_masters.find_one({"sku_name": entry.source_sku}, {"_id": 0})
    if not source_master:
        raise HTTPException(status_code=404, detail=f"Source SKU {entry.source_sku} not found")
    target_master = await db.finished_product_masters.find_one({"sku_name": entry.target_sku}, {"_id": 0})
    if not target_master:
        raise HTTPException(status_code=404, detail=f"Target SKU {entry.target_sku} not found")
    new_source_records = await db.finished_products.find({"sku": entry.source_sku, "current_stock": {"$gt": 0}}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    total_available = sum(r['current_stock'] for r in new_source_records)
    if total_available < entry.quantity_used:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {entry.source_sku}. Available: {round(total_available, 2)}, Required: {entry.quantity_used}")
    remaining = entry.quantity_used
    for record in new_source_records:
        if remaining <= 0:
            break
        deduct = min(record['current_stock'], remaining)
        await db.finished_products.update_one({"id": record['id']}, {"$set": {"current_stock": round(record['current_stock'] - deduct, 4)}})
        remaining -= deduct
    update_doc = {
        "source_sku": entry.source_sku, "target_sku": entry.target_sku,
        "quantity_used": entry.quantity_used, "quantity_produced": entry.quantity_produced,
        "quantity_wasted": entry.quantity_wasted, "date": entry.repack_date, "notes": entry.notes or ""
    }
    await db.finished_product_repacks.update_one({"id": repack_id}, {"$set": update_doc})
    fp_doc = {
        "id": str(uuid.uuid4()), "semi_finished_id": "", "batch_id": "",
        "batch_number": existing['repack_batch_number'], "sku": entry.target_sku,
        "quantity": entry.quantity_produced, "quantity_wasted": entry.quantity_wasted,
        "unit": target_master['uom'], "current_stock": entry.quantity_produced,
        "source": "repack", "source_repack_id": repack_id,
        "date": entry.repack_date, "notes": entry.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_products.insert_one(fp_doc)
    updated = await db.finished_product_repacks.find_one({"id": repack_id}, {"_id": 0})
    return FinishedProductRepackResponse(**updated)


@router.delete("/finished-product-repack/{repack_id}")
async def delete_finished_product_repack(repack_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete repack entries")
    existing = await db.finished_product_repacks.find_one({"id": repack_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Repack entry not found")
    source_records = await db.finished_products.find({"sku": existing['source_sku']}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    restore_qty = existing['quantity_used']
    for record in source_records:
        if restore_qty <= 0:
            break
        can_restore = min(restore_qty, record['quantity'] - record['current_stock'])
        if can_restore > 0:
            await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": can_restore}})
            restore_qty -= can_restore
    await db.finished_products.delete_many({"source_repack_id": repack_id})
    await db.finished_product_repacks.delete_one({"id": repack_id})
    return {"message": "Repack entry deleted successfully"}


# ============ FINISHED PRODUCT BOOK WASTAGE ROUTES ============

@router.post("/finished-product-wastage", response_model=FinishedProductWastageResponse)
async def create_finished_product_wastage(entry: FinishedProductWastageCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot book wastage")
    await validate_entry_date(entry.wastage_date, current_user)
    finished_master = await db.finished_product_masters.find_one({"sku_name": entry.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {entry.sku}")
    records = await db.finished_products.find(
        {"sku": entry.sku, "current_stock": {"$gt": 0}}, {"_id": 0}
    ).sort("created_at", 1).to_list(10000)
    total_available = sum(r['current_stock'] for r in records)
    if total_available < entry.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {entry.sku}. Available: {round(total_available, 2)}, Required: {entry.quantity}")
    remaining = entry.quantity
    for record in records:
        if remaining <= 0:
            break
        deduct = min(record['current_stock'], remaining)
        await db.finished_products.update_one(
            {"id": record['id']},
            {"$set": {"current_stock": round(record['current_stock'] - deduct, 4)}}
        )
        remaining -= deduct
    wastage_id = str(uuid.uuid4())
    wastage_doc = {
        "id": wastage_id, "sku": entry.sku, "quantity": entry.quantity,
        "unit": finished_master['uom'], "reason": entry.reason,
        "date": entry.wastage_date, "notes": entry.notes or "",
        "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_product_wastages.insert_one(wastage_doc)
    await log_activity(current_user['username'], "created", "wastage", f"Wastage {entry.quantity} {entry.sku}: {entry.reason}", wastage_id, "wastage")
    return FinishedProductWastageResponse(**wastage_doc)


@router.get("/finished-product-wastages")
async def get_finished_product_wastages(current_user: dict = Depends(get_current_user)):
    wastages = await db.finished_product_wastages.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return wastages


@router.put("/finished-product-wastage/{wastage_id}", response_model=FinishedProductWastageResponse)
async def update_finished_product_wastage(wastage_id: str, entry: FinishedProductWastageCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update wastage entries")
    await validate_entry_date(entry.wastage_date, current_user)
    existing = await db.finished_product_wastages.find_one({"id": wastage_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Wastage entry not found")
    finished_master = await db.finished_product_masters.find_one({"sku_name": entry.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {entry.sku}")
    old_records = await db.finished_products.find({"sku": existing['sku']}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    old_restore = existing['quantity']
    for record in old_records:
        if old_restore <= 0:
            break
        can_restore = min(old_restore, record['quantity'] - record['current_stock'])
        if can_restore > 0:
            await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": can_restore}})
            old_restore -= can_restore
    new_records = await db.finished_products.find({"sku": entry.sku, "current_stock": {"$gt": 0}}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    total_available = sum(r['current_stock'] for r in new_records)
    if total_available < entry.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock for {entry.sku}. Available: {round(total_available, 2)}, Required: {entry.quantity}")
    remaining = entry.quantity
    for record in new_records:
        if remaining <= 0:
            break
        deduct = min(record['current_stock'], remaining)
        await db.finished_products.update_one({"id": record['id']}, {"$set": {"current_stock": round(record['current_stock'] - deduct, 4)}})
        remaining -= deduct
    update_doc = {
        "sku": entry.sku, "quantity": entry.quantity, "unit": finished_master['uom'],
        "reason": entry.reason, "date": entry.wastage_date, "notes": entry.notes or ""
    }
    await db.finished_product_wastages.update_one({"id": wastage_id}, {"$set": update_doc})
    updated = await db.finished_product_wastages.find_one({"id": wastage_id}, {"_id": 0})
    return FinishedProductWastageResponse(**updated)


@router.delete("/finished-product-wastage/{wastage_id}")
async def delete_finished_product_wastage(wastage_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete wastage entries")
    existing = await db.finished_product_wastages.find_one({"id": wastage_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Wastage entry not found")
    records = await db.finished_products.find({"sku": existing['sku']}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    restore_qty = existing['quantity']
    for record in records:
        if restore_qty <= 0:
            break
        can_restore = min(restore_qty, record['quantity'] - record['current_stock'])
        if can_restore > 0:
            await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": can_restore}})
            restore_qty -= can_restore
    await db.finished_product_wastages.delete_one({"id": wastage_id})
    return {"message": "Wastage entry deleted successfully"}
