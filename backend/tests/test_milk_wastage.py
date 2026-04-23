"""
Test suite for Milk Wastage Tracking feature
Tests CRUD operations, RBAC enforcement, and TS report integration
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"username": "admin", "password": "admin123"}
VIEWER_CREDS = {"username": "viewer", "password": "viewer123"}
MODIFY_CREDS = {"username": "supervisor", "password": "super123"}


class TestMilkWastageAuth:
    """Authentication tests for wastage endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def get_token(self, creds):
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=creds)
        if response.status_code == 200:
            return response.json().get("token")
        return None
    
    def test_admin_login(self):
        """Admin can login successfully"""
        token = self.get_token(ADMIN_CREDS)
        assert token is not None, "Admin login failed"
        print("PASS: Admin login successful")
    
    def test_viewer_login(self):
        """Viewer can login successfully"""
        token = self.get_token(VIEWER_CREDS)
        assert token is not None, "Viewer login failed"
        print("PASS: Viewer login successful")
    
    def test_modify_login(self):
        """Modify user can login successfully"""
        token = self.get_token(MODIFY_CREDS)
        assert token is not None, "Modify user login failed"
        print("PASS: Modify user login successful")


class TestMilkWastageCRUD:
    """CRUD operations for milk wastage"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin for CRUD tests
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200, "Admin login failed"
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.created_ids = []
    
    def teardown_method(self, method):
        """Cleanup created test data"""
        for wastage_id in self.created_ids:
            try:
                self.session.delete(f"{BASE_URL}/api/milk-wastage/{wastage_id}")
            except:
                pass
    
    def test_get_wastage_list(self):
        """GET /api/milk-wastage returns list of wastage entries"""
        response = self.session.get(f"{BASE_URL}/api/milk-wastage")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASS: GET /api/milk-wastage returns {len(data)} entries")
    
    def test_create_wastage_all_fields(self):
        """POST /api/milk-wastage creates entry with all fields"""
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 10.5,
            "fat_kg": 0.5,
            "snf_kg": 0.8,
            "notes": "TEST_spillage during transfer"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "id" in data, "Response should have id"
        assert data["date"] == payload["date"], "Date mismatch"
        assert data["quantity_kg"] == payload["quantity_kg"], "Quantity mismatch"
        assert data["fat_kg"] == payload["fat_kg"], "Fat mismatch"
        assert data["snf_kg"] == payload["snf_kg"], "SNF mismatch"
        assert data["notes"] == payload["notes"], "Notes mismatch"
        
        self.created_ids.append(data["id"])
        print(f"PASS: Created wastage entry with all fields, id={data['id']}")
    
    def test_create_wastage_qty_only(self):
        """POST /api/milk-wastage creates entry with only quantity_kg"""
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 5.0,
            "fat_kg": 0,
            "snf_kg": 0,
            "notes": "TEST_qty only wastage"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["quantity_kg"] == 5.0
        assert data["fat_kg"] == 0
        assert data["snf_kg"] == 0
        
        self.created_ids.append(data["id"])
        print("PASS: Created wastage entry with only quantity_kg")
    
    def test_create_wastage_fat_only(self):
        """POST /api/milk-wastage creates entry with only fat_kg"""
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 0,
            "fat_kg": 0.3,
            "snf_kg": 0,
            "notes": "TEST_fat only wastage"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["quantity_kg"] == 0
        assert data["fat_kg"] == 0.3
        assert data["snf_kg"] == 0
        
        self.created_ids.append(data["id"])
        print("PASS: Created wastage entry with only fat_kg")
    
    def test_create_wastage_snf_only(self):
        """POST /api/milk-wastage creates entry with only snf_kg"""
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 0,
            "fat_kg": 0,
            "snf_kg": 0.5,
            "notes": "TEST_snf only wastage"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data["quantity_kg"] == 0
        assert data["fat_kg"] == 0
        assert data["snf_kg"] == 0.5
        
        self.created_ids.append(data["id"])
        print("PASS: Created wastage entry with only snf_kg")
    
    def test_update_wastage(self):
        """PUT /api/milk-wastage/{id} updates wastage entry"""
        # First create
        create_payload = {
            "date": "2026-03-25",
            "quantity_kg": 2.0,
            "fat_kg": 0.1,
            "snf_kg": 0.2,
            "notes": "TEST_original"
        }
        create_response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=create_payload)
        assert create_response.status_code == 200
        wastage_id = create_response.json()["id"]
        self.created_ids.append(wastage_id)
        
        # Update
        update_payload = {
            "date": "2026-03-26",
            "quantity_kg": 3.0,
            "fat_kg": 0.15,
            "snf_kg": 0.25,
            "notes": "TEST_updated"
        }
        update_response = self.session.put(f"{BASE_URL}/api/milk-wastage/{wastage_id}", json=update_payload)
        assert update_response.status_code == 200, f"Expected 200, got {update_response.status_code}"
        
        data = update_response.json()
        assert data["date"] == update_payload["date"], "Date not updated"
        assert data["quantity_kg"] == update_payload["quantity_kg"], "Quantity not updated"
        assert data["fat_kg"] == update_payload["fat_kg"], "Fat not updated"
        assert data["snf_kg"] == update_payload["snf_kg"], "SNF not updated"
        assert data["notes"] == update_payload["notes"], "Notes not updated"
        
        # Verify with GET
        get_response = self.session.get(f"{BASE_URL}/api/milk-wastage")
        assert get_response.status_code == 200
        entries = get_response.json()
        updated_entry = next((e for e in entries if e["id"] == wastage_id), None)
        assert updated_entry is not None, "Updated entry not found in list"
        assert updated_entry["quantity_kg"] == 3.0, "Update not persisted"
        
        print(f"PASS: Updated wastage entry {wastage_id}")
    
    def test_delete_wastage_admin(self):
        """DELETE /api/milk-wastage/{id} deletes entry (admin)"""
        # First create
        create_payload = {
            "date": "2026-03-25",
            "quantity_kg": 1.0,
            "fat_kg": 0.05,
            "snf_kg": 0.1,
            "notes": "TEST_to_delete"
        }
        create_response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=create_payload)
        assert create_response.status_code == 200
        wastage_id = create_response.json()["id"]
        
        # Delete
        delete_response = self.session.delete(f"{BASE_URL}/api/milk-wastage/{wastage_id}")
        assert delete_response.status_code == 200, f"Expected 200, got {delete_response.status_code}"
        
        # Verify deleted
        get_response = self.session.get(f"{BASE_URL}/api/milk-wastage")
        entries = get_response.json()
        deleted_entry = next((e for e in entries if e["id"] == wastage_id), None)
        assert deleted_entry is None, "Entry should be deleted"
        
        print(f"PASS: Deleted wastage entry {wastage_id}")


class TestMilkWastageRBAC:
    """RBAC enforcement for milk wastage endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.created_ids = []
        
        # Create a test entry as admin for RBAC tests
        admin_response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        admin_token = admin_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
        
        create_payload = {
            "date": "2026-03-25",
            "quantity_kg": 1.0,
            "fat_kg": 0.05,
            "snf_kg": 0.1,
            "notes": "TEST_rbac_test_entry"
        }
        create_response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=create_payload)
        if create_response.status_code == 200:
            self.test_entry_id = create_response.json()["id"]
            self.created_ids.append(self.test_entry_id)
        else:
            self.test_entry_id = None
    
    def teardown_method(self, method):
        """Cleanup created test data"""
        # Re-login as admin to cleanup
        self.session.headers.update({"Content-Type": "application/json"})
        admin_response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        if admin_response.status_code == 200:
            admin_token = admin_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {admin_token}"})
            for wastage_id in self.created_ids:
                try:
                    self.session.delete(f"{BASE_URL}/api/milk-wastage/{wastage_id}")
                except:
                    pass
    
    def test_viewer_can_read_wastage(self):
        """View user can read wastage entries"""
        # Login as viewer
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=VIEWER_CREDS)
        assert login_response.status_code == 200
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to read
        response = self.session.get(f"{BASE_URL}/api/milk-wastage")
        assert response.status_code == 200, f"Viewer should be able to read, got {response.status_code}"
        print("PASS: Viewer can read wastage entries")
    
    def test_viewer_cannot_create_wastage(self):
        """View user cannot create wastage entries (403)"""
        # Login as viewer
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=VIEWER_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to create
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 1.0,
            "fat_kg": 0.05,
            "snf_kg": 0.1,
            "notes": "TEST_viewer_create"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 403, f"Viewer should get 403, got {response.status_code}"
        print("PASS: Viewer cannot create wastage (403)")
    
    def test_viewer_cannot_update_wastage(self):
        """View user cannot update wastage entries (403)"""
        if not self.test_entry_id:
            pytest.skip("No test entry created")
        
        # Login as viewer
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=VIEWER_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to update
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 2.0,
            "fat_kg": 0.1,
            "snf_kg": 0.2,
            "notes": "TEST_viewer_update"
        }
        response = self.session.put(f"{BASE_URL}/api/milk-wastage/{self.test_entry_id}", json=payload)
        assert response.status_code == 403, f"Viewer should get 403, got {response.status_code}"
        print("PASS: Viewer cannot update wastage (403)")
    
    def test_viewer_cannot_delete_wastage(self):
        """View user cannot delete wastage entries (403)"""
        if not self.test_entry_id:
            pytest.skip("No test entry created")
        
        # Login as viewer
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=VIEWER_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to delete
        response = self.session.delete(f"{BASE_URL}/api/milk-wastage/{self.test_entry_id}")
        assert response.status_code == 403, f"Viewer should get 403, got {response.status_code}"
        print("PASS: Viewer cannot delete wastage (403)")
    
    def test_modify_user_can_create_wastage(self):
        """Modify user can create wastage entries"""
        # Login as modify user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=MODIFY_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to create
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 1.5,
            "fat_kg": 0.07,
            "snf_kg": 0.12,
            "notes": "TEST_modify_create"
        }
        response = self.session.post(f"{BASE_URL}/api/milk-wastage", json=payload)
        assert response.status_code == 200, f"Modify user should be able to create, got {response.status_code}"
        
        if response.status_code == 200:
            self.created_ids.append(response.json()["id"])
        
        print("PASS: Modify user can create wastage")
    
    def test_modify_user_can_update_wastage(self):
        """Modify user can update wastage entries"""
        if not self.test_entry_id:
            pytest.skip("No test entry created")
        
        # Login as modify user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=MODIFY_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to update
        payload = {
            "date": "2026-03-25",
            "quantity_kg": 2.5,
            "fat_kg": 0.12,
            "snf_kg": 0.18,
            "notes": "TEST_modify_update"
        }
        response = self.session.put(f"{BASE_URL}/api/milk-wastage/{self.test_entry_id}", json=payload)
        assert response.status_code == 200, f"Modify user should be able to update, got {response.status_code}"
        print("PASS: Modify user can update wastage")
    
    def test_modify_user_cannot_delete_wastage(self):
        """Modify user cannot delete wastage entries (403)"""
        if not self.test_entry_id:
            pytest.skip("No test entry created")
        
        # Login as modify user
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json=MODIFY_CREDS)
        token = login_response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Try to delete
        response = self.session.delete(f"{BASE_URL}/api/milk-wastage/{self.test_entry_id}")
        assert response.status_code == 403, f"Modify user should get 403, got {response.status_code}"
        print("PASS: Modify user cannot delete wastage (403)")


