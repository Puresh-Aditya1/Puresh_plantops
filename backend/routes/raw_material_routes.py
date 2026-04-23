from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import (
    RawMaterialStockCreate, RawMaterialStockResponse,
    RawMaterialMasterCreate, RawMaterialMasterResponse,
    RawMaterialRateCreate, RawMaterialRateResponse,
    RMAdjustmentEntry, RMAdjustmentResponse,
    RMDirectConsumptionCreate, RMDirectConsumptionResponse
)
from activity_logger import log_activity

router = APIRouter(prefix="/api")


async def recalculate_batches_for_material(material_name: str, material_id: str):
    """When a rate changes, update cost_per_unit in all batches using this material,
    update raw_material_stock.cost_per_unit, and cascade to finished product costs."""
    from routes.batch_routes import recalculate_finished_products_for_batch, recalculate_finished_products_for_material

    # Get all rates for this material, sorted newest first
    rates = await db.raw_material_rates.find(
        {"raw_material_id": material_id}, {"_id": 0}
    ).sort("from_date", -1).to_list(10000)

    if not rates:
        return 0

    def get_rate_for_date(date_str):
        for r in rates:
            from_d = r['from_date']
            to_d = r['to_date'] if r['to_date'] else "9999-12-31"
            if from_d <= date_str <= to_d:
                return r['rate']
        return None

    # --- Update batches ---
    batches = await db.batches.find(
        {"raw_materials.name": material_name}, {"_id": 0}
    ).to_list(100000)

    updated_count = 0
    updated_batch_ids = []
    for batch in batches:
        new_rate = get_rate_for_date(batch['date'])
        if new_rate is None:
            continue
        changed = False
        for rm in batch.get('raw_materials', []):
            if rm['name'] == material_name and rm.get('cost_per_unit') != new_rate:
                rm['cost_per_unit'] = new_rate
                changed = True
        if changed:
            await db.batches.update_one(
                {"id": batch['id']},
                {"$set": {"raw_materials": batch['raw_materials']}}
            )
            updated_count += 1
            updated_batch_ids.append(batch['id'])

    # --- Update raw_material_stock cost_per_unit ---
    stock_entries = await db.raw_material_stock.find(
        {"name": material_name}, {"_id": 0}
    ).to_list(100000)

    for entry in stock_entries:
        new_rate = get_rate_for_date(entry['date'])
        if new_rate is not None and entry.get('cost_per_unit') != new_rate:
            await db.raw_material_stock.update_one(
                {"id": entry['id']},
                {"$set": {"cost_per_unit": new_rate}}
            )

    # --- Cascade to finished products for updated batches ---
    for bid in updated_batch_ids:
        await recalculate_finished_products_for_batch(bid)

    # --- Cascade to finished products that used this material as additional material during packing ---
    await recalculate_finished_products_for_material(material_name, material_id)

    return updated_count


# ============ RAW MATERIAL STOCK ROUTES ============

