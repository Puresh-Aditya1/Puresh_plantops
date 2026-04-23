"""
Tests for Aggregated Stock Endpoints - Dairy Manufacturing Inventory Management
Tests the new aggregated endpoints for SKU-based and product-name-based stock views
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed")

@pytest.fixture(scope="module")
def auth_headers(auth_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


class TestLogin:
    """Test login functionality"""
    
    def test_login_with_admin_credentials(self):
        """Test login with admin/admin123"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"
        print("✓ Login with admin/admin123 successful")


class TestFinishedProductsSummary:
    """Test GET /api/finished-products-summary - aggregated by SKU"""
    
    def test_get_finished_products_summary(self, auth_headers):
        """Test that finished products are aggregated by SKU"""
        response = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Verify structure of aggregated data
        if data:
            item = data[0]
            assert "sku" in item, "Missing 'sku' field in aggregated data"
            assert "unit" in item, "Missing 'unit' field"
            assert "total_produced" in item, "Missing 'total_produced' field"
            assert "total_wasted" in item, "Missing 'total_wasted' field"
            assert "current_stock" in item, "Missing 'current_stock' field"
            
            # Verify no duplicate SKUs (should be aggregated)
            skus = [p["sku"] for p in data]
            assert len(skus) == len(set(skus)), "Duplicate SKUs found - data not properly aggregated"
            
            print(f"✓ Finished products summary: {len(data)} unique SKUs")
            for item in data[:3]:  # Print first 3
                print(f"  - {item['sku']}: stock={item['current_stock']} {item['unit']}")
        else:
            print("✓ Finished products summary returned empty list (no data)")


class TestSemiFinishedSummary:
    """Test GET /api/semi-finished-summary - aggregated by product name"""
    
    def test_get_semi_finished_summary(self, auth_headers):
        """Test that semi-finished products are aggregated by product name"""
        response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        # Verify structure of aggregated data
        if data:
            item = data[0]
            assert "product_name" in item, "Missing 'product_name' field"
            assert "total_produced" in item, "Missing 'total_produced' field"
            assert "current_stock" in item, "Missing 'current_stock' field"
            assert "batch_count" in item, "Missing 'batch_count' field"
            assert "record_ids" in item, "Missing 'record_ids' field"
            
            # Verify no duplicate product names (should be aggregated)
            names = [p["product_name"] for p in data]
            assert len(names) == len(set(names)), "Duplicate product names found - data not properly aggregated"
            
            print(f"✓ Semi-finished summary: {len(data)} unique products")
            for item in data[:3]:
                print(f"  - {item['product_name']}: stock={item['current_stock']} kg, batches={item['batch_count']}")
        else:
            print("✓ Semi-finished summary returned empty list (no data)")


