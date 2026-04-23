from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import (
    SemiFinishedProductCreate, SemiFinishedProductResponse,
    PackingEntry, FinishedProductResponse
)
from routes.batch_routes import update_raw_material_usage
from activity_logger import log_activity
from transaction_manager import TransactionManager

router = APIRouter(prefix="/api")


async def recalc_semi_finished_stock(product_name: str):
    records = await db.semi_finished_products.find({"product_name": product_name}, {"_id": 0}).to_list(10000)
    if not records:
        return
    master = await db.semi_finished_masters.find_one({"name": product_name}, {"_id": 0})
    sku_map = {}
    if master:
        for m in master.get('finished_sku_mappings', []):
            sku_map[m['sku_name']] = m['quantity_consumed']
    for rec in records:
        produced = rec['quantity_kg']
        packings = await db.finished_products.find({"semi_finished_id": rec['id']}, {"_id": 0}).to_list(10000)
        consumed = 0
        for pk in packings:
            if pk.get('semi_finished_consumed') is not None:
                # Manual mode: user entered the total amount consumed (wastage already accounted for)
                consumed += pk['semi_finished_consumed']
            else:
                qty_per_unit = sku_map.get(pk['sku'], 1.0)
                consumed += (qty_per_unit * pk['quantity']) + pk.get('quantity_wasted', 0)
        actual_stock = round(produced - consumed, 4)
        if abs(rec['current_stock'] - actual_stock) > 0.001:
            await db.semi_finished_products.update_one(
                {"id": rec['id']}, {"$set": {"current_stock": actual_stock}}
            )


