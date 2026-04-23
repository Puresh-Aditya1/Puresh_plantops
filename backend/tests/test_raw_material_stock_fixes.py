"""
Test Raw Material Stock Bug Fixes:
1. Multiple purchases for same material on same day (no unique constraint)
2. Entry_id field in ledger for purchase transactions
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")

@pytest.fixture
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestMultiplePurchasesSameDay:
    """Test that multiple purchases can be added for same material on same day"""
    
    def test_add_first_purchase_for_smp(self, api_client):
        """Add first purchase entry for SMP on a test date"""
        test_date = "2026-03-24"
        
        # First, check if SMP material exists
        masters_response = api_client.get(f"{BASE_URL}/api/raw-material-master")
        assert masters_response.status_code == 200
        masters = masters_response.json()
        smp_exists = any(m['name'] == 'SMP' for m in masters)
        
        if not smp_exists:
            pytest.skip("SMP material not found in master - skipping test")
        
        # Add first purchase
        payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 100.0
        }
        response = api_client.post(f"{BASE_URL}/api/raw-material-stock", json=payload)
        
        # Should succeed (201 or 200)
        assert response.status_code in [200, 201], f"First purchase failed: {response.text}"
        data = response.json()
        assert data['name'] == 'SMP'
        assert data['purchased'] == 100.0
        print(f"First purchase created with ID: {data['id']}")
        
        # Store ID for cleanup
        return data['id']
    
    def test_add_second_purchase_same_day_no_error(self, api_client):
        """Add second purchase for SMP on same date - should NOT show 'already exists' error"""
        test_date = "2026-03-24"
        
        # Add second purchase on same date
        payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 50.0
        }
        response = api_client.post(f"{BASE_URL}/api/raw-material-stock", json=payload)
        
        # Should succeed - no unique constraint error
        assert response.status_code in [200, 201], f"Second purchase failed with: {response.text}"
        
        # Verify it's NOT returning "already exists" error
        if response.status_code >= 400:
            error_detail = response.json().get('detail', '')
            assert 'already exists' not in error_detail.lower(), \
                f"Bug not fixed: Still getting 'already exists' error: {error_detail}"
        
        data = response.json()
        assert data['name'] == 'SMP'
        assert data['purchased'] == 50.0
        print(f"Second purchase created successfully with ID: {data['id']}")
        return data['id']
    
    def test_add_third_purchase_same_day(self, api_client):
        """Add third purchase for SMP on same date to confirm fix"""
        test_date = "2026-03-24"
        
        payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 25.0
        }
        response = api_client.post(f"{BASE_URL}/api/raw-material-stock", json=payload)
        
        assert response.status_code in [200, 201], f"Third purchase failed: {response.text}"
        data = response.json()
        print(f"Third purchase created successfully with ID: {data['id']}")
        return data['id']


class TestLedgerEntryId:
    """Test that ledger returns entry_id for purchase transactions"""
    
    def test_ledger_has_entry_id_for_purchases(self, api_client):
        """Verify ledger API returns entry_id field for Purchase type transactions"""
        response = api_client.get(f"{BASE_URL}/api/reports/raw-material-ledger?material=SMP")
        
        assert response.status_code == 200, f"Ledger API failed: {response.text}"
        data = response.json()
        
        # Find SMP in ledger
        smp_ledger = None
        for item in data:
            if item['material_name'] == 'SMP':
                smp_ledger = item
                break
        
        if not smp_ledger:
            pytest.skip("SMP not found in ledger")
        
        # Check transactions for entry_id
        purchase_transactions = [t for t in smp_ledger['transactions'] if t['type'] == 'Purchase']
        
        assert len(purchase_transactions) > 0, "No purchase transactions found for SMP"
        
        # Verify entry_id exists for purchase transactions
        for txn in purchase_transactions:
            assert 'entry_id' in txn, f"entry_id missing from purchase transaction: {txn}"
            assert txn['entry_id'] is not None, f"entry_id is None for purchase: {txn}"
            print(f"Purchase transaction has entry_id: {txn['entry_id']}")
    
    def test_batch_usage_no_entry_id(self, api_client):
        """Verify Batch Usage transactions do NOT have entry_id (they are derived)"""
        response = api_client.get(f"{BASE_URL}/api/reports/raw-material-ledger?material=SMP")
        
        assert response.status_code == 200
        data = response.json()
        
        smp_ledger = None
        for item in data:
            if item['material_name'] == 'SMP':
                smp_ledger = item
                break
        
        if not smp_ledger:
            pytest.skip("SMP not found in ledger")
        
        # Check batch usage transactions
        batch_transactions = [t for t in smp_ledger['transactions'] if t['type'] == 'Batch Usage']
        
        for txn in batch_transactions:
            # Batch usage should NOT have entry_id (or it should be None/missing)
            entry_id = txn.get('entry_id')
            assert entry_id is None or 'entry_id' not in txn, \
                f"Batch Usage should not have entry_id but found: {entry_id}"
        
        print(f"Verified {len(batch_transactions)} batch usage transactions have no entry_id")


class TestPurchaseEditDelete:
    """Test edit and delete functionality for purchase entries"""
    
    def test_create_and_edit_purchase(self, api_client):
        """Create a purchase entry and then edit it"""
        test_date = "2026-03-25"
        
        # Create purchase
        create_payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 75.0
        }
        create_response = api_client.post(f"{BASE_URL}/api/raw-material-stock", json=create_payload)
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create purchase: {create_response.text}")
        
        created = create_response.json()
        stock_id = created['id']
        print(f"Created purchase with ID: {stock_id}")
        
        # Edit purchase
        edit_payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 100.0  # Changed from 75 to 100
        }
        edit_response = api_client.put(f"{BASE_URL}/api/raw-material-stock/{stock_id}", json=edit_payload)
        
        assert edit_response.status_code == 200, f"Edit failed: {edit_response.text}"
        edited = edit_response.json()
        assert edited['purchased'] == 100.0, f"Purchase not updated: {edited}"
        print(f"Successfully edited purchase to 100.0")
        
        return stock_id
    
    def test_create_and_delete_purchase(self, api_client):
        """Create a purchase entry and then delete it"""
        test_date = "2026-03-26"
        
        # Create purchase
        create_payload = {
            "name": "SMP",
            "date": test_date,
            "purchased": 30.0
        }
        create_response = api_client.post(f"{BASE_URL}/api/raw-material-stock", json=create_payload)
        
        if create_response.status_code not in [200, 201]:
            pytest.skip(f"Could not create purchase: {create_response.text}")
        
        created = create_response.json()
        stock_id = created['id']
        print(f"Created purchase with ID: {stock_id}")
        
        # Delete purchase
        delete_response = api_client.delete(f"{BASE_URL}/api/raw-material-stock/{stock_id}")
        
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"Successfully deleted purchase {stock_id}")
        
        # Verify deletion
        get_response = api_client.get(f"{BASE_URL}/api/raw-material-stock")
        stocks = get_response.json()
        deleted_exists = any(s['id'] == stock_id for s in stocks)
        assert not deleted_exists, f"Purchase {stock_id} still exists after deletion"


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_purchases(self, api_client):
        """Clean up test purchases created during testing"""
        # Get all stock entries
        response = api_client.get(f"{BASE_URL}/api/raw-material-stock")
        if response.status_code != 200:
            return
        
        stocks = response.json()
        
        # Delete test entries from dates 2026-03-24, 2026-03-25, 2026-03-26
        test_dates = ["2026-03-24", "2026-03-25", "2026-03-26"]
        deleted_count = 0
        
        for stock in stocks:
            if stock['date'] in test_dates and stock['name'] == 'SMP':
                delete_response = api_client.delete(f"{BASE_URL}/api/raw-material-stock/{stock['id']}")
                if delete_response.status_code == 200:
                    deleted_count += 1
        
        print(f"Cleaned up {deleted_count} test purchase entries")
