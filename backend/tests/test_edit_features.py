"""
Test suite for Edit (PUT) features for Receives, Repacks, and Wastage entries
Tests the new PUT endpoints and verifies stock adjustments
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestEditFeatures:
    """Test PUT endpoints for Receives, Repacks, and Wastage"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as admin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        self.token = login_response.json()["token"]
        self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        
        yield
        
        # Cleanup: Delete test entries created during tests
        self._cleanup_test_data()
    
    def _cleanup_test_data(self):
        """Clean up test data created during tests"""
        # Clean up test receives
        receives = self.session.get(f"{BASE_URL}/api/finished-product-receives").json()
        for r in receives:
            if "TEST_EDIT" in (r.get('source_name') or '') or "TEST_EDIT" in (r.get('notes') or ''):
                self.session.delete(f"{BASE_URL}/api/finished-product-receive/{r['id']}")
        
        # Clean up test repacks
        repacks = self.session.get(f"{BASE_URL}/api/finished-product-repacks").json()
        for rp in repacks:
            if "TEST_EDIT" in (rp.get('notes') or ''):
                self.session.delete(f"{BASE_URL}/api/finished-product-repack/{rp['id']}")
        
        # Clean up test wastages
        wastages = self.session.get(f"{BASE_URL}/api/finished-product-wastages").json()
        for w in wastages:
            if "TEST_EDIT" in (w.get('reason') or '') or "TEST_EDIT" in (w.get('notes') or ''):
                self.session.delete(f"{BASE_URL}/api/finished-product-wastage/{w['id']}")
    
    # ========== RECEIVE EDIT TESTS ==========
    
    def test_put_receive_endpoint_exists(self):
        """Test that PUT /api/finished-product-receive/{id} endpoint exists"""
        # First create a receive to edit
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-receive", json={
            "sku": "Paneer-1kg",
            "quantity": 5,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_Supplier",
            "cost_per_unit": 100,
            "notes": "TEST_EDIT - Initial"
        })
        assert create_response.status_code == 200, f"Create receive failed: {create_response.text}"
        receive_id = create_response.json()["id"]
        
        # Test PUT endpoint
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-receive/{receive_id}", json={
            "sku": "Paneer-1kg",
            "quantity": 10,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_Supplier_Updated",
            "cost_per_unit": 120,
            "notes": "TEST_EDIT - Updated"
        })
        assert put_response.status_code == 200, f"PUT receive failed: {put_response.text}"
        
        # Verify update
        updated = put_response.json()
        assert updated["quantity"] == 10
        assert updated["source_name"] == "TEST_EDIT_Supplier_Updated"
        assert updated["cost_per_unit"] == 120
        print("PASS: PUT /api/finished-product-receive/{id} endpoint works correctly")
    
    def test_put_receive_updates_stock(self):
        """Test that editing receive updates finished_products stock"""
        # Get initial stock
        summary_before = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_before = next((s['current_stock'] for s in summary_before if s['sku'] == 'Paneer-1kg'), 0)
        
        # Create receive
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-receive", json={
            "sku": "Paneer-1kg",
            "quantity": 5,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_Stock_Test",
            "cost_per_unit": 100,
            "notes": "TEST_EDIT - Stock test"
        })
        assert create_response.status_code == 200
        receive_id = create_response.json()["id"]
        
        # Verify stock increased by 5
        summary_after_create = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_after_create = next((s['current_stock'] for s in summary_after_create if s['sku'] == 'Paneer-1kg'), 0)
        assert paneer_stock_after_create == paneer_stock_before + 5, f"Stock should increase by 5 after create"
        
        # Edit receive to change quantity to 10
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-receive/{receive_id}", json={
            "sku": "Paneer-1kg",
            "quantity": 10,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_Stock_Test",
            "cost_per_unit": 100,
            "notes": "TEST_EDIT - Stock test updated"
        })
        assert put_response.status_code == 200
        
        # Verify stock is now original + 10 (not original + 5)
        summary_after_edit = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_after_edit = next((s['current_stock'] for s in summary_after_edit if s['sku'] == 'Paneer-1kg'), 0)
        assert paneer_stock_after_edit == paneer_stock_before + 10, f"Stock should be original + 10 after edit. Got {paneer_stock_after_edit}, expected {paneer_stock_before + 10}"
        print("PASS: PUT receive correctly updates stock")
    
    def test_put_receive_validates_sku(self):
        """Test that PUT receive validates SKU exists in master"""
        # Create receive
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-receive", json={
            "sku": "Paneer-1kg",
            "quantity": 5,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_SKU_Validation",
            "cost_per_unit": 100,
            "notes": "TEST_EDIT"
        })
        assert create_response.status_code == 200
        receive_id = create_response.json()["id"]
        
        # Try to update with invalid SKU
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-receive/{receive_id}", json={
            "sku": "INVALID_SKU_12345",
            "quantity": 10,
            "receive_date": "2026-01-15",
            "source_name": "TEST_EDIT_SKU_Validation",
            "cost_per_unit": 100,
            "notes": "TEST_EDIT"
        })
        assert put_response.status_code == 404, f"Should return 404 for invalid SKU"
        print("PASS: PUT receive validates SKU exists")
    
    # ========== REPACK EDIT TESTS ==========
    
    def test_put_repack_endpoint_exists(self):
        """Test that PUT /api/finished-product-repack/{id} endpoint exists"""
        # First create a repack to edit
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-repack", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 1,
            "quantity_produced": 4,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Initial repack"
        })
        assert create_response.status_code == 200, f"Create repack failed: {create_response.text}"
        repack_id = create_response.json()["id"]
        
        # Test PUT endpoint
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-repack/{repack_id}", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 2,
            "quantity_produced": 8,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Updated repack"
        })
        assert put_response.status_code == 200, f"PUT repack failed: {put_response.text}"
        
        # Verify update
        updated = put_response.json()
        assert updated["quantity_used"] == 2
        assert updated["quantity_produced"] == 8
        print("PASS: PUT /api/finished-product-repack/{id} endpoint works correctly")
    
    def test_put_repack_adjusts_stock(self):
        """Test that editing repack adjusts source and target stock correctly"""
        # Get initial stock
        summary_before = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_1kg_before = next((s['current_stock'] for s in summary_before if s['sku'] == 'Paneer-1kg'), 0)
        paneer_200g_before = next((s['current_stock'] for s in summary_before if s['sku'] == 'paneer 200g'), 0)
        
        # Create repack: use 1kg, produce 4x200g
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-repack", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 1,
            "quantity_produced": 4,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Stock adjustment test"
        })
        assert create_response.status_code == 200
        repack_id = create_response.json()["id"]
        
        # Verify stock after create
        summary_after_create = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_1kg_after_create = next((s['current_stock'] for s in summary_after_create if s['sku'] == 'Paneer-1kg'), 0)
        paneer_200g_after_create = next((s['current_stock'] for s in summary_after_create if s['sku'] == 'paneer 200g'), 0)
        
        assert paneer_1kg_after_create == paneer_1kg_before - 1, "Source stock should decrease by 1"
        assert paneer_200g_after_create == paneer_200g_before + 4, "Target stock should increase by 4"
        
        # Edit repack: use 2kg, produce 8x200g
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-repack/{repack_id}", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 2,
            "quantity_produced": 8,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Stock adjustment test updated"
        })
        assert put_response.status_code == 200
        
        # Verify stock after edit
        summary_after_edit = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_1kg_after_edit = next((s['current_stock'] for s in summary_after_edit if s['sku'] == 'Paneer-1kg'), 0)
        paneer_200g_after_edit = next((s['current_stock'] for s in summary_after_edit if s['sku'] == 'paneer 200g'), 0)
        
        # After edit: source should be original - 2, target should be original + 8
        assert paneer_1kg_after_edit == paneer_1kg_before - 2, f"Source stock should be original - 2. Got {paneer_1kg_after_edit}, expected {paneer_1kg_before - 2}"
        assert paneer_200g_after_edit == paneer_200g_before + 8, f"Target stock should be original + 8. Got {paneer_200g_after_edit}, expected {paneer_200g_before + 8}"
        print("PASS: PUT repack correctly adjusts source and target stock")
    
    def test_put_repack_validates_stock(self):
        """Test that PUT repack validates sufficient source stock"""
        # Create repack with small quantity
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-repack", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 1,
            "quantity_produced": 4,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Stock validation test"
        })
        assert create_response.status_code == 200
        repack_id = create_response.json()["id"]
        
        # Try to update with very large quantity (should fail)
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-repack/{repack_id}", json={
            "source_sku": "Paneer-1kg",
            "target_sku": "paneer 200g",
            "quantity_used": 99999,
            "quantity_produced": 400000,
            "quantity_wasted": 0,
            "repack_date": "2026-01-15",
            "notes": "TEST_EDIT - Stock validation test"
        })
        assert put_response.status_code == 400, f"Should return 400 for insufficient stock"
        print("PASS: PUT repack validates sufficient source stock")
    
    # ========== WASTAGE EDIT TESTS ==========
    
    def test_put_wastage_endpoint_exists(self):
        """Test that PUT /api/finished-product-wastage/{id} endpoint exists"""
        # First create a wastage to edit
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-wastage", json={
            "sku": "Paneer-1kg",
            "quantity": 1,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Expired",
            "notes": "TEST_EDIT - Initial wastage"
        })
        assert create_response.status_code == 200, f"Create wastage failed: {create_response.text}"
        wastage_id = create_response.json()["id"]
        
        # Test PUT endpoint
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-wastage/{wastage_id}", json={
            "sku": "Paneer-1kg",
            "quantity": 2,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Damaged",
            "notes": "TEST_EDIT - Updated wastage"
        })
        assert put_response.status_code == 200, f"PUT wastage failed: {put_response.text}"
        
        # Verify update
        updated = put_response.json()
        assert updated["quantity"] == 2
        assert updated["reason"] == "TEST_EDIT - Damaged"
        print("PASS: PUT /api/finished-product-wastage/{id} endpoint works correctly")
    
    def test_put_wastage_adjusts_stock(self):
        """Test that editing wastage adjusts stock correctly"""
        # Get initial stock
        summary_before = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_before = next((s['current_stock'] for s in summary_before if s['sku'] == 'Paneer-1kg'), 0)
        
        # Create wastage: waste 1 unit
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-wastage", json={
            "sku": "Paneer-1kg",
            "quantity": 1,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Stock adjustment",
            "notes": "TEST_EDIT"
        })
        assert create_response.status_code == 200
        wastage_id = create_response.json()["id"]
        
        # Verify stock decreased by 1
        summary_after_create = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_after_create = next((s['current_stock'] for s in summary_after_create if s['sku'] == 'Paneer-1kg'), 0)
        assert paneer_stock_after_create == paneer_stock_before - 1, "Stock should decrease by 1 after wastage"
        
        # Edit wastage: change to 2 units
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-wastage/{wastage_id}", json={
            "sku": "Paneer-1kg",
            "quantity": 2,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Stock adjustment updated",
            "notes": "TEST_EDIT"
        })
        assert put_response.status_code == 200
        
        # Verify stock is now original - 2
        summary_after_edit = self.session.get(f"{BASE_URL}/api/finished-products-summary").json()
        paneer_stock_after_edit = next((s['current_stock'] for s in summary_after_edit if s['sku'] == 'Paneer-1kg'), 0)
        assert paneer_stock_after_edit == paneer_stock_before - 2, f"Stock should be original - 2. Got {paneer_stock_after_edit}, expected {paneer_stock_before - 2}"
        print("PASS: PUT wastage correctly adjusts stock")
    
    def test_put_wastage_validates_stock(self):
        """Test that PUT wastage validates sufficient stock"""
        # Create wastage with small quantity
        create_response = self.session.post(f"{BASE_URL}/api/finished-product-wastage", json={
            "sku": "Paneer-1kg",
            "quantity": 1,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Stock validation",
            "notes": "TEST_EDIT"
        })
        assert create_response.status_code == 200
        wastage_id = create_response.json()["id"]
        
        # Try to update with very large quantity (should fail)
        put_response = self.session.put(f"{BASE_URL}/api/finished-product-wastage/{wastage_id}", json={
            "sku": "Paneer-1kg",
            "quantity": 99999,
            "wastage_date": "2026-01-15",
            "reason": "TEST_EDIT - Stock validation",
            "notes": "TEST_EDIT"
        })
        assert put_response.status_code == 400, f"Should return 400 for insufficient stock"
        print("PASS: PUT wastage validates sufficient stock")
    
    # ========== GET EXISTING ENTRIES TESTS ==========
    
    def test_get_existing_receives(self):
        """Test that existing receives can be fetched"""
        response = self.session.get(f"{BASE_URL}/api/finished-product-receives")
        assert response.status_code == 200
        receives = response.json()
        print(f"PASS: GET /api/finished-product-receives returns {len(receives)} entries")
    
    def test_get_existing_repacks(self):
        """Test that existing repacks can be fetched"""
        response = self.session.get(f"{BASE_URL}/api/finished-product-repacks")
        assert response.status_code == 200
        repacks = response.json()
        print(f"PASS: GET /api/finished-product-repacks returns {len(repacks)} entries")
    
    def test_get_existing_wastages(self):
        """Test that existing wastages can be fetched"""
        response = self.session.get(f"{BASE_URL}/api/finished-product-wastages")
        assert response.status_code == 200
        wastages = response.json()
        print(f"PASS: GET /api/finished-product-wastages returns {len(wastages)} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
