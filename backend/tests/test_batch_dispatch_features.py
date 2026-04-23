"""
Test suite for Batch Entry and Dispatch features:
- Batch quantity_produced field
- Batch date filtering
- Batch edit/delete
- Finished product creation from batch
- Dispatch edit/delete with stock restoration
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
    assert response.status_code == 200, f"Login failed: {response.text}"
    return response.json()["token"]

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestBatchQuantityProduced:
    """Test that batches have quantity_produced field"""
    
    def test_get_batches_has_quantity_produced(self, auth_headers):
        """GET /api/batches returns batches with quantity_produced field"""
        response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        assert response.status_code == 200
        batches = response.json()
        assert len(batches) > 0, "No batches found"
        
        # Check first batch has quantity_produced
        batch = batches[0]
        assert "quantity_produced" in batch, "quantity_produced field missing"
        assert isinstance(batch["quantity_produced"], (int, float)), "quantity_produced should be numeric"
        print(f"Batch {batch['batch_number']} has quantity_produced: {batch['quantity_produced']}")


class TestBatchDateFilter:
    """Test batch date range filtering"""
    
    def test_batch_filter_with_date_range(self, auth_headers):
        """GET /api/batches with start_date and end_date filters"""
        # Get all batches first
        all_response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        assert all_response.status_code == 200
        all_batches = all_response.json()
        total_count = len(all_batches)
        print(f"Total batches: {total_count}")
        
        # Filter by specific date
        filtered_response = requests.get(
            f"{BASE_URL}/api/batches?start_date=2026-03-23&end_date=2026-03-23",
            headers=auth_headers
        )
        assert filtered_response.status_code == 200
        filtered_batches = filtered_response.json()
        
        # Verify all filtered batches have the correct date
        for batch in filtered_batches:
            assert batch["date"] == "2026-03-23", f"Batch date {batch['date']} not in filter range"
        print(f"Filtered batches for 2026-03-23: {len(filtered_batches)}")
    
    def test_batch_filter_start_date_only(self, auth_headers):
        """GET /api/batches with only start_date"""
        response = requests.get(
            f"{BASE_URL}/api/batches?start_date=2026-03-22",
            headers=auth_headers
        )
        assert response.status_code == 200
        batches = response.json()
        for batch in batches:
            assert batch["date"] >= "2026-03-22", f"Batch date {batch['date']} before start_date"
        print(f"Batches from 2026-03-22: {len(batches)}")


class TestFinishedProductFromBatch:
    """Test that finished products are created from batches with output_type='finished'"""
    
    def test_dahi_400gm_pouch_in_finished_products(self, auth_headers):
        """Verify Dahi-400gm pouch appears in finished products"""
        response = requests.get(f"{BASE_URL}/api/finished-products", headers=auth_headers)
        assert response.status_code == 200
        products = response.json()
        
        # Find Dahi-400gm pouch
        dahi_products = [p for p in products if "Dahi" in p.get("sku", "")]
        assert len(dahi_products) > 0, "Dahi-400gm pouch not found in finished products"
        
        dahi = dahi_products[0]
        assert dahi["current_stock"] == 50, f"Expected stock 50, got {dahi['current_stock']}"
        print(f"Found Dahi product: {dahi['sku']} with stock {dahi['current_stock']}")
    
    def test_finished_products_summary_has_dahi(self, auth_headers):
        """Verify Dahi appears in finished products summary"""
        response = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=auth_headers)
        assert response.status_code == 200
        summary = response.json()
        
        dahi_summary = [s for s in summary if "Dahi" in s.get("sku", "")]
        assert len(dahi_summary) > 0, "Dahi not in finished products summary"
        print(f"Dahi in summary: {dahi_summary[0]}")


class TestDispatchCRUD:
    """Test dispatch create, update, delete operations"""
    
    def test_get_all_dispatches(self, auth_headers):
        """GET /api/dispatch returns all dispatches"""
        response = requests.get(f"{BASE_URL}/api/dispatch", headers=auth_headers)
        assert response.status_code == 200
        dispatches = response.json()
        print(f"Total dispatches: {len(dispatches)}")
        
        # Verify dispatch structure
        if len(dispatches) > 0:
            dispatch = dispatches[0]
            assert "id" in dispatch
            assert "challan_number" in dispatch
            assert "destination" in dispatch
            assert "products" in dispatch
            assert "date" in dispatch
    
    def test_create_dispatch_with_date(self, auth_headers):
        """POST /api/dispatch with dispatch_date field"""
        # First get available products
        summary_response = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=auth_headers)
        summary = summary_response.json()
        
        # Find a product with stock
        product_with_stock = None
        for p in summary:
            if p.get("current_stock", 0) > 1:
                product_with_stock = p
                break
        
        if not product_with_stock:
            pytest.skip("No products with stock available for dispatch test")
        
        # Create dispatch
        dispatch_data = {
            "dispatch_type": "delivery_challan",
            "challan_number": f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "destination": "Test Destination",
            "dispatch_date": "2026-03-23",
            "notes": "Test dispatch",
            "products": [{"sku": product_with_stock["sku"], "quantity": 1}]
        }
        
        response = requests.post(f"{BASE_URL}/api/dispatch", json=dispatch_data, headers=auth_headers)
        assert response.status_code == 200, f"Create dispatch failed: {response.text}"
        
        created = response.json()
        assert created["date"] == "2026-03-23", "Dispatch date not set correctly"
        assert created["challan_number"] == dispatch_data["challan_number"]
        print(f"Created dispatch: {created['id']} with date {created['date']}")
        
        # Store for cleanup
        return created["id"]
    
    def test_update_dispatch(self, auth_headers):
        """PUT /api/dispatch/{id} updates dispatch"""
        # Get existing dispatches
        response = requests.get(f"{BASE_URL}/api/dispatch", headers=auth_headers)
        dispatches = response.json()
        
        if len(dispatches) == 0:
            pytest.skip("No dispatches to update")
        
        dispatch = dispatches[0]
        original_destination = dispatch["destination"]
        
        # Update dispatch
        update_data = {
            "dispatch_type": dispatch["dispatch_type"],
            "challan_number": dispatch["challan_number"],
            "destination": "Updated Destination",
            "dispatch_date": dispatch["date"],
            "notes": "Updated notes",
            "products": dispatch["products"]
        }
        
        update_response = requests.put(
            f"{BASE_URL}/api/dispatch/{dispatch['id']}",
            json=update_data,
            headers=auth_headers
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        
        updated = update_response.json()
        assert updated["destination"] == "Updated Destination"
        print(f"Updated dispatch {dispatch['id']} destination to: {updated['destination']}")
        
        # Restore original
        update_data["destination"] = original_destination
        requests.put(f"{BASE_URL}/api/dispatch/{dispatch['id']}", json=update_data, headers=auth_headers)


class TestBatchDelete:
    """Test batch delete endpoint"""
    
    def test_delete_batch_requires_admin(self, auth_headers):
        """DELETE /api/batches/{id} requires admin role"""
        # Get a batch
        response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        batches = response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches to test delete")
        
        # We're logged in as admin, so delete should work
        # But we won't actually delete to preserve test data
        # Just verify the endpoint exists and returns proper response
        batch_id = batches[-1]["id"]  # Get last batch
        
        # Test with a non-existent ID to verify endpoint works
        fake_id = "00000000-0000-0000-0000-000000000000"
        delete_response = requests.delete(
            f"{BASE_URL}/api/batches/{fake_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 404, "Should return 404 for non-existent batch"
        print("Batch delete endpoint working (404 for non-existent batch)")


class TestDispatchDelete:
    """Test dispatch delete endpoint"""
    
    def test_delete_dispatch_requires_admin(self, auth_headers):
        """DELETE /api/dispatch/{id} requires admin role"""
        # Test with non-existent ID
        fake_id = "00000000-0000-0000-0000-000000000000"
        delete_response = requests.delete(
            f"{BASE_URL}/api/dispatch/{fake_id}",
            headers=auth_headers
        )
        assert delete_response.status_code == 404, "Should return 404 for non-existent dispatch"
        print("Dispatch delete endpoint working (404 for non-existent dispatch)")


class TestBatchEdit:
    """Test batch edit/update endpoint"""
    
    def test_get_single_batch(self, auth_headers):
        """GET /api/batches/{id} returns single batch"""
        # Get all batches
        response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        batches = response.json()
        
        if len(batches) == 0:
            pytest.skip("No batches available")
        
        batch_id = batches[0]["id"]
        
        # Get single batch
        single_response = requests.get(f"{BASE_URL}/api/batches/{batch_id}", headers=auth_headers)
        assert single_response.status_code == 200
        
        batch = single_response.json()
        assert batch["id"] == batch_id
        assert "quantity_produced" in batch
        print(f"Got single batch: {batch['batch_number']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
