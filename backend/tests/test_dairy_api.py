"""
Comprehensive API tests for Dairy Manufacturing Inventory Management System
Tests: Auth, Master Data CRUD, Batch Entry, Raw Material Stock, Semi-Finished Products, Packing
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_"

class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """Test login with valid admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"
        print("✓ Login with admin/admin123 successful")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "wronguser",
            "password": "wrongpass"
        })
        assert response.status_code == 401
        print("✓ Invalid credentials correctly rejected")


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


class TestRawMaterialMaster:
    """Raw Material Master CRUD tests"""
    
    def test_create_raw_material(self, auth_headers):
        """Create a raw material master"""
        payload = {
            "name": f"{TEST_PREFIX}Sugar",
            "unit": "kg",
            "description": "Test sugar material"
        }
        response = requests.post(f"{BASE_URL}/api/raw-material-master", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["name"] == f"{TEST_PREFIX}Sugar"
        assert data["unit"] == "kg"
        assert "id" in data
        print(f"✓ Created raw material: {data['name']}")
        return data
    
    def test_list_raw_materials(self, auth_headers):
        """List all raw materials"""
        response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} raw materials")
    
    def test_create_raw_material_rate(self, auth_headers):
        """Create a rate for raw material"""
        # First get or create a material
        list_response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        materials = list_response.json()
        test_material = next((m for m in materials if m["name"].startswith(TEST_PREFIX)), None)
        
        if not test_material:
            # Create one
            create_response = requests.post(f"{BASE_URL}/api/raw-material-master", json={
                "name": f"{TEST_PREFIX}RateMaterial",
                "unit": "kg"
            }, headers=auth_headers)
            test_material = create_response.json()
        
        # Create rate
        today = datetime.now().strftime("%Y-%m-%d")
        rate_payload = {
            "raw_material_id": test_material["id"],
            "rate": 50.0,
            "from_date": today,
            "to_date": None
        }
        response = requests.post(f"{BASE_URL}/api/raw-material-rate", json=rate_payload, headers=auth_headers)
        assert response.status_code == 200, f"Rate creation failed: {response.text}"
        data = response.json()
        assert data["rate"] == 50.0
        print(f"✓ Created rate for material: {test_material['name']}")
        return test_material, data
    
    def test_get_rate_by_date(self, auth_headers):
        """Get rate for a material by date"""
        # First ensure we have a material with rate
        list_response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        materials = list_response.json()
        test_material = next((m for m in materials if m["name"].startswith(TEST_PREFIX)), None)
        
        if test_material:
            today = datetime.now().strftime("%Y-%m-%d")
            response = requests.get(
                f"{BASE_URL}/api/raw-material-rate-by-date/{test_material['name']}/{today}",
                headers=auth_headers
            )
            assert response.status_code == 200
            print(f"✓ Got rate by date for {test_material['name']}")


class TestFinishedProductMaster:
    """Finished Product Master CRUD tests"""
    
    def test_create_finished_product(self, auth_headers):
        """Create a finished product master"""
        payload = {
            "sku_name": f"{TEST_PREFIX}Paneer-200g",
            "uom": "packet",
            "description": "Test paneer packet"
        }
        response = requests.post(f"{BASE_URL}/api/finished-product-master", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["sku_name"] == f"{TEST_PREFIX}Paneer-200g"
        assert "id" in data
        print(f"✓ Created finished product: {data['sku_name']}")
        return data
    
    def test_list_finished_products(self, auth_headers):
        """List all finished product masters"""
        response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} finished product masters")
    
    def test_update_finished_product(self, auth_headers):
        """Update a finished product master"""
        # Get existing
        list_response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
        masters = list_response.json()
        test_master = next((m for m in masters if m["sku_name"].startswith(TEST_PREFIX)), None)
        
        if test_master:
            update_payload = {
                "sku_name": test_master["sku_name"],
                "uom": "grams",
                "description": "Updated description"
            }
            response = requests.put(
                f"{BASE_URL}/api/finished-product-master/{test_master['id']}",
                json=update_payload,
                headers=auth_headers
            )
            assert response.status_code == 200
            data = response.json()
            assert data["uom"] == "grams"
            print(f"✓ Updated finished product: {test_master['sku_name']}")


