from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import BatchCreate, BatchResponse
from activity_logger import log_activity
from transaction_manager import TransactionManager

router = APIRouter(prefix="/api")


async def update_raw_material_usage(material_name: str, quantity_used: float, date: str):
    stock = await db.raw_material_stock.find_one({"name": material_name, "date": date}, {"_id": 0})
    if stock:
        new_used = stock['used'] + quantity_used
        new_closing = stock['opening_stock'] + stock['purchased'] - new_used
        await db.raw_material_stock.update_one(
            {"name": material_name, "date": date},
            {"$set": {"used": new_used, "closing_stock": new_closing}}
        )
    else:
        stock_id = str(uuid.uuid4())
        await db.raw_material_stock.insert_one({
            "id": stock_id, "name": material_name, "unit": "kg", "date": date,
            "opening_stock": 0, "purchased": 0, "used": quantity_used,
            "closing_stock": -quantity_used, "cost_per_unit": 0
        })


def compute_batch_costs(batch: dict) -> dict:
    milk_kg = batch.get('milk_kg', 0)
    fat_pct = batch.get('fat_percent', 0)
    fat_rate = batch.get('fat_rate', 0)
    snf_pct = batch.get('snf_percent', 0)
    snf_rate = batch.get('snf_rate', 0)
    fat_cost = round((fat_pct * 10 * milk_kg / 1000) * fat_rate, 2)
    snf_cost = round((snf_pct * 10 * milk_kg / 1000) * snf_rate, 2)
    milk_cost = round(fat_cost + snf_cost, 2)
    batch['fat_cost'] = fat_cost
    batch['snf_cost'] = snf_cost
    batch['milk_cost'] = milk_cost
    other_rm_cost = 0
    for rm in batch.get('raw_materials', []):
        other_rm_cost += rm.get('quantity', 0) * rm.get('cost_per_unit', 0)
    batch['other_rm_cost'] = round(other_rm_cost, 2)
    additional_costs_total = sum(c.get('amount', 0) for c in batch.get('additional_costs', []))
    batch['additional_costs_total'] = round(additional_costs_total, 2)
    total_cost = round(milk_cost + other_rm_cost + additional_costs_total, 2)
    batch['total_raw_material_cost'] = total_cost
    qty = batch.get('quantity_produced', 0)
    batch['cost_per_unit'] = round(total_cost / qty, 2) if qty > 0 else 0
    return batch


def get_batch_cost_per_kg(batch: dict) -> float:
    """Calculate cost per kg for a batch without mutating it."""
    milk_kg = batch.get('milk_kg', 0)
    fat_cost = round((batch.get('fat_percent', 0) * 10 * milk_kg / 1000) * batch.get('fat_rate', 0), 2)
    snf_cost = round((batch.get('snf_percent', 0) * 10 * milk_kg / 1000) * batch.get('snf_rate', 0), 2)
    milk_cost = fat_cost + snf_cost
    other_rm_cost = sum(rm.get('quantity', 0) * rm.get('cost_per_unit', 0) for rm in batch.get('raw_materials', []))
    additional_costs_total = sum(c.get('amount', 0) for c in batch.get('additional_costs', []))
    total_cost = milk_cost + other_rm_cost + additional_costs_total
    qty = batch.get('quantity_produced', 0)
    return round(total_cost / qty, 2) if qty > 0 else 0


async def recalculate_finished_products_for_batch(batch_id: str) -> int:
    """Recalculate semi_finished_cost, total_packing_cost, cost_per_finished_unit
    for all finished products linked to this batch."""
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        return 0

    cost_per_kg = get_batch_cost_per_kg(batch)

    finished_products = await db.finished_products.find(
        {"batch_id": batch_id, "semi_finished_consumed": {"$ne": None}},
        {"_id": 0}
    ).to_list(100000)

    updated_count = 0
    for fp in finished_products:
        consumed = fp.get('semi_finished_consumed', 0) or 0
        new_sf_cost = round(cost_per_kg * consumed, 2)
        add_mat_cost = fp.get('additional_materials_cost', 0) or 0
        add_costs_total = fp.get('additional_costs_total', 0) or 0
        new_total = round(new_sf_cost + add_mat_cost + add_costs_total, 2)
        qty = fp.get('quantity', 0)
        new_cpu = round(new_total / qty, 2) if qty > 0 else 0

        if (fp.get('semi_finished_cost') != new_sf_cost or
                fp.get('total_packing_cost') != new_total or
                fp.get('cost_per_finished_unit') != new_cpu):
            await db.finished_products.update_one(
                {"id": fp['id']},
                {"$set": {
                    "semi_finished_cost": new_sf_cost,
                    "total_packing_cost": new_total,
                    "cost_per_finished_unit": new_cpu
                }}
            )
            updated_count += 1

    return updated_count


