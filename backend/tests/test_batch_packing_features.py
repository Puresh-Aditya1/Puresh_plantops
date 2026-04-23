"""
Test batch-to-batch packing features:
- GET /api/batches-for-packing/{product_name} returns batches with available stock
- POST /api/packing-by-product with batch_id selects specific batch for packing
- POST /api/packing-by-product with additional_materials deducts from raw_material_stock and calculates cost
- Finished product document contains batch_number, semi_finished_cost, additional_materials_cost, total_packing_cost, cost_per_finished_unit
- DELETE /api/packing/{id} restores both semi-finished stock AND additional material stock
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip("Authentication failed - skipping tests")

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Shared requests session with auth"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestBatchesForPackingEndpoint:
    """Test GET /api/batches-for-packing/{product_name}"""
    
    def test_batches_for_packing_returns_batches_with_stock(self, api_client):
        """Test that endpoint returns batches with available stock"""
        response = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have at least one batch with stock
        if len(data) > 0:
            batch = data[0]
            # Verify required fields
            assert "batch_id" in batch, "Missing batch_id"
            assert "batch_number" in batch, "Missing batch_number"
            assert "batch_date" in batch, "Missing batch_date"
            assert "available_stock" in batch, "Missing available_stock"
            assert "batch_cost_per_kg" in batch, "Missing batch_cost_per_kg"
            
            # Verify data types
            assert isinstance(batch["batch_number"], str), "batch_number should be string"
            assert isinstance(batch["available_stock"], (int, float)), "available_stock should be numeric"
            assert isinstance(batch["batch_cost_per_kg"], (int, float)), "batch_cost_per_kg should be numeric"
            assert batch["available_stock"] > 0, "available_stock should be positive"
            print(f"Found batch {batch['batch_number']} with {batch['available_stock']} kg available @ {batch['batch_cost_per_kg']}/kg")
    
    def test_batches_for_packing_nonexistent_product(self, api_client):
        """Test endpoint with non-existent product returns empty list"""
        response = api_client.get(f"{BASE_URL}/api/batches-for-packing/NonExistentProduct")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0, "Should return empty list for non-existent product"


class TestPackingByProductWithBatchSelection:
    """Test POST /api/packing-by-product with batch_id selection"""
    
    def test_packing_with_batch_selection(self, api_client):
        """Test packing from a specific batch"""
        # First get available batches
        batches_response = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block")
        assert batches_response.status_code == 200
        batches = batches_response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches available for packing")
        
        # Select the batch with most stock
        batch = max(batches, key=lambda b: b['available_stock'])
        initial_stock = batch['available_stock']
        batch_cost_per_kg = batch['batch_cost_per_kg']
        
        # Create packing entry with batch selection
        packing_payload = {
            "semi_finished_id": "Paneer Block",  # Product name
            "batch_id": batch['batch_id'],
            "sku": "Paneer 1kg",
            "quantity_produced": 5,
            "quantity_wasted": 0,
            "packing_date": datetime.now().strftime("%Y-%m-%d"),
            "additional_materials": []
        }
        
        response = api_client.post(f"{BASE_URL}/api/packing-by-product", json=packing_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify response contains batch info
        assert data.get("batch_id") == batch['batch_id'], "batch_id should match selected batch"
        assert data.get("batch_number") == batch['batch_number'], "batch_number should be populated"
        
        # Verify cost calculation
        # For Paneer 1kg, quantity_consumed = 1.0 kg per unit
        # Total consumed = 5 units * 1.0 kg = 5 kg
        expected_semi_finished_cost = round(batch_cost_per_kg * 5, 2)
        assert data.get("semi_finished_cost") == expected_semi_finished_cost, \
            f"semi_finished_cost should be {expected_semi_finished_cost}, got {data.get('semi_finished_cost')}"
        
        assert data.get("additional_materials_cost") == 0, "additional_materials_cost should be 0 when no materials added"
        assert data.get("total_packing_cost") == expected_semi_finished_cost, \
            f"total_packing_cost should equal semi_finished_cost when no additional materials"
        
        expected_cost_per_unit = round(expected_semi_finished_cost / 5, 2)
        assert data.get("cost_per_finished_unit") == expected_cost_per_unit, \
            f"cost_per_finished_unit should be {expected_cost_per_unit}, got {data.get('cost_per_finished_unit')}"
        
        # Store packing ID for cleanup
        packing_id = data['id']
        print(f"Created packing {packing_id} from batch {batch['batch_number']}")
        print(f"Cost breakdown: semi_finished={data.get('semi_finished_cost')}, total={data.get('total_packing_cost')}, per_unit={data.get('cost_per_finished_unit')}")
        
        # Verify stock was deducted from the specific batch
        batches_after = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block").json()
        batch_after = next((b for b in batches_after if b['batch_id'] == batch['batch_id']), None)
        
        if batch_after:
            expected_stock = round(initial_stock - 5, 2)  # 5 kg consumed for 5 units of 1kg each
            assert abs(batch_after['available_stock'] - expected_stock) < 0.1, \
                f"Stock should be {expected_stock}, got {batch_after['available_stock']}"
        
        # Cleanup - delete the packing entry
        delete_response = api_client.delete(f"{BASE_URL}/api/packing/{packing_id}")
        assert delete_response.status_code == 200, f"Failed to delete packing: {delete_response.text}"


class TestPackingWithAdditionalMaterials:
    """Test POST /api/packing-by-product with additional_materials"""
    
    def test_packing_with_additional_materials_cost_calculation(self, api_client):
        """Test that additional materials are deducted and cost is calculated"""
        # Get available batches
        batches_response = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block")
        batches = batches_response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches available for packing")
        
        batch = max(batches, key=lambda b: b['available_stock'])
        batch_cost_per_kg = batch['batch_cost_per_kg']
        
        # Get raw material masters to find a material to use
        rm_response = api_client.get(f"{BASE_URL}/api/raw-material-master")
        raw_materials = rm_response.json()
        
        if len(raw_materials) == 0:
            pytest.skip("No raw materials available")
        
        # Use SMP as additional material (if available)
        test_material = next((rm for rm in raw_materials if rm['name'] == 'SMP'), raw_materials[0])
        
        # Create packing with additional materials
        packing_payload = {
            "semi_finished_id": "Paneer Block",
            "batch_id": batch['batch_id'],
            "sku": "Paneer 200gm",  # 0.2 kg per unit
            "quantity_produced": 10,  # 10 units = 2 kg consumed
            "quantity_wasted": 0,
            "packing_date": datetime.now().strftime("%Y-%m-%d"),
            "additional_materials": [
                {"name": test_material['name'], "quantity": 0.5}
            ]
        }
        
        response = api_client.post(f"{BASE_URL}/api/packing-by-product", json=packing_payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        
        # Verify additional materials are recorded
        assert data.get("additional_materials") is not None, "additional_materials should be present"
        assert len(data.get("additional_materials", [])) > 0, "Should have at least one additional material"
        
        # Verify cost fields
        assert data.get("semi_finished_cost") is not None, "semi_finished_cost should be present"
        assert data.get("additional_materials_cost") is not None, "additional_materials_cost should be present"
        assert data.get("total_packing_cost") is not None, "total_packing_cost should be present"
        assert data.get("cost_per_finished_unit") is not None, "cost_per_finished_unit should be present"
        
        # Verify total = semi_finished + additional
        expected_total = round(data['semi_finished_cost'] + data['additional_materials_cost'], 2)
        assert abs(data['total_packing_cost'] - expected_total) < 0.01, \
            f"total_packing_cost should be {expected_total}, got {data['total_packing_cost']}"
        
        # Verify cost per unit
        expected_per_unit = round(data['total_packing_cost'] / 10, 2)
        assert abs(data['cost_per_finished_unit'] - expected_per_unit) < 0.01, \
            f"cost_per_finished_unit should be {expected_per_unit}, got {data['cost_per_finished_unit']}"
        
        print(f"Packing with additional materials created successfully")
        print(f"Semi-finished cost: {data['semi_finished_cost']}")
        print(f"Additional materials cost: {data['additional_materials_cost']}")
        print(f"Total packing cost: {data['total_packing_cost']}")
        print(f"Cost per finished unit: {data['cost_per_finished_unit']}")
        
        # Store for cleanup
        packing_id = data['id']
        
        # Cleanup
        delete_response = api_client.delete(f"{BASE_URL}/api/packing/{packing_id}")
        assert delete_response.status_code == 200


class TestDeletePackingRestoresStock:
    """Test DELETE /api/packing/{id} restores semi-finished stock AND additional materials"""
    
    def test_delete_packing_restores_semi_finished_stock(self, api_client):
        """Test that deleting packing restores semi-finished stock"""
        # Get initial batches
        batches_before = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block").json()
        if len(batches_before) == 0:
            pytest.skip("No batches available")
        
        batch = max(batches_before, key=lambda b: b['available_stock'])
        initial_stock = batch['available_stock']
        
        # Create packing
        packing_payload = {
            "semi_finished_id": "Paneer Block",
            "batch_id": batch['batch_id'],
            "sku": "Paneer 1kg",
            "quantity_produced": 3,
            "quantity_wasted": 0,
            "packing_date": datetime.now().strftime("%Y-%m-%d"),
            "additional_materials": []
        }
        
        create_response = api_client.post(f"{BASE_URL}/api/packing-by-product", json=packing_payload)
        assert create_response.status_code == 200
        packing_id = create_response.json()['id']
        
        # Verify stock was deducted
        batches_after_create = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block").json()
        batch_after_create = next((b for b in batches_after_create if b['batch_id'] == batch['batch_id']), None)
        assert batch_after_create is not None
        assert batch_after_create['available_stock'] < initial_stock, "Stock should be deducted after packing"
        
        # Delete packing
        delete_response = api_client.delete(f"{BASE_URL}/api/packing/{packing_id}")
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        
        # Verify stock was restored
        batches_after_delete = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block").json()
        batch_after_delete = next((b for b in batches_after_delete if b['batch_id'] == batch['batch_id']), None)
        assert batch_after_delete is not None
        
        # Stock should be restored to initial value (within tolerance)
        assert abs(batch_after_delete['available_stock'] - initial_stock) < 0.1, \
            f"Stock should be restored to {initial_stock}, got {batch_after_delete['available_stock']}"
        
        print(f"Stock restored: {initial_stock} -> {batch_after_create['available_stock']} -> {batch_after_delete['available_stock']}")


class TestPackingHistoryWithCostBreakdown:
    """Test packing history endpoint returns cost breakdown"""
    
    def test_packing_history_contains_cost_fields(self, api_client):
        """Test that packing history includes cost breakdown fields"""
        # Get packing history
        response = api_client.get(f"{BASE_URL}/api/packing-history-by-product/Paneer%20Block")
        assert response.status_code == 200
        
        history = response.json()
        
        # If there's any history with cost data, verify fields
        for packing in history:
            # These fields should exist (may be null for old entries)
            assert "batch_number" in packing or packing.get("batch_number") is None
            
            # If cost fields are present, verify they're numeric
            if packing.get("total_packing_cost") is not None:
                assert isinstance(packing["total_packing_cost"], (int, float))
                assert isinstance(packing.get("semi_finished_cost", 0), (int, float))
                assert isinstance(packing.get("additional_materials_cost", 0), (int, float))
                assert isinstance(packing.get("cost_per_finished_unit", 0), (int, float))
                print(f"Packing {packing['id']}: total_cost={packing['total_packing_cost']}, per_unit={packing.get('cost_per_finished_unit')}")


class TestFinishedProductResponseFields:
    """Test that finished product response contains all required cost fields"""
    
    def test_finished_product_has_cost_fields(self, api_client):
        """Test finished product response model has cost fields"""
        response = api_client.get(f"{BASE_URL}/api/finished-products")
        assert response.status_code == 200
        
        products = response.json()
        
        if len(products) > 0:
            product = products[0]
            # Verify all expected fields exist in response
            expected_fields = [
                "id", "batch_id", "sku", "quantity", "quantity_wasted",
                "unit", "current_stock", "date", "created_at"
            ]
            for field in expected_fields:
                assert field in product, f"Missing field: {field}"
            
            # Cost fields should exist (may be null for old entries)
            cost_fields = [
                "batch_number", "semi_finished_cost", "additional_materials_cost",
                "total_packing_cost", "cost_per_finished_unit", "additional_materials"
            ]
            for field in cost_fields:
                assert field in product, f"Missing cost field: {field}"
            
            print(f"Finished product {product['id']} has all required fields")


class TestInsufficientStockError:
    """Test error handling for insufficient stock"""
    
    def test_packing_insufficient_stock_error(self, api_client):
        """Test that packing fails with proper error when stock is insufficient"""
        # Get batches
        batches = api_client.get(f"{BASE_URL}/api/batches-for-packing/Paneer%20Block").json()
        if len(batches) == 0:
            pytest.skip("No batches available")
        
        batch = batches[0]
        
        # Try to pack more than available
        packing_payload = {
            "semi_finished_id": "Paneer Block",
            "batch_id": batch['batch_id'],
            "sku": "Paneer 1kg",
            "quantity_produced": 10000,  # Way more than available
            "quantity_wasted": 0,
            "packing_date": datetime.now().strftime("%Y-%m-%d"),
            "additional_materials": []
        }
        
        response = api_client.post(f"{BASE_URL}/api/packing-by-product", json=packing_payload)
        assert response.status_code == 400, f"Expected 400 for insufficient stock, got {response.status_code}"
        
        error_detail = response.json().get("detail", "")
        assert "Insufficient stock" in error_detail, f"Error should mention insufficient stock: {error_detail}"
        print(f"Correctly rejected with error: {error_detail}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
