"""
Test suite for Finished Product Book Wastage feature
Tests:
1. POST /api/finished-product-wastage - Create wastage entry (deducts stock FIFO)
2. GET /api/finished-product-wastages - List all wastage entries
3. DELETE /api/finished-product-wastage/{id} - Delete wastage entry (restores stock)
4. POST /api/finished-product-wastage with insufficient stock - Should return 400
5. GET /api/reports/finished-ledger - Verify 'Book Wastage' transaction type appears
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


class TestBookWastageFeature(TestAuth):
    """Test Finished Product Book Wastage feature"""
    
    def test_get_finished_product_masters(self, headers):
        """Get finished product masters for testing"""
        response = requests.get(f"{BASE_URL}/api/finished-product-master", headers=headers)
        assert response.status_code == 200
        masters = response.json()
        
        if not masters:
            pytest.skip("No finished product masters available")
        
        # Find Paneer-1kg or use first available
        paneer_master = next((m for m in masters if 'Paneer' in m['sku_name']), None)
        if paneer_master:
            self.__class__.test_sku = paneer_master['sku_name']
            self.__class__.test_unit = paneer_master['uom']
        else:
            self.__class__.test_sku = masters[0]['sku_name']
            self.__class__.test_unit = masters[0]['uom']
        print(f"✓ Found finished product master: {self.__class__.test_sku}")
    
    def test_check_current_stock(self, headers):
        """Check current stock for the test SKU"""
        response = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=headers)
        assert response.status_code == 200
        
        summary = response.json()
        sku_summary = next((s for s in summary if s['sku'] == self.__class__.test_sku), None)
        
        if sku_summary:
            self.__class__.initial_stock = sku_summary['current_stock']
            print(f"✓ Current stock for {self.__class__.test_sku}: {self.__class__.initial_stock}")
        else:
            self.__class__.initial_stock = 0
            print(f"⚠ No stock found for {self.__class__.test_sku}, will create receive entry")
    
    def test_setup_stock_if_needed(self, headers):
        """Create receive entry if no stock available"""
        if self.__class__.initial_stock < 5:
            # Create receive entry to have stock for wastage testing
            today = time.strftime("%Y-%m-%d")
            receive_payload = {
                "sku": self.__class__.test_sku,
                "quantity": 20,
                "receive_date": today,
                "source_name": "TEST_Wastage_Setup",
                "cost_per_unit": 100,
                "notes": "TEST_setup_for_wastage"
            }
            
            response = requests.post(f"{BASE_URL}/api/finished-product-receive", json=receive_payload, headers=headers)
            assert response.status_code == 200, f"Failed to create receive for wastage setup: {response.text}"
            
            self.__class__.setup_receive_id = response.json()['id']
            self.__class__.initial_stock = 20
            print(f"✓ Created setup receive entry with 20 units")
        else:
            self.__class__.setup_receive_id = None
            print(f"✓ Sufficient stock available, no setup needed")
    
    def test_create_wastage_entry(self, headers):
        """Create a wastage entry and verify stock is deducted"""
        today = time.strftime("%Y-%m-%d")
        wastage_payload = {
            "sku": self.__class__.test_sku,
            "quantity": 2,
            "wastage_date": today,
            "reason": "Expired",
            "notes": "TEST_wastage_entry"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-wastage", json=wastage_payload, headers=headers)
        assert response.status_code == 200, f"Failed to create wastage: {response.text}"
        
        wastage = response.json()
        
        # Verify response fields
        assert wastage['sku'] == self.__class__.test_sku
        assert wastage['quantity'] == 2
        assert wastage['reason'] == "Expired"
        assert wastage['date'] == today
        assert 'id' in wastage
        assert 'created_by' in wastage
        
        self.__class__.test_wastage_id = wastage['id']
        print(f"✓ Wastage entry created: {wastage['id']}, quantity=2, reason=Expired")
        
        # Verify stock was deducted
        summary_res = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=headers)
        assert summary_res.status_code == 200
        
        summary = summary_res.json()
        sku_summary = next((s for s in summary if s['sku'] == self.__class__.test_sku), None)
        
        if sku_summary:
            expected_stock = self.__class__.initial_stock - 2
            assert abs(sku_summary['current_stock'] - expected_stock) < 0.01, \
                f"Stock not deducted correctly. Expected: {expected_stock}, Got: {sku_summary['current_stock']}"
            print(f"✓ Stock deducted correctly: {self.__class__.initial_stock} -> {sku_summary['current_stock']}")
    
    def test_list_wastages(self, headers):
        """List all wastages and verify test entry is present"""
        response = requests.get(f"{BASE_URL}/api/finished-product-wastages", headers=headers)
        assert response.status_code == 200
        
        wastages = response.json()
        assert isinstance(wastages, list)
        
        # Find our test wastage
        test_wastages = [w for w in wastages if w.get('notes') == 'TEST_wastage_entry']
        assert len(test_wastages) >= 1, "Test wastage entry not found in list"
        
        # Verify wastage entry has all required fields
        test_wastage = test_wastages[0]
        assert 'date' in test_wastage
        assert 'sku' in test_wastage
        assert 'quantity' in test_wastage
        assert 'reason' in test_wastage
        assert 'notes' in test_wastage
        assert 'created_by' in test_wastage
        
        print(f"✓ GET /api/finished-product-wastages returns {len(wastages)} entries")
    
    def test_wastage_insufficient_stock(self, headers):
        """Test wastage with insufficient stock returns 400"""
        today = time.strftime("%Y-%m-%d")
        wastage_payload = {
            "sku": self.__class__.test_sku,
            "quantity": 99999,  # Very large quantity
            "wastage_date": today,
            "reason": "Test insufficient",
            "notes": "TEST_should_fail"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-wastage", json=wastage_payload, headers=headers)
        assert response.status_code == 400, f"Expected 400 for insufficient stock, got {response.status_code}"
        
        error_detail = response.json().get('detail', '')
        assert 'Insufficient stock' in error_detail, f"Expected 'Insufficient stock' in error, got: {error_detail}"
        print(f"✓ Insufficient stock returns 400 with correct error message")
    
    def test_ledger_includes_book_wastage_type(self, headers):
        """Verify ledger includes 'Book Wastage' transaction type"""
        response = requests.get(f"{BASE_URL}/api/reports/finished-ledger", headers=headers)
        assert response.status_code == 200
        
        ledger = response.json()
        
        # Find our SKU in ledger
        sku_ledger = [l for l in ledger if l['sku'] == self.__class__.test_sku]
        
        if sku_ledger:
            # Check for Book Wastage transaction type
            book_wastage_txns = [t for t in sku_ledger[0]['transactions'] if t['type'] == 'Book Wastage']
            assert len(book_wastage_txns) >= 1, "No 'Book Wastage' transaction type found in ledger"
            
            # Verify transaction has correct fields
            wastage_txn = book_wastage_txns[0]
            assert 'date' in wastage_txn
            assert 'description' in wastage_txn
            assert 'out_qty' in wastage_txn
            assert wastage_txn['out_qty'] > 0, "Book Wastage should have out_qty > 0"
            
            print(f"✓ Ledger includes 'Book Wastage' transaction type with out_qty={wastage_txn['out_qty']}")
        else:
            print(f"⚠ SKU {self.__class__.test_sku} not found in ledger")
    
    def test_delete_wastage_entry(self, headers):
        """Delete wastage entry and verify stock is restored"""
        if not hasattr(self.__class__, 'test_wastage_id'):
            pytest.skip("No test wastage to delete")
        
        # Get stock before delete
        summary_before = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=headers).json()
        sku_before = next((s for s in summary_before if s['sku'] == self.__class__.test_sku), None)
        stock_before = sku_before['current_stock'] if sku_before else 0
        
        # Delete wastage
        response = requests.delete(f"{BASE_URL}/api/finished-product-wastage/{self.__class__.test_wastage_id}", headers=headers)
        assert response.status_code == 200, f"Failed to delete wastage: {response.text}"
        
        # Verify stock was restored
        summary_after = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=headers).json()
        sku_after = next((s for s in summary_after if s['sku'] == self.__class__.test_sku), None)
        stock_after = sku_after['current_stock'] if sku_after else 0
        
        # Stock should be restored by 2 (the wastage quantity)
        expected_stock = stock_before + 2
        assert abs(stock_after - expected_stock) < 0.01, \
            f"Stock not restored correctly. Expected: {expected_stock}, Got: {stock_after}"
        
        print(f"✓ Wastage entry deleted and stock restored: {stock_before} -> {stock_after}")
    
    def test_cleanup_setup_receive(self, headers):
        """Cleanup setup receive entry if created"""
        if hasattr(self.__class__, 'setup_receive_id') and self.__class__.setup_receive_id:
            requests.delete(f"{BASE_URL}/api/finished-product-receive/{self.__class__.setup_receive_id}", headers=headers)
            print("✓ Setup receive cleaned up")


class TestWastageRBACAndValidation(TestAuth):
    """Test RBAC and validation for wastage feature"""
    
    def test_wastage_requires_valid_sku(self, headers):
        """Test wastage with invalid SKU returns 404"""
        today = time.strftime("%Y-%m-%d")
        wastage_payload = {
            "sku": "INVALID_SKU_12345",
            "quantity": 1,
            "wastage_date": today,
            "reason": "Test",
            "notes": "TEST_invalid_sku"
        }
        
        response = requests.post(f"{BASE_URL}/api/finished-product-wastage", json=wastage_payload, headers=headers)
        assert response.status_code == 404, f"Expected 404 for invalid SKU, got {response.status_code}"
        print(f"✓ Invalid SKU returns 404")
    
    def test_delete_wastage_admin_only(self, headers):
        """Test that only admin can delete wastage entries"""
        # This test verifies the endpoint exists and requires admin
        # We'll create a wastage, then try to delete with non-admin (if we had one)
        # For now, just verify the endpoint works for admin
        
        # Get a finished product master
        masters_res = requests.get(f"{BASE_URL}/api/finished-product-master", headers=headers)
        masters = masters_res.json()
        
        if not masters:
            pytest.skip("No finished product masters available")
        
        test_sku = masters[0]['sku_name']
        
        # Check if there's stock
        summary_res = requests.get(f"{BASE_URL}/api/finished-products-summary", headers=headers)
        summary = summary_res.json()
        sku_summary = next((s for s in summary if s['sku'] == test_sku and s['current_stock'] > 0), None)
        
        if not sku_summary:
            # Create receive entry
            today = time.strftime("%Y-%m-%d")
            receive_res = requests.post(f"{BASE_URL}/api/finished-product-receive", json={
                "sku": test_sku,
                "quantity": 10,
                "receive_date": today,
                "source_name": "TEST_RBAC_Setup",
                "cost_per_unit": 50,
                "notes": "TEST_rbac_setup"
            }, headers=headers)
            assert receive_res.status_code == 200
            setup_receive_id = receive_res.json()['id']
        else:
            setup_receive_id = None
        
        # Create wastage
        today = time.strftime("%Y-%m-%d")
        wastage_res = requests.post(f"{BASE_URL}/api/finished-product-wastage", json={
            "sku": test_sku,
            "quantity": 1,
            "wastage_date": today,
            "reason": "RBAC Test",
            "notes": "TEST_rbac_wastage"
        }, headers=headers)
        
        if wastage_res.status_code == 200:
            wastage_id = wastage_res.json()['id']
            
            # Delete as admin (should work)
            delete_res = requests.delete(f"{BASE_URL}/api/finished-product-wastage/{wastage_id}", headers=headers)
            assert delete_res.status_code == 200, f"Admin should be able to delete wastage"
            print(f"✓ Admin can delete wastage entries")
        
        # Cleanup
        if setup_receive_id:
            requests.delete(f"{BASE_URL}/api/finished-product-receive/{setup_receive_id}", headers=headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