async def recalculate_finished_products_for_material(material_name: str, material_id: str) -> int:
    """When a raw material rate changes, update additional_materials cost in all
    finished products that used this material during packing."""
    # Get all rates for this material
    rates = await db.raw_material_rates.find(
        {"raw_material_id": material_id}, {"_id": 0}
    ).sort("from_date", -1).to_list(10000)

    def get_rate_for_date(date_str):
        for r in rates:
            from_d = r['from_date']
            to_d = r['to_date'] if r['to_date'] else "9999-12-31"
            if from_d <= date_str <= to_d:
                return r['rate']
        return None

    # Find all finished products that have this material in additional_materials
    finished_products = await db.finished_products.find(
        {"additional_materials.name": material_name},
        {"_id": 0}
    ).to_list(100000)

    updated_count = 0
    for fp in finished_products:
        changed = False
        new_add_mat_cost = 0
        updated_materials = []
        for mat in fp.get('additional_materials', []):
            if mat['name'] == material_name:
                new_rate = get_rate_for_date(fp['date'])
                if new_rate is not None and mat.get('cost_per_unit') != new_rate:
                    mat['cost_per_unit'] = new_rate
                    mat['total_cost'] = round(mat['quantity'] * new_rate, 2)
                    changed = True
            new_add_mat_cost += mat.get('total_cost', mat.get('quantity', 0) * mat.get('cost_per_unit', 0))
            updated_materials.append(mat)

        if changed:
            new_add_mat_cost = round(new_add_mat_cost, 2)
            sf_cost = fp.get('semi_finished_cost', 0) or 0
            add_costs_total = fp.get('additional_costs_total', 0) or 0
            new_total = round(sf_cost + new_add_mat_cost + add_costs_total, 2)
            qty = fp.get('quantity', 0)
            new_cpu = round(new_total / qty, 2) if qty > 0 else 0

            await db.finished_products.update_one(
                {"id": fp['id']},
                {"$set": {
                    "additional_materials": updated_materials,
                    "additional_materials_cost": new_add_mat_cost,
                    "total_packing_cost": new_total,
                    "cost_per_finished_unit": new_cpu
                }}
            )
            updated_count += 1

    return updated_count


async def fetch_raw_materials_with_rates(raw_materials, raw_material_quantities, batch_date):
    """Optimized: Batch fetch all materials and rates to avoid N+1 queries"""
    if not raw_materials:
        return []
    
    # Batch fetch all material masters
    material_masters = await db.raw_material_masters.find(
        {"name": {"$in": raw_materials}}, {"_id": 0}
    ).to_list(100)
    
    # Create lookup dict
    material_lookup = {m['name']: m for m in material_masters}
    
    # Verify all materials exist
    for material_name in raw_materials:
        if material_name not in material_lookup:
            raise HTTPException(status_code=404, detail=f"Material {material_name} not found in master")
    
    # Batch fetch all rates for these materials
    material_ids = [m['id'] for m in material_masters]
    all_rates = await db.raw_material_rates.find(
        {"raw_material_id": {"$in": material_ids}}, {"_id": 0}
    ).to_list(500)
    
    # Group rates by material_id
    rates_by_material = {}
    for rate in all_rates:
        mid = rate['raw_material_id']
        if mid not in rates_by_material:
            rates_by_material[mid] = []
        rates_by_material[mid].append(rate)
    
    # Build result
    raw_materials_with_rates = []
    for i, material_name in enumerate(raw_materials):
        quantity = raw_material_quantities[i]
        material = material_lookup[material_name]
        rates = rates_by_material.get(material['id'], [])
        
        cost_per_unit = 0
        for rate in rates:
            from_date = rate['from_date']
            to_date = rate['to_date'] if rate['to_date'] else "9999-12-31"
            if from_date <= batch_date <= to_date:
                cost_per_unit = rate['rate']
                break
        
        if cost_per_unit == 0:
            raise HTTPException(status_code=400, detail=f"No rate found for {material_name} on date {batch_date}")
        
        raw_materials_with_rates.append({
            "name": material_name, "quantity": quantity, "cost_per_unit": cost_per_unit
        })
    
    return raw_materials_with_rates


