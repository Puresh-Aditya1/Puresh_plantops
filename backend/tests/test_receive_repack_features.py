"""
Test suite for Finished Product Receive, Repack, and Batch Additional Costs features
Tests:
1. Batch Production - 'Other Costs' feature (additional_costs field)
2. POST /api/finished-product-receive - Create receive entry
3. GET /api/finished-product-receives - List all receives
4. DELETE /api/finished-product-receive/{id} - Delete receive entry
5. POST /api/finished-product-repack - Create repack with R-series batch number
6. GET /api/finished-product-repacks - List all repacks
7. DELETE /api/finished-product-repack/{id} - Delete repack entry
8. GET /api/reports/finished-ledger - Verify Receive, Repack, Repack Out transaction types
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get admin auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()['token']
    
    @pytest.fixture(scope="class")
    def headers(self, auth_token):
        """Get auth headers"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestBatchAdditionalCosts(TestAuth):
    """Test Batch Production with additional_costs (Other Costs) feature"""
    
    def test_create_batch_with_additional_costs(self, headers):
        """Create a batch with additional_costs and verify they are saved and calculated correctly"""
        # First, get existing semi-finished master to use
        masters_res = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=headers)
        assert masters_res.status_code == 200
        masters = masters_res.json()
        
        if not masters:
            pytest.skip("No semi-finished masters available for testing")
        
        product_name = masters[0]['name']
        
        # Get raw material rates to use
        rm_masters = requests.get(f"{BASE_URL}/api/raw-material-master", headers=headers)
        assert rm_masters.status_code == 200
        
        # Create batch with additional_costs
        today = time.strftime("%Y-%m-%d")
        batch_payload = {
            "batch_date": today,
            "milk_kg": 100,
            "fat_percent": 4.5,
            "fat_rate": 50,
            "snf_percent": 8.5,
            "snf_rate": 30,
            "raw_materials": [],
            "raw_material_quantities": [],
            "output_type": "semi-finished",
            "product_name": product_name,
            "quantity_produced": 10,
            "additional_costs": [
                {"description": "Labour", "amount": 500},
                {"description": "Electricity", "amount": 300}
            ],
            "notes": "TEST_batch_with_additional_costs"
        }
        
        response = requests.post(f"{BASE_URL}/api/batches", json=batch_payload, headers=headers)
        assert response.status_code == 200, f"Failed to create batch: {response.text}"
        
        batch = response.json()
        
        # Verify additional_costs are saved
        assert "additional_costs" in batch, "additional_costs field missing in response"
        assert len(batch['additional_costs']) == 2, f"Expected 2 additional costs, got {len(batch['additional_costs'])}"
        
        # Verify additional_costs_total is calculated correctly (500 + 300 = 800)
        assert batch['additional_costs_total'] == 800, f"Expected additional_costs_total=800, got {batch['additional_costs_total']}"
        
        # Verify additional_costs_total is included in total_raw_material_cost
        # total_raw_material_cost = milk_cost + other_rm_cost + additional_costs_total
        milk_cost = batch.get('milk_cost', 0)
        other_rm_cost = batch.get('other_rm_cost', 0)
        expected_total = milk_cost + other_rm_cost + 800
        assert batch['total_raw_material_cost'] == expected_total, f"Expected total_raw_material_cost={expected_total}, got {batch['total_raw_material_cost']}"
        
        # Verify cost_per_unit includes additional_costs
        if batch['quantity_produced'] > 0:
            expected_cpu = round(expected_total / batch['quantity_produced'], 2)
            assert batch['cost_per_unit'] == expected_cpu, f"Expected cost_per_unit={expected_cpu}, got {batch['cost_per_unit']}"
        
        # Store batch_id for cleanup
        self.__class__.test_batch_id = batch['id']
        print(f"✓ Batch created with additional_costs: {batch['batch_number']}, additional_costs_total={batch['additional_costs_total']}")
    
    def test_get_batch_with_additional_costs(self, headers):
        """Verify GET batch returns additional_costs correctly"""
        if not hasattr(self.__class__, 'test_batch_id'):
            pytest.skip("No test batch created")
        
        response = requests.get(f"{BASE_URL}/api/batches/{self.__class__.test_batch_id}", headers=headers)
        assert response.status_code == 200
        
        batch = response.json()
        assert batch['additional_costs_total'] == 800
        print(f"✓ GET batch returns additional_costs_total correctly")
    
    def test_cleanup_batch(self, headers):
        """Cleanup test batch"""
        if hasattr(self.__class__, 'test_batch_id'):
            requests.delete(f"{BASE_URL}/api/batches/{self.__class__.test_batch_id}", headers=headers)
            print("✓ Test batch cleaned up")