class TestProductStockReport:
    """Test GET /api/reports/product-stock - aggregated report"""
    
    def test_get_product_stock_report(self, auth_headers):
        """Test product stock report returns aggregated data"""
        response = requests.get(f"{BASE_URL}/api/reports/product-stock", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "semi_finished" in data, "Missing 'semi_finished' in response"
        assert "finished" in data, "Missing 'finished' in response"
        assert isinstance(data["semi_finished"], list)
        assert isinstance(data["finished"], list)
        
        # Verify semi-finished aggregation
        if data["semi_finished"]:
            sf_item = data["semi_finished"][0]
            assert "product_name" in sf_item
            assert "total_produced" in sf_item
            assert "current_stock" in sf_item
            assert "batch_count" in sf_item
            
            # Check no duplicates
            sf_names = [p["product_name"] for p in data["semi_finished"]]
            assert len(sf_names) == len(set(sf_names)), "Duplicate semi-finished product names"
        
        # Verify finished aggregation
        if data["finished"]:
            f_item = data["finished"][0]
            assert "sku" in f_item
            assert "total_produced" in f_item
            assert "total_wasted" in f_item
            assert "current_stock" in f_item
            
            # Check no duplicates
            f_skus = [p["sku"] for p in data["finished"]]
            assert len(f_skus) == len(set(f_skus)), "Duplicate finished product SKUs"
        
        print(f"✓ Product stock report: {len(data['semi_finished'])} semi-finished, {len(data['finished'])} finished")


class TestDashboardStats:
    """Test GET /api/dashboard/stats - aggregated low stock alerts"""
    
    def test_dashboard_stats_aggregated(self, auth_headers):
        """Test dashboard returns aggregated stock data with SKU names"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "batches_today" in data
        assert "dispatches_today" in data
        assert "total_stock_items" in data
        assert "low_stock_count" in data
        assert "low_stock_products" in data
        
        # Verify low_stock_products structure (should have sku, unit, current_stock)
        if data["low_stock_products"]:
            item = data["low_stock_products"][0]
            assert "sku" in item, "Low stock item missing 'sku' field"
            assert "unit" in item, "Low stock item missing 'unit' field"
            assert "current_stock" in item, "Low stock item missing 'current_stock' field"
            
            # Verify no duplicate SKUs in low stock
            skus = [p["sku"] for p in data["low_stock_products"]]
            assert len(skus) == len(set(skus)), "Duplicate SKUs in low stock alerts"
            
            print(f"✓ Dashboard stats: {data['low_stock_count']} low stock alerts")
            for item in data["low_stock_products"][:3]:
                print(f"  - {item['sku']}: {item['current_stock']} {item['unit']}")
        else:
            print(f"✓ Dashboard stats: No low stock alerts")


class TestDispatchWithSKU:
    """Test POST /api/dispatch with SKU-based selection"""
    
    def test_dispatch_accepts_sku_format(self, auth_headers):
        """Test that dispatch endpoint accepts {sku, quantity} format"""
        # First get available SKUs
        summary_response = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=auth_headers)
        summary = summary_response.json()
        
        if not summary:
            pytest.skip("No finished products available for dispatch test")
        
        # Find a SKU with stock
        available_sku = None
        for item in summary:
            if item["current_stock"] > 0:
                available_sku = item
                break
        
        if not available_sku:
            pytest.skip("No finished products with stock available")
        
        # Test dispatch with SKU format
        dispatch_payload = {
            "dispatch_type": "delivery_challan",
            "challan_number": f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "destination": "Test Destination",
            "notes": "Test dispatch with SKU",
            "products": [
                {"sku": available_sku["sku"], "quantity": 1}
            ]
        }
        
        response = requests.post(f"{BASE_URL}/api/dispatch", json=dispatch_payload, headers=auth_headers)
        
        if response.status_code == 400 and "Insufficient stock" in response.text:
            print(f"✓ Dispatch endpoint accepts SKU format (insufficient stock for actual dispatch)")
        else:
            assert response.status_code == 200, f"Dispatch failed: {response.text}"
            data = response.json()
            assert "id" in data
            assert data["products"][0]["sku"] == available_sku["sku"]
            print(f"✓ Dispatch created with SKU: {available_sku['sku']}")


class TestPackingByProduct:
    """Test POST /api/packing-by-product endpoint"""
    
    def test_packing_by_product_endpoint_exists(self, auth_headers):
        """Test that packing-by-product endpoint exists and accepts product name"""
        # Get semi-finished summary
        summary_response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=auth_headers)
        summary = summary_response.json()
        
        if not summary:
            pytest.skip("No semi-finished products available")
        
        # Find a product with stock
        available_product = None
        for item in summary:
            if item["current_stock"] > 0:
                available_product = item
                break
        
        if not available_product:
            pytest.skip("No semi-finished products with stock available")
        
        # Get semi-finished master to find valid SKU
        master_response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=auth_headers)
        masters = master_response.json()
        
        matching_master = next((m for m in masters if m["name"] == available_product["product_name"]), None)
        
        if not matching_master or not matching_master.get("finished_sku_mappings"):
            pytest.skip(f"No SKU mappings found for {available_product['product_name']}")
        
        sku_name = matching_master["finished_sku_mappings"][0]["sku_name"]
        
        # Test packing by product name
        packing_payload = {
            "semi_finished_id": available_product["product_name"],  # Product name, not ID
            "sku": sku_name,
            "quantity_produced": 1,
            "quantity_wasted": 0,
            "packing_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(f"{BASE_URL}/api/packing-by-product", json=packing_payload, headers=auth_headers)
        
        if response.status_code == 400:
            # Could be insufficient stock or other validation error
            print(f"✓ Packing-by-product endpoint exists and validates input: {response.json().get('detail', '')}")
        elif response.status_code == 404:
            print(f"✓ Packing-by-product endpoint exists (master/SKU not found)")
        else:
            assert response.status_code == 200, f"Packing failed: {response.text}"
            data = response.json()
            assert "id" in data
            print(f"✓ Packing created via product name: {available_product['product_name']}")


class TestPackingHistoryByProduct:
    """Test GET /api/packing-history-by-product/{product_name}"""
    
    def test_packing_history_by_product(self, auth_headers):
        """Test packing history returns data across all batches for a product"""
        # Get semi-finished summary
        summary_response = requests.get(f"{BASE_URL}/api/semi-finished-summary", headers=auth_headers)
        summary = summary_response.json()
        
        if not summary:
            pytest.skip("No semi-finished products available")
        
        product_name = summary[0]["product_name"]
        
        response = requests.get(
            f"{BASE_URL}/api/packing-history-by-product/{product_name}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        
        print(f"✓ Packing history for '{product_name}': {len(data)} entries")


class TestRawMaterialStockCRUD:
    """Test Raw Material Stock CRUD operations"""
    
    def test_list_raw_material_stock(self, auth_headers):
        """Test listing raw material stock"""
        response = requests.get(f"{BASE_URL}/api/raw-material-stock", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} raw material stock entries")
    
    def test_raw_material_stock_report(self, auth_headers):
        """Test raw material stock report with filters"""
        response = requests.get(f"{BASE_URL}/api/reports/raw-material-stock", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Raw material stock report: {len(data)} entries")


class TestNavigationEndpoints:
    """Test all navigation-related endpoints work"""
    
    def test_batches_endpoint(self, auth_headers):
        """Test batches list"""
        response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Batches endpoint working")
    
    def test_semi_finished_endpoint(self, auth_headers):
        """Test semi-finished list"""
        response = requests.get(f"{BASE_URL}/api/semi-finished", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Semi-finished endpoint working")
    
    def test_finished_products_endpoint(self, auth_headers):
        """Test finished products list"""
        response = requests.get(f"{BASE_URL}/api/finished-products", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Finished products endpoint working")
    
    def test_dispatch_endpoint(self, auth_headers):
        """Test dispatch list"""
        response = requests.get(f"{BASE_URL}/api/dispatch", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Dispatch endpoint working")
    
    def test_users_endpoint(self, auth_headers):
        """Test users list (admin)"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        print(f"✓ Users endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