@router.post("/batches", response_model=BatchResponse)
async def create_batch(batch: BatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create batches")
    await validate_entry_date(batch.batch_date, current_user)
    batch_id = str(uuid.uuid4())

    mm = batch.batch_date[5:7]
    yy = batch.batch_date[2:4]
    dd = batch.batch_date[8:10]
    date_prefix = f"{mm}{yy}{dd}"
    existing_count = await db.batches.count_documents({"date": batch.batch_date})
    letter = chr(65 + existing_count)
    batch_number = f"{date_prefix}{letter}"

    raw_materials_with_rates = await fetch_raw_materials_with_rates(
        batch.raw_materials, batch.raw_material_quantities, batch.batch_date
    )

    batch_doc = {
        "id": batch_id, "batch_number": batch_number, "date": batch.batch_date,
        "milk_kg": batch.milk_kg, "fat_percent": batch.fat_percent, "fat_rate": batch.fat_rate,
        "snf_percent": batch.snf_percent, "snf_rate": batch.snf_rate,
        "raw_materials": raw_materials_with_rates, "output_type": batch.output_type,
        "product_name": batch.product_name, "quantity_produced": batch.quantity_produced,
        "additional_costs": batch.additional_costs or [], "status": "active",
        "notes": batch.notes, "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Use TransactionManager for atomic operation
    tm = TransactionManager(db, 'batch_create', {
        'batch_id': batch_id,
        'batch_number': batch_number,
        'user': current_user['username']
    })
    
    # Step 1: Insert batch document
    async def insert_batch():
        await db.batches.insert_one(batch_doc)
        return batch_doc
    
    async def rollback_batch():
        await db.batches.delete_one({"id": batch_id})
    
    tm.add_step('insert_batch', insert_batch, rollback_batch)
    
    # Step 2: Update raw material usage
    rm_updates = []  # Track for rollback
    
    async def update_raw_materials():
        for rm in raw_materials_with_rates:
            # Store original state for rollback
            original = await db.raw_material_stock.find_one(
                {"name": rm['name'], "date": batch_doc['date']}, {"_id": 0}
            )
            rm_updates.append({
                'name': rm['name'],
                'date': batch_doc['date'],
                'quantity': rm['quantity'],
                'original': original
            })
            await update_raw_material_usage(rm['name'], rm['quantity'], batch_doc['date'])
    
    async def rollback_raw_materials():
        for rm_update in rm_updates:
            if rm_update['original']:
                # Restore original values
                await db.raw_material_stock.update_one(
                    {"name": rm_update['name'], "date": rm_update['date']},
                    {"$set": {
                        "used": rm_update['original']['used'],
                        "closing_stock": rm_update['original']['closing_stock']
                    }}
                )
            else:
                # Delete the newly created stock record
                await db.raw_material_stock.delete_one(
                    {"name": rm_update['name'], "date": rm_update['date']}
                )
    
    tm.add_step('update_raw_materials', update_raw_materials, rollback_raw_materials)
    
    # Step 3: Create output product (semi-finished or finished)
    product_id = str(uuid.uuid4())
    
    async def create_output_product():
        if batch.output_type == "semi-finished":
            product_doc = {
                "id": product_id, "batch_id": batch_id, "product_name": batch.product_name,
                "quantity_kg": batch.quantity_produced, "current_stock": batch.quantity_produced,
                "date": batch_doc['date'], "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.semi_finished_products.insert_one(product_doc)
        elif batch.output_type == "finished":
            finished_master = await db.finished_product_masters.find_one(
                {"sku_name": batch.product_name}, {"_id": 0}
            )
            unit = finished_master['uom'] if finished_master else 'pcs'
            finished_doc = {
                "id": product_id, "semi_finished_id": "", "batch_id": batch_id,
                "sku": batch.product_name, "quantity": batch.quantity_produced,
                "quantity_wasted": 0, "unit": unit, "current_stock": batch.quantity_produced,
                "source": "batch", "date": batch_doc['date'],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.finished_products.insert_one(finished_doc)
    
    async def rollback_output_product():
        if batch.output_type == "semi-finished":
            await db.semi_finished_products.delete_one({"id": product_id})
        elif batch.output_type == "finished":
            await db.finished_products.delete_one({"id": product_id})
    
    tm.add_step('create_output_product', create_output_product, rollback_output_product)
    
    # Execute the transaction
    success, result = await tm.execute()
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {result}")

    await log_activity(current_user['username'], "created", "batch", f"Batch {batch_number} - {batch.product_name} ({batch.quantity_produced} {batch.output_type})", batch_id, "batch")
    compute_batch_costs(batch_doc)
    return BatchResponse(**batch_doc)


@router.get("/batches")
async def get_batches(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    
    # Get total count for pagination
    total_count = await db.batches.count_documents(query)
    total_pages = (total_count + page_size - 1) // page_size
    
    # Apply pagination
    skip = (page - 1) * page_size
    batches = await db.batches.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)
    
    for batch in batches:
        compute_batch_costs(batch)
    
    return {
        "batches": batches,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages
        }
    }


@router.get("/batches/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    batch = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    compute_batch_costs(batch)
    return batch


@router.put("/batches/{batch_id}", response_model=BatchResponse)
async def update_batch(batch_id: str, batch: BatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update batches")
    await validate_entry_date(batch.batch_date, current_user)
    existing = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be edited. They are system-generated.")

    raw_materials_with_rates = await fetch_raw_materials_with_rates(
        batch.raw_materials, batch.raw_material_quantities, batch.batch_date
    )

    update_doc = {
        "date": batch.batch_date, "milk_kg": batch.milk_kg, "fat_percent": batch.fat_percent,
        "fat_rate": batch.fat_rate, "snf_percent": batch.snf_percent, "snf_rate": batch.snf_rate,
        "raw_materials": raw_materials_with_rates, "output_type": batch.output_type,
        "product_name": batch.product_name, "quantity_produced": batch.quantity_produced,
        "additional_costs": batch.additional_costs or [], "notes": batch.notes
    }
    await db.batches.update_one({"id": batch_id}, {"$set": update_doc})

    if batch.output_type == "semi-finished":
        await db.semi_finished_products.update_one(
            {"batch_id": batch_id},
            {"$set": {"product_name": batch.product_name, "quantity_kg": batch.quantity_produced, "date": batch.batch_date}}
        )
    elif batch.output_type == "finished":
        existing_finished = await db.finished_products.find_one({"batch_id": batch_id, "source": "batch"}, {"_id": 0})
        finished_master = await db.finished_product_masters.find_one({"sku_name": batch.product_name}, {"_id": 0})
        unit = finished_master['uom'] if finished_master else 'pcs'
        if existing_finished:
            qty_diff = batch.quantity_produced - existing_finished['quantity']
            await db.finished_products.update_one(
                {"batch_id": batch_id, "source": "batch"},
                {"$set": {
                    "sku": batch.product_name, "quantity": batch.quantity_produced,
                    "current_stock": existing_finished['current_stock'] + qty_diff,
                    "unit": unit, "date": batch.batch_date
                }}
            )
        else:
            finished_id = str(uuid.uuid4())
            finished_doc = {
                "id": finished_id, "semi_finished_id": "", "batch_id": batch_id,
                "sku": batch.product_name, "quantity": batch.quantity_produced,
                "quantity_wasted": 0, "unit": unit, "current_stock": batch.quantity_produced,
                "source": "batch", "date": batch.batch_date,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.finished_products.insert_one(finished_doc)

    updated = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    compute_batch_costs(updated)

    # Recalculate finished product costs linked to this batch
    await recalculate_finished_products_for_batch(batch_id)

    await log_activity(current_user['username'], "updated", "batch", f"Updated batch {existing['batch_number']}", batch_id, "batch")
    return BatchResponse(**updated)


@router.delete("/batches/{batch_id}")
async def delete_batch(batch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete batches")
    existing = await db.batches.find_one({"id": batch_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    # Protect opening balance entries
    if existing.get("is_opening_balance"):
        raise HTTPException(status_code=403, detail="Opening balance entries cannot be deleted. They are system-generated.")
    
    await db.semi_finished_products.delete_many({"batch_id": batch_id})
    await db.finished_products.delete_many({"batch_id": batch_id, "source": "batch"})
    await db.batches.delete_one({"id": batch_id})
    await log_activity(current_user['username'], "deleted", "batch", f"Deleted batch {existing['batch_number']}", batch_id, "batch")
    return {"message": "Batch deleted successfully"}