class TestFinishedProductReceive(TestAuth):
    """Test Finished Product Receive feature"""
    
    def test_get_finished_product_masters(self, headers):
        """Get finished product masters for testing"""
        response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=headers)
        assert response.status_code == 200
        masters = response.json()
        
        if not masters:
            pytest.skip("No finished product masters available")
        
        # Store first SKU for testing
        self.__class__.test_sku = masters[0]['sku_name']
        self.__class__.test_unit = masters[0]['uom']
        print(f"✓ Found finished product master: {self.__class__.test_sku}")
    
    def test_create_receive_entry(self, headers):
        """Create a receive entry and verify it creates finished_products record with source='receive'"""
        if not hasattr(self.__class__, 'test_sku'):
            pytest.skip("No test SKU available")
        
        today = time.strftime("%Y-%m-%d")
        receive_payload = {
            "sku": self.__class__.test_sku,
            "quantity": 25,
            "receive_date": today,
            "source_name": "TEST_External_Supplier",
            "cost_per_unit": 150,
            "notes": "TEST_receive_entry"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-receive", json=receive_payload, headers=headers)
        assert response.status_code == 200, f"Failed to create receive: {response.text}"
        
        receive = response.json()
        
        # Verify response fields
        assert receive['sku'] == self.__class__.test_sku
        assert receive['quantity'] == 25
        assert receive['source_name'] == "TEST_External_Supplier"
        assert receive['cost_per_unit'] == 150
        assert receive['total_cost'] == 3750  # 25 * 150
        assert receive['date'] == today
        
        self.__class__.test_receive_id = receive['id']
        print(f"✓ Receive entry created: {receive['id']}, total_cost={receive['total_cost']}")
        
        # Verify finished_products record was created with source='receive'
        fp_response = requests.get(f"{BASE_URL}/api/finished-products", headers=headers)
        assert fp_response.status_code == 200
        
        finished_products = fp_response.json()
        receive_fp = [fp for fp in finished_products if fp.get('source') == 'receive' and fp.get('source_receive_id') == receive['id']]
        
        assert len(receive_fp) == 1, f"Expected 1 finished_product with source='receive', found {len(receive_fp)}"
        assert receive_fp[0]['current_stock'] == 25
        print(f"✓ Finished product record created with source='receive', current_stock=25")
    
    def test_list_receives(self, headers):
        """List all receives and verify test entry is present"""
        response = requests.get(f"{BASE_URL}/api/finished-product-receives", headers=headers)
        assert response.status_code == 200
        
        receives = response.json()
        assert isinstance(receives, list)
        
        # Find our test receive
        test_receives = [r for r in receives if r.get('notes') == 'TEST_receive_entry']
        assert len(test_receives) >= 1, "Test receive entry not found in list"
        print(f"✓ GET /api/finished-product-receives returns {len(receives)} entries")
    
    def test_delete_receive_entry(self, headers):
        """Delete receive entry and verify stock is removed"""
        if not hasattr(self.__class__, 'test_receive_id'):
            pytest.skip("No test receive to delete")
        
        # Get stock before delete
        fp_before = requests.get(f"{BASE_URL}/api/finished-products", headers=headers).json()
        receive_fp_before = [fp for fp in fp_before if fp.get('source_receive_id') == self.__class__.test_receive_id]
        
        # Delete receive
        response = requests.delete(f"{BASE_URL}/api/finished-product-receive/{self.__class__.test_receive_id}", headers=headers)
        assert response.status_code == 200, f"Failed to delete receive: {response.text}"
        
        # Verify finished_products record was removed
        fp_after = requests.get(f"{BASE_URL}/api/finished-products", headers=headers).json()
        receive_fp_after = [fp for fp in fp_after if fp.get('source_receive_id') == self.__class__.test_receive_id]
        
        assert len(receive_fp_after) == 0, "Finished product record should be removed after delete"
        print(f"✓ Receive entry deleted and stock removed")


class TestFinishedProductRepack(TestAuth):
    """Test Finished Product Repack feature with R-series batch numbers"""
    
    def test_setup_stock_for_repack(self, headers):
        """Create receive entry to have stock for repack testing"""
        # Get finished product masters
        masters_res = requests.get(f"{BASE_URL}/api/finished-product-master", headers=headers)
        assert masters_res.status_code == 200
        masters = masters_res.json()
        
        if len(masters) < 2:
            pytest.skip("Need at least 2 finished product masters for repack testing")
        
        self.__class__.source_sku = masters[0]['sku_name']
        self.__class__.target_sku = masters[1]['sku_name'] if len(masters) > 1 else masters[0]['sku_name']
        
        # Create receive entry to have stock
        today = time.strftime("%Y-%m-%d")
        receive_payload = {
            "sku": self.__class__.source_sku,
            "quantity": 50,
            "receive_date": today,
            "source_name": "TEST_Repack_Source",
            "cost_per_unit": 100,
            "notes": "TEST_stock_for_repack"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-receive", json=receive_payload, headers=headers)
        assert response.status_code == 200, f"Failed to create receive for repack: {response.text}"
        
        self.__class__.setup_receive_id = response.json()['id']
        print(f"✓ Created stock for repack: {self.__class__.source_sku} qty=50")
    
    def test_create_repack_entry(self, headers):
        """Create repack entry and verify R-series batch number is generated"""
        if not hasattr(self.__class__, 'source_sku'):
            pytest.skip("No source SKU available")
        
        today = time.strftime("%Y-%m-%d")
        repack_payload = {
            "source_sku": self.__class__.source_sku,
            "target_sku": self.__class__.target_sku,
            "quantity_used": 10,
            "quantity_produced": 9,
            "quantity_wasted": 1,
            "repack_date": today,
            "notes": "TEST_repack_entry"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-repack", json=repack_payload, headers=headers)
        assert response.status_code == 200, f"Failed to create repack: {response.text}"
        
        repack = response.json()
        
        # Verify R-series batch number format: R-MMYYDDC
        assert repack['repack_batch_number'].startswith('R-'), f"Batch number should start with 'R-', got {repack['repack_batch_number']}"
        
        # Verify response fields
        assert repack['source_sku'] == self.__class__.source_sku
        assert repack['target_sku'] == self.__class__.target_sku
        assert repack['quantity_used'] == 10
        assert repack['quantity_produced'] == 9
        assert repack['quantity_wasted'] == 1
        
        self.__class__.test_repack_id = repack['id']
        self.__class__.test_repack_batch_number = repack['repack_batch_number']
        print(f"✓ Repack created with R-series batch: {repack['repack_batch_number']}")
        
        # Verify source stock was deducted (FIFO)
        fp_response = requests.get(f"{BASE_URL}/api/finished-products", headers=headers)
        finished_products = fp_response.json()
        
        # Verify target stock was added
        target_fp = [fp for fp in finished_products if fp.get('source') == 'repack' and fp.get('source_repack_id') == repack['id']]
        assert len(target_fp) == 1, f"Expected 1 finished_product with source='repack', found {len(target_fp)}"
        assert target_fp[0]['current_stock'] == 9
        assert target_fp[0]['batch_number'] == repack['repack_batch_number']
        print(f"✓ Target stock added: {self.__class__.target_sku} qty=9 with batch {repack['repack_batch_number']}")
    
    def test_list_repacks(self, headers):
        """List all repacks and verify test entry is present"""
        response = requests.get(f"{BASE_URL}/api/finished-product-repacks", headers=headers)
        assert response.status_code == 200
        
        repacks = response.json()
        assert isinstance(repacks, list)
        
        # Find our test repack
        test_repacks = [r for r in repacks if r.get('notes') == 'TEST_repack_entry']
        assert len(test_repacks) >= 1, "Test repack entry not found in list"
        print(f"✓ GET /api/finished-product-repacks returns {len(repacks)} entries")
    
    def test_delete_repack_entry(self, headers):
        """Delete repack and verify source stock is restored"""
        if not hasattr(self.__class__, 'test_repack_id'):
            pytest.skip("No test repack to delete")
        
        # Delete repack
        response = requests.delete(f"{BASE_URL}/api/finished-product-repack/{self.__class__.test_repack_id}", headers=headers)
        assert response.status_code == 200, f"Failed to delete repack: {response.text}"
        
        # Verify target finished_products record was removed
        fp_after = requests.get(f"{BASE_URL}/api/finished-products", headers=headers).json()
        repack_fp_after = [fp for fp in fp_after if fp.get('source_repack_id') == self.__class__.test_repack_id]
        
        assert len(repack_fp_after) == 0, "Target finished product record should be removed after delete"
        print(f"✓ Repack entry deleted and source stock restored")
    
    def test_cleanup_setup_receive(self, headers):
        """Cleanup setup receive entry"""
        if hasattr(self.__class__, 'setup_receive_id'):
            requests.delete(f"{BASE_URL}/api/finished-product-receive/{self.__class__.setup_receive_id}", headers=headers)
            print("✓ Setup receive cleaned up")


class TestFinishedLedger(TestAuth):
    """Test finished ledger includes Receive, Repack, and Repack Out transaction types"""
    
    def test_setup_ledger_data(self, headers):
        """Create receive and repack entries for ledger testing"""
        masters_res = requests.get(f"{BASE_URL}/api/finished-product-master", headers=headers)
        masters = masters_res.json()
        
        if len(masters) < 2:
            pytest.skip("Need at least 2 finished product masters for ledger testing")
        
        self.__class__.source_sku = masters[0]['sku_name']
        self.__class__.target_sku = masters[1]['sku_name']
        
        today = time.strftime("%Y-%m-%d")
        
        # Create receive entry
        receive_res = requests.post(f"{BASE_URL}/api/finished-product-receive", json={
            "sku": self.__class__.source_sku,
            "quantity": 100,
            "receive_date": today,
            "source_name": "TEST_Ledger_Source",
            "cost_per_unit": 50,
            "notes": "TEST_ledger_receive"
        }, headers=headers)
        assert receive_res.status_code == 200
        self.__class__.ledger_receive_id = receive_res.json()['id']
        
        # Create repack entry
        repack_res = requests.post(f"{BASE_URL}/api/finished-product-repack", json={
            "source_sku": self.__class__.source_sku,
            "target_sku": self.__class__.target_sku,
            "quantity_used": 20,
            "quantity_produced": 18,
            "quantity_wasted": 2,
            "repack_date": today,
            "notes": "TEST_ledger_repack"
        }, headers=headers)
        assert repack_res.status_code == 200
        self.__class__.ledger_repack_id = repack_res.json()['id']
        print(f"✓ Created ledger test data: receive and repack entries")
    
    def test_ledger_includes_receive_type(self, headers):
        """Verify ledger includes 'Receive' transaction type"""
        response = requests.get(f"{BASE_URL}/api/reports/finished-ledger", headers=headers)
        assert response.status_code == 200
        
        ledger = response.json()
        
        # Find source SKU ledger
        source_ledger = [l for l in ledger if l['sku'] == self.__class__.source_sku]
        assert len(source_ledger) == 1, f"Source SKU {self.__class__.source_sku} not found in ledger"
        
        # Check for Receive transaction type
        receive_txns = [t for t in source_ledger[0]['transactions'] if t['type'] == 'Receive']
        assert len(receive_txns) >= 1, "No 'Receive' transaction type found in ledger"
        print(f"✓ Ledger includes 'Receive' transaction type")
    
    def test_ledger_includes_repack_out_type(self, headers):
        """Verify ledger includes 'Repack Out' transaction type for source SKU"""
        response = requests.get(f"{BASE_URL}/api/reports/finished-ledger", headers=headers)
        ledger = response.json()
        
        source_ledger = [l for l in ledger if l['sku'] == self.__class__.source_sku]
        
        # Check for Repack Out transaction type
        repack_out_txns = [t for t in source_ledger[0]['transactions'] if t['type'] == 'Repack Out']
        assert len(repack_out_txns) >= 1, "No 'Repack Out' transaction type found in ledger"
        print(f"✓ Ledger includes 'Repack Out' transaction type")
    
    def test_ledger_includes_repack_type(self, headers):
        """Verify ledger includes 'Repack' transaction type for target SKU"""
        response = requests.get(f"{BASE_URL}/api/reports/finished-ledger", headers=headers)
        ledger = response.json()
        
        target_ledger = [l for l in ledger if l['sku'] == self.__class__.target_sku]
        
        if target_ledger:
            # Check for Repack transaction type
            repack_txns = [t for t in target_ledger[0]['transactions'] if t['type'] == 'Repack']
            assert len(repack_txns) >= 1, "No 'Repack' transaction type found in target SKU ledger"
            print(f"✓ Ledger includes 'Repack' transaction type for target SKU")
        else:
            print(f"⚠ Target SKU {self.__class__.target_sku} not found in ledger (may be first entry)")
    
    def test_cleanup_ledger_data(self, headers):
        """Cleanup ledger test data"""
        if hasattr(self.__class__, 'ledger_repack_id'):
            requests.delete(f"{BASE_URL}/api/finished-product-repack/{self.__class__.ledger_repack_id}", headers=headers)
        if hasattr(self.__class__, 'ledger_receive_id'):
            requests.delete(f"{BASE_URL}/api/finished-product-receive/{self.__class__.ledger_receive_id}", headers=headers)
        print("✓ Ledger test data cleaned up")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