@router.post("/raw-material-stock", response_model=RawMaterialStockResponse)
async def create_raw_material_stock(stock: RawMaterialStockCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create stock entries")
    await validate_entry_date(stock.date, current_user)
    material_master = await db.raw_material_masters.find_one({"name": stock.name}, {"_id": 0})
    if not material_master:
        raise HTTPException(status_code=404, detail=f"Material {stock.name} not found in master")
    rates = await db.raw_material_rates.find({"raw_material_id": material_master['id']}, {"_id": 0}).to_list(10000)
    cost_per_unit = 0
    for rate in rates:
        from_date = rate['from_date']
        to_date = rate['to_date'] if rate['to_date'] else "9999-12-31"
        if from_date <= stock.date <= to_date:
            cost_per_unit = rate['rate']
            break
    if cost_per_unit == 0:
        raise HTTPException(status_code=400, detail=f"No rate found for {stock.name} on date {stock.date}")
    
    # Check if entry already exists for this material and date
    existing = await db.raw_material_stock.find_one({"name": stock.name, "date": stock.date}, {"_id": 0})
    
    previous_stocks = await db.raw_material_stock.find(
        {"name": stock.name, "date": {"$lt": stock.date}}, {"_id": 0}
    ).sort("date", -1).limit(1).to_list(1)
    opening_stock = previous_stocks[0]['closing_stock'] if previous_stocks else 0
    
    batches = await db.batches.find({"date": stock.date}, {"_id": 0}).to_list(10000)
    used = 0
    for batch in batches:
        for rm in batch.get('raw_materials', []):
            if rm['name'] == stock.name:
                used += rm['quantity']
    
    if existing:
        # Update existing entry - add to purchased amount
        new_purchased = existing.get('purchased', 0) + stock.purchased
        new_closing = opening_stock + new_purchased - used
        await db.raw_material_stock.update_one(
            {"name": stock.name, "date": stock.date},
            {"$set": {"purchased": new_purchased, "used": used, "closing_stock": new_closing, "cost_per_unit": cost_per_unit}}
        )
        stock_doc = {
            "id": existing['id'], "name": stock.name, "unit": material_master['unit'],
            "date": stock.date, "opening_stock": opening_stock, "purchased": new_purchased,
            "used": used, "closing_stock": new_closing, "cost_per_unit": cost_per_unit
        }
        await log_activity(current_user['username'], "updated", "raw_material", f"Added purchase {stock.purchased} {material_master['unit']} of {stock.name}", existing['id'], "raw_material_stock")
    else:
        # Create new entry
        closing_stock = opening_stock + stock.purchased - used
        stock_id = str(uuid.uuid4())
        stock_doc = {
            "id": stock_id, "name": stock.name, "unit": material_master['unit'],
            "date": stock.date, "opening_stock": opening_stock, "purchased": stock.purchased,
            "used": used, "closing_stock": closing_stock, "cost_per_unit": cost_per_unit
        }
        await db.raw_material_stock.insert_one(stock_doc)
        await log_activity(current_user['username'], "created", "raw_material", f"Purchased {stock.purchased} {material_master['unit']} of {stock.name}", stock_id, "raw_material_stock")
    
    return RawMaterialStockResponse(**stock_doc)


@router.get("/raw-material-stock", response_model=List[RawMaterialStockResponse])
async def get_raw_material_stock(current_user: dict = Depends(get_current_user)):
    stocks = await db.raw_material_stock.find({}, {"_id": 0}).sort("date", -1).to_list(10000)
    return stocks


@router.put("/raw-material-stock/{stock_id}", response_model=RawMaterialStockResponse)
async def update_raw_material_stock(stock_id: str, stock: RawMaterialStockCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update stock entries")
    await validate_entry_date(stock.date, current_user)
    existing = await db.raw_material_stock.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be edited. They are system-generated.")
    
    material_master = await db.raw_material_masters.find_one({"name": stock.name}, {"_id": 0})
    if not material_master:
        raise HTTPException(status_code=404, detail=f"Material {stock.name} not found in master")
    rates = await db.raw_material_rates.find({"raw_material_id": material_master['id']}, {"_id": 0}).to_list(10000)
    cost_per_unit = 0
    for rate in rates:
        from_date = rate['from_date']
        to_date = rate['to_date'] if rate['to_date'] else "9999-12-31"
        if from_date <= stock.date <= to_date:
            cost_per_unit = rate['rate']
            break
    if cost_per_unit == 0:
        raise HTTPException(status_code=400, detail=f"No rate found for {stock.name} on date {stock.date}")
    previous_stocks = await db.raw_material_stock.find(
        {"name": stock.name, "date": {"$lt": stock.date}}, {"_id": 0}
    ).sort("date", -1).limit(1).to_list(1)
    opening_stock = previous_stocks[0]['closing_stock'] if previous_stocks else 0
    batches = await db.batches.find({"date": stock.date}, {"_id": 0}).to_list(10000)
    used = 0
    for batch in batches:
        for rm in batch['raw_materials']:
            if rm['name'] == stock.name:
                used += rm['quantity']
    closing_stock = opening_stock + stock.purchased - used
    update_doc = {
        "name": stock.name, "unit": material_master['unit'], "date": stock.date,
        "opening_stock": opening_stock, "purchased": stock.purchased,
        "used": used, "closing_stock": closing_stock, "cost_per_unit": cost_per_unit
    }
    await db.raw_material_stock.update_one({"id": stock_id}, {"$set": update_doc})
    updated = await db.raw_material_stock.find_one({"id": stock_id}, {"_id": 0})
    return RawMaterialStockResponse(**updated)


@router.delete("/raw-material-stock/{stock_id}")
async def delete_raw_material_stock(stock_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete stock entries")
    existing = await db.raw_material_stock.find_one({"id": stock_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Stock entry not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be deleted. They are system-generated.")
    
    await db.raw_material_stock.delete_one({"id": stock_id})
    return {"message": "Stock entry deleted successfully"}


@router.get("/reports/raw-material-stock")
async def get_raw_material_report(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    material: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    if material and material != "all":
        query["name"] = material
    stocks = await db.raw_material_stock.find(query, {"_id": 0}).sort([("date", 1), ("name", 1)]).to_list(10000)
    return stocks


@router.get("/raw-materials/list")
async def get_raw_materials_list(current_user: dict = Depends(get_current_user)):
    materials = await db.raw_material_stock.distinct("name")
    return materials


# ============ RAW MATERIAL MASTER ROUTES ============

@router.post("/raw-material-master", response_model=RawMaterialMasterResponse)
async def create_raw_material_master(material: RawMaterialMasterCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create masters")
    existing = await db.raw_material_masters.find_one({"name": material.name}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Material already exists")
    material_id = str(uuid.uuid4())
    material_doc = {
        "id": material_id, "name": material.name, "unit": material.unit,
        "description": material.description,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.raw_material_masters.insert_one(material_doc)
    return RawMaterialMasterResponse(**material_doc)


@router.get("/raw-material-master", response_model=List[RawMaterialMasterResponse])
async def get_raw_material_masters(current_user: dict = Depends(get_current_user)):
    materials = await db.raw_material_masters.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    return materials


@router.delete("/raw-material-master/{material_id}")
async def delete_raw_material_master(material_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete masters")
    result = await db.raw_material_masters.delete_one({"id": material_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material not found")
    await db.raw_material_rates.delete_many({"raw_material_id": material_id})
    return {"message": "Material deleted successfully"}


@router.patch("/raw-material-master/{material_id}/toggle-status")
async def toggle_raw_material_status(material_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can toggle status")
    material = await db.raw_material_masters.find_one({"id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    new_status = not material.get('is_active', True)
    await db.raw_material_masters.update_one({"id": material_id}, {"$set": {"is_active": new_status}})
    return {"message": f"Material {'activated' if new_status else 'deactivated'} successfully", "is_active": new_status}


@router.post("/raw-material-rate")
async def create_raw_material_rate(rate: RawMaterialRateCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create rates")
    material = await db.raw_material_masters.find_one({"id": rate.raw_material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    
    # Auto-close previous rate: Find rates that are currently open (no to_date or to_date >= from_date)
    # and update their to_date to one day before the new rate's from_date
    from datetime import datetime as dt, timedelta
    new_from = dt.strptime(rate.from_date, "%Y-%m-%d")
    prev_to_date = (new_from - timedelta(days=1)).strftime("%Y-%m-%d")
    
    # Find and update any open rates that would overlap
    await db.raw_material_rates.update_many(
        {
            "raw_material_id": rate.raw_material_id,
            "$or": [
                {"to_date": None},
                {"to_date": ""},
                {"to_date": {"$gte": rate.from_date}}
            ],
            "from_date": {"$lt": rate.from_date}  # Only close rates that started before the new one
        },
        {"$set": {"to_date": prev_to_date}}
    )
    
    rate_id = str(uuid.uuid4())
    rate_doc = {
        "id": rate_id, "raw_material_id": rate.raw_material_id,
        "raw_material_name": material['name'], "rate": rate.rate,
        "from_date": rate.from_date, "to_date": rate.to_date,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.raw_material_rates.insert_one(rate_doc)
    
    # Recalculate all affected batches and stock entries
    updated = await recalculate_batches_for_material(material['name'], rate.raw_material_id)
    
    await log_activity(
        current_user['username'], "created", "raw_material_rate",
        f"Added rate {rate.rate} for {material['name']} from {rate.from_date} ({updated} batches recalculated)"
    )
    
    return {**RawMaterialRateResponse(**rate_doc).model_dump(), "batches_recalculated": updated}


@router.get("/raw-material-rate/{material_id}", response_model=List[RawMaterialRateResponse])
async def get_raw_material_rates(material_id: str, current_user: dict = Depends(get_current_user)):
    rates = await db.raw_material_rates.find(
        {"raw_material_id": material_id}, {"_id": 0}
    ).sort("from_date", -1).to_list(10000)
    return rates


@router.get("/raw-material-rates-all")
async def get_all_raw_material_rates(current_user: dict = Depends(get_current_user)):
    """Get all raw materials with their rate history and current rate"""
    materials = await db.raw_material_masters.find({"status": {"$ne": "inactive"}}, {"_id": 0}).sort("name", 1).to_list(10000)
    all_rates = await db.raw_material_rates.find({}, {"_id": 0}).sort("from_date", -1).to_list(100000)
    
    # Group rates by material
    rates_by_material = {}
    for r in all_rates:
        mid = r['raw_material_id']
        if mid not in rates_by_material:
            rates_by_material[mid] = []
        rates_by_material[mid].append(r)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = []
    
    for m in materials:
        material_rates = rates_by_material.get(m['id'], [])
        current_rate = None
        latest_rate = None
        
        # Find current rate (applicable today)
        for r in material_rates:
            from_date = r['from_date']
            to_date = r['to_date'] if r['to_date'] else "9999-12-31"
            if from_date <= today <= to_date:
                current_rate = r
                break
        
        # Latest rate is the first one (sorted by from_date desc)
        if material_rates:
            latest_rate = material_rates[0]
        
        result.append({
            "material_id": m['id'],
            "material_name": m['name'],
            "unit": m.get('unit', 'kg'),
            "current_rate": current_rate['rate'] if current_rate else None,
            "current_rate_from": current_rate['from_date'] if current_rate else None,
            "current_rate_to": current_rate['to_date'] if current_rate else None,
            "latest_rate_id": latest_rate['id'] if latest_rate else None,
            "rate_history": material_rates
        })
    
    return result


@router.put("/raw-material-rate/{rate_id}")
async def update_raw_material_rate(rate_id: str, rate: RawMaterialRateCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update rates")
    
    # Get the rate being edited
    existing_rate = await db.raw_material_rates.find_one({"id": rate_id}, {"_id": 0})
    if not existing_rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    
    # Check if this is the latest rate for this material
    latest_rate = await db.raw_material_rates.find_one(
        {"raw_material_id": existing_rate['raw_material_id']},
        {"_id": 0},
        sort=[("from_date", -1)]
    )
    
    if latest_rate and latest_rate['id'] != rate_id:
        raise HTTPException(status_code=400, detail="Only the latest rate can be edited. Please add a new rate instead.")
    
    material = await db.raw_material_masters.find_one({"id": rate.raw_material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")
    update_doc = {
        "rate": rate.rate, "from_date": rate.from_date,
        "to_date": rate.to_date, "raw_material_name": material['name']
    }
    result = await db.raw_material_rates.update_one({"id": rate_id}, {"$set": update_doc})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rate not found")
    
    # Recalculate all affected batches and stock entries
    updated = await recalculate_batches_for_material(material['name'], rate.raw_material_id)
    
    await log_activity(
        current_user['username'], "updated", "raw_material_rate",
        f"Updated rate for {material['name']} to {rate.rate} ({updated} batches recalculated)"
    )
    
    updated_rate = await db.raw_material_rates.find_one({"id": rate_id}, {"_id": 0})
    return {**RawMaterialRateResponse(**updated_rate).model_dump(), "batches_recalculated": updated}


@router.delete("/raw-material-rate/{rate_id}")
async def delete_raw_material_rate(rate_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete rates")
    result = await db.raw_material_rates.delete_one({"id": rate_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rate not found")
    return {"message": "Rate deleted successfully"}


@router.get("/raw-material-rate-by-date/{material_name}/{date}")
async def get_rate_by_date(material_name: str, date: str, current_user: dict = Depends(get_current_user)):
    material = await db.raw_material_masters.find_one({"name": material_name}, {"_id": 0})
    if not material:
        return {"rate": 0, "message": "Material not found"}
    rates = await db.raw_material_rates.find({"raw_material_id": material['id']}, {"_id": 0}).to_list(10000)
    for rate in rates:
        from_date = rate['from_date']
        to_date = rate['to_date'] if rate['to_date'] else "9999-12-31"
        if from_date <= date <= to_date:
            return {"rate": rate['rate'], "from_date": from_date, "to_date": rate['to_date']}
    return {"rate": 0, "message": "No rate found for this date"}


# ============ RAW MATERIAL ADJUSTMENT ROUTES ============

@router.post("/rm-adjustment", response_model=RMAdjustmentResponse)
async def create_rm_adjustment(entry: RMAdjustmentEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create entries")
    await validate_entry_date(entry.date, current_user)
    if entry.type not in ("gain", "loss"):
        raise HTTPException(status_code=400, detail="Type must be 'gain' or 'loss'")
    if entry.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than 0")
    doc = {
        "id": str(uuid.uuid4()), "material_name": entry.material_name, "date": entry.date,
        "type": entry.type, "quantity": entry.quantity, "notes": entry.notes,
        "created_by": current_user['username'], "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rm_adjustments.insert_one(doc)
    return RMAdjustmentResponse(**doc)


@router.get("/rm-adjustment", response_model=List[RMAdjustmentResponse])
async def get_rm_adjustments(current_user: dict = Depends(get_current_user)):
    entries = await db.rm_adjustments.find({}, {"_id": 0}).sort("date", -1).to_list(10000)
    return entries


@router.put("/rm-adjustment/{adj_id}", response_model=RMAdjustmentResponse)
async def update_rm_adjustment(adj_id: str, entry: RMAdjustmentEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update entries")
    await validate_entry_date(entry.date, current_user)
    if entry.type not in ("gain", "loss"):
        raise HTTPException(status_code=400, detail="Type must be 'gain' or 'loss'")
    existing = await db.rm_adjustments.find_one({"id": adj_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Raw material adjustment entry not found")
    update_doc = {
        "material_name": entry.material_name, "date": entry.date,
        "type": entry.type, "quantity": entry.quantity, "notes": entry.notes
    }
    await db.rm_adjustments.update_one({"id": adj_id}, {"$set": update_doc})
    updated = await db.rm_adjustments.find_one({"id": adj_id}, {"_id": 0})
    return RMAdjustmentResponse(**updated)


@router.delete("/rm-adjustment/{adj_id}")
async def delete_rm_adjustment(adj_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete entries")
    existing = await db.rm_adjustments.find_one({"id": adj_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Raw material adjustment entry not found")
    await db.rm_adjustments.delete_one({"id": adj_id})
    return {"message": "Deleted successfully"}


# ============ RAW MATERIAL DIRECT CONSUMPTION ROUTES ============

@router.post("/rm-direct-consumption", response_model=RMDirectConsumptionResponse)
async def create_rm_direct_consumption(entry: RMDirectConsumptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create entries")
    await validate_entry_date(entry.consumption_date, current_user)
    master = await db.raw_material_masters.find_one({"name": entry.material_name}, {"_id": 0})
    if not master:
        raise HTTPException(status_code=404, detail=f"Raw material '{entry.material_name}' not found in master")
    consumption_id = str(uuid.uuid4())
    doc = {
        "id": consumption_id, "material_name": entry.material_name,
        "quantity": entry.quantity, "unit": master.get('unit', 'kg'),
        "reason": entry.reason, "date": entry.consumption_date,
        "notes": entry.notes or "", "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.rm_direct_consumption.insert_one(doc)
    await log_activity(current_user['username'], "created", "rm_consumption", f"Direct consumption: {entry.quantity} of {entry.material_name} - {entry.reason}", consumption_id, "rm_consumption")
    return RMDirectConsumptionResponse(**doc)


@router.get("/rm-direct-consumption")
async def get_rm_direct_consumption(current_user: dict = Depends(get_current_user)):
    items = await db.rm_direct_consumption.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return items


@router.put("/rm-direct-consumption/{consumption_id}", response_model=RMDirectConsumptionResponse)
async def update_rm_direct_consumption(consumption_id: str, entry: RMDirectConsumptionCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update entries")
    await validate_entry_date(entry.consumption_date, current_user)
    existing = await db.rm_direct_consumption.find_one({"id": consumption_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Consumption entry not found")
    master = await db.raw_material_masters.find_one({"name": entry.material_name}, {"_id": 0})
    if not master:
        raise HTTPException(status_code=404, detail=f"Raw material '{entry.material_name}' not found")
    update_doc = {
        "material_name": entry.material_name, "quantity": entry.quantity,
        "unit": master.get('unit', 'kg'), "reason": entry.reason,
        "date": entry.consumption_date, "notes": entry.notes or ""
    }
    await db.rm_direct_consumption.update_one({"id": consumption_id}, {"$set": update_doc})
    updated = await db.rm_direct_consumption.find_one({"id": consumption_id}, {"_id": 0})
    return RMDirectConsumptionResponse(**updated)


@router.delete("/rm-direct-consumption/{consumption_id}")
async def delete_rm_direct_consumption(consumption_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete entries")
    existing = await db.rm_direct_consumption.find_one({"id": consumption_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Consumption entry not found")
    await db.rm_direct_consumption.delete_one({"id": consumption_id})
    return {"message": "Consumption entry deleted successfully"}
