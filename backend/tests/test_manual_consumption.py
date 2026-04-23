"""
Test Manual Consumption Mode for Packing and Admin-Only Restrictions
=====================================================================
Tests for:
1. Manual consumption packing (quantity_consumed=0 in SKU mapping)
2. Fixed ratio packing (quantity_consumed > 0)
3. Semi-finished stock calculations with semi_finished_consumed field
4. Activity Log and Wastage Tracker admin-only restrictions
5. Non-admin user restrictions on sidebar and dashboard
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://daily-plant-ops.preview.emergentagent.com')


class TestManualConsumptionPacking:
    """Tests for manual consumption mode in packing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin and get token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_dahi_lassi_manual_consumption_mapping(self):
        """Verify Dahi->Lassi 500ml has quantity_consumed=0 (manual mode)"""
        response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=self.headers)
        assert response.status_code == 200
        
        masters = response.json()
        dahi_master = next((m for m in masters if m['name'] == 'Dahi'), None)
        assert dahi_master is not None, "Dahi master not found"
        
        lassi_mapping = next((m for m in dahi_master['finished_sku_mappings'] 
                             if m['sku_name'] == 'Lassi 500ml'), None)
        assert lassi_mapping is not None, "Lassi 500ml mapping not found in Dahi"
        assert lassi_mapping['quantity_consumed'] == 0, "Lassi 500ml should have quantity_consumed=0 for manual mode"
        print("PASS: Dahi->Lassi 500ml has quantity_consumed=0 (manual consumption mode)")
    
    def test_paneer_fixed_ratio_mapping(self):
        """Verify Paneer->Paneer-1kg has quantity_consumed=1.0 (fixed ratio)"""
        response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=self.headers)
        assert response.status_code == 200
        
        masters = response.json()
        paneer_master = next((m for m in masters if m['name'] == 'Paneer'), None)
        assert paneer_master is not None, "Paneer master not found"
        
        paneer_1kg_mapping = next((m for m in paneer_master['finished_sku_mappings'] 
                                   if m['sku_name'] == 'Paneer-1kg'), None)
        assert paneer_1kg_mapping is not None, "Paneer-1kg mapping not found"
        assert paneer_1kg_mapping['quantity_consumed'] == 1.0, "Paneer-1kg should have quantity_consumed=1.0"
        print("PASS: Paneer->Paneer-1kg has quantity_consumed=1.0 (fixed ratio mode)")
    
    def test_manual_consumption_packing_requires_semi_finished_consumed(self):
        """POST /api/packing-by-product without semi_finished_consumed should fail for manual SKUs"""
        # Try to pack Lassi 500ml without semi_finished_consumed
        payload = {
            "semi_finished_id": "Dahi",
            "sku": "Lassi 500ml",
            "quantity_produced": 10,
            "quantity_wasted": 0,
            "packing_date": "2026-03-28"
            # Missing semi_finished_consumed
        }
        response = requests.post(f"{BASE_URL}/api/packing-by-product", json=payload, headers=self.headers)
        assert response.status_code == 400, f"Expected 400 for missing semi_finished_consumed, got {response.status_code}"
        assert "Manual consumption required" in response.json().get('detail', ''), "Error should mention manual consumption"
        print("PASS: Packing without semi_finished_consumed fails for manual consumption SKUs")
    
    def test_manual_consumption_packing_with_semi_finished_consumed(self):
        """POST /api/packing-by-product with semi_finished_consumed should work"""
        # Get current Dahi stock
        summary_response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=self.headers)
        assert summary_response.status_code == 200
        dahi_summary = next((s for s in summary_response.json() if s['product_name'] == 'Dahi'), None)
        initial_stock = dahi_summary['current_stock'] if dahi_summary else 0
        
        # Pack Lassi 500ml with manual consumption
        payload = {
            "semi_finished_id": "Dahi",
            "sku": "Lassi 500ml",
            "quantity_produced": 5,
            "quantity_wasted": 0,
            "semi_finished_consumed": 3.5,  # Manual entry: 3.5kg of Dahi used
            "packing_date": "2026-03-28"
        }
        response = requests.post(f"{BASE_URL}/api/packing-by-product", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Packing failed: {response.text}"
        
        packing_data = response.json()
        assert packing_data['semi_finished_consumed'] == 3.5, "semi_finished_consumed should be 3.5"
        assert packing_data['quantity'] == 5, "quantity should be 5"
        
        # Verify stock was deducted correctly
        summary_response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=self.headers)
        dahi_summary = next((s for s in summary_response.json() if s['product_name'] == 'Dahi'), None)
        new_stock = dahi_summary['current_stock'] if dahi_summary else 0
        
        expected_stock = round(initial_stock - 3.5, 4)
        assert abs(new_stock - expected_stock) < 0.01, f"Stock should be {expected_stock}, got {new_stock}"
        
        # Cleanup: delete the packing entry
        packing_id = packing_data['id']
        delete_response = requests.delete(f"{BASE_URL}/api/packing/{packing_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Failed to delete packing: {delete_response.text}"
        
        print(f"PASS: Manual consumption packing works. Stock deducted: {initial_stock} -> {new_stock}")
    
    def test_semi_finished_ledger_shows_manual_consumption(self):
        """Semi-finished ledger should show correct consumed amount for manual entries"""
        response = requests.get(f"{BASE_URL}/api/reports/semi-finished-ledger?product_name=Dahi", headers=self.headers)
        assert response.status_code == 200
        
        ledger = response.json()
        assert len(ledger) > 0, "Dahi ledger should have entries"
        
        dahi_ledger = ledger[0]
        assert dahi_ledger['product_name'] == 'Dahi'
        
        # Check that packing transactions exist
        packing_txns = [t for t in dahi_ledger['transactions'] if t['type'] == 'Packing']
        print(f"PASS: Semi-finished ledger has {len(packing_txns)} packing transactions for Dahi")
    
    def test_existing_dahi_stock_calculation(self):
        """Verify existing Dahi stock: produced 50kg - consumed 20kg = 30kg remaining"""
        response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=self.headers)
        assert response.status_code == 200
        
        dahi_summary = next((s for s in response.json() if s['product_name'] == 'Dahi'), None)
        assert dahi_summary is not None, "Dahi summary not found"
        
        assert dahi_summary['total_produced'] == 50.0, f"Expected 50kg produced, got {dahi_summary['total_produced']}"
        assert dahi_summary['current_stock'] == 30.0, f"Expected 30kg stock, got {dahi_summary['current_stock']}"
        print(f"PASS: Dahi stock calculation correct: produced={dahi_summary['total_produced']}, stock={dahi_summary['current_stock']}")