@router.post("/semi-finished", response_model=SemiFinishedProductResponse)
async def create_semi_finished(product: SemiFinishedProductCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create products")
    product_id = str(uuid.uuid4())
    product_doc = {
        "id": product_id, "batch_id": product.batch_id, "product_name": product.product_name,
        "quantity_kg": product.quantity_kg, "current_stock": product.quantity_kg,
        "date": datetime.now(timezone.utc).date().isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.semi_finished_products.insert_one(product_doc)
    return SemiFinishedProductResponse(**product_doc)


@router.get("/semi-finished", response_model=List[SemiFinishedProductResponse])
async def get_semi_finished(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if start_date and end_date:
        query["date"] = {"$gte": start_date, "$lte": end_date}
    elif start_date:
        query["date"] = {"$gte": start_date}
    elif end_date:
        query["date"] = {"$lte": end_date}
    products = await db.semi_finished_products.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return products


def calculate_batch_cost_per_kg(batch: dict) -> float:
    """Calculate cost per kg for a batch from its milk, raw materials, and additional costs."""
    milk_kg = batch.get('milk_kg', 0)
    fat_cost = round((batch.get('fat_percent', 0) * 10 * milk_kg / 1000) * batch.get('fat_rate', 0), 2)
    snf_cost = round((batch.get('snf_percent', 0) * 10 * milk_kg / 1000) * batch.get('snf_rate', 0), 2)
    milk_cost = fat_cost + snf_cost
    other_rm_cost = sum(rm.get('quantity', 0) * rm.get('cost_per_unit', 0) for rm in batch.get('raw_materials', []))
    additional_costs_total = sum(c.get('amount', 0) for c in batch.get('additional_costs', []))
    total_cost = milk_cost + other_rm_cost + additional_costs_total
    qty_produced = batch.get('quantity_produced', 0)
    return round(total_cost / qty_produced, 2) if qty_produced > 0 else 0


@router.get("/batches-for-packing/{product_name}")
async def get_batches_for_packing(product_name: str, current_user: dict = Depends(get_current_user)):
    await recalc_semi_finished_stock(product_name)
    sf_records = await db.semi_finished_products.find(
        {"product_name": product_name, "current_stock": {"$gt": 0.001}}, {"_id": 0}
    ).sort("created_at", 1).to_list(10000)
    
    # Batch fetch all batch info at once to avoid N+1 queries
    batch_ids = [rec['batch_id'] for rec in sf_records if rec.get('batch_id')]
    
    # Check both active and archived batches
    active_batches = await db.batches.find({"id": {"$in": batch_ids}}, {"_id": 0}).to_list(1000)
    archived_batches = await db.batches_archive.find({"id": {"$in": batch_ids}}, {"_id": 0}).to_list(1000)
    
    batch_map = {b['id']: b for b in active_batches}
    archived_batch_map = {b['id']: b for b in archived_batches}
    
    result = []
    for rec in sf_records:
        batch_id = rec.get('batch_id')
        batch = batch_map.get(batch_id)
        archived_batch = archived_batch_map.get(batch_id) if not batch else None
        
        if batch:
            # Active batch - calculate cost
            batch_cost_per_unit = calculate_batch_cost_per_kg(batch)
            result.append({
                "batch_id": batch['id'], "batch_number": batch['batch_number'],
                "batch_date": batch['date'], "semi_finished_id": rec['id'],
                "available_stock": round(rec['current_stock'], 2),
                "total_produced": rec['quantity_kg'], "batch_cost_per_kg": batch_cost_per_unit
            })
        elif archived_batch:
            # Batch was archived - still calculate cost from archived data
            batch_cost_per_unit = calculate_batch_cost_per_kg(archived_batch)
            result.append({
                "batch_id": archived_batch['id'], 
                "batch_number": f"[Archived] {archived_batch.get('batch_number', rec.get('date', 'Unknown'))}",
                "batch_date": archived_batch.get('date', rec.get('date', '')), 
                "semi_finished_id": rec['id'],
                "available_stock": round(rec['current_stock'], 2),
                "total_produced": rec['quantity_kg'], 
                "batch_cost_per_kg": batch_cost_per_unit
            })
        else:
            # Batch completely missing (deleted) - no cost data available
            result.append({
                "batch_id": batch_id or '', 
                "batch_number": f"[Unknown] {rec.get('date', 'Unknown')}",
                "batch_date": rec.get('date', ''), "semi_finished_id": rec['id'],
                "available_stock": round(rec['current_stock'], 2),
                "total_produced": rec['quantity_kg'], "batch_cost_per_kg": 0
            })
    
    return result


@router.post("/packing", response_model=FinishedProductResponse)
async def create_packing_entry(packing: PackingEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create packing entries")
    semi_finished = None
    if packing.semi_finished_id:
        semi_finished = await db.semi_finished_products.find_one({"id": packing.semi_finished_id}, {"_id": 0})
    if not semi_finished:
        raise HTTPException(status_code=404, detail="Semi-finished product not found")
    semi_master = await db.semi_finished_masters.find_one({"name": semi_finished['product_name']}, {"_id": 0})
    if not semi_master:
        raise HTTPException(status_code=404, detail="Semi-finished master not found")
    sku_mapping = None
    for mapping in semi_master['finished_sku_mappings']:
        if mapping['sku_name'] == packing.sku:
            sku_mapping = mapping
            break
    if not sku_mapping:
        raise HTTPException(status_code=404, detail=f"SKU {packing.sku} not found in {semi_finished['product_name']} master mappings")
    finished_master = await db.finished_product_masters.find_one({"sku_name": packing.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {packing.sku}")
    quantity_consumed_per_unit = sku_mapping['quantity_consumed']
    is_manual = quantity_consumed_per_unit == 0 or packing.semi_finished_consumed is not None
    if is_manual:
        if not packing.semi_finished_consumed or packing.semi_finished_consumed <= 0:
            raise HTTPException(status_code=400, detail=f"Manual consumption required for {packing.sku}. Enter how much {semi_finished['product_name']} was consumed.")
        # Manual mode: user enters total consumption (wastage is informational only)
        total_consumed = packing.semi_finished_consumed
    else:
        total_consumed = (quantity_consumed_per_unit * packing.quantity_produced) + packing.quantity_wasted
    if semi_finished['current_stock'] < total_consumed:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {semi_finished['current_stock']}, Required: {total_consumed}")
    finished_id = str(uuid.uuid4())
    finished_doc = {
        "id": finished_id, "semi_finished_id": packing.semi_finished_id,
        "batch_id": semi_finished['batch_id'], "sku": packing.sku,
        "quantity": packing.quantity_produced, "quantity_wasted": packing.quantity_wasted,
        "unit": finished_master['uom'], "current_stock": packing.quantity_produced,
        "date": packing.packing_date, "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.finished_products.insert_one(finished_doc)
    new_stock = semi_finished['current_stock'] - total_consumed
    await db.semi_finished_products.update_one(
        {"id": packing.semi_finished_id}, {"$set": {"current_stock": new_stock}}
    )
    return FinishedProductResponse(**finished_doc)


@router.post("/packing-by-product")
async def create_packing_by_product_name(packing: PackingEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create packing entries")
    product_name = packing.semi_finished_id
    await validate_entry_date(packing.packing_date, current_user)
    await recalc_semi_finished_stock(product_name)
    semi_master = await db.semi_finished_masters.find_one({"name": product_name}, {"_id": 0})
    if not semi_master:
        raise HTTPException(status_code=404, detail=f"Semi-finished master not found for {product_name}")
    sku_mapping = None
    for mapping in semi_master['finished_sku_mappings']:
        if mapping['sku_name'] == packing.sku:
            sku_mapping = mapping
            break
    if not sku_mapping:
        raise HTTPException(status_code=404, detail=f"SKU {packing.sku} not found in {product_name} master mappings")
    finished_master = await db.finished_product_masters.find_one({"sku_name": packing.sku}, {"_id": 0})
    if not finished_master:
        raise HTTPException(status_code=404, detail=f"Finished product master not found for {packing.sku}")
    quantity_consumed_per_unit = sku_mapping['quantity_consumed']
    is_manual = quantity_consumed_per_unit == 0 or packing.semi_finished_consumed is not None
    if is_manual:
        if not packing.semi_finished_consumed or packing.semi_finished_consumed <= 0:
            raise HTTPException(status_code=400, detail=f"Manual consumption required for {packing.sku}. Enter how much {product_name} was consumed.")
        # Manual mode: user enters total consumption (wastage is informational only)
        total_consumed = packing.semi_finished_consumed
    else:
        total_consumed = (quantity_consumed_per_unit * packing.quantity_produced) + packing.quantity_wasted

    # Prepare data for the transaction
    source_record = None
    stock_updates = []  # Track all stock changes for rollback
    
    if packing.batch_id:
        source_record = await db.semi_finished_products.find_one(
            {"batch_id": packing.batch_id, "product_name": product_name}, {"_id": 0}
        )
        if not source_record:
            raise HTTPException(status_code=404, detail="No semi-finished product found for this batch")
        if source_record['current_stock'] < total_consumed:
            raise HTTPException(status_code=400, detail=f"Insufficient stock in this batch. Available: {round(source_record['current_stock'], 2)}, Required: {round(total_consumed, 2)}")
        stock_updates.append({
            'id': source_record['id'],
            'original_stock': source_record['current_stock'],
            'new_stock': round(source_record['current_stock'] - total_consumed, 4)
        })
    else:
        records = await db.semi_finished_products.find(
            {"product_name": product_name, "current_stock": {"$gt": 0}}, {"_id": 0}
        ).sort("created_at", 1).to_list(10000)
        total_available = sum(r['current_stock'] for r in records)
        if total_available < total_consumed:
            raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {round(total_available, 2)}, Required: {round(total_consumed, 2)}")
        remaining = total_consumed
        source_record = records[0]
        for record in records:
            if remaining <= 0:
                break
            deduct = min(record['current_stock'], remaining)
            stock_updates.append({
                'id': record['id'],
                'original_stock': record['current_stock'],
                'new_stock': round(record['current_stock'] - deduct, 4)
            })
            remaining -= deduct

    # Check both active and archived batches for cost calculation
    batch = await db.batches.find_one({"id": source_record['batch_id']}, {"_id": 0})
    if not batch:
        # Try archived batches
        batch = await db.batches_archive.find_one({"id": source_record['batch_id']}, {"_id": 0})
    
    batch_cost_per_kg = 0
    batch_number = ""
    if batch:
        batch_number = batch.get('batch_number', '')
        batch_cost_per_kg = calculate_batch_cost_per_kg(batch)

    semi_finished_cost = round(batch_cost_per_kg * total_consumed, 2)

    additional_materials_with_cost = []
    additional_materials_cost = 0
    rm_updates = []  # Track raw material updates for rollback
    
    if packing.additional_materials:
        for mat in packing.additional_materials:
            mat_name = mat.get('name', '')
            mat_qty = float(mat.get('quantity', 0))
            if mat_name and mat_qty > 0:
                mat_master = await db.raw_material_masters.find_one({"name": mat_name}, {"_id": 0})
                mat_cost_per_unit = 0
                if mat_master:
                    rates = await db.raw_material_rates.find(
                        {"raw_material_id": mat_master['id']}, {"_id": 0}
                    ).to_list(10000)
                    for rate in rates:
                        from_date = rate.get('from_date', '')
                        to_date = rate.get('to_date') if rate.get('to_date') else "9999-12-31"
                        if from_date <= packing.packing_date <= to_date:
                            mat_cost_per_unit = rate['rate']
                            break
                mat_total_cost = round(mat_qty * mat_cost_per_unit, 2)
                additional_materials_with_cost.append({
                    "name": mat_name, "quantity": mat_qty,
                    "cost_per_unit": mat_cost_per_unit, "total_cost": mat_total_cost
                })
                additional_materials_cost += mat_total_cost
                # Store for transaction
                original_rm = await db.raw_material_stock.find_one(
                    {"name": mat_name, "date": packing.packing_date}, {"_id": 0}
                )
                rm_updates.append({
                    'name': mat_name,
                    'date': packing.packing_date,
                    'quantity': mat_qty,
                    'original': original_rm
                })

    # Process additional costs (labor, electricity, fuel, etc.)
    additional_costs_list = []
    additional_costs_total = 0
    if packing.additional_costs:
        for cost in packing.additional_costs:
            cost_desc = cost.get('description', '')
            cost_amount = float(cost.get('amount', 0))
            if cost_desc and cost_amount > 0:
                additional_costs_list.append({
                    "description": cost_desc,
                    "amount": cost_amount
                })
                additional_costs_total += cost_amount

    total_packing_cost = round(semi_finished_cost + additional_materials_cost + additional_costs_total, 2)
    cost_per_finished_unit = round(total_packing_cost / packing.quantity_produced, 2) if packing.quantity_produced > 0 else 0

    finished_id = str(uuid.uuid4())
    finished_doc = {
        "id": finished_id, "semi_finished_id": source_record['id'],
        "batch_id": source_record['batch_id'], "batch_number": batch_number,
        "sku": packing.sku, "quantity": packing.quantity_produced,
        "quantity_wasted": packing.quantity_wasted, "unit": finished_master['uom'],
        "current_stock": packing.quantity_produced, "date": packing.packing_date,
        "semi_finished_consumed": total_consumed,
        "additional_materials": additional_materials_with_cost,
        "additional_costs": additional_costs_list,
        "semi_finished_cost": semi_finished_cost,
        "additional_materials_cost": round(additional_materials_cost, 2),
        "additional_costs_total": round(additional_costs_total, 2),
        "total_packing_cost": total_packing_cost,
        "cost_per_finished_unit": cost_per_finished_unit,
        "notes": packing.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Create transaction manager
    tm = TransactionManager(db, 'packing', {
        'finished_id': finished_id,
        'sku': packing.sku,
        'product_name': product_name,
        'user': current_user['username']
    })
    
    # Step 1: Deduct semi-finished stock (FIFO)
    async def deduct_semi_finished():
        for update in stock_updates:
            await db.semi_finished_products.update_one(
                {"id": update['id']},
                {"$set": {"current_stock": update['new_stock']}}
            )
    
    async def rollback_semi_finished():
        for update in stock_updates:
            await db.semi_finished_products.update_one(
                {"id": update['id']},
                {"$set": {"current_stock": update['original_stock']}}
            )
    
    tm.add_step('deduct_semi_finished', deduct_semi_finished, rollback_semi_finished)
    
    # Step 2: Update raw material usage
    async def update_raw_materials():
        for rm_update in rm_updates:
            await update_raw_material_usage(rm_update['name'], rm_update['quantity'], rm_update['date'])
    
    async def rollback_raw_materials():
        for rm_update in rm_updates:
            if rm_update['original']:
                await db.raw_material_stock.update_one(
                    {"name": rm_update['name'], "date": rm_update['date']},
                    {"$set": {
                        "used": rm_update['original']['used'],
                        "closing_stock": rm_update['original']['closing_stock']
                    }}
                )
            else:
                await db.raw_material_stock.delete_one(
                    {"name": rm_update['name'], "date": rm_update['date']}
                )
    
    tm.add_step('update_raw_materials', update_raw_materials, rollback_raw_materials)
    
    # Step 3: Create finished product
    async def create_finished():
        await db.finished_products.insert_one(finished_doc)
        return finished_doc
    
    async def rollback_finished():
        await db.finished_products.delete_one({"id": finished_id})
    
    tm.add_step('create_finished', create_finished, rollback_finished)
    
    # Execute transaction
    success, result = await tm.execute()
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {result}")
    
    await log_activity(current_user['username'], "created", "packing", f"Packed {packing.sku} x {packing.quantity_produced} from {product_name}", finished_id, "packing")
    return FinishedProductResponse(**finished_doc)


@router.get("/finished-products", response_model=List[FinishedProductResponse])
async def get_finished_products(current_user: dict = Depends(get_current_user)):
    products = await db.finished_products.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return products


@router.get("/packing-history/{semi_finished_id}")
async def get_packing_history(semi_finished_id: str, current_user: dict = Depends(get_current_user)):
    packings = await db.finished_products.find(
        {"semi_finished_id": semi_finished_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    return packings


@router.get("/packing-history-by-product/{product_name}")
async def get_packing_history_by_product(product_name: str, current_user: dict = Depends(get_current_user)):
    records = await db.semi_finished_products.find({"product_name": product_name}, {"_id": 0}).to_list(10000)
    record_ids = [r['id'] for r in records]
    packings = await db.finished_products.find(
        {"semi_finished_id": {"$in": record_ids}}, {"_id": 0}
    ).sort("created_at", -1).to_list(10000)
    for pk in packings:
        pk['product_name'] = product_name  # Add product_name for frontend convenience
        if not pk.get('batch_number'):
            batch = await db.batches.find_one({"id": pk.get('batch_id', '')}, {"_id": 0})
            if batch:
                pk['batch_number'] = batch.get('batch_number', '')
    return packings


@router.put("/packing/{packing_id}")
async def update_packing(packing_id: str, packing: PackingEntry, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update packing")
    await validate_entry_date(packing.packing_date, current_user)
    existing = await db.finished_products.find_one({"id": packing_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Packing not found")
    semi_finished = await db.semi_finished_products.find_one({"id": packing.semi_finished_id}, {"_id": 0})
    if not semi_finished:
        raise HTTPException(status_code=404, detail="Semi-finished product not found")
    await recalc_semi_finished_stock(semi_finished['product_name'])
    semi_finished = await db.semi_finished_products.find_one({"id": packing.semi_finished_id}, {"_id": 0})
    semi_master = await db.semi_finished_masters.find_one({"name": semi_finished['product_name']}, {"_id": 0})
    qty_per_unit = 1.0
    if semi_master:
        for mapping in semi_master.get('finished_sku_mappings', []):
            if mapping['sku_name'] == packing.sku:
                qty_per_unit = mapping['quantity_consumed']
                break
    is_manual = qty_per_unit == 0 or packing.semi_finished_consumed is not None
    if is_manual:
        # Manual mode: semi_finished_consumed is the total (wastage is informational)
        if existing.get('semi_finished_consumed') is not None:
            old_consumed = existing['semi_finished_consumed']
        else:
            old_consumed = (qty_per_unit * existing['quantity']) + existing.get('quantity_wasted', 0)
        if not packing.semi_finished_consumed or packing.semi_finished_consumed <= 0:
            raise HTTPException(status_code=400, detail="Manual consumption required. Enter how much was consumed.")
        new_consumed = packing.semi_finished_consumed
    else:
        if existing.get('semi_finished_consumed') is not None:
            old_consumed = existing['semi_finished_consumed']
        else:
            old_consumed = (qty_per_unit * existing['quantity']) + existing.get('quantity_wasted', 0)
        new_consumed = (qty_per_unit * packing.quantity_produced) + packing.quantity_wasted
    difference = new_consumed - old_consumed
    if difference > 0:
        all_records = await db.semi_finished_products.find(
            {"product_name": semi_finished['product_name']}, {"_id": 0}
        ).to_list(10000)
        total_available = sum(r['current_stock'] for r in all_records)
        if total_available < difference:
            raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {round(total_available, 2)}, Extra needed: {round(difference, 2)}")
    stock_diff = packing.quantity_produced - existing['quantity']

    # --- Recalculate all costs ---
    # 1. Semi-finished cost from batch
    batch = await db.batches.find_one({"id": existing.get('batch_id', '')}, {"_id": 0})
    if not batch:
        batch = await db.batches_archive.find_one({"id": existing.get('batch_id', '')}, {"_id": 0})
    batch_cost_per_kg = calculate_batch_cost_per_kg(batch) if batch else 0
    semi_finished_cost = round(batch_cost_per_kg * new_consumed, 2)

    # 2. Additional materials with rate lookups
    additional_materials_with_cost = []
    additional_materials_cost = 0
    if packing.additional_materials:
        for mat in packing.additional_materials:
            mat_name = mat.get('name', '')
            mat_qty = float(mat.get('quantity', 0))
            if mat_name and mat_qty > 0:
                mat_master = await db.raw_material_masters.find_one({"name": mat_name}, {"_id": 0})
                mat_cost_per_unit = 0
                if mat_master:
                    rates = await db.raw_material_rates.find(
                        {"raw_material_id": mat_master['id']}, {"_id": 0}
                    ).to_list(10000)
                    for rate in rates:
                        from_date = rate.get('from_date', '')
                        to_date = rate.get('to_date') if rate.get('to_date') else "9999-12-31"
                        if from_date <= packing.packing_date <= to_date:
                            mat_cost_per_unit = rate['rate']
                            break
                mat_total_cost = round(mat_qty * mat_cost_per_unit, 2)
                additional_materials_with_cost.append({
                    "name": mat_name, "quantity": mat_qty,
                    "cost_per_unit": mat_cost_per_unit, "total_cost": mat_total_cost
                })
                additional_materials_cost += mat_total_cost

    # 3. Additional costs (labor, electricity, fuel, etc.)
    additional_costs_list = []
    additional_costs_total = 0
    if packing.additional_costs:
        for cost in packing.additional_costs:
            cost_desc = cost.get('description', '')
            cost_amount = float(cost.get('amount', 0))
            if cost_desc and cost_amount > 0:
                additional_costs_list.append({"description": cost_desc, "amount": cost_amount})
                additional_costs_total += cost_amount

    # 4. Totals
    total_packing_cost = round(semi_finished_cost + additional_materials_cost + additional_costs_total, 2)
    cost_per_finished_unit = round(total_packing_cost / packing.quantity_produced, 2) if packing.quantity_produced > 0 else 0

    update_doc = {
        "sku": packing.sku, "quantity": packing.quantity_produced,
        "quantity_wasted": packing.quantity_wasted,
        "semi_finished_consumed": new_consumed,
        "current_stock": existing['current_stock'] + stock_diff,
        "date": packing.packing_date,
        "additional_materials": additional_materials_with_cost,
        "additional_costs": additional_costs_list,
        "semi_finished_cost": semi_finished_cost,
        "additional_materials_cost": round(additional_materials_cost, 2),
        "additional_costs_total": round(additional_costs_total, 2),
        "total_packing_cost": total_packing_cost,
        "cost_per_finished_unit": cost_per_finished_unit,
        "notes": packing.notes or ""
    }
    await db.finished_products.update_one({"id": packing_id}, {"$set": update_doc})
    if difference > 0:
        remaining = difference
        records = await db.semi_finished_products.find(
            {"product_name": semi_finished['product_name'], "current_stock": {"$gt": 0}}, {"_id": 0}
        ).sort("created_at", 1).to_list(10000)
        for record in records:
            if remaining <= 0:
                break
            deduct = min(record['current_stock'], remaining)
            await db.semi_finished_products.update_one(
                {"id": record['id']},
                {"$set": {"current_stock": round(record['current_stock'] - deduct, 4)}}
            )
            remaining -= deduct
    elif difference < 0:
        await db.semi_finished_products.update_one(
            {"id": packing.semi_finished_id},
            {"$inc": {"current_stock": round(-difference, 4)}}
        )
    updated = await db.finished_products.find_one({"id": packing_id}, {"_id": 0})
    return FinishedProductResponse(**updated)


@router.delete("/packing/{packing_id}")
async def delete_packing(packing_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete packing")
    packing = await db.finished_products.find_one({"id": packing_id}, {"_id": 0})
    if not packing:
        raise HTTPException(status_code=404, detail="Packing not found")
    semi_finished = await db.semi_finished_products.find_one({"id": packing['semi_finished_id']}, {"_id": 0})
    qty_per_unit = 1.0
    if semi_finished:
        semi_master = await db.semi_finished_masters.find_one({"name": semi_finished['product_name']}, {"_id": 0})
        if semi_master:
            for mapping in semi_master.get('finished_sku_mappings', []):
                if mapping['sku_name'] == packing['sku']:
                    qty_per_unit = mapping['quantity_consumed']
                    break
    if packing.get('semi_finished_consumed') is not None:
        total_consumed = packing['semi_finished_consumed']
    else:
        total_consumed = (qty_per_unit * packing['quantity']) + packing.get('quantity_wasted', 0)
    await db.semi_finished_products.update_one(
        {"id": packing['semi_finished_id']},
        {"$inc": {"current_stock": round(total_consumed, 4)}}
    )
    for mat in packing.get('additional_materials', []) or []:
        mat_name = mat.get('name', '')
        mat_qty = float(mat.get('quantity', 0))
        if mat_name and mat_qty > 0:
            stock = await db.raw_material_stock.find_one({"name": mat_name, "date": packing['date']}, {"_id": 0})
            if stock:
                new_used = max(0, stock['used'] - mat_qty)
                new_closing = stock['opening_stock'] + stock['purchased'] - new_used
                await db.raw_material_stock.update_one(
                    {"name": mat_name, "date": packing['date']},
                    {"$set": {"used": new_used, "closing_stock": new_closing}}
                )
    await db.finished_products.delete_one({"id": packing_id})
    if semi_finished:
        await recalc_semi_finished_stock(semi_finished['product_name'])
    return {"message": "Packing deleted successfully"}
