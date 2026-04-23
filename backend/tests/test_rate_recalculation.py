"""
Backend tests for raw material rate recalculation feature.
Verifies that when a raw material rate is created/updated, all batches
and raw_material_stock entries in the rate's active period get their
cost_per_unit auto-updated, and batch totals reflect new costs.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://daily-plant-ops.preview.emergentagent.com').rstrip('/')

ADMIN_USER = "admin"
ADMIN_PASS = "admin123"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Auth regression ----------
class TestAuthRegression:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j.get("access_token") or j.get("token")

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": ADMIN_USER, "password": "wrong"}, timeout=30)
        assert r.status_code in (400, 401, 403)


# ---------- Rates-all regression ----------
class TestRatesAll:
    def test_get_all_rates(self, headers):
        r = requests.get(f"{BASE_URL}/api/raw-material-rates-all", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            item = data[0]
            for key in ("material_id", "material_name", "rate_history"):
                assert key in item


# ---------- Helpers ----------
def _find_material_by_name(headers, name):
    r = requests.get(f"{BASE_URL}/api/raw-material-master", headers=headers, timeout=30)
    assert r.status_code == 200
    for m in r.json():
        if m['name'].lower() == name.lower():
            return m
    return None


def _get_rates_all(headers):
    r = requests.get(f"{BASE_URL}/api/raw-material-rates-all", headers=headers, timeout=30)
    assert r.status_code == 200
    return r.json()


def _get_batches(headers):
    r = requests.get(f"{BASE_URL}/api/batches?page_size=1000", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    if isinstance(data, dict) and 'batches' in data:
        return data['batches']
    return data


def _batches_using_material(batches, material_name):
    """Return list of (batch, rm_entry) for batches consuming material_name."""
    out = []
    for b in batches:
        for rm in b.get('raw_materials', []) or []:
            if rm.get('name', '').lower() == material_name.lower():
                out.append((b, rm))
                break
    return out


def _get_rate_for_date(rate_history, date_str):
    for r in rate_history:
        frm = r['from_date']
        to = r['to_date'] if r.get('to_date') else "9999-12-31"
        if frm <= date_str <= to:
            return r
    return None


# ---------- Core Recalculation tests ----------
class TestRateUpdateRecalc:
    """Rate UPDATE recalculates cost_per_unit in affected batches."""

    def test_update_latest_rate_updates_batch_cost(self, headers):
        # Use 'sugar' material as per agent context. Fallback to any material with batches + latest rate.
        rates_all = _get_rates_all(headers)
        batches = _get_batches(headers)

        target = None
        target_rate = None
        for item in rates_all:
            if not item.get('latest_rate_id') or not item.get('rate_history'):
                continue
            using = _batches_using_material(batches, item['material_name'])
            if not using:
                continue
            latest_rate_rec = item['rate_history'][0]
            frm = latest_rate_rec['from_date']
            to = latest_rate_rec.get('to_date') or "9999-12-31"
            # Ensure at least one batch date falls in this rate window
            if any(frm <= b['date'] <= to for b, _ in using):
                target = item
                target_rate = latest_rate_rec
                break

        if not target:
            pytest.skip("No material found whose latest rate window covers any batch date")

        material_name = target['material_name']
        rate_id = target['latest_rate_id']
        mat_id = target['material_id']
        latest_rate_rec = target_rate
        original_rate = latest_rate_rec['rate']
        from_date = latest_rate_rec['from_date']
        to_date = latest_rate_rec.get('to_date')

        # Pick a test rate different from current
        new_rate_value = round(original_rate + 7.77, 2)

        payload = {
            "raw_material_id": mat_id,
            "rate": new_rate_value,
            "from_date": from_date,
            "to_date": to_date,
        }
        r = requests.put(f"{BASE_URL}/api/raw-material-rate/{rate_id}", headers=headers, json=payload, timeout=60)
        assert r.status_code == 200, f"PUT rate failed: {r.status_code} {r.text}"
        returned = r.json()
        assert returned['rate'] == new_rate_value

        # Verify batches updated
        new_batches = _get_batches(headers)
        affected = _batches_using_material(new_batches, material_name)
        assert len(affected) > 0, "Expected some batches using this material"

        matched_any = False
        for b, rm in affected:
            bd = b['date']
            # Only batches whose date falls within this rate's window must be updated to new rate
            if from_date <= bd <= (to_date if to_date else "9999-12-31"):
                assert rm['cost_per_unit'] == new_rate_value, (
                    f"Batch {b.get('batch_number')} ({bd}) using {material_name} "
                    f"still has cost_per_unit {rm['cost_per_unit']} instead of {new_rate_value}"
                )
                matched_any = True

                # Validate total_raw_material_cost reflects new cost
                other_rm_cost = sum(
                    x.get('quantity', 0) * x.get('cost_per_unit', 0) for x in b.get('raw_materials', [])
                )
                # total >= other_rm_cost
                assert b.get('total_raw_material_cost', 0) >= round(other_rm_cost, 2) - 0.5
        assert matched_any, f"No batch date fell in rate window {from_date}..{to_date}"

        # Verify raw_material_stock also updated within window
        rs = requests.get(f"{BASE_URL}/api/raw-material-stock", headers=headers, timeout=30)
        assert rs.status_code == 200
        stocks = rs.json()
        stock_checked = 0
        for s in stocks:
            if s['name'].lower() != material_name.lower():
                continue
            sd = s['date']
            if from_date <= sd <= (to_date if to_date else "9999-12-31"):
                assert s['cost_per_unit'] == new_rate_value, (
                    f"Stock entry on {sd} for {material_name} has cost_per_unit {s['cost_per_unit']} "
                    f"expected {new_rate_value}"
                )
                stock_checked += 1

        # Restore original rate to avoid polluting data
        restore_payload = {
            "raw_material_id": mat_id,
            "rate": original_rate,
            "from_date": from_date,
            "to_date": to_date,
        }
        rr = requests.put(f"{BASE_URL}/api/raw-material-rate/{rate_id}", headers=headers, json=restore_payload, timeout=60)
        assert rr.status_code == 200

        # Verify restore worked
        final_batches = _get_batches(headers)
        for b, rm in _batches_using_material(final_batches, material_name):
            if from_date <= b['date'] <= (to_date if to_date else "9999-12-31"):
                assert rm['cost_per_unit'] == original_rate, "Restore of original rate did not propagate"


class TestRateCreateRecalc:
    """Rate CREATE auto-closes previous rate and recalculates affected batches."""

    def test_create_new_rate_closes_previous_and_recalculates(self, headers):
        rates_all = _get_rates_all(headers)
        batches = _get_batches(headers)

        target = None
        for item in rates_all:
            if not item.get('latest_rate_id') or not item.get('rate_history'):
                continue
            using = _batches_using_material(batches, item['material_name'])
            if using:
                target = item
                break
        if not target:
            pytest.skip("No material with rate + batches for create test")

        material_name = target['material_name']
        mat_id = target['material_id']
        prev_latest = target['rate_history'][0]
        prev_latest_id = prev_latest['id']
        prev_rate_value = prev_latest['rate']
        prev_from = prev_latest['from_date']

        # Use a future from_date so it won't affect existing batches (non-destructive)
        new_from = "2099-01-01"
        new_rate_value = round(prev_rate_value + 123.45, 2)

        payload = {
            "raw_material_id": mat_id,
            "rate": new_rate_value,
            "from_date": new_from,
            "to_date": None,
        }
        r = requests.post(f"{BASE_URL}/api/raw-material-rate", headers=headers, json=payload, timeout=60)
        assert r.status_code == 200, f"POST rate failed: {r.status_code} {r.text}"
        created = r.json()
        created_id = created['id']
        assert created['rate'] == new_rate_value
        assert created['from_date'] == new_from

        # Previous latest rate should now have to_date = new_from - 1 day = 2098-12-31
        rates_after = _get_rates_all(headers)
        material_after = next((m for m in rates_after if m['material_id'] == mat_id), None)
        assert material_after is not None
        prev_now = next((r for r in material_after['rate_history'] if r['id'] == prev_latest_id), None)
        assert prev_now is not None
        assert prev_now['to_date'] == "2098-12-31", f"Expected auto-close to 2098-12-31, got {prev_now['to_date']}"

        # Batches dated before 2099 should still use the previous rate
        batches_after = _get_batches(headers)
        for b, rm in _batches_using_material(batches_after, material_name):
            if prev_from <= b['date'] <= "2098-12-31":
                # Should be previous rate (unchanged)
                assert rm['cost_per_unit'] == prev_rate_value, (
                    f"Batch {b['date']} unexpectedly changed to {rm['cost_per_unit']} "
                    f"after creating future rate"
                )

        # --- Cleanup: delete the new rate (admin can) and reopen previous rate ---
        dr = requests.delete(f"{BASE_URL}/api/raw-material-rate/{created_id}", headers=headers, timeout=30)
        assert dr.status_code == 200

        # Restore previous rate's to_date to original (use PUT - it's now the latest again)
        restore = {
            "raw_material_id": mat_id,
            "rate": prev_rate_value,
            "from_date": prev_from,
            "to_date": prev_latest.get('to_date'),  # original value (likely None)
        }
        pr = requests.put(f"{BASE_URL}/api/raw-material-rate/{prev_latest_id}", headers=headers, json=restore, timeout=60)
        assert pr.status_code == 200, f"Restore failed: {pr.text}"


# ---------- Batch creation regression ----------
class TestBatchCreationRegression:
    def test_get_batches_ok(self, headers):
        r = requests.get(f"{BASE_URL}/api/batches?page_size=1000", headers=headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        batches = data['batches'] if isinstance(data, dict) and 'batches' in data else data
        assert isinstance(batches, list)
        if batches:
            b = batches[0]
            for k in ("total_raw_material_cost", "cost_per_unit"):
                assert k in b, f"Batch missing field {k}"
