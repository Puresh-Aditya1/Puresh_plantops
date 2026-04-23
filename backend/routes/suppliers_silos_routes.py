from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import (
    SemiFinishedMasterCreate, SemiFinishedMasterResponse,
    FinishedProductMasterCreate, FinishedProductMasterResponse
)

router = APIRouter(prefix="/api")


# ============ SUPPLIERS ============

@router.get("/suppliers")
async def get_suppliers(current_user: dict = Depends(get_current_user)):
    suppliers = await db.suppliers.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    return suppliers


@router.post("/suppliers")
async def create_supplier(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage suppliers")
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Supplier name is required")
    existing = await db.suppliers.find_one({"name": name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Supplier already exists")
    doc = {"id": str(uuid.uuid4()), "name": name, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.suppliers.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage suppliers")
    result = await db.suppliers.delete_one({"id": supplier_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier deleted"}


# ============ SILOS ============

@router.get("/silos")
async def get_silos(current_user: dict = Depends(get_current_user)):
    silos = await db.silos.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    return silos


@router.post("/silos")
async def create_silo(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage silos")
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Silo name is required")
    existing = await db.silos.find_one({"name": name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Silo already exists")
    doc = {"id": str(uuid.uuid4()), "name": name, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.silos.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.delete("/silos/{silo_id}")
async def delete_silo(silo_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage silos")
    result = await db.silos.delete_one({"id": silo_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Silo not found")
    return {"message": "Silo deleted"}


@router.put("/silos/{silo_id}")
async def update_silo(silo_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage silos")
    new_name = body.get("name", "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Silo name is required")
    existing = await db.silos.find_one({"id": silo_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Silo not found")
    dup = await db.silos.find_one({"name": new_name, "id": {"$ne": silo_id}}, {"_id": 0})
    if dup:
        raise HTTPException(status_code=400, detail="Silo name already exists")
    old_name = existing['name']
    await db.silos.update_one({"id": silo_id}, {"$set": {"name": new_name}})
    await db.daily_silo_entries.update_many({"silo_name": old_name}, {"$set": {"silo_name": new_name}})
    return {"message": "Silo renamed", "old_name": old_name, "new_name": new_name}


# ============ DAILY SILO ENTRY ============

async def get_system_closing_for_date(target_date: str):
    purchases = await db.milk_stock.find({}, {"_id": 0}).to_list(10000)
    batches = await db.batches.find({}, {"_id": 0}).to_list(10000)
    adjustments = await db.milk_adjustments.find({}, {"_id": 0}).to_list(10000)
    initial = await db.initial_stocks.find_one({"type": "raw_material", "name": "Milk"}, {"_id": 0})
    milk = 0; fat = 0; snf = 0
    if initial and initial['date'] <= target_date:
        milk += initial['quantity']
    for p in purchases:
        if p['date'] <= target_date:
            milk += p['quantity_kg']; fat += p['fat_kg']; snf += p['snf_kg']
    for b in batches:
        if b['date'] <= target_date:
            milk -= b.get('milk_kg', 0)
            fat -= round(b.get('fat_percent', 0) * b.get('milk_kg', 0) / 100, 4)
            snf -= round(b.get('snf_percent', 0) * b.get('milk_kg', 0) / 100, 4)
    for a in adjustments:
        if a['date'] <= target_date:
            qty = a.get('quantity_kg', 0); fk = a.get('fat_kg', 0); sk = a.get('snf_kg', 0)
            if a.get('type') == 'gain':
                milk += qty; fat += fk; snf += sk
            else:
                milk -= qty; fat -= fk; snf -= sk
    return {"milk_kg": round(milk, 2), "fat_kg": round(fat, 2), "snf_kg": round(snf, 2)}


@router.get("/daily-silo-entry")
async def get_daily_silo_entry(date: str, current_user: dict = Depends(get_current_user)):
    silos = await db.silos.find({}, {"_id": 0}).sort("name", 1).to_list(100)
    entries = await db.daily_silo_entries.find({"date": date}, {"_id": 0}).to_list(100)
    system_closing = await get_system_closing_for_date(date)
    entry_map = {e['silo_name']: e for e in entries}
    silo_data = []
    total_qty = 0; total_fat = 0; total_snf = 0
    for s in silos:
        e = entry_map.get(s['name'])
        qty = e['quantity_kg'] if e else 0
        fat_pct = e['fat_percent'] if e else 0
        snf_pct = e['snf_percent'] if e else 0
        fat_kg = round(qty * fat_pct / 100, 2) if qty else 0
        snf_kg = round(qty * snf_pct / 100, 2) if qty else 0
        total_qty += qty; total_fat += fat_kg; total_snf += snf_kg
        silo_data.append({
            "silo_name": s['name'], "quantity_kg": qty, "fat_percent": fat_pct,
            "snf_percent": snf_pct, "fat_kg": fat_kg, "snf_kg": snf_kg,
            "saved": e is not None
        })
    diff_milk = round(total_qty - system_closing['milk_kg'], 2)
    diff_fat = round(total_fat - system_closing['fat_kg'], 2)
    diff_snf = round(total_snf - system_closing['snf_kg'], 2)
    return {
        "date": date, "silos": silo_data,
        "totals": {"milk_kg": round(total_qty, 2), "fat_kg": round(total_fat, 2), "snf_kg": round(total_snf, 2)},
        "system_closing": system_closing,
        "difference": {"milk_kg": diff_milk, "fat_kg": diff_fat, "snf_kg": diff_snf},
        "is_complete": all(sd['saved'] for sd in silo_data) and len(silo_data) > 0,
        "has_error": abs(diff_milk) > 0.01 or abs(diff_fat) > 0.01 or abs(diff_snf) > 0.01
    }


@router.post("/daily-silo-entry")
async def save_daily_silo_entry(body: dict, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot save entries")
    date = body.get("date")
    entries = body.get("entries", [])
    if not date or not entries:
        raise HTTPException(status_code=400, detail="Date and entries are required")
    await validate_entry_date(date, current_user)
    for entry in entries:
        silo_name = entry.get("silo_name")
        qty = float(entry.get("quantity_kg", 0))
        fat_pct = float(entry.get("fat_percent", 0))
        snf_pct = float(entry.get("snf_percent", 0))
        existing = await db.daily_silo_entries.find_one({"date": date, "silo_name": silo_name}, {"_id": 0})
        if existing:
            await db.daily_silo_entries.update_one(
                {"date": date, "silo_name": silo_name},
                {"$set": {"quantity_kg": qty, "fat_percent": fat_pct, "snf_percent": snf_pct,
                          "updated_by": current_user['username'], "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            await db.daily_silo_entries.insert_one({
                "id": str(uuid.uuid4()), "date": date, "silo_name": silo_name,
                "quantity_kg": qty, "fat_percent": fat_pct, "snf_percent": snf_pct,
                "created_by": current_user['username'], "created_at": datetime.now(timezone.utc).isoformat()
            })
    return {"message": "Silo entries saved successfully"}


# ============ SEMI-FINISHED PRODUCT MASTER ROUTES ============

@router.post("/semi-finished-master", response_model=SemiFinishedMasterResponse)
async def create_semi_finished_master(master: SemiFinishedMasterCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create masters")
    master_id = str(uuid.uuid4())
    master_doc = {
        "id": master_id, "name": master.name, "unit": master.unit,
        "finished_sku_mappings": [m.model_dump() for m in master.finished_sku_mappings],
        "description": master.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.semi_finished_masters.insert_one(master_doc)
    return SemiFinishedMasterResponse(**master_doc)


@router.get("/semi-finished-master")
async def get_semi_finished_masters(current_user: dict = Depends(get_current_user)):
    masters = await db.semi_finished_masters.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    return masters


@router.get("/semi-finished-master/{master_id}", response_model=SemiFinishedMasterResponse)
async def get_semi_finished_master(master_id: str, current_user: dict = Depends(get_current_user)):
    master = await db.semi_finished_masters.find_one({"id": master_id}, {"_id": 0})
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    return master


@router.put("/semi-finished-master/{master_id}", response_model=SemiFinishedMasterResponse)
async def update_semi_finished_master(master_id: str, master: SemiFinishedMasterCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update masters")
    update_doc = {
        "name": master.name, "unit": master.unit,
        "finished_sku_mappings": [m.model_dump() for m in master.finished_sku_mappings],
        "description": master.description
    }
    result = await db.semi_finished_masters.update_one({"id": master_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Master not found")
    updated_master = await db.semi_finished_masters.find_one({"id": master_id}, {"_id": 0})
    return SemiFinishedMasterResponse(**updated_master)


@router.delete("/semi-finished-master/{master_id}")
async def delete_semi_finished_master(master_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete masters")
    result = await db.semi_finished_masters.delete_one({"id": master_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Master not found")
    return {"message": "Master deleted successfully"}


@router.patch("/semi-finished-master/{master_id}/toggle-status")
async def toggle_semi_finished_master_status(master_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can toggle status")
    master = await db.semi_finished_masters.find_one({"id": master_id}, {"_id": 0})
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    new_status = not master.get('is_active', True)
    await db.semi_finished_masters.update_one({"id": master_id}, {"$set": {"is_active": new_status}})
    return {"message": f"Master {'activated' if new_status else 'deactivated'} successfully", "is_active": new_status}


# ============ FINISHED PRODUCT MASTER ROUTES ============

@router.post("/finished-product-master", response_model=FinishedProductMasterResponse)
async def create_finished_product_master(master: FinishedProductMasterCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create masters")
    master_id = str(uuid.uuid4())
    master_doc = {
        "id": master_id, "sku_name": master.sku_name, "uom": master.uom,
        "description": master.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_product_masters.insert_one(master_doc)
    return FinishedProductMasterResponse(**master_doc)


@router.get("/finished-product-master")
async def get_finished_product_masters(current_user: dict = Depends(get_current_user)):
    masters = await db.finished_product_masters.find({}, {"_id": 0}).sort("sku_name", 1).to_list(10000)
    return masters


@router.put("/finished-product-master/{master_id}", response_model=FinishedProductMasterResponse)
async def update_finished_product_master(master_id: str, master: FinishedProductMasterCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update masters")
    update_doc = {"sku_name": master.sku_name, "uom": master.uom, "description": master.description}
    result = await db.finished_product_masters.update_one({"id": master_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Master not found")
    updated_master = await db.finished_product_masters.find_one({"id": master_id}, {"_id": 0})
    return FinishedProductMasterResponse(**updated_master)


@router.delete("/finished-product-master/{master_id}")
async def delete_finished_product_master(master_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete masters")
    result = await db.finished_product_masters.delete_one({"id": master_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Master not found")
    return {"message": "Master deleted successfully"}


@router.patch("/finished-product-master/{master_id}/toggle-status")
async def toggle_finished_product_master_status(master_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can toggle status")
    master = await db.finished_product_masters.find_one({"id": master_id}, {"_id": 0})
    if not master:
        raise HTTPException(status_code=404, detail="Master not found")
    new_status = not master.get('is_active', True)
    await db.finished_product_masters.update_one({"id": master_id}, {"$set": {"is_active": new_status}})
    return {"message": f"Master {'activated' if new_status else 'deactivated'} successfully", "is_active": new_status}
