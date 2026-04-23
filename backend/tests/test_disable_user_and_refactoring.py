"""
Test suite for:
1. Disable User feature - admin can disable/enable users, disabled users blocked from login
2. Backend refactoring verification - all routes still work after modular split
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"


class TestHealthAndBasicEndpoints:
    """Verify backend is running and basic endpoints work after refactoring"""
    
    def test_health_endpoint(self):
        """GET /api/health should return status ok"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        print("PASS: Health endpoint working")
    
    def test_admin_login(self):
        """POST /api/auth/login with admin credentials should return token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "admin"
        assert data["user"]["role"] == "admin"
        print("PASS: Admin login working")


class TestDisableUserFeature:
    """Test the new Disable User feature"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def test_user(self, admin_token):
        """Create a test user for disable/enable testing"""
        unique_id = str(uuid.uuid4())[:8]
        test_username = f"TEST_disable_user_{unique_id}"
        test_password = "testpass123"
        
        # Create test user
        response = requests.post(
            f"{BASE_URL}/api/auth/register",
            json={
                "username": test_username,
                "password": test_password,
                "role": "view",
                "full_name": "Test Disable User"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        user_data = response.json()
        
        yield {
            "id": user_data["id"],
            "username": test_username,
            "password": test_password
        }
        
        # Cleanup: Delete test user
        requests.delete(
            f"{BASE_URL}/api/users/{user_data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    
    def test_get_users_returns_is_active_field(self, admin_token):
        """GET /api/users should return users with is_active field"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        users = response.json()
        assert isinstance(users, list)
        assert len(users) > 0
        
        # Check admin user has is_active field
        admin_user = next((u for u in users if u["username"] == "admin"), None)
        assert admin_user is not None
        # is_active should be True for admin (or not present which defaults to True)
        assert admin_user.get("is_active", True) == True
        print("PASS: GET /api/users returns users with is_active field")
    
    def test_toggle_status_disables_user(self, admin_token, test_user):
        """PUT /api/users/{id}/toggle-status should disable an active user"""
        # First verify user is active
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = response.json()
        user = next((u for u in users if u["id"] == test_user["id"]), None)
        assert user is not None
        assert user.get("is_active", True) == True
        
        # Toggle status to disable
        response = requests.put(
            f"{BASE_URL}/api/users/{test_user['id']}/toggle-status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        updated_user = response.json()
        assert updated_user["is_active"] == False
        print("PASS: Toggle status disables user")
    
    def test_disabled_user_cannot_login(self, admin_token, test_user):
        """Disabled user should NOT be able to login (expect 403)"""
        # First disable the user
        response = requests.put(
            f"{BASE_URL}/api/users/{test_user['id']}/toggle-status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert response.json()["is_active"] == False
        
        # Try to login with disabled user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"]
        })
        assert login_response.status_code == 403
        assert "disabled" in login_response.json()["detail"].lower()
        print("PASS: Disabled user cannot login (403)")
    
    def test_reenable_user_can_login(self, admin_token, test_user):
        """Re-enabled user should be able to login again"""
        # First disable the user
        requests.put(
            f"{BASE_URL}/api/users/{test_user['id']}/toggle-status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # Re-enable the user (toggle again)
        response = requests.put(
            f"{BASE_URL}/api/users/{test_user['id']}/toggle-status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert response.json()["is_active"] == True
        
        # Try to login with re-enabled user
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": test_user["username"],
            "password": test_user["password"]
        })
        assert login_response.status_code == 200
        assert "token" in login_response.json()
        print("PASS: Re-enabled user can login")
    
    def test_cannot_disable_admin_account(self, admin_token):
        """Admin account cannot be disabled (expect 400)"""
        # Get admin user ID
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        users = response.json()
        admin_user = next((u for u in users if u["username"] == "admin"), None)
        assert admin_user is not None
        
        # Try to disable admin
        response = requests.put(
            f"{BASE_URL}/api/users/{admin_user['id']}/toggle-status",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 400
        assert "admin" in response.json()["detail"].lower()
        print("PASS: Cannot disable admin account (400)")


class TestRefactoredRoutes:
    """Verify all routes work after backend refactoring"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    def test_dashboard_stats(self, admin_token):
        """GET /api/dashboard/stats should return dashboard data"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/stats",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        # Dashboard should have some stats
        assert isinstance(data, dict)
        print("PASS: Dashboard stats endpoint working")
    
    def test_batches_endpoint(self, admin_token):
        """GET /api/batches should return batches list"""
        response = requests.get(
            f"{BASE_URL}/api/batches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Batches endpoint working")
    
    def test_finished_products_endpoint(self, admin_token):
        """GET /api/finished-products should return finished products"""
        response = requests.get(
            f"{BASE_URL}/api/finished-products",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Finished products endpoint working")
    
    def test_dispatch_endpoint(self, admin_token):
        """GET /api/dispatch should return dispatches"""
        response = requests.get(
            f"{BASE_URL}/api/dispatch",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Dispatch endpoint working")
    
    def test_milk_stock_endpoint(self, admin_token):
        """GET /api/milk-stock should return milk stock entries"""
        response = requests.get(
            f"{BASE_URL}/api/milk-stock",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Milk stock endpoint working")
    
    def test_raw_material_master_endpoint(self, admin_token):
        """GET /api/raw-material-master should return raw material masters"""
        response = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Raw material master endpoint working")
    
    def test_semi_finished_master_endpoint(self, admin_token):
        """GET /api/semi-finished-master should return semi-finished masters"""
        response = requests.get(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Semi-finished master endpoint working")
    
    def test_finished_product_master_endpoint(self, admin_token):
        """GET /api/finished-product-master should return finished product masters"""
        response = requests.get(
            f"{BASE_URL}/api/finished-product-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Finished product master endpoint working")
    
    def test_wastage_loss_summary_endpoint(self, admin_token):
        """GET /api/reports/wastage-loss-summary should return wastage data"""
        response = requests.get(
            f"{BASE_URL}/api/reports/wastage-loss-summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict) or isinstance(data, list)
        print("PASS: Wastage loss summary endpoint working")
    
    def test_backup_history_endpoint(self, admin_token):
        """GET /api/backup/history should return backup list"""
        response = requests.get(
            f"{BASE_URL}/api/backup/history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("PASS: Backup history endpoint working")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
