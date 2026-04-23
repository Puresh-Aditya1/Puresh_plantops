"""
Test Activity Log Feature - User Activity Audit Trail
Tests for:
- GET /api/activity-logs - returns activity log entries
- GET /api/activity-logs?username=admin - filters by user
- GET /api/activity-logs?category=auth - filters by category
- GET /api/activity-logs/categories - returns filter options
- Login action creates activity log with action=login, category=auth
- Creating batch creates activity log with category=batch
- Disabling user creates activity log with category=user, action=disabled
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestActivityLogAPI:
    """Activity Log API endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
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
    
    def test_get_activity_logs_returns_list(self):
        """GET /api/activity-logs returns activity log entries"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # If there are logs, verify structure
        if len(data) > 0:
            log = data[0]
            assert "username" in log, "Log should have username"
            assert "action" in log, "Log should have action"
            assert "category" in log, "Log should have category"
            assert "timestamp" in log, "Log should have timestamp"
            print(f"Found {len(data)} activity logs")
            print(f"Sample log: {log}")
    
    def test_get_activity_logs_filter_by_username(self):
        """GET /api/activity-logs?username=admin filters by user"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={"username": "admin"})
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All logs should be from admin user
        for log in data:
            assert log["username"] == "admin", f"Expected username 'admin', got '{log['username']}'"
        print(f"Found {len(data)} logs for admin user")
    
    def test_get_activity_logs_filter_by_category(self):
        """GET /api/activity-logs?category=auth filters by category"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={"category": "auth"})
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All logs should have auth category
        for log in data:
            assert log["category"] == "auth", f"Expected category 'auth', got '{log['category']}'"
        print(f"Found {len(data)} auth category logs")
    
    def test_get_activity_logs_filter_by_action(self):
        """GET /api/activity-logs?action=login filters by action"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={"action": "login"})
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # All logs should have login action
        for log in data:
            assert log["action"] == "login", f"Expected action 'login', got '{log['action']}'"
        print(f"Found {len(data)} login action logs")
    
    def test_get_activity_categories_returns_filter_options(self):
        """GET /api/activity-logs/categories returns filter options"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs/categories")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert "categories" in data, "Response should have 'categories' field"
        assert "usernames" in data, "Response should have 'usernames' field"
        assert "actions" in data, "Response should have 'actions' field"
        
        assert isinstance(data["categories"], list), "categories should be a list"
        assert isinstance(data["usernames"], list), "usernames should be a list"
        assert isinstance(data["actions"], list), "actions should be a list"
        
        print(f"Categories: {data['categories']}")
        print(f"Usernames: {data['usernames']}")
        print(f"Actions: {data['actions']}")
    
    def test_login_creates_activity_log(self):
        """Login action creates an activity log entry with action=login, category=auth"""
        # Perform a fresh login to generate a new log entry
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert login_response.status_code == 200, f"Login failed: {login_response.text}"
        
        # Wait a moment for the log to be written
        time.sleep(0.5)
        
        # Check activity logs for the login entry
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={
            "username": "admin",
            "action": "login",
            "category": "auth"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert len(data) > 0, "Should have at least one login log entry"
        
        # Verify the most recent login log
        latest_log = data[0]
        assert latest_log["username"] == "admin", "Log should be for admin user"
        assert latest_log["action"] == "login", "Log action should be 'login'"
        assert latest_log["category"] == "auth", "Log category should be 'auth'"
        print(f"Login activity log verified: {latest_log}")
    
    def test_activity_logs_require_authentication(self):
        """Activity logs endpoints require authentication"""
        # Create a new session without auth
        unauth_session = requests.Session()
        unauth_session.headers.update({"Content-Type": "application/json"})
        
        response = unauth_session.get(f"{BASE_URL}/api/activity-logs")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        
        response = unauth_session.get(f"{BASE_URL}/api/activity-logs/categories")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("Authentication required for activity log endpoints - verified")


class TestActivityLogIntegration:
    """Integration tests - verify activity logs are created for various actions"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup - get auth token"""
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
    
    def test_user_toggle_creates_activity_log(self):
        """Disabling/enabling a user creates an activity log with category=user"""
        # First, create a test user
        create_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "username": "TEST_activity_user",
            "password": "testpass123",
            "role": "operator",
            "full_name": "Test Activity User"
        })
        
        if create_response.status_code == 400 and "already exists" in create_response.text:
            # User exists, get their ID
            users_response = self.session.get(f"{BASE_URL}/api/users")
            users = users_response.json()
            test_user = next((u for u in users if u["username"] == "TEST_activity_user"), None)
            if test_user:
                user_id = test_user["id"]
            else:
                pytest.skip("Could not find or create test user")
        else:
            assert create_response.status_code == 200, f"Failed to create user: {create_response.text}"
            user_id = create_response.json()["id"]
        
        # Toggle user status (disable)
        toggle_response = self.session.put(f"{BASE_URL}/api/users/{user_id}/toggle-status")
        assert toggle_response.status_code == 200, f"Failed to toggle user: {toggle_response.text}"
        
        time.sleep(0.5)
        
        # Check activity logs for the toggle entry
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={
            "category": "user"
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert len(data) > 0, "Should have user category logs"
        
        # Find the toggle log
        toggle_logs = [log for log in data if log["action"] in ["disabled", "enabled"] and "TEST_activity_user" in log.get("details", "")]
        assert len(toggle_logs) > 0, "Should have a toggle status log for test user"
        
        latest_toggle = toggle_logs[0]
        assert latest_toggle["category"] == "user", "Log category should be 'user'"
        assert latest_toggle["action"] in ["disabled", "enabled"], f"Log action should be 'disabled' or 'enabled', got '{latest_toggle['action']}'"
        print(f"User toggle activity log verified: {latest_toggle}")
        
        # Toggle back to original state
        self.session.put(f"{BASE_URL}/api/users/{user_id}/toggle-status")
        
        # Cleanup - delete test user
        self.session.delete(f"{BASE_URL}/api/users/{user_id}")
    
    def test_activity_logs_sorted_by_timestamp_desc(self):
        """Activity logs are sorted by timestamp in descending order (newest first)"""
        response = self.session.get(f"{BASE_URL}/api/activity-logs")
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        if len(data) >= 2:
            # Verify descending order
            for i in range(len(data) - 1):
                assert data[i]["timestamp"] >= data[i+1]["timestamp"], \
                    f"Logs not sorted by timestamp desc: {data[i]['timestamp']} < {data[i+1]['timestamp']}"
            print("Activity logs are sorted by timestamp (newest first) - verified")
        else:
            print("Not enough logs to verify sorting")
    
    def test_activity_logs_date_filter(self):
        """Activity logs can be filtered by date range"""
        from datetime import datetime, timedelta
        
        today = datetime.now().strftime("%Y-%m-%d")
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # Filter by start_date
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={
            "start_date": yesterday
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Logs from {yesterday}: {len(response.json())} entries")
        
        # Filter by end_date
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={
            "end_date": today
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Logs until {today}: {len(response.json())} entries")
        
        # Filter by date range
        response = self.session.get(f"{BASE_URL}/api/activity-logs", params={
            "start_date": yesterday,
            "end_date": today
        })
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"Logs from {yesterday} to {today}: {len(response.json())} entries")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
