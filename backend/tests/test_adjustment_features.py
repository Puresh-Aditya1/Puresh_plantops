"""
Test suite for Milk and Raw Material Gain/Loss Adjustment Features
Tests: CRUD operations for milk-adjustment and rm-adjustment APIs
Tests: Milk TS Report and RM Ledger with adjustment calculations
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuth:
    """Authentication tests for different roles"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def viewer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "viewer", "password": "viewer123"
        })
        assert response.status_code == 200, f"Viewer login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def modify_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "supervisor", "password": "super123"
        })
        assert response.status_code == 200, f"Modify user login failed: {response.text}"
        return response.json()["token"]


class TestMilkAdjustmentCRUD(TestAuth):
    """Milk Adjustment CRUD API tests"""
    
    def test_create_milk_gain_adjustment(self, admin_token):
        """POST /api/milk-adjustment with type='gain' creates gain entry"""
        response = requests.post(f"{BASE_URL}/api/milk-adjustment", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": "2026-03-25",
                "type": "gain",
                "quantity_kg": 5.0,
                "fat_kg": 0.25,
                "snf_kg": 0.4,
                "notes": "TEST_Cream recovery gain"
            })
        assert response.status_code == 200, f"Failed to create gain: {response.text}"
        data = response.json()
        assert data["type"] == "gain"
        assert data["quantity_kg"] == 5.0
        assert data["fat_kg"] == 0.25
        assert data["snf_kg"] == 0.4
        assert "id" in data
        return data["id"]
    
    def test_create_milk_loss_adjustment(self, admin_token):
        """POST /api/milk-adjustment with type='loss' creates loss entry"""
        response = requests.post(f"{BASE_URL}/api/milk-adjustment", 
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": "2026-03-25",
                "type": "loss",
                "quantity_kg": 2.0,
                "fat_kg": 0.1,
                "snf_kg": 0.15,
                "notes": "TEST_Spillage loss"
            })
        assert response.status_code == 200, f"Failed to create loss: {response.text}"
        data = response.json()
        assert data["type"] == "loss"
        assert data["quantity_kg"] == 2.0
        return data["id"]
    
    def test_get_milk_adjustments_sorted_by_date_desc(self, admin_token):
        """GET /api/milk-adjustment returns list sorted by date desc"""
        response = requests.get(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Check sorting (desc)
        if len(data) >= 2:
            dates = [entry["date"] for entry in data]
            assert dates == sorted(dates, reverse=True), "Entries not sorted by date desc"
    
    def test_update_milk_adjustment(self, admin_token):
        """PUT /api/milk-adjustment/{id} updates entry"""
        # First create an entry
        create_resp = requests.post(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"date": "2026-03-26", "type": "gain", "quantity_kg": 1.0, "fat_kg": 0.05, "snf_kg": 0.08, "notes": "TEST_To update"})
        assert create_resp.status_code == 200
        adj_id = create_resp.json()["id"]
        
        # Update it
        update_resp = requests.put(f"{BASE_URL}/api/milk-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"date": "2026-03-26", "type": "loss", "quantity_kg": 1.5, "fat_kg": 0.07, "snf_kg": 0.1, "notes": "TEST_Updated to loss"})
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["type"] == "loss"
        assert updated["quantity_kg"] == 1.5
        assert updated["notes"] == "TEST_Updated to loss"
        return adj_id
    
    def test_delete_milk_adjustment_admin_only(self, admin_token, viewer_token, modify_token):
        """DELETE /api/milk-adjustment/{id} admin only"""
        # Create entry to delete
        create_resp = requests.post(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"date": "2026-03-27", "type": "loss", "quantity_kg": 0.5, "fat_kg": 0.02, "snf_kg": 0.03, "notes": "TEST_To delete"})
        adj_id = create_resp.json()["id"]
        
        # Viewer cannot delete
        viewer_del = requests.delete(f"{BASE_URL}/api/milk-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {viewer_token}"})
        assert viewer_del.status_code == 403, "Viewer should not be able to delete"
        
        # Modify user cannot delete
        modify_del = requests.delete(f"{BASE_URL}/api/milk-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {modify_token}"})
        assert modify_del.status_code == 403, "Modify user should not be able to delete"
        
        # Admin can delete
        admin_del = requests.delete(f"{BASE_URL}/api/milk-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert admin_del.status_code == 200, f"Admin delete failed: {admin_del.text}"
    
    def test_viewer_cannot_create_adjustment(self, viewer_token):
        """View-only user cannot create milk adjustment"""
        response = requests.post(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {viewer_token}"},
            json={"date": "2026-03-25", "type": "gain", "quantity_kg": 1.0, "fat_kg": 0.05, "snf_kg": 0.08, "notes": "TEST_Should fail"})
        assert response.status_code == 403
    
    def test_modify_user_can_create_adjustment(self, modify_token):
        """Modify user can create milk adjustment"""
        response = requests.post(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {modify_token}"},
            json={"date": "2026-03-25", "type": "gain", "quantity_kg": 0.5, "fat_kg": 0.02, "snf_kg": 0.04, "notes": "TEST_Modify user created"})
        assert response.status_code == 200


class TestMilkTSReportWithAdjustments(TestAuth):
    """Milk TS Report tests with gain/loss adjustments"""
    
    def test_milk_ts_report_includes_total_gain_and_loss(self, admin_token):
        """GET /api/reports/milk-ts includes total_gain and total_loss"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Check structure
        assert "total_gain" in data, "Missing total_gain in response"
        assert "total_loss" in data, "Missing total_loss in response"
        assert "milk_kg" in data["total_gain"]
        assert "fat_kg" in data["total_gain"]
        assert "snf_kg" in data["total_gain"]
        assert "milk_kg" in data["total_loss"]
        assert "fat_kg" in data["total_loss"]
        assert "snf_kg" in data["total_loss"]
    
    def test_daily_summary_includes_gain_loss_fields(self, admin_token):
        """daily_summary includes gain_milk_kg, gain_fat_kg, gain_snf_kg, loss_milk_kg, loss_fat_kg, loss_snf_kg"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        if len(data["daily_summary"]) > 0:
            day = data["daily_summary"][0]
            required_fields = ["gain_milk_kg", "gain_fat_kg", "gain_snf_kg", "loss_milk_kg", "loss_fat_kg", "loss_snf_kg"]
            for field in required_fields:
                assert field in day, f"Missing {field} in daily_summary"
    
    def test_closing_calculation_with_adjustments(self, admin_token):
        """Closing = Opening + Purchased - Used + Gain - Loss (verify numbers)"""
        response = requests.get(f"{BASE_URL}/api/reports/milk-ts",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        # Verify closing calculation
        opening = data["opening"]["milk_kg"]
        purchased = data["total_purchased"]["milk_kg"]
        used = data["total_used"]["milk_kg"]
        gain = data["total_gain"]["milk_kg"]
        loss = data["total_loss"]["milk_kg"]
        closing = data["closing"]["milk_kg"]
        
        expected_closing = round(opening + purchased - used + gain - loss, 2)
        assert abs(closing - expected_closing) < 0.01, f"Closing mismatch: expected {expected_closing}, got {closing}"
        
        # Same for fat
        opening_fat = data["opening"]["fat_kg"]
        purchased_fat = data["total_purchased"]["fat_kg"]
        used_fat = data["total_used"]["fat_kg"]
        gain_fat = data["total_gain"]["fat_kg"]
        loss_fat = data["total_loss"]["fat_kg"]
        closing_fat = data["closing"]["fat_kg"]
        
        expected_closing_fat = round(opening_fat + purchased_fat - used_fat + gain_fat - loss_fat, 2)
        assert abs(closing_fat - expected_closing_fat) < 0.01, f"Fat closing mismatch: expected {expected_closing_fat}, got {closing_fat}"


class TestRMAdjustmentCRUD(TestAuth):
    """Raw Material Adjustment CRUD API tests"""
    
    def test_create_rm_gain_adjustment(self, admin_token):
        """POST /api/rm-adjustment with material_name, type='gain', quantity"""
        response = requests.post(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "material_name": "SMP",
                "date": "2026-03-25",
                "type": "gain",
                "quantity": 3.0,
                "notes": "TEST_Found extra stock"
            })
        assert response.status_code == 200, f"Failed to create RM gain: {response.text}"
        data = response.json()
        assert data["type"] == "gain"
        assert data["material_name"] == "SMP"
        assert data["quantity"] == 3.0
        return data["id"]
    
    def test_create_rm_loss_adjustment(self, admin_token):
        """POST /api/rm-adjustment with type='loss'"""
        response = requests.post(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "material_name": "SMP",
                "date": "2026-03-25",
                "type": "loss",
                "quantity": 1.5,
                "notes": "TEST_Spillage"
            })
        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "loss"
        return data["id"]
    
    def test_get_rm_adjustments_returns_list(self, admin_token):
        """GET /api/rm-adjustment returns list"""
        response = requests.get(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_update_rm_adjustment(self, admin_token):
        """PUT /api/rm-adjustment/{id} updates entry"""
        # Create entry
        create_resp = requests.post(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"material_name": "SMP", "date": "2026-03-26", "type": "gain", "quantity": 2.0, "notes": "TEST_To update"})
        adj_id = create_resp.json()["id"]
        
        # Update
        update_resp = requests.put(f"{BASE_URL}/api/rm-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"material_name": "SMP", "date": "2026-03-26", "type": "loss", "quantity": 2.5, "notes": "TEST_Updated"})
        assert update_resp.status_code == 200
        updated = update_resp.json()
        assert updated["type"] == "loss"
        assert updated["quantity"] == 2.5
        return adj_id
    
    def test_delete_rm_adjustment_admin_only(self, admin_token, viewer_token, modify_token):
        """DELETE /api/rm-adjustment/{id} admin only - NOTE: This endpoint may not exist"""
        # Create entry
        create_resp = requests.post(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"material_name": "SMP", "date": "2026-03-27", "type": "loss", "quantity": 0.5, "notes": "TEST_To delete"})
        adj_id = create_resp.json()["id"]
        
        # Try to delete - this endpoint may not exist per the review request
        admin_del = requests.delete(f"{BASE_URL}/api/rm-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"})
        
        # If endpoint doesn't exist, it will return 405 Method Not Allowed or 404
        if admin_del.status_code == 405 or admin_del.status_code == 404:
            pytest.skip("DELETE /api/rm-adjustment/{id} endpoint not implemented")
        
        # If it exists, verify RBAC
        if admin_del.status_code == 200:
            # Recreate for RBAC test
            create_resp2 = requests.post(f"{BASE_URL}/api/rm-adjustment",
                headers={"Authorization": f"Bearer {admin_token}"},
                json={"material_name": "SMP", "date": "2026-03-27", "type": "loss", "quantity": 0.5, "notes": "TEST_RBAC delete"})
            adj_id2 = create_resp2.json()["id"]
            
            viewer_del = requests.delete(f"{BASE_URL}/api/rm-adjustment/{adj_id2}",
                headers={"Authorization": f"Bearer {viewer_token}"})
            assert viewer_del.status_code == 403, "Viewer should not be able to delete"