class TestUpdatePackingWithManualConsumption:
    """Tests for updating packing entries with semi_finished_consumed"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_update_packing_with_semi_finished_consumed(self):
        """PUT /api/packing/{id} with semi_finished_consumed should update correctly"""
        # First create a packing entry
        payload = {
            "semi_finished_id": "Dahi",
            "sku": "Lassi 500ml",
            "quantity_produced": 10,
            "quantity_wasted": 0,
            "semi_finished_consumed": 5.0,
            "packing_date": "2026-03-28"
        }
        create_response = requests.post(f"{BASE_URL}/api/packing-by-product", json=payload, headers=self.headers)
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        
        packing_id = create_response.json()['id']
        semi_finished_id = create_response.json()['semi_finished_id']
        
        # Update the packing entry with new semi_finished_consumed
        update_payload = {
            "semi_finished_id": semi_finished_id,
            "sku": "Lassi 500ml",
            "quantity_produced": 10,
            "quantity_wasted": 0,
            "semi_finished_consumed": 7.0,  # Changed from 5.0 to 7.0
            "packing_date": "2026-03-28"
        }
        update_response = requests.put(f"{BASE_URL}/api/packing/{packing_id}", json=update_payload, headers=self.headers)
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data['semi_finished_consumed'] == 7.0, f"Expected 7.0, got {updated_data['semi_finished_consumed']}"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/packing/{packing_id}", headers=self.headers)
        print("PASS: PUT /api/packing/{id} with semi_finished_consumed updates correctly")


class TestAdminOnlyRestrictions:
    """Tests for Activity Log and Wastage Tracker admin-only restrictions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin and create test non-admin user"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Create a test non-admin user
        self.test_username = f"TEST_user_{uuid.uuid4().hex[:8]}"
        self.test_password = "testpass123"
        
        create_user_response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "username": self.test_username,
            "password": self.test_password,
            "role": "modify"
        }, headers=self.admin_headers)
        
        if create_user_response.status_code == 200:
            self.test_user_id = create_user_response.json()['id']
        else:
            print(f"Warning: Could not create test user: {create_user_response.text}")
            self.test_user_id = None
        
        yield
        
        # Cleanup: delete test user
        if self.test_user_id:
            requests.delete(f"{BASE_URL}/api/users/{self.test_user_id}", headers=self.admin_headers)
    
    def test_activity_logs_admin_access(self):
        """Admin should be able to access activity logs"""
        response = requests.get(f"{BASE_URL}/api/activity-logs", headers=self.admin_headers)
        assert response.status_code == 200, f"Admin should access activity logs, got {response.status_code}"
        print("PASS: Admin can access /api/activity-logs")
    
    def test_activity_logs_non_admin_forbidden(self):
        """Non-admin user should get 403 for activity logs"""
        # Login as non-admin user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": self.test_username,
            "password": self.test_password
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as test user")
        
        non_admin_token = login_response.json()["token"]
        non_admin_headers = {"Authorization": f"Bearer {non_admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/activity-logs", headers=non_admin_headers)
        assert response.status_code == 403, f"Non-admin should get 403, got {response.status_code}"
        assert "admin" in response.json().get('detail', '').lower(), "Error should mention admin"
        print("PASS: Non-admin gets 403 for /api/activity-logs")
    
    def test_activity_logs_categories_non_admin_forbidden(self):
        """Non-admin user should get 403 for activity logs categories"""
        # Login as non-admin user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": self.test_username,
            "password": self.test_password
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as test user")
        
        non_admin_token = login_response.json()["token"]
        non_admin_headers = {"Authorization": f"Bearer {non_admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/activity-logs/categories", headers=non_admin_headers)
        assert response.status_code == 403, f"Non-admin should get 403, got {response.status_code}"
        print("PASS: Non-admin gets 403 for /api/activity-logs/categories")
    
    def test_wastage_summary_accessible_to_all(self):
        """Wastage summary API should be accessible (UI restriction is frontend-only)"""
        # Login as non-admin user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": self.test_username,
            "password": self.test_password
        })
        
        if login_response.status_code != 200:
            pytest.skip("Could not login as test user")
        
        non_admin_token = login_response.json()["token"]
        non_admin_headers = {"Authorization": f"Bearer {non_admin_token}"}
        
        # Note: The wastage API is accessible, but the UI hides it for non-admin
        response = requests.get(f"{BASE_URL}/api/reports/wastage-loss-summary", headers=non_admin_headers)
        # This should be 200 since the restriction is UI-only based on the code
        assert response.status_code == 200, f"Wastage API should be accessible, got {response.status_code}"
        print("PASS: Wastage summary API accessible (UI restriction is frontend-only)")