class TestMilkTSReportWithWastage:
    """Test that TS report includes wastage correctly"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        # Login as admin
        response = self.session.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDS)
        assert response.status_code == 200
        token = response.json().get("token")
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_ts_report_has_total_wastage(self):
        """GET /api/reports/milk-ts includes total_wastage in response"""
        response = self.session.get(f"{BASE_URL}/api/reports/milk-ts")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total_wastage" in data, "Response should have total_wastage"
        assert "milk_kg" in data["total_wastage"], "total_wastage should have milk_kg"
        assert "fat_kg" in data["total_wastage"], "total_wastage should have fat_kg"
        assert "snf_kg" in data["total_wastage"], "total_wastage should have snf_kg"
        
        print(f"PASS: TS report has total_wastage: {data['total_wastage']}")
    
    def test_ts_report_daily_summary_has_wastage(self):
        """GET /api/reports/milk-ts daily_summary includes wastage fields"""
        response = self.session.get(f"{BASE_URL}/api/reports/milk-ts")
        assert response.status_code == 200
        
        data = response.json()
        assert "daily_summary" in data, "Response should have daily_summary"
        
        if len(data["daily_summary"]) > 0:
            day = data["daily_summary"][0]
            assert "wastage_milk_kg" in day, "daily_summary should have wastage_milk_kg"
            assert "wastage_fat_kg" in day, "daily_summary should have wastage_fat_kg"
            assert "wastage_snf_kg" in day, "daily_summary should have wastage_snf_kg"
            print(f"PASS: Daily summary has wastage fields for date {day['date']}")
        else:
            print("PASS: Daily summary structure verified (no data)")
    
    def test_closing_formula_with_wastage(self):
        """Closing = Opening + Purchased - Used - Wastage"""
        response = self.session.get(f"{BASE_URL}/api/reports/milk-ts")
        assert response.status_code == 200
        
        data = response.json()
        opening = data["opening"]
        purchased = data["total_purchased"]
        used = data["total_used"]
        wastage = data["total_wastage"]
        closing = data["closing"]
        
        # Verify formula: Closing = Opening + Purchased - Used - Wastage
        expected_milk = round(opening["milk_kg"] + purchased["milk_kg"] - used["milk_kg"] - wastage["milk_kg"], 2)
        expected_fat = round(opening["fat_kg"] + purchased["fat_kg"] - used["fat_kg"] - wastage["fat_kg"], 2)
        expected_snf = round(opening["snf_kg"] + purchased["snf_kg"] - used["snf_kg"] - wastage["snf_kg"], 2)
        
        assert closing["milk_kg"] == expected_milk, f"Milk closing mismatch: {closing['milk_kg']} != {expected_milk}"
        assert closing["fat_kg"] == expected_fat, f"Fat closing mismatch: {closing['fat_kg']} != {expected_fat}"
        assert closing["snf_kg"] == expected_snf, f"SNF closing mismatch: {closing['snf_kg']} != {expected_snf}"
        
        print(f"PASS: Closing formula verified - Milk: {closing['milk_kg']}, Fat: {closing['fat_kg']}, SNF: {closing['snf_kg']}")
        print(f"  Opening: {opening}")
        print(f"  Purchased: {purchased}")
        print(f"  Used: {used}")
        print(f"  Wastage: {wastage}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
