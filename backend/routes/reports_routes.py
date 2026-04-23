from fastapi import APIRouter, Depends
from typing import Optional
from datetime import datetime, timezone

from database import db
from auth import get_current_user

router = APIRouter(prefix="/api")


# ============ PRODUCT STOCK REPORT ============

@router.get("/reports/product-stock")
async def get_product_stock_report(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    semi_raw = await db.semi_finished_products.find({}, {"_id": 0}).to_list(10000)
    finished_raw = await db.finished_products.find({}, {"_id": 0}).to_list(10000)
    dispatches = await db.dispatches.find({}, {"_id": 0}).to_list(10000)
    all_masters = await db.semi_finished_masters.find({}, {"_id": 0}).to_list(10000)
    master_map = {m['name']: m for m in all_masters}
    all_initial = await db.initial_stocks.find({}, {"_id": 0}).to_list(10000)
    sf_initial = {s['name']: s for s in all_initial if s['type'] == 'semi_finished'}
    fin_initial = {s['name']: s for s in all_initial if s['type'] == 'finished'}
    
    # Fetch repacks and wastages for accurate stock calculation
    all_repacks = await db.finished_product_repacks.find({}, {"_id": 0}).to_list(5000)
    all_wastages = await db.finished_product_wastages.find({}, {"_id": 0}).to_list(5000)

    sf_names = sorted(set(list(set(p['product_name'] for p in semi_raw)) + list(sf_initial.keys())))
    semi_result = []
    for name in sf_names:
        prods = [p for p in semi_raw if p['product_name'] == name]
        sf_ids = [p['id'] for p in prods]
        packings = [fp for fp in finished_raw if fp.get('semi_finished_id') in sf_ids]
        semi_master = master_map.get(name)
        opening = 0; in_range = 0; out_range = 0
        init = sf_initial.get(name)
        if init:
            if start_date and init['date'] < start_date:
                opening += init['quantity']
            elif end_date and init['date'] > end_date:
                pass
            else:
                in_range += init['quantity']
        for p in prods:
            qty = round(p['quantity_kg'], 2)
            if start_date and p['date'] < start_date:
                opening += qty
            elif end_date and p['date'] > end_date:
                continue
            else:
                in_range += qty
        for pk in packings:
            if pk.get('semi_finished_consumed') is not None:
                consumed = round(pk['semi_finished_consumed'], 2)
            else:
                consumed = pk['quantity'] + pk['quantity_wasted']
                if semi_master:
                    for mapping in semi_master.get('finished_sku_mappings', []):
                        if mapping['sku_name'] == pk['sku']:
                            consumed = round(mapping['quantity_consumed'] * pk['quantity'] + pk['quantity_wasted'], 2)
                            break
            if start_date and pk['date'] < start_date:
                opening -= consumed
            elif end_date and pk['date'] > end_date:
                continue
            else:
                out_range += consumed
        semi_result.append({
            "product_name": name, "opening_stock": round(opening, 2),
            "produced": round(in_range, 2), "packed_out": round(out_range, 2),
            "closing_stock": round(opening + in_range - out_range, 2),
            "batch_count": len(prods)
        })

    sku_set = sorted(set(list(set(fp['sku'] for fp in finished_raw)) + list(fin_initial.keys())))
    fin_result = []
    for sku in sku_set:
        entries = [fp for fp in finished_raw if fp['sku'] == sku]
        unit = entries[0].get('unit', '') if entries else fin_initial.get(sku, {}).get('unit', '')
        opening = 0; produced_range = 0; wasted_range = 0; dispatched_range = 0; repack_out_range = 0; wastage_booked_range = 0
        
        init = fin_initial.get(sku)
        if init:
            if start_date and init['date'] < start_date:
                opening += init['quantity']
            elif end_date and init['date'] > end_date:
                pass
            else:
                produced_range += init['quantity']
        
        # Production (packing, batch, receive, repack-in)
        for fp in entries:
            qty = fp['quantity']; wasted = fp['quantity_wasted']
            if start_date and fp['date'] < start_date:
                opening += qty
            elif end_date and fp['date'] > end_date:
                continue
            else:
                produced_range += qty; wasted_range += wasted
        
        # Dispatches
        for d in dispatches:
            for prod in d.get('products', []):
                if prod.get('sku') == sku:
                    dqty = prod.get('quantity', 0)
                    if start_date and d['date'] < start_date:
                        opening -= dqty
                    elif end_date and d['date'] > end_date:
                        continue
                    else:
                        dispatched_range += dqty
        
        # Repack Out (source SKU loses stock when repacked to another SKU)
        repacks_out = [rp for rp in all_repacks if rp.get('source_sku') == sku]
        for rp in repacks_out:
            rp_qty = rp.get('quantity_used', 0)
            if start_date and rp['date'] < start_date:
                opening -= rp_qty
            elif end_date and rp['date'] > end_date:
                continue
            else:
                repack_out_range += rp_qty
        
        # Book Wastage (wastage entries reduce stock)
        wastages = [w for w in all_wastages if w.get('sku') == sku]
        for w in wastages:
            w_qty = w.get('quantity', 0)
            if start_date and w['date'] < start_date:
                opening -= w_qty
            elif end_date and w['date'] > end_date:
                continue
            else:
                wastage_booked_range += w_qty
        
        # Closing = Opening + Produced - Dispatched - Repack Out - Wastage Booked
        closing = round(opening + produced_range - dispatched_range - repack_out_range - wastage_booked_range, 2)
        
        fin_result.append({
            "sku": sku, "unit": unit, "opening_stock": round(opening, 2),
            "produced": round(produced_range, 2), "wasted": round(wasted_range, 2),
            "dispatched": round(dispatched_range, 2),
            "repack_out": round(repack_out_range, 2),
            "wastage_booked": round(wastage_booked_range, 2),
            "closing_stock": closing
        })
    return {"semi_finished": semi_result, "finished": fin_result}


# ============ MILK TS REPORT ============

@router.get("/reports/milk-ts")
async def get_milk_ts_report(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    # Build date query for MongoDB-level filtering
    date_query = {}
    if start_date or end_date:
        date_query["date"] = {}
        if start_date:
            # Fetch data from before start_date for opening balance
            pass  # We need all data before start_date for opening balance calc
        if end_date:
            date_query["date"]["$lte"] = end_date
    
    # Optimized: Use aggregation with date filter where possible
    purchases = await db.milk_stock.find({}, {"_id": 0}).sort("date", 1).to_list(5000)
    batches = await db.batches.find({}, {"_id": 0, "id": 1, "date": 1, "batch_number": 1, "product_name": 1, "milk_kg": 1, "fat_percent": 1, "snf_percent": 1, "is_opening_balance": 1}).sort("date", 1).to_list(5000)
    adjustments = await db.milk_adjustments.find({}, {"_id": 0}).sort("date", 1).to_list(2000)
    all_txns = []
    for p in purchases:
        # Skip opening balance entries - they're handled as initial stock
        if p.get('is_opening_balance'):
            continue
        all_txns.append({
            "date": p['date'], "type": "Purchase",
            "milk_kg_in": p['quantity_kg'], "fat_kg_in": p['fat_kg'], "snf_kg_in": p['snf_kg'],
            "milk_kg_out": 0, "fat_kg_out": 0, "snf_kg_out": 0,
            "gain_milk": 0, "gain_fat": 0, "gain_snf": 0,
            "loss_milk": 0, "loss_fat": 0, "loss_snf": 0,
            "description": f"Purchased {p['quantity_kg']:.2f} kg (Fat {p['fat_percent']}%, SNF {p['snf_percent']}%)"
        })
    for b in batches:
        # Skip opening balance batches (they have 0 milk usage anyway)
        if b.get('is_opening_balance'):
            continue
        milk_kg = b.get('milk_kg', 0)
        fat_kg = round(b.get('fat_percent', 0) * milk_kg / 100, 4)
        snf_kg = round(b.get('snf_percent', 0) * milk_kg / 100, 4)
        all_txns.append({
            "date": b['date'], "type": "Batch Usage",
            "milk_kg_in": 0, "fat_kg_in": 0, "snf_kg_in": 0,
            "milk_kg_out": milk_kg, "fat_kg_out": fat_kg, "snf_kg_out": snf_kg,
            "gain_milk": 0, "gain_fat": 0, "gain_snf": 0,
            "loss_milk": 0, "loss_fat": 0, "loss_snf": 0,
            "description": f"Batch {b['batch_number']} - {b['product_name']}"
        })
    for a in adjustments:
        is_gain = a.get('type') == 'gain'
        qty = a.get('quantity_kg', 0); fat = a.get('fat_kg', 0); snf = a.get('snf_kg', 0)
        all_txns.append({
            "date": a['date'], "type": f"Adjustment ({'Gain' if is_gain else 'Loss'})",
            "milk_kg_in": 0, "fat_kg_in": 0, "snf_kg_in": 0,
            "milk_kg_out": 0, "fat_kg_out": 0, "snf_kg_out": 0,
            "gain_milk": qty if is_gain else 0, "gain_fat": fat if is_gain else 0, "gain_snf": snf if is_gain else 0,
            "loss_milk": qty if not is_gain else 0, "loss_fat": fat if not is_gain else 0, "loss_snf": snf if not is_gain else 0,
            "description": f"{'Gain' if is_gain else 'Loss'}: {a.get('notes', '') or 'Adjustment'}"
        })
    all_txns.sort(key=lambda x: x['date'])

    def net_change(t):
        return (t['milk_kg_in'] - t['milk_kg_out'] + t['gain_milk'] - t['loss_milk'],
                t['fat_kg_in'] - t['fat_kg_out'] + t['gain_fat'] - t['loss_fat'],
                t['snf_kg_in'] - t['snf_kg_out'] + t['gain_snf'] - t['loss_snf'])

    # Opening balance entries are skipped - user will add opening data manually
    
    opening_milk = 0; opening_fat = 0; opening_snf = 0
    filtered_txns = []
    for t in all_txns:
        dm, df, ds = net_change(t)
        if start_date and t['date'] < start_date:
            opening_milk += dm; opening_fat += df; opening_snf += ds
        elif end_date and t['date'] > end_date:
            continue
        else:
            filtered_txns.append(t)

    bal_m = round(opening_milk, 4); bal_f = round(opening_fat, 4); bal_s = round(opening_snf, 4)
    for t in filtered_txns:
        dm, df, ds = net_change(t)
        bal_m = round(bal_m + dm, 4); bal_f = round(bal_f + df, 4); bal_s = round(bal_s + ds, 4)
        t['balance_milk_kg'] = bal_m; t['balance_fat_kg'] = bal_f; t['balance_snf_kg'] = bal_s

    dates = sorted(set(t['date'] for t in filtered_txns))
    daily_summary = []
    
    # No automatic Initial Stock handling - user adds opening data manually
    r_m = round(opening_milk, 4)
    r_f = round(opening_fat, 4)
    r_s = round(opening_snf, 4)
    
    for d in dates:
        dt = [t for t in filtered_txns if t['date'] == d]
        # Purchased = all incoming milk (Purchase type)
        pm = sum(t['milk_kg_in'] for t in dt)
        pf = sum(t['fat_kg_in'] for t in dt)
        ps = sum(t['snf_kg_in'] for t in dt)
        um = sum(t['milk_kg_out'] for t in dt); uf = sum(t['fat_kg_out'] for t in dt); us = sum(t['snf_kg_out'] for t in dt)
        gm = sum(t['gain_milk'] for t in dt); gf = sum(t['gain_fat'] for t in dt); gs = sum(t['gain_snf'] for t in dt)
        lm = sum(t['loss_milk'] for t in dt); lf = sum(t['loss_fat'] for t in dt); ls = sum(t['loss_snf'] for t in dt)
        cm = round(r_m + pm - um + gm - lm, 4); cf = round(r_f + pf - uf + gf - lf, 4); cs = round(r_s + ps - us + gs - ls, 4)
        daily_summary.append({
            "date": d,
            "opening_milk_kg": round(r_m, 2), "opening_fat_kg": round(r_f, 2), "opening_snf_kg": round(r_s, 2),
            "purchased_milk_kg": round(pm, 2), "purchased_fat_kg": round(pf, 2), "purchased_snf_kg": round(ps, 2),
            "used_milk_kg": round(um, 2), "used_fat_kg": round(uf, 2), "used_snf_kg": round(us, 2),
            "gain_milk_kg": round(gm, 2), "gain_fat_kg": round(gf, 2), "gain_snf_kg": round(gs, 2),
            "loss_milk_kg": round(lm, 2), "loss_fat_kg": round(lf, 2), "loss_snf_kg": round(ls, 2),
            "closing_milk_kg": round(cm, 2), "closing_fat_kg": round(cf, 2), "closing_snf_kg": round(cs, 2)
        })
        r_m = cm; r_f = cf; r_s = cs

    # Calculate totals
    tp_m = round(sum(t['milk_kg_in'] for t in filtered_txns), 2)
    tp_f = round(sum(t['fat_kg_in'] for t in filtered_txns), 2)
    tp_s = round(sum(t['snf_kg_in'] for t in filtered_txns), 2)
    tu_m = round(sum(t['milk_kg_out'] for t in filtered_txns), 2)
    tu_f = round(sum(t['fat_kg_out'] for t in filtered_txns), 2)
    tu_s = round(sum(t['snf_kg_out'] for t in filtered_txns), 2)
    tg_m = round(sum(t['gain_milk'] for t in filtered_txns), 2)
    tg_f = round(sum(t['gain_fat'] for t in filtered_txns), 2)
    tg_s = round(sum(t['gain_snf'] for t in filtered_txns), 2)
    tl_m = round(sum(t['loss_milk'] for t in filtered_txns), 2)
    tl_f = round(sum(t['loss_fat'] for t in filtered_txns), 2)
    tl_s = round(sum(t['loss_snf'] for t in filtered_txns), 2)
    
    return {
        "opening": {"milk_kg": round(opening_milk, 2), "fat_kg": round(opening_fat, 2), "snf_kg": round(opening_snf, 2)},
        "total_purchased": {"milk_kg": tp_m, "fat_kg": tp_f, "snf_kg": tp_s},
        "total_used": {"milk_kg": tu_m, "fat_kg": tu_f, "snf_kg": tu_s},
        "total_gain": {"milk_kg": tg_m, "fat_kg": tg_f, "snf_kg": tg_s},
        "total_loss": {"milk_kg": tl_m, "fat_kg": tl_f, "snf_kg": tl_s},
        "closing": {
            "milk_kg": round(opening_milk + tp_m - tu_m + tg_m - tl_m, 2),
            "fat_kg": round(opening_fat + tp_f - tu_f + tg_f - tl_f, 2),
            "snf_kg": round(opening_snf + tp_s - tu_s + tg_s - tl_s, 2)
        },
        "daily_summary": daily_summary, "transactions": filtered_txns
    }


# ============ STOCK LEDGER REPORTS ============

@router.get("/reports/semi-finished-ledger")
async def get_semi_finished_ledger(
    product_name: Optional[str] = None, start_date: Optional[str] = None,
    end_date: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    # Build optimized query with product filter
    sf_query = {}
    if product_name:
        sf_query["product_name"] = product_name
    
    # Use projection to fetch only needed fields
    semi_products = await db.semi_finished_products.find(
        sf_query, 
        {"_id": 0, "id": 1, "product_name": 1, "quantity_kg": 1, "date": 1, "batch_id": 1, "is_opening_balance": 1}
    ).sort("date", 1).to_list(2000)
    
    product_names = list(set(p['product_name'] for p in semi_products))
    
    # Only fetch masters for relevant products
    master_query = {"name": {"$in": product_names}} if product_names else {}
    all_masters = await db.semi_finished_masters.find(master_query, {"_id": 0}).to_list(100)
    master_map = {m['name']: m for m in all_masters}
    
    # Only fetch relevant initial stocks
    init_query = {"type": "semi_finished"}
    if product_name:
        init_query["name"] = product_name
    initial_stocks = await db.initial_stocks.find(init_query, {"_id": 0}).to_list(100)
    initial_map = {s['name']: s for s in initial_stocks}
    
    # Also check for opening balance entries from archive (in semi_finished_products)
    ob_sf_query = {"is_opening_balance": True}
    if product_name:
        ob_sf_query["product_name"] = product_name
    ob_sf = await db.semi_finished_products.find(ob_sf_query, {"_id": 0}).to_list(100)
    for ob in ob_sf:
        ob_name = ob.get('product_name', '')
        if ob_name and ob_name not in initial_map:
            initial_map[ob_name] = {
                'name': ob_name,
                'type': 'semi_finished',
                'quantity': ob.get('quantity_kg', 0),
                'date': ob.get('date', ''),
            }
    
    for iname in initial_map:
        if iname not in product_names:
            product_names.append(iname)
    result = []
    for name in sorted(product_names):
        prods = [p for p in semi_products if p['product_name'] == name]
        sf_ids = [p['id'] for p in prods]
        
        # Optimized: Only fetch packings for these specific semi-finished IDs
        packings = await db.finished_products.find(
            {"semi_finished_id": {"$in": sf_ids}}, 
            {"_id": 0, "id": 1, "date": 1, "sku": 1, "quantity": 1, "quantity_wasted": 1, "semi_finished_consumed": 1, "batch_number": 1, "notes": 1, "semi_finished_id": 1}
        ).sort("date", 1).to_list(2000)
        
        semi_master = master_map.get(name)
        batch_ids = list(set(p.get('batch_id', '') for p in prods if p.get('batch_id')))
        
        # Only fetch needed batch info
        batches_list = await db.batches.find(
            {"id": {"$in": batch_ids}}, 
            {"_id": 0, "id": 1, "batch_number": 1}
        ).to_list(500)
        batch_num_map = {b['id']: b.get('batch_number', '') for b in batches_list}
        all_txns = []
        init = initial_map.get(name)
        if init:
            all_txns.append({"date": init['date'], "type": "Initial Stock", "description": "Opening balance", "in_qty": round(init['quantity'], 2), "out_qty": 0})
        for p in prods:
            # Skip opening balance entries - they're shown as Initial Stock
            if p.get('is_opening_balance'):
                continue
            bn = batch_num_map.get(p.get('batch_id', ''), '')
            bn_label = f" [{bn}]" if bn else ""
            all_txns.append({"date": p['date'], "type": "Production", "description": f"Batch{bn_label} production ({p['quantity_kg']:.2f} kg)", "in_qty": round(p['quantity_kg'], 2), "out_qty": 0})
        for pk in packings:
            if pk.get('semi_finished_consumed') is not None:
                # Manual mode: user entered total consumption (wastage is informational)
                consumed_kg = round(pk['semi_finished_consumed'], 2)
            else:
                consumed_kg = pk['quantity'] + pk['quantity_wasted']
                if semi_master:
                    for mapping in semi_master.get('finished_sku_mappings', []):
                        if mapping['sku_name'] == pk['sku']:
                            consumed_kg = round(mapping['quantity_consumed'] * pk['quantity'] + pk['quantity_wasted'], 2)
                            break
            pk_bn = pk.get('batch_number', '')
            pk_bn_label = f" [{pk_bn}]" if pk_bn else ""
            notes_label = f" | {pk['notes']}" if pk.get('notes') else ""
            all_txns.append({"date": pk['date'], "type": "Packing", "description": f"Packed{pk_bn_label} {pk['sku']} x {pk['quantity']:.0f} (consumed {consumed_kg:.2f} kg){notes_label}", "in_qty": 0, "out_qty": consumed_kg})
        all_txns.sort(key=lambda x: x['date'])
        opening = 0; filtered_txns = []
        for t in all_txns:
            if start_date and t['date'] < start_date:
                opening += t['in_qty'] - t['out_qty']
            elif end_date and t['date'] > end_date:
                continue
            else:
                filtered_txns.append(t)
        balance = round(opening, 2)
        for t in filtered_txns:
            balance = round(balance + t['in_qty'] - t['out_qty'], 2)
            t['balance'] = balance
        total_in = round(sum(t['in_qty'] for t in filtered_txns), 2)
        total_out = round(sum(t['out_qty'] for t in filtered_txns), 2)
        result.append({
            "product_name": name, "opening_stock": round(opening, 2),
            "total_in": total_in, "total_out": total_out,
            "closing_stock": round(opening + total_in - total_out, 2),
            "transactions": filtered_txns
        })
    return result


@router.get("/reports/finished-ledger")
async def get_finished_ledger(
    sku: Optional[str] = None, start_date: Optional[str] = None,
    end_date: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    # Build optimized query
    fp_query = {}
    if sku:
        fp_query["sku"] = sku
    
    # Use projection to fetch only needed fields
    finished_products = await db.finished_products.find(
        fp_query, 
        {"_id": 0, "id": 1, "sku": 1, "quantity": 1, "date": 1, "unit": 1, "source": 1, "source_receive_id": 1, "batch_number": 1, "is_opening_balance": 1}
    ).sort("date", 1).to_list(3000)
    
    sku_names = list(set(p['sku'] for p in finished_products))
    
    # Only fetch dispatches for these SKUs (using aggregation to filter)
    dispatches = await db.dispatches.find(
        {}, {"_id": 0, "date": 1, "challan_number": 1, "destination": 1, "products": 1}
    ).sort("date", 1).to_list(2000)
    
    # Only fetch relevant initial stocks
    init_query = {"type": "finished"}
    if sku:
        init_query["name"] = sku
    initial_stocks = await db.initial_stocks.find(init_query, {"_id": 0}).to_list(100)
    initial_map = {s['name']: s for s in initial_stocks}
    
    # Also check for opening balance receives (from archive)
    ob_receives_query = {"is_opening_balance": True}
    if sku:
        ob_receives_query["sku"] = sku
    ob_receives = await db.finished_product_receives.find(ob_receives_query, {"_id": 0}).to_list(100)
    for ob in ob_receives:
        ob_sku = ob.get('sku', '')
        if ob_sku and ob_sku not in initial_map:
            initial_map[ob_sku] = {
                'name': ob_sku,
                'type': 'finished',
                'quantity': ob.get('quantity', 0),
                'date': ob.get('receive_date', ''),
                'unit': ob.get('unit', '')
            }
    
    for iname in initial_map:
        if iname not in sku_names:
            sku_names.append(iname)

    # Pre-fetch receives, repacks, wastages to avoid N+1 queries
    all_receive_ids = [p.get('source_receive_id', '') for p in finished_products if p.get('source') == 'receive']
    all_receives = await db.finished_product_receives.find(
        {"id": {"$in": all_receive_ids}}, {"_id": 0, "id": 1, "source_name": 1}
    ).to_list(500) if all_receive_ids else []
    receives_map = {r['id']: r for r in all_receives}
    
    # Filter repacks and wastages by SKU if specified
    repack_query = {"source_sku": sku} if sku else {}
    wastage_query = {"sku": sku} if sku else {}
    all_repacks = await db.finished_product_repacks.find(repack_query, {"_id": 0}).to_list(1000)
    all_wastages = await db.finished_product_wastages.find(wastage_query, {"_id": 0}).to_list(1000)

    result = []
    for sku_name in sorted(sku_names):
        prods = [p for p in finished_products if p['sku'] == sku_name]
        unit = prods[0].get('unit', '') if prods else initial_map.get(sku_name, {}).get('unit', '')
        all_txns = []
        init = initial_map.get(sku_name)
        if init:
            all_txns.append({"date": init['date'], "type": "Initial Stock", "description": "Opening balance", "in_qty": round(init['quantity'], 2), "out_qty": 0})
        for p in prods:
            # Skip opening balance entries from receive - they're shown as Initial Stock
            if p.get('is_opening_balance') and p.get('source') == 'receive':
                continue
            source = p.get('source', '')
            if source == 'batch':
                desc = f"Batch production ({p['quantity']:.2f} {unit})"; txn_type = "Batch Production"
            elif source == 'receive':
                recv = receives_map.get(p.get('source_receive_id', ''))
                src_name = recv.get('source_name', 'External') if recv else 'External'
                desc = f"Received from {src_name} ({p['quantity']:.2f} {unit})"; txn_type = "Receive"
            elif source == 'repack':
                desc = f"Repacked [{p.get('batch_number', '')}] ({p['quantity']:.2f} {unit})"; txn_type = "Repack"
            else:
                desc = f"Packed {p['quantity']:.2f} {unit}"; txn_type = "Packing"
            all_txns.append({"date": p['date'], "type": txn_type, "description": desc, "in_qty": round(p['quantity'], 2), "out_qty": 0})
        for d in dispatches:
            for dp in d.get('products', []):
                if dp.get('sku', '') == sku_name or dp.get('finished_product_id', '') in [p['id'] for p in prods]:
                    all_txns.append({"date": d['date'], "type": "Dispatch", "description": f"Challan {d['challan_number']} to {d['destination']}", "in_qty": 0, "out_qty": round(dp['quantity'], 2)})
        repacks_out = [rp for rp in all_repacks if rp['source_sku'] == sku_name]
        for rp in repacks_out:
            all_txns.append({"date": rp['date'], "type": "Repack Out", "description": f"Repacked [{rp['repack_batch_number']}] to {rp['target_sku']} ({rp['quantity_used']:.2f} used, {rp.get('quantity_wasted', 0):.2f} waste, {rp.get('quantity_produced', 0):.2f} produced)", "in_qty": 0, "out_qty": round(rp['quantity_used'], 2)})
        wastages = [w for w in all_wastages if w['sku'] == sku_name]
        for w in wastages:
            all_txns.append({"date": w['date'], "type": "Book Wastage", "description": f"Wastage: {w['reason']} ({w['quantity']:.2f} {unit})", "in_qty": 0, "out_qty": round(w['quantity'], 2)})
        all_txns.sort(key=lambda x: x['date'])
        opening = 0; filtered_txns = []
        for t in all_txns:
            if start_date and t['date'] < start_date:
                opening += t['in_qty'] - t['out_qty']
            elif end_date and t['date'] > end_date:
                continue
            else:
                filtered_txns.append(t)
        balance = round(opening, 2)
        for t in filtered_txns:
            balance = round(balance + t['in_qty'] - t['out_qty'], 2)
            t['balance'] = balance
        total_in = round(sum(t['in_qty'] for t in filtered_txns), 2)
        total_out = round(sum(t['out_qty'] for t in filtered_txns), 2)
        result.append({
            "sku": sku_name, "unit": unit, "opening_stock": round(opening, 2),
            "total_in": total_in, "total_out": total_out,
            "closing_stock": round(opening + total_in - total_out, 2),
            "transactions": filtered_txns
        })
    return result


@router.get("/reports/raw-material-ledger")
async def get_raw_material_ledger(
    material: Optional[str] = None, start_date: Optional[str] = None,
    end_date: Optional[str] = None, current_user: dict = Depends(get_current_user)
):
    # Only fetch active masters or specific material
    master_query = {"name": material} if material else {}
    masters = await db.raw_material_masters.find(master_query, {"_id": 0, "name": 1, "unit": 1}).to_list(100)
    material_names = [m['name'] for m in masters]
    if material:
        material_names = [material]
    
    # Build date-aware queries for better performance
    batch_query = {}
    stock_query = {"name": {"$in": material_names}} if material_names else {}
    adj_query = {"material_name": {"$in": material_names}} if material_names else {}
    
    # Use projection to fetch only needed fields
    batches = await db.batches.find(
        batch_query, 
        {"_id": 0, "date": 1, "batch_number": 1, "raw_materials": 1}
    ).sort("date", 1).to_list(2000)
    
    stock_entries = await db.raw_material_stock.find(
        stock_query, {"_id": 0}
    ).sort("date", 1).to_list(2000)
    
    rm_adjs = await db.rm_adjustments.find(adj_query, {"_id": 0}).to_list(1000)
    rm_consumptions = await db.rm_direct_consumption.find(adj_query, {"_id": 0}).to_list(1000)
    
    # Only fetch finished products with additional_materials that contain our materials
    finished_products = await db.finished_products.find(
        {"additional_materials": {"$exists": True, "$ne": []}},
        {"_id": 0, "date": 1, "sku": 1, "batch_number": 1, "additional_materials": 1}
    ).sort("date", 1).to_list(2000)
    
    # Filter to only those with our materials
    finished_products = [
        fp for fp in finished_products 
        if any(am.get('name') in material_names and am.get('quantity', 0) > 0 for am in fp.get('additional_materials', []))
    ]
    
    init_query = {"type": "raw_material"}
    if material:
        init_query["name"] = material
    initial_stocks = await db.initial_stocks.find(init_query, {"_id": 0}).to_list(100)
    initial_map = {s['name']: s for s in initial_stocks}
    
    # Also check for opening balance entries from archive (in raw_material_stock)
    ob_stocks_query = {"is_opening_balance": True}
    if material:
        ob_stocks_query["name"] = material
    ob_stocks = await db.raw_material_stock.find(ob_stocks_query, {"_id": 0}).to_list(100)
    for ob in ob_stocks:
        ob_name = ob.get('name', '')
        if ob_name and ob_name not in initial_map:
            initial_map[ob_name] = {
                'name': ob_name,
                'type': 'raw_material',
                'quantity': ob.get('purchased', 0),  # Archive stores opening balance in 'purchased' field
                'date': ob.get('date', ''),  # Archive uses 'date' not 'purchase_date'
                'unit': ob.get('unit', 'kg')
            }
    
    master_unit_map = {m['name']: m['unit'] for m in masters}
    result = []
    for mat_name in sorted(material_names):
        all_txns = []
        init = initial_map.get(mat_name)
        if init:
            all_txns.append({"date": init['date'], "type": "Initial Stock", "description": "Opening balance", "in_qty": round(init['quantity'], 2), "out_qty": 0, "adj_qty": 0, "cost_per_unit": 0})
        for s in stock_entries:
            # Skip opening balance entries - they're shown as Initial Stock
            if s.get('is_opening_balance'):
                continue
            if s['name'] == mat_name and s['purchased'] > 0:
                all_txns.append({"date": s['date'], "type": "Purchase", "description": f"Purchased {s['purchased']:.2f} {master_unit_map.get(mat_name, 'kg')}", "in_qty": round(s['purchased'], 2), "out_qty": 0, "adj_qty": 0, "cost_per_unit": s.get('cost_per_unit', 0), "entry_id": s['id']})
        for b in batches:
            for rm in b.get('raw_materials', []):
                if rm['name'] == mat_name:
                    all_txns.append({"date": b['date'], "type": "Batch Usage", "description": f"Used in batch {b['batch_number']}", "in_qty": 0, "out_qty": round(rm['quantity'], 2), "adj_qty": 0, "cost_per_unit": rm.get('cost_per_unit', 0)})
        for adj in rm_adjs:
            if adj['material_name'] == mat_name:
                is_gain = adj['type'] == 'gain'
                all_txns.append({"date": adj['date'], "type": f"Adjustment ({'Gain' if is_gain else 'Loss'})", "description": f"{'Gain' if is_gain else 'Loss'}: {adj.get('notes', '') or 'Stock adjustment'}", "in_qty": 0, "out_qty": 0, "adj_qty": round(adj['quantity'], 2) if is_gain else round(-adj['quantity'], 2), "cost_per_unit": 0, "entry_id": adj['id'], "adj_type": adj['type'], "adj_raw_qty": adj['quantity'], "adj_notes": adj.get('notes', '')})
        for dc in rm_consumptions:
            if dc['material_name'] == mat_name:
                all_txns.append({"date": dc['date'], "type": "Direct Consumption", "description": f"{dc['reason']}{' - ' + dc['notes'] if dc.get('notes') else ''}", "in_qty": 0, "out_qty": round(dc['quantity'], 2), "adj_qty": 0, "cost_per_unit": 0})
        for fp in finished_products:
            for am in fp.get('additional_materials', []):
                if am.get('name') == mat_name and am.get('quantity', 0) > 0:
                    all_txns.append({"date": fp['date'], "type": "Packing Usage", "description": f"Packing {fp['sku']} (Batch {fp.get('batch_number', 'N/A')})", "in_qty": 0, "out_qty": round(am['quantity'], 2), "adj_qty": 0, "cost_per_unit": am.get('cost_per_unit', 0)})
        all_txns.sort(key=lambda x: x['date'])
        opening = 0; filtered_txns = []
        for t in all_txns:
            if start_date and t['date'] < start_date:
                opening += t['in_qty'] - t['out_qty'] + t['adj_qty']
            elif end_date and t['date'] > end_date:
                continue
            else:
                filtered_txns.append(t)
        balance = round(opening, 2)
        for t in filtered_txns:
            balance = round(balance + t['in_qty'] - t['out_qty'] + t['adj_qty'], 2)
            t['balance'] = balance
        total_in = round(sum(t['in_qty'] for t in filtered_txns), 2)
        total_out = round(sum(t['out_qty'] for t in filtered_txns), 2)
        total_adj = round(sum(t['adj_qty'] for t in filtered_txns), 2)
        if len(all_txns) > 0 or not material:
            result.append({
                "material_name": mat_name, "unit": master_unit_map.get(mat_name, 'kg'),
                "opening_stock": round(opening, 2), "total_in": total_in,
                "total_out": total_out, "total_adjustment": total_adj,
                "closing_stock": round(opening + total_in - total_out + total_adj, 2),
                "transactions": filtered_txns
            })
    return result


# ============ WASTAGE / LOSS SUMMARY ============

@router.get("/reports/wastage-loss-summary")
async def get_wastage_loss_summary(
    start_date: Optional[str] = None, end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    entries = []
    
    # Build date query for MongoDB-level filtering
    date_query = {}
    if start_date or end_date:
        date_query["date"] = {}
        if start_date:
            date_query["date"]["$gte"] = start_date
        if end_date:
            date_query["date"]["$lte"] = end_date
    
    # Packing wastage from semi-finished to finished (stored in finished_products collection)
    packing_query = {**date_query, "quantity_wasted": {"$gt": 0}} if date_query else {"quantity_wasted": {"$gt": 0}}
    packing_entries = await db.finished_products.find(
        packing_query, {"_id": 0, "date": 1, "semi_finished_id": 1, "sku": 1, "quantity_wasted": 1, "notes": 1}
    ).to_list(1000)
    
    # Get semi-finished product names for display
    sf_ids = list(set(pe.get('semi_finished_id', '') for pe in packing_entries))
    sf_products = await db.semi_finished_products.find({"id": {"$in": sf_ids}}, {"_id": 0, "id": 1, "product_name": 1}).to_list(1000)
    sf_name_map = {sf['id']: sf['product_name'] for sf in sf_products}
    
    for pe in packing_entries:
        product_name = sf_name_map.get(pe.get('semi_finished_id', ''), 'Unknown')
        entries.append({
            "date": pe.get('date', ''), "category": "Packing Wastage", 
            "item": f"{product_name} -> {pe.get('sku', 'Unknown')}", "type": "loss", 
            "quantity": round(pe.get('quantity_wasted', 0), 2), "unit": "kg", 
            "notes": pe.get('notes', ''), "source": "packing"
        })
    
    fp_wastages = await db.finished_product_wastages.find(
        date_query, {"_id": 0}
    ).to_list(1000)
    
    for w in fp_wastages:
        entries.append({
            "date": w.get('date', ''), "category": "Book Wastage", 
            "item": w.get('sku', ''), "type": "loss", 
            "quantity": round(w['quantity'], 2), "unit": w.get('unit', ''), 
            "notes": w.get('reason', '') + (' - ' + w.get('notes', '') if w.get('notes') else ''), 
            "source": "finished_wastage"
        })
    
    repack_query = {**date_query, "quantity_wasted": {"$gt": 0}} if date_query else {"quantity_wasted": {"$gt": 0}}
    repacks = await db.finished_product_repacks.find(
        repack_query, {"_id": 0, "date": 1, "source_sku": 1, "target_sku": 1, "repack_batch_number": 1, "quantity_wasted": 1, "notes": 1}
    ).to_list(500)
    
    for rp in repacks:
        entries.append({
            "date": rp.get('date', ''), "category": "Repack Wastage", 
            "item": f"{rp.get('source_sku', '')} -> {rp.get('target_sku', '')} [{rp.get('repack_batch_number', '')}]", 
            "type": "loss", "quantity": round(rp.get('quantity_wasted', 0), 2), "unit": "", 
            "notes": rp.get('notes', ''), "source": "repack"
        })
    
    milk_adj_query = {**date_query, "quantity_kg": {"$ne": 0}} if date_query else {"quantity_kg": {"$ne": 0}}
    milk_adjs = await db.milk_adjustments.find(milk_adj_query, {"_id": 0}).to_list(500)
    
    for ma in milk_adjs:
        qty = ma.get('quantity_kg', 0)
        entries.append({
            "date": ma.get('date', ''), "category": "Milk Adjustment", 
            "item": f"Milk ({ma.get('type', 'loss')})", "type": ma.get('type', 'loss'), 
            "quantity": round(abs(qty), 2), "unit": "kg", 
            "notes": ma.get('notes', ''), "source": "milk_adjustment"
        })
    
    rm_adjs = await db.rm_adjustments.find(date_query, {"_id": 0}).to_list(500)
    
    for ra in rm_adjs:
        entries.append({
            "date": ra.get('date', ''), "category": "Raw Material Adjustment", 
            "item": ra.get('material_name', ''), "type": ra.get('type', 'loss'), 
            "quantity": round(abs(ra.get('quantity', 0)), 2), "unit": "", 
            "notes": ra.get('notes', ''), "source": "rm_adjustment"
        })
    
    rm_consumptions = await db.rm_direct_consumption.find(date_query, {"_id": 0}).to_list(500)
    
    for dc in rm_consumptions:
        entries.append({
            "date": dc.get('date', ''), "category": "RM Direct Consumption", 
            "item": dc.get('material_name', ''), "type": "loss", 
            "quantity": round(dc['quantity'], 2), "unit": dc.get('unit', ''), 
            "notes": dc.get('reason', '') + (' - ' + dc.get('notes', '') if dc.get('notes') else ''), 
            "source": "rm_consumption"
        })
    entries.sort(key=lambda x: x['date'], reverse=True)
    summary = {}
    for e in entries:
        cat = e['category']
        if cat not in summary:
            summary[cat] = {"category": cat, "total_loss": 0, "total_gain": 0, "count": 0}
        summary[cat]["count"] += 1
        if e['type'] == 'loss':
            summary[cat]["total_loss"] += e['quantity']
        else:
            summary[cat]["total_gain"] += e['quantity']
    return {"entries": entries, "summary": list(summary.values()), "total_entries": len(entries)}


# ============ SUMMARIES ============

@router.get("/finished-products-summary")
async def get_finished_products_summary(current_user: dict = Depends(get_current_user)):
    products = await db.finished_products.find({}, {"_id": 0}).to_list(10000)
    agg = {}
    for p in products:
        sku = p['sku']
        if sku not in agg:
            agg[sku] = {"sku": sku, "unit": p.get('unit', ''), "total_produced": 0, "total_wasted": 0, "current_stock": 0, "total_dispatched": 0}
        agg[sku]["total_produced"] += p['quantity']
        agg[sku]["total_wasted"] += p['quantity_wasted']
        agg[sku]["current_stock"] += p['current_stock']
    dispatches = await db.dispatches.find({}, {"_id": 0}).to_list(10000)
    for d in dispatches:
        for prod in d.get('products', []):
            sku = prod.get('sku', '')
            if sku in agg:
                agg[sku]["total_dispatched"] += prod.get('quantity', 0)
    return list(agg.values())


@router.get("/semi-finished-summary")
async def get_semi_finished_summary(current_user: dict = Depends(get_current_user)):
    products = await db.semi_finished_products.find({}, {"_id": 0}).to_list(10000)
    finished = await db.finished_products.find({}, {"_id": 0}).to_list(10000)
    masters = await db.semi_finished_masters.find({}, {"_id": 0}).to_list(10000)
    sku_consumption = {}
    for m in masters:
        for mapping in m.get('finished_sku_mappings', []):
            sku_consumption[(m['name'], mapping['sku_name'])] = mapping['quantity_consumed']
    # Build lookup map for semi-finished products
    sf_map = {p['id']: p for p in products}
    agg = {}
    for p in products:
        name = p['product_name']
        if name not in agg:
            agg[name] = {"product_name": name, "total_produced": 0, "total_consumed": 0, "batch_count": 0, "record_ids": []}
        agg[name]["total_produced"] += p['quantity_kg']
        agg[name]["batch_count"] += 1
        agg[name]["record_ids"].append(p['id'])
    for fp in finished:
        sf = sf_map.get(fp.get('semi_finished_id', ''))
        if sf and sf['product_name'] in agg:
            if fp.get('semi_finished_consumed') is not None:
                consumed = fp['semi_finished_consumed']
            else:
                qty_per_unit = sku_consumption.get((sf['product_name'], fp['sku']), 1.0)
                consumed = (qty_per_unit * fp['quantity']) + fp.get('quantity_wasted', 0)
            agg[sf['product_name']]["total_consumed"] += consumed
    result = []
    for name, data in agg.items():
        data["current_stock"] = round(data["total_produced"] - data["total_consumed"], 4)
        del data["total_consumed"]
        result.append(data)
    return result


@router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    batches_today = await db.batches.count_documents({"date": today})
    dispatches_today = await db.dispatches.count_documents({"date": today})
    finished_products = await db.finished_products.find({}, {"_id": 0}).to_list(10000)
    sku_totals = {}
    for p in finished_products:
        sku = p['sku']
        if sku not in sku_totals:
            sku_totals[sku] = {"sku": sku, "unit": p.get('unit', ''), "current_stock": 0}
        sku_totals[sku]["current_stock"] += p['current_stock']
    total_stock_items = sum(v['current_stock'] for v in sku_totals.values())
    low_stock = [v for v in sku_totals.values() if v['current_stock'] < 10]
    return {
        "batches_today": batches_today, "dispatches_today": dispatches_today,
        "total_stock_items": total_stock_items, "low_stock_count": len(low_stock),
        "low_stock_products": low_stock
    }


# ============ COST TREND REPORTS ============

@router.get("/reports/cost-trend/semi-finished")
async def cost_trend_semi_finished(product_name: str = None, start_date: str = None, end_date: str = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if product_name:
        query["product_name"] = product_name
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    batches = await db.batches.find(query, {"_id": 0}).sort("date", 1).to_list(5000)
    result = []
    for b in batches:
        milk_kg = b.get('milk_kg', 0)
        fat_cost = round((b.get('fat_percent', 0) * 10 * milk_kg / 1000) * b.get('fat_rate', 0), 2)
        snf_cost = round((b.get('snf_percent', 0) * 10 * milk_kg / 1000) * b.get('snf_rate', 0), 2)
        milk_cost = fat_cost + snf_cost
        other_rm_cost = sum(rm.get('quantity', 0) * rm.get('cost_per_unit', 0) for rm in b.get('raw_materials', []))
        # Include additional costs (labor, electricity, etc.) from batch
        additional_costs_total = sum(c.get('amount', 0) for c in b.get('additional_costs', []))
        total_cost = milk_cost + other_rm_cost + additional_costs_total
        qty = b.get('quantity_produced', 0)
        cost_per_unit = round(total_cost / qty, 2) if qty > 0 else 0
        result.append({
            "batch_number": b['batch_number'], "date": b['date'],
            "product_name": b['product_name'], "quantity_produced": qty,
            "milk_cost": milk_cost, "raw_material_cost": round(other_rm_cost + additional_costs_total, 2),
            "total_cost": round(total_cost, 2), "cost_per_unit": cost_per_unit
        })
    return result


@router.get("/reports/cost-trend/finished")
async def cost_trend_finished(sku: str = None, start_date: str = None, end_date: str = None, current_user: dict = Depends(get_current_user)):
    query = {}
    if sku:
        query["sku"] = sku
    if start_date or end_date:
        query["date"] = {}
        if start_date:
            query["date"]["$gte"] = start_date
        if end_date:
            query["date"]["$lte"] = end_date
    packings = await db.finished_products.find(query, {"_id": 0}).sort("date", 1).to_list(10000)

    # Exclude non-production entries (receives, repacks, wastage) from cost trend
    packings = [pk for pk in packings if pk.get('source') not in ('receive', 'repack', 'wastage')]

    # Batch-fetch all related batches for direct batch→finished products
    batch_ids = list(set(pk.get('batch_id', '') for pk in packings if pk.get('batch_id')))
    batches_list = await db.batches.find({"id": {"$in": batch_ids}}, {"_id": 0}).to_list(10000)
    archived_list = await db.batches_archive.find({"id": {"$in": batch_ids}}, {"_id": 0}).to_list(10000)
    batch_map = {b['id']: b for b in batches_list}
    batch_map.update({b['id']: b for b in archived_list})

    result = []
    for pk in packings:
        batch_number = pk.get('batch_number', '')
        quantity = pk.get('quantity', 0)

        if pk.get('source') == 'batch':
            # Direct batch → finished product (no packing stage)
            batch = batch_map.get(pk.get('batch_id', ''))
            if batch:
                if not batch_number:
                    batch_number = batch.get('batch_number', '')
                milk_kg = batch.get('milk_kg', 0)
                fat_cost = round((batch.get('fat_percent', 0) * 10 * milk_kg / 1000) * batch.get('fat_rate', 0), 2)
                snf_cost = round((batch.get('snf_percent', 0) * 10 * milk_kg / 1000) * batch.get('snf_rate', 0), 2)
                milk_cost = fat_cost + snf_cost
                other_rm_cost = sum(rm.get('quantity', 0) * rm.get('cost_per_unit', 0) for rm in batch.get('raw_materials', []))
                additional_costs_total = sum(c.get('amount', 0) for c in batch.get('additional_costs', []))
                total_cost = milk_cost + other_rm_cost + additional_costs_total
                qty_produced = batch.get('quantity_produced', 0)
                batch_cost_per_unit = round(total_cost / qty_produced, 2) if qty_produced > 0 else 0
                final_cost_per_unit = batch_cost_per_unit

                result.append({
                    "id": pk['id'], "batch_number": batch_number, "date": pk['date'],
                    "sku": pk['sku'], "quantity": quantity,
                    "batch_cost_per_unit": batch_cost_per_unit,
                    "conversion_cost_per_unit": 0,
                    "final_cost_per_unit": final_cost_per_unit,
                    "total_packing_cost": round(total_cost, 2)
                })
            else:
                result.append({
                    "id": pk['id'], "batch_number": batch_number, "date": pk['date'],
                    "sku": pk['sku'], "quantity": quantity,
                    "batch_cost_per_unit": 0, "conversion_cost_per_unit": 0,
                    "final_cost_per_unit": 0, "total_packing_cost": 0
                })
        else:
            # Semi-finished → finished (packing stage)
            semi_finished_cost = pk.get('semi_finished_cost', 0) or 0
            additional_materials_cost = pk.get('additional_materials_cost', 0) or 0
            additional_costs_total = pk.get('additional_costs_total', 0) or 0
            total_packing_cost = pk.get('total_packing_cost', 0) or 0
            cost_per_finished_unit = pk.get('cost_per_finished_unit', 0) or 0

            batch_cost_per_unit = round(semi_finished_cost / quantity, 2) if quantity > 0 else 0
            conversion_cost_per_unit = round((additional_materials_cost + additional_costs_total) / quantity, 2) if quantity > 0 else 0

            result.append({
                "id": pk['id'], "batch_number": batch_number, "date": pk['date'],
                "sku": pk['sku'], "quantity": quantity,
                "batch_cost_per_unit": batch_cost_per_unit,
                "conversion_cost_per_unit": conversion_cost_per_unit,
                "final_cost_per_unit": cost_per_finished_unit,
                "total_packing_cost": total_packing_cost
            })
    return result
