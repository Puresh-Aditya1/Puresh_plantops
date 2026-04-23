from fastapi import APIRouter, HTTPException, Depends
from typing import List
from datetime import datetime, timezone
import uuid

from database import db
from auth import get_current_user, validate_entry_date
from models import DispatchCreate, DispatchResponse
from activity_logger import log_activity
from transaction_manager import TransactionManager

router = APIRouter(prefix="/api")


@router.post("/dispatch", response_model=DispatchResponse)
async def create_dispatch(dispatch: DispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot create dispatch")
    dispatch_date = dispatch.dispatch_date or datetime.now(timezone.utc).date().isoformat()
    await validate_entry_date(dispatch_date, current_user)
    
    # Pre-validate all products have sufficient stock
    stock_updates = []  # Track all updates for rollback
    
    for product in dispatch.products:
        sku_name = product.get('sku', '')
        quantity_to_dispatch = product['quantity']
        if sku_name:
            records = await db.finished_products.find(
                {"sku": sku_name, "current_stock": {"$gt": 0}}, {"_id": 0}
            ).sort("created_at", 1).to_list(10000)
            total_available = sum(r['current_stock'] for r in records)
            if total_available < quantity_to_dispatch:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {sku_name}. Available: {total_available}, Required: {quantity_to_dispatch}")
            # Prepare FIFO deductions
            remaining = quantity_to_dispatch
            for record in records:
                if remaining <= 0:
                    break
                deduct = min(record['current_stock'], remaining)
                stock_updates.append({
                    'id': record['id'],
                    'sku': sku_name,
                    'original_stock': record['current_stock'],
                    'new_stock': record['current_stock'] - deduct
                })
                remaining -= deduct
        else:
            fid = product.get('finished_product_id', '')
            finished = await db.finished_products.find_one({"id": fid}, {"_id": 0})
            if not finished:
                raise HTTPException(status_code=404, detail=f"Product {fid} not found")
            if finished['current_stock'] < quantity_to_dispatch:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {finished['sku']}")
            stock_updates.append({
                'id': fid,
                'sku': finished['sku'],
                'original_stock': finished['current_stock'],
                'new_stock': finished['current_stock'] - quantity_to_dispatch
            })
    
    dispatch_id = str(uuid.uuid4())
    dispatch_doc = {
        "id": dispatch_id, "dispatch_type": dispatch.dispatch_type,
        "challan_number": dispatch.challan_number, "products": dispatch.products,
        "destination": dispatch.destination, "notes": dispatch.notes,
        "date": dispatch_date, "created_by": current_user['username'],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Create transaction manager
    tm = TransactionManager(db, 'dispatch', {
        'dispatch_id': dispatch_id,
        'challan_number': dispatch.challan_number,
        'user': current_user['username']
    })
    
    # Step 1: Deduct stock from finished products
    async def deduct_stock():
        for update in stock_updates:
            await db.finished_products.update_one(
                {"id": update['id']},
                {"$set": {"current_stock": update['new_stock']}}
            )
    
    async def rollback_stock():
        for update in stock_updates:
            await db.finished_products.update_one(
                {"id": update['id']},
                {"$set": {"current_stock": update['original_stock']}}
            )
    
    tm.add_step('deduct_stock', deduct_stock, rollback_stock)
    
    # Step 2: Create dispatch record
    async def create_dispatch_record():
        await db.dispatches.insert_one(dispatch_doc)
        return dispatch_doc
    
    async def rollback_dispatch_record():
        await db.dispatches.delete_one({"id": dispatch_id})
    
    tm.add_step('create_dispatch_record', create_dispatch_record, rollback_dispatch_record)
    
    # Execute transaction
    success, result = await tm.execute()
    
    if not success:
        raise HTTPException(status_code=500, detail=f"Transaction failed: {result}")
    
    await log_activity(current_user['username'], "created", "dispatch", f"Dispatch {dispatch.challan_number} to {dispatch.destination}", dispatch_id, "dispatch")
    return DispatchResponse(**dispatch_doc)


@router.get("/dispatch", response_model=List[DispatchResponse])
async def get_dispatches(current_user: dict = Depends(get_current_user)):
    dispatches = await db.dispatches.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    return dispatches


@router.put("/dispatch/{dispatch_id}")
async def update_dispatch(dispatch_id: str, dispatch: DispatchCreate, current_user: dict = Depends(get_current_user)):
    if current_user['role'] == 'view':
        raise HTTPException(status_code=403, detail="View-only users cannot update dispatches")
    dispatch_date = dispatch.dispatch_date or datetime.now(timezone.utc).date().isoformat()
    await validate_entry_date(dispatch_date, current_user)
    existing = await db.dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    for product in existing.get('products', []):
        sku_name = product.get('sku', '')
        qty = product.get('quantity', 0)
        if sku_name and qty > 0:
            records = await db.finished_products.find({"sku": sku_name}, {"_id": 0}).sort("created_at", 1).to_list(10000)
            for record in records:
                if qty <= 0:
                    break
                restore = min(qty, record['quantity'] - record['current_stock'])
                if restore > 0:
                    await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": restore}})
                    qty -= restore
    for product in dispatch.products:
        sku_name = product.get('sku', '')
        quantity_to_dispatch = product['quantity']
        if sku_name:
            records = await db.finished_products.find(
                {"sku": sku_name, "current_stock": {"$gt": 0}}, {"_id": 0}
            ).sort("created_at", 1).to_list(10000)
            total_available = sum(r['current_stock'] for r in records)
            if total_available < quantity_to_dispatch:
                raise HTTPException(status_code=400, detail=f"Insufficient stock for {sku_name}. Available: {total_available}, Required: {quantity_to_dispatch}")
            remaining = quantity_to_dispatch
            for record in records:
                if remaining <= 0:
                    break
                deduct = min(record['current_stock'], remaining)
                await db.finished_products.update_one(
                    {"id": record['id']}, {"$set": {"current_stock": record['current_stock'] - deduct}}
                )
                remaining -= deduct
    update_doc = {
        "dispatch_type": dispatch.dispatch_type, "challan_number": dispatch.challan_number,
        "products": dispatch.products, "destination": dispatch.destination,
        "notes": dispatch.notes, "date": dispatch_date
    }
    await db.dispatches.update_one({"id": dispatch_id}, {"$set": update_doc})
    updated = await db.dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    await log_activity(current_user['username'], "updated", "dispatch", f"Updated dispatch {dispatch.challan_number}", dispatch_id, "dispatch")
    return DispatchResponse(**updated)


@router.delete("/dispatch/{dispatch_id}")
async def delete_dispatch(dispatch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can delete dispatches")
    existing = await db.dispatches.find_one({"id": dispatch_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Dispatch not found")
    for product in existing.get('products', []):
        sku_name = product.get('sku', '')
        qty = product.get('quantity', 0)
        if sku_name and qty > 0:
            records = await db.finished_products.find({"sku": sku_name}, {"_id": 0}).sort("created_at", 1).to_list(10000)
            for record in records:
                if qty <= 0:
                    break
                restore = min(qty, record['quantity'] - record['current_stock'])
                if restore > 0:
                    await db.finished_products.update_one({"id": record['id']}, {"$inc": {"current_stock": restore}})
                    qty -= restore
    await db.dispatches.delete_one({"id": dispatch_id})
    await log_activity(current_user['username'], "deleted", "dispatch", f"Deleted dispatch {existing['challan_number']}", dispatch_id, "dispatch")
    return {"message": "Dispatch deleted successfully"}
