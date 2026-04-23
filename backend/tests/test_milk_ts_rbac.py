"""
Test suite for Milk TS Sheet and RBAC features
Tests:
- Milk Stock CRUD operations (POST, GET, PUT, DELETE)
- Milk TS Report endpoint with date filters
- RBAC: view user cannot create/update/delete
- RBAC: modify user can create/update but not delete
- RBAC: admin user has full access
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "admin123"}
VIEWER_CREDS = {"username": "viewer", "password": "viewer123"}
MODIFY_CREDS = {"username": "supervisor", "password": "super123"}


class TestAuth:
    """Authentication tests for all user roles"""
    
    def test_admin_login(self):
        """Admin user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        print(f"✓ Admin login successful, role: {data['user']['role']}")
    
    def test_viewer_login(self):
        """Viewer user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=VIEWER_CREDS)
        assert response.status_code == 200, f"Viewer login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "view"
        print(f"✓ Viewer login successful, role: {data['user']['role']}")
    
    def test_modify_login(self):
        """Modify user can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=MODIFY_CREDS)
        assert response.status_code == 200, f"Modify login failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "modify"
        print(f"✓ Modify user login successful, role: {data['user']['role']}")


def get_token(creds):
    """Helper to get auth token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json=creds)
    if response.status_code == 200:
        return response.json()["token"]
    return None


class TestMilkStockCRUD:
    """Milk Stock CRUD operations tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token for tests"""
        self.admin_token = get_token(ADMIN_CREDS)
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.created_ids = []
        yield
        # Cleanup created entries
        for entry_id in self.created_ids:
            requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
    
    def test_get_milk_stock_list(self):
        """GET /api/milk-stock returns list of entries"""
        response = requests.get(f"{BASE_URL}/api/milk-stock", headers=self.headers)
        assert response.status_code == 200, f"Failed to get milk stock: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/milk-stock returned {len(data)} entries")
    
    def test_create_milk_stock(self):
        """POST /api/milk-stock creates new entry"""
        payload = {
            "date": "2026-01-20",
            "quantity_kg": 100.5,
            "fat_percent": 4.5,
            "snf_percent": 8.5,
            "notes": "TEST_milk_purchase"
        }
        response = requests.post(f"{BASE_URL}/api/milk-stock", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Failed to create milk stock: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "id" in data
        assert data["quantity_kg"] == 100.5
        assert data["fat_percent"] == 4.5
        assert data["snf_percent"] == 8.5
        
        # Verify calculated values
        expected_fat_kg = round(4.5 * 100.5 / 100, 4)
        expected_snf_kg = round(8.5 * 100.5 / 100, 4)
        assert abs(data["fat_kg"] - expected_fat_kg) < 0.01, f"Fat kg mismatch: {data['fat_kg']} vs {expected_fat_kg}"
        assert abs(data["snf_kg"] - expected_snf_kg) < 0.01, f"SNF kg mismatch: {data['snf_kg']} vs {expected_snf_kg}"
        
        self.created_ids.append(data["id"])
        print(f"✓ Created milk stock entry: {data['id']}, fat_kg={data['fat_kg']}, snf_kg={data['snf_kg']}")
    
    def test_update_milk_stock(self):
        """PUT /api/milk-stock/{id} updates entry"""
        # First create an entry
        create_payload = {
            "date": "2026-01-21",
            "quantity_kg": 50.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_to_update"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        self.created_ids.append(entry_id)
        
        # Update the entry
        update_payload = {
            "date": "2026-01-21",
            "quantity_kg": 75.0,
            "fat_percent": 5.0,
            "snf_percent": 9.0,
            "notes": "TEST_updated"
        }
        update_response = requests.put(f"{BASE_URL}/api/milk-stock/{entry_id}", json=update_payload, headers=self.headers)
        assert update_response.status_code == 200, f"Failed to update: {update_response.text}"
        
        updated_data = update_response.json()
        assert updated_data["quantity_kg"] == 75.0
        assert updated_data["fat_percent"] == 5.0
        assert updated_data["notes"] == "TEST_updated"
        print(f"✓ Updated milk stock entry: {entry_id}")
    
    def test_delete_milk_stock(self):
        """DELETE /api/milk-stock/{id} deletes entry (admin only)"""
        # First create an entry
        create_payload = {
            "date": "2026-01-22",
            "quantity_kg": 30.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_to_delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        
        # Delete the entry
        delete_response = requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Failed to delete: {delete_response.text}"
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/milk-stock", headers=self.headers)
        entries = get_response.json()
        assert not any(e["id"] == entry_id for e in entries), "Entry still exists after deletion"
        print(f"✓ Deleted milk stock entry: {entry_id}")


class TestMilkTSReport:
    """Milk TS Report endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_token(ADMIN_CREDS)
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_get_milk_ts_report(self):
        """GET /api/reports/milk-ts returns TS report"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts", headers=self.headers)
        assert response.status_code == 200, f"Failed to get TS report: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert "opening" in data
        assert "total_purchased" in data
        assert "total_used" in data
        assert "closing" in data
        assert "daily_summary" in data
        assert "transactions" in data
        
        # Verify opening/closing structure
        for key in ["opening", "total_purchased", "total_used", "closing"]:
            assert "milk_kg" in data[key]
            assert "fat_kg" in data[key]
            assert "snf_kg" in data[key]
        
        print(f"✓ GET /api/reports/milk-ts returned valid structure")
        print(f"  Opening: milk={data['opening']['milk_kg']}, fat={data['opening']['fat_kg']}, snf={data['opening']['snf_kg']}")
        print(f"  Closing: milk={data['closing']['milk_kg']}, fat={data['closing']['fat_kg']}, snf={data['closing']['snf_kg']}")
    
    def test_milk_ts_report_with_date_filter(self):
        """GET /api/reports/milk-ts with date range filter"""
        response = requests.get(
            f"{BASE_URL}/api/reports/milk-ts?start_date=2026-01-01&end_date=2026-12-31",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed with date filter: {response.text}"
        data = response.json()
        
        # Verify daily_summary dates are within range
        for day in data["daily_summary"]:
            assert "2026-01-01" <= day["date"] <= "2026-12-31", f"Date {day['date']} outside filter range"
        
        print(f"✓ Date filter works, {len(data['daily_summary'])} days in range")
    
    def test_milk_ts_report_daily_summary_structure(self):
        """Verify daily summary has correct fields"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        if data["daily_summary"]:
            day = data["daily_summary"][0]
            required_fields = [
                "date", "opening_milk_kg", "opening_fat_kg", "opening_snf_kg",
                "purchased_milk_kg", "purchased_fat_kg", "purchased_snf_kg",
                "used_milk_kg", "used_fat_kg", "used_snf_kg",
                "closing_milk_kg", "closing_fat_kg", "closing_snf_kg"
            ]
            for field in required_fields:
                assert field in day, f"Missing field: {field}"
            print(f"✓ Daily summary has all required fields")
        else:
            print("⚠ No daily summary data to verify")
    
    def test_milk_ts_closing_calculation(self):
        """Verify closing = opening + purchased - used"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify closing calculation
        expected_closing_milk = data["opening"]["milk_kg"] + data["total_purchased"]["milk_kg"] - data["total_used"]["milk_kg"]
        expected_closing_fat = data["opening"]["fat_kg"] + data["total_purchased"]["fat_kg"] - data["total_used"]["fat_kg"]
        expected_closing_snf = data["opening"]["snf_kg"] + data["total_purchased"]["snf_kg"] - data["total_used"]["snf_kg"]
        
        assert abs(data["closing"]["milk_kg"] - expected_closing_milk) < 0.1, "Milk closing mismatch"
        assert abs(data["closing"]["fat_kg"] - expected_closing_fat) < 0.1, "Fat closing mismatch"
        assert abs(data["closing"]["snf_kg"] - expected_closing_snf) < 0.1, "SNF closing mismatch"
        
        print(f"✓ Closing calculation verified: milk={data['closing']['milk_kg']}, fat={data['closing']['fat_kg']}, snf={data['closing']['snf_kg']}")


class TestRBACViewUser:
    """RBAC tests for view-only user"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup viewer token"""
        self.viewer_token = get_token(VIEWER_CREDS)
        if not self.viewer_token:
            pytest.skip("Viewer user not available")
        self.headers = {"Authorization": f"Bearer {self.viewer_token}"}
    
    def test_viewer_can_read_milk_stock(self):
        """View user can read milk stock"""
        response = requests.get(f"{BASE_URL}/api/milk-stock", headers=self.headers)
        assert response.status_code == 200, f"Viewer cannot read milk stock: {response.text}"
        print("✓ Viewer can read milk stock")
    
    def test_viewer_cannot_create_milk_stock(self):
        """View user cannot create milk stock - should get 403"""
        payload = {
            "date": "2026-01-25",
            "quantity_kg": 100.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_viewer_create"
        }
        response = requests.post(f"{BASE_URL}/api/milk-stock", json=payload, headers=self.headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Viewer blocked from creating milk stock (403)")
    
    def test_viewer_cannot_update_milk_stock(self):
        """View user cannot update milk stock - should get 403"""
        # First get an existing entry
        admin_token = get_token(ADMIN_CREDS)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        entries = requests.get(f"{BASE_URL}/api/milk-stock", headers=admin_headers).json()
        
        if entries:
            entry_id = entries[0]["id"]
            payload = {
                "date": entries[0]["date"],
                "quantity_kg": 999.0,
                "fat_percent": 4.0,
                "snf_percent": 8.0,
                "notes": "TEST_viewer_update"
            }
            response = requests.put(f"{BASE_URL}/api/milk-stock/{entry_id}", json=payload, headers=self.headers)
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("✓ Viewer blocked from updating milk stock (403)")
        else:
            pytest.skip("No milk stock entries to test update")
    
    def test_viewer_cannot_delete_milk_stock(self):
        """View user cannot delete milk stock - should get 403"""
        admin_token = get_token(ADMIN_CREDS)
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        entries = requests.get(f"{BASE_URL}/api/milk-stock", headers=admin_headers).json()
        
        if entries:
            entry_id = entries[0]["id"]
            response = requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("✓ Viewer blocked from deleting milk stock (403)")
        else:
            pytest.skip("No milk stock entries to test delete")
    
    def test_viewer_cannot_create_batch(self):
        """View user cannot create batch - should get 403"""
        payload = {
            "batch_date": "2026-01-25",
            "milk_kg": 100.0,
            "fat_percent": 4.0,
            "fat_rate": 50,
            "snf_percent": 8.0,
            "snf_rate": 30,
            "raw_materials": [],
            "raw_material_quantities": [],
            "output_type": "finished",
            "product_name": "Test Product",
            "quantity_produced": 10
        }
        response = requests.post(f"{BASE_URL}/api/batches", json=payload, headers=self.headers)
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✓ Viewer blocked from creating batch (403)")


class TestRBACModifyUser:
    """RBAC tests for modify user"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup modify user token"""
        self.modify_token = get_token(MODIFY_CREDS)
        if not self.modify_token:
            pytest.skip("Modify user not available")
        self.headers = {"Authorization": f"Bearer {self.modify_token}"}
        self.admin_token = get_token(ADMIN_CREDS)
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.admin_headers)
    
    def test_modify_can_create_milk_stock(self):
        """Modify user can create milk stock"""
        payload = {
            "date": "2026-01-26",
            "quantity_kg": 80.0,
            "fat_percent": 4.2,
            "snf_percent": 8.3,
            "notes": "TEST_modify_create"
        }
        response = requests.post(f"{BASE_URL}/api/milk-stock", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Modify user cannot create: {response.text}"
        self.created_ids.append(response.json()["id"])
        print("✓ Modify user can create milk stock")
    
    def test_modify_can_update_milk_stock(self):
        """Modify user can update milk stock"""
        # Create an entry first
        create_payload = {
            "date": "2026-01-27",
            "quantity_kg": 60.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_modify_to_update"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        self.created_ids.append(entry_id)
        
        # Update it
        update_payload = {
            "date": "2026-01-27",
            "quantity_kg": 70.0,
            "fat_percent": 4.5,
            "snf_percent": 8.5,
            "notes": "TEST_modify_updated"
        }
        update_response = requests.put(f"{BASE_URL}/api/milk-stock/{entry_id}", json=update_payload, headers=self.headers)
        assert update_response.status_code == 200, f"Modify user cannot update: {update_response.text}"
        print("✓ Modify user can update milk stock")
    
    def test_modify_cannot_delete_milk_stock(self):
        """Modify user cannot delete milk stock - should get 403"""
        # Create an entry first
        create_payload = {
            "date": "2026-01-28",
            "quantity_kg": 40.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_modify_to_delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        assert create_response.status_code == 200
        entry_id = create_response.json()["id"]
        self.created_ids.append(entry_id)
        
        # Try to delete
        delete_response = requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
        assert delete_response.status_code == 403, f"Expected 403, got {delete_response.status_code}"
        print("✓ Modify user blocked from deleting milk stock (403)")
    
    def test_modify_cannot_delete_batch(self):
        """Modify user cannot delete batch - should get 403"""
        # Get existing batches
        batches = requests.get(f"{BASE_URL}/api/batches", headers=self.admin_headers).json()
        
        if batches:
            batch_id = batches[0]["id"]
            response = requests.delete(f"{BASE_URL}/api/batches/{batch_id}", headers=self.headers)
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("✓ Modify user blocked from deleting batch (403)")
        else:
            pytest.skip("No batches to test delete")


class TestRBACAdminUser:
    """RBAC tests for admin user - full access"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup admin token"""
        self.admin_token = get_token(ADMIN_CREDS)
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.created_ids = []
        yield
        # Cleanup
        for entry_id in self.created_ids:
            requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
    
    def test_admin_can_create_milk_stock(self):
        """Admin can create milk stock"""
        payload = {
            "date": "2026-01-29",
            "quantity_kg": 120.0,
            "fat_percent": 4.8,
            "snf_percent": 8.8,
            "notes": "TEST_admin_create"
        }
        response = requests.post(f"{BASE_URL}/api/milk-stock", json=payload, headers=self.headers)
        assert response.status_code == 200, f"Admin cannot create: {response.text}"
        self.created_ids.append(response.json()["id"])
        print("✓ Admin can create milk stock")
    
    def test_admin_can_update_milk_stock(self):
        """Admin can update milk stock"""
        # Create first
        create_payload = {
            "date": "2026-01-30",
            "quantity_kg": 90.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_admin_to_update"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        entry_id = create_response.json()["id"]
        self.created_ids.append(entry_id)
        
        # Update
        update_payload = {
            "date": "2026-01-30",
            "quantity_kg": 95.0,
            "fat_percent": 4.5,
            "snf_percent": 8.5,
            "notes": "TEST_admin_updated"
        }
        update_response = requests.put(f"{BASE_URL}/api/milk-stock/{entry_id}", json=update_payload, headers=self.headers)
        assert update_response.status_code == 200
        print("✓ Admin can update milk stock")
    
    def test_admin_can_delete_milk_stock(self):
        """Admin can delete milk stock"""
        # Create first
        create_payload = {
            "date": "2026-01-31",
            "quantity_kg": 50.0,
            "fat_percent": 4.0,
            "snf_percent": 8.0,
            "notes": "TEST_admin_to_delete"
        }
        create_response = requests.post(f"{BASE_URL}/api/milk-stock", json=create_payload, headers=self.headers)
        entry_id = create_response.json()["id"]
        
        # Delete
        delete_response = requests.delete(f"{BASE_URL}/api/milk-stock/{entry_id}", headers=self.headers)
        assert delete_response.status_code == 200, f"Admin cannot delete: {delete_response.text}"
        print("✓ Admin can delete milk stock")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