class TestSemiFinishedMaster:
    """Semi-Finished Product Master CRUD tests"""
    
    def test_create_semi_finished_master(self, auth_headers):
        """Create a semi-finished product master with SKU mappings"""
        # First ensure we have a finished product
        fp_response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
        finished_products = fp_response.json()
        
        if not finished_products:
            # Create one
            requests.post(f"{BASE_URL}/api/finished-product-master", json={
                "sku_name": f"{TEST_PREFIX}SKU-100g",
                "uom": "packet"
            }, headers=auth_headers)
            fp_response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
            finished_products = fp_response.json()
        
        sku_name = finished_products[0]["sku_name"] if finished_products else f"{TEST_PREFIX}SKU-100g"
        
        payload = {
            "name": f"{TEST_PREFIX}PaneerBlock",
            "unit": "kg",
            "description": "Test paneer block",
            "finished_sku_mappings": [
                {"sku_name": sku_name, "quantity_consumed": 0.2}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/semi-finished-master", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["name"] == f"{TEST_PREFIX}PaneerBlock"
        assert len(data["finished_sku_mappings"]) > 0
        print(f"✓ Created semi-finished master: {data['name']}")
        return data
    
    def test_list_semi_finished_masters(self, auth_headers):
        """List all semi-finished masters"""
        response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} semi-finished masters")
    
    def test_update_semi_finished_master(self, auth_headers):
        """Update a semi-finished master"""
        list_response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=auth_headers)
        masters = list_response.json()
        test_master = next((m for m in masters if m["name"].startswith(TEST_PREFIX)), None)
        
        if test_master:
            # Get finished products for mapping
            fp_response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
            finished_products = fp_response.json()
            sku_name = finished_products[0]["sku_name"] if finished_products else "TestSKU"
            
            update_payload = {
                "name": test_master["name"],
                "unit": "kg",
                "description": "Updated description",
                "finished_sku_mappings": [
                    {"sku_name": sku_name, "quantity_consumed": 0.25}
                ]
            }
            response = requests.put(
                f"{BASE_URL}/api/semi-finished-master/{test_master['id']}",
                json=update_payload,
                headers=auth_headers
            )
            assert response.status_code == 200
            print(f"✓ Updated semi-finished master: {test_master['name']}")


class TestBatchEntry:
    """Batch Entry CRUD tests"""
    
    def test_create_batch(self, auth_headers):
        """Create a batch with raw materials"""
        # First ensure we have raw material with rate
        rm_response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        raw_materials = rm_response.json()
        
        if not raw_materials:
            pytest.skip("No raw materials available for batch creation")
        
        # Get semi-finished masters
        sf_response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=auth_headers)
        semi_finished = sf_response.json()
        
        if not semi_finished:
            pytest.skip("No semi-finished masters available for batch creation")
        
        material_name = raw_materials[0]["name"]
        product_name = semi_finished[0]["name"]
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Check if rate exists for this material
        rate_response = requests.get(
            f"{BASE_URL}/api/raw-material-rate-by-date/{material_name}/{today}",
            headers=auth_headers
        )
        rate_data = rate_response.json()
        
        if rate_data.get("rate", 0) == 0:
            # Create a rate first
            rm_id = raw_materials[0]["id"]
            requests.post(f"{BASE_URL}/api/raw-material-rate", json={
                "raw_material_id": rm_id,
                "rate": 100.0,
                "from_date": today,
                "to_date": None
            }, headers=auth_headers)
        
        payload = {
            "batch_date": today,
            "milk_kg": 100.0,
            "fat_percent": 4.5,
            "snf_percent": 8.5,
            "raw_materials": [material_name],
            "raw_material_quantities": [10.0],
            "output_type": "semi-finished",
            "product_name": product_name,
            "quantity_produced": 50.0,
            "notes": "Test batch"
        }
        response = requests.post(f"{BASE_URL}/api/batches", json=payload, headers=auth_headers)
        
        if response.status_code == 400 and "No rate found" in response.text:
            pytest.skip(f"Rate not configured for material: {material_name}")
        
        assert response.status_code == 200, f"Batch creation failed: {response.text}"
        data = response.json()
        assert "batch_number" in data
        assert data["milk_kg"] == 100.0
        print(f"✓ Created batch: {data['batch_number']}")
        return data
    
    def test_list_batches(self, auth_headers):
        """List all batches"""
        response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} batches")
    
    def test_get_batch_by_id(self, auth_headers):
        """Get a specific batch by ID"""
        list_response = requests.get(f"{BASE_URL}/api/batches", headers=auth_headers)
        batches = list_response.json()
        
        if batches:
            batch_id = batches[0]["id"]
            response = requests.get(f"{BASE_URL}/api/batches/{batch_id}", headers=auth_headers)
            assert response.status_code == 200
            data = response.json()
            assert data["id"] == batch_id
            print(f"✓ Got batch by ID: {batch_id[:8]}...")