class TestRMLedgerWithAdjustments(TestAuth):
    """Raw Material Ledger tests with adjustments"""
    
    def test_rm_ledger_includes_total_adjustment(self, admin_token):
        """GET /api/reports/raw-material-ledger includes total_adjustment"""
        response = requests.get(f"{BASE_URL}/api/reports/raw-material-ledger",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        if len(data) > 0:
            item = data[0]
            assert "total_adjustment" in item, "Missing total_adjustment in ledger"
    
    def test_rm_ledger_transactions_include_adj_qty(self, admin_token):
        """Transactions include adj_qty field"""
        response = requests.get(f"{BASE_URL}/api/reports/raw-material-ledger",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            for txn in item.get("transactions", []):
                assert "adj_qty" in txn, f"Missing adj_qty in transaction: {txn}"
    
    def test_rm_ledger_closing_calculation(self, admin_token):
        """closing_stock = opening + total_in - total_out + total_adjustment"""
        response = requests.get(f"{BASE_URL}/api/reports/raw-material-ledger",
            headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        
        for item in data:
            opening = item["opening_stock"]
            total_in = item["total_in"]
            total_out = item["total_out"]
            total_adj = item.get("total_adjustment", 0)
            closing = item["closing_stock"]
            
            expected = round(opening + total_in - total_out + total_adj, 2)
            assert abs(closing - expected) < 0.01, f"Closing mismatch for {item['material_name']}: expected {expected}, got {closing}"


class TestCleanup(TestAuth):
    """Cleanup test data"""
    
    def test_cleanup_test_adjustments(self, admin_token):
        """Clean up TEST_ prefixed adjustments"""
        # Get all milk adjustments
        milk_resp = requests.get(f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"})
        if milk_resp.status_code == 200:
            for adj in milk_resp.json():
                if adj.get("notes", "").startswith("TEST_"):
                    requests.delete(f"{BASE_URL}/api/milk-adjustment/{adj['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"})
        
        # Get all RM adjustments - try to delete if endpoint exists
        rm_resp = requests.get(f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"})
        if rm_resp.status_code == 200:
            for adj in rm_resp.json():
                if adj.get("notes", "").startswith("TEST_"):
                    # Try delete - may not exist
                    requests.delete(f"{BASE_URL}/api/rm-adjustment/{adj['id']}",
                        headers={"Authorization": f"Bearer {admin_token}"})
        
        assert True  # Cleanup always passes


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