class TestFixedRatioPacking:
    """Tests for fixed ratio packing (quantity_consumed > 0)"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_fixed_ratio_packing_without_semi_finished_consumed(self):
        """Fixed ratio packing should work without semi_finished_consumed field"""
        # Check if Paneer has stock
        summary_response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=self.headers)
        paneer_summary = next((s for s in summary_response.json() if s['product_name'] == 'Paneer'), None)
        
        if not paneer_summary or paneer_summary['current_stock'] < 2:
            pytest.skip("Not enough Paneer stock for test")
        
        initial_stock = paneer_summary['current_stock']
        
        # Pack Paneer-1kg without semi_finished_consumed (should use fixed ratio 1.0)
        payload = {
            "semi_finished_id": "Paneer",
            "sku": "Paneer-1kg",
            "quantity_produced": 2,
            "quantity_wasted": 0,
            "packing_date": "2026-03-28"
            # No semi_finished_consumed - should use fixed ratio
        }
        response = requests.post(f"{BASE_URL}/api/packing-by-product", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Fixed ratio packing failed: {response.text}"
        
        packing_data = response.json()
        # For fixed ratio, semi_finished_consumed should be calculated as qty_per_unit * quantity_produced
        expected_consumed = 1.0 * 2  # quantity_consumed=1.0 * 2 units
        assert packing_data['semi_finished_consumed'] == expected_consumed, f"Expected {expected_consumed}, got {packing_data['semi_finished_consumed']}"
        
        # Cleanup
        packing_id = packing_data['id']
        requests.delete(f"{BASE_URL}/api/packing/{packing_id}", headers=self.headers)
        
        print(f"PASS: Fixed ratio packing works without semi_finished_consumed. Auto-calculated: {expected_consumed}kg")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