class TestRawMaterialStock:
    """Raw Material Stock CRUD tests"""
    
    def test_create_stock_entry(self, auth_headers):
        """Create a raw material stock entry"""
        # Get raw materials
        rm_response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        raw_materials = rm_response.json()
        
        if not raw_materials:
            pytest.skip("No raw materials available")
        
        material = raw_materials[0]
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Ensure rate exists
        rate_response = requests.get(
            f"{BASE_URL}/api/raw-material-rate-by-date/{material['name']}/{today}",
            headers=auth_headers
        )
        rate_data = rate_response.json()
        
        if rate_data.get("rate", 0) == 0:
            requests.post(f"{BASE_URL}/api/raw-material-rate", json={
                "raw_material_id": material["id"],
                "rate": 75.0,
                "from_date": today,
                "to_date": None
            }, headers=auth_headers)
        
        # Use a unique date to avoid conflicts
        test_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        payload = {
            "name": material["name"],
            "date": test_date,
            "purchased": 100.0
        }
        response = requests.post(f"{BASE_URL}/api/raw-material-stock", json=payload, headers=auth_headers)
        
        if response.status_code == 400:
            if "already exists" in response.text:
                print(f"✓ Stock entry already exists for {material['name']} on {test_date}")
                return
            elif "No rate found" in response.text:
                pytest.skip(f"Rate not configured for date: {test_date}")
        
        assert response.status_code == 200, f"Stock creation failed: {response.text}"
        data = response.json()
        assert data["name"] == material["name"]
        assert data["purchased"] == 100.0
        print(f"✓ Created stock entry for {material['name']}")
        return data
    
    def test_list_stock_entries(self, auth_headers):
        """List all stock entries"""
        response = requests.get(f"{BASE_URL}/api/raw-material-stock", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} stock entries")
    
    def test_stock_report_with_filters(self, auth_headers):
        """Test stock report with date and material filters"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/reports/raw-material-stock?start_date={today}&end_date={today}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Stock report with filters returned {len(data)} entries")


class TestSemiFinishedProducts:
    """Semi-Finished Products tests"""
    
    def test_list_semi_finished_products(self, auth_headers):
        """List all semi-finished products"""
        response = requests.get(f"{BASE_URL}/api/semi-finished", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} semi-finished products")
    
    def test_semi_finished_with_date_filter(self, auth_headers):
        """Test semi-finished products with date filter"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/semi-finished?start_date={today}&end_date={today}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Semi-finished products with date filter returned {len(data)} entries")


class TestPacking:
    """Packing (Finished Products) tests"""
    
    def test_list_finished_products(self, auth_headers):
        """List all finished products"""
        response = requests.get(f"{BASE_URL}/api/finished-products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} finished products")
    
    def test_packing_history(self, auth_headers):
        """Test packing history endpoint"""
        # Get semi-finished products
        sf_response = requests.get(f"{BASE_URL}/api/semi-finished", headers=auth_headers)
        semi_finished = sf_response.json()
        
        if semi_finished:
            product_id = semi_finished[0]["id"]
            response = requests.get(
                f"{BASE_URL}/api/packing-history/{product_id}",
                headers=auth_headers
            )
            assert response.status_code == 200
            data = response.json()
            assert isinstance(data, list)
            print(f"✓ Got packing history for product")


class TestDispatch:
    """Dispatch tests"""
    
    def test_list_dispatches(self, auth_headers):
        """List all dispatches"""
        response = requests.get(f"{BASE_URL}/api/dispatch", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} dispatches")


class TestDashboard:
    """Dashboard stats tests"""
    
    def test_dashboard_stats(self, auth_headers):
        """Get dashboard statistics"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "batches_today" in data
        assert "dispatches_today" in data
        assert "total_stock_items" in data
        assert "low_stock_count" in data
        print(f"✓ Dashboard stats: {data['batches_today']} batches today, {data['total_stock_items']} stock items")


class TestUserManagement:
    """User management tests (admin only)"""
    
    def test_list_users(self, auth_headers):
        """List all users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least admin user
        print(f"✓ Listed {len(data)} users")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_data(self, auth_headers):
        """Clean up test-created data"""
        # Delete test raw materials
        rm_response = requests.get(f"{BASE_URL}/api/raw-material-master", headers=auth_headers)
        for material in rm_response.json():
            if material["name"].startswith(TEST_PREFIX):
                requests.delete(f"{BASE_URL}/api/raw-material-master/{material['id']}", headers=auth_headers)
                print(f"  Deleted raw material: {material['name']}")
        
        # Delete test finished products
        fp_response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=auth_headers)
        for product in fp_response.json():
            if product["sku_name"].startswith(TEST_PREFIX):
                requests.delete(f"{BASE_URL}/api/finished-product-master/{product['id']}", headers=auth_headers)
                print(f"  Deleted finished product: {product['sku_name']}")
        
        # Delete test semi-finished masters
        sf_response = requests.get(f"{BASE_URL}/api/semi-finished-master", headers=auth_headers)
        for master in sf_response.json():
            if master["name"].startswith(TEST_PREFIX):
                requests.delete(f"{BASE_URL}/api/semi-finished-master/{master['id']}", headers=auth_headers)
                print(f"  Deleted semi-finished master: {master['name']}")
        
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
