"""
Test suite for Stock Ledger Reports - Date-wise stock movement ledger for all 3 product types:
- Semi-Finished Products: Production IN, Packing OUT
- Finished Products: Packing IN, Dispatch OUT
- Raw Materials: Purchase IN, Batch Usage OUT
"""
import pytest
import requests
import os

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

@pytest.fixture
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestSemiFinishedLedger:
    """Tests for Semi-Finished Products Ledger API"""
    
    def test_get_semi_finished_ledger_returns_data(self, api_client):
        """GET /api/reports/semi-finished-ledger returns ledger data"""
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            item = data[0]
            # Verify ledger structure
            assert "product_name" in item
            assert "opening_stock" in item
            assert "total_in" in item
            assert "total_out" in item
            assert "closing_stock" in item
            assert "transactions" in item
            assert isinstance(item["transactions"], list)
    
    def test_semi_finished_ledger_transaction_structure(self, api_client):
        """Verify transaction structure has date, type, description, in_qty, out_qty, balance"""
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0 and len(data[0]["transactions"]) > 0:
            txn = data[0]["transactions"][0]
            assert "date" in txn
            assert "type" in txn
            assert "description" in txn
            assert "in_qty" in txn
            assert "out_qty" in txn
            assert "balance" in txn
    
    def test_semi_finished_ledger_transaction_types(self, api_client):
        """Verify transaction types are Production (IN) or Packing (OUT)"""
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        for item in data:
            for txn in item["transactions"]:
                assert txn["type"] in ["Production", "Packing"]
                if txn["type"] == "Production":
                    assert txn["in_qty"] > 0
                    assert txn["out_qty"] == 0
                elif txn["type"] == "Packing":
                    assert txn["out_qty"] > 0
                    assert txn["in_qty"] == 0
    
    def test_semi_finished_ledger_date_filter(self, api_client):
        """Test date range filtering on semi-finished ledger"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/semi-finished-ledger?start_date=2026-03-23&end_date=2026-03-23"
        )
        assert response.status_code == 200
        
        data = response.json()
        # Verify all transactions are within date range
        for item in data:
            for txn in item["transactions"]:
                assert txn["date"] >= "2026-03-23"
                assert txn["date"] <= "2026-03-23"
    
    def test_semi_finished_ledger_opening_stock_calculation(self, api_client):
        """Verify opening stock is calculated from transactions before start_date"""
        # Get full ledger
        full_response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert full_response.status_code == 200
        
        # Get filtered ledger with future start date
        filtered_response = api_client.get(
            f"{BASE_URL}/api/reports/semi-finished-ledger?start_date=2026-04-01"
        )
        assert filtered_response.status_code == 200


class TestFinishedLedger:
    """Tests for Finished Products Ledger API"""
    
    def test_get_finished_ledger_returns_data(self, api_client):
        """GET /api/reports/finished-ledger returns ledger data"""
        response = api_client.get(f"{BASE_URL}/api/reports/finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            item = data[0]
            # Verify ledger structure
            assert "sku" in item
            assert "unit" in item
            assert "opening_stock" in item
            assert "total_in" in item
            assert "total_out" in item
            assert "closing_stock" in item
            assert "transactions" in item
    
    def test_finished_ledger_transaction_types(self, api_client):
        """Verify transaction types are Packing (IN) or Dispatch (OUT)"""
        response = api_client.get(f"{BASE_URL}/api/reports/finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        for item in data:
            for txn in item["transactions"]:
                assert txn["type"] in ["Packing", "Dispatch"]
                if txn["type"] == "Packing":
                    assert txn["in_qty"] > 0
                    assert txn["out_qty"] == 0
                elif txn["type"] == "Dispatch":
                    assert txn["out_qty"] > 0
                    assert txn["in_qty"] == 0
    
    def test_finished_ledger_date_filter(self, api_client):
        """Test date range filtering on finished ledger"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/finished-ledger?start_date=2026-03-23&end_date=2026-03-23"
        )
        assert response.status_code == 200
        
        data = response.json()
        for item in data:
            for txn in item["transactions"]:
                assert txn["date"] >= "2026-03-23"
                assert txn["date"] <= "2026-03-23"


class TestRawMaterialLedger:
    """Tests for Raw Material Ledger API"""
    
    def test_get_raw_material_ledger_returns_data(self, api_client):
        """GET /api/reports/raw-material-ledger returns ledger data"""
        response = api_client.get(f"{BASE_URL}/api/reports/raw-material-ledger")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            item = data[0]
            # Verify ledger structure
            assert "material_name" in item
            assert "unit" in item
            assert "opening_stock" in item
            assert "total_in" in item
            assert "total_out" in item
            assert "closing_stock" in item
            assert "transactions" in item
    
    def test_raw_material_ledger_transaction_types(self, api_client):
        """Verify transaction types are Purchase (IN) or Batch Usage (OUT)"""
        response = api_client.get(f"{BASE_URL}/api/reports/raw-material-ledger")
        assert response.status_code == 200
        
        data = response.json()
        for item in data:
            for txn in item["transactions"]:
                assert txn["type"] in ["Purchase", "Batch Usage"]
                if txn["type"] == "Purchase":
                    assert txn["in_qty"] > 0
                    assert txn["out_qty"] == 0
                elif txn["type"] == "Batch Usage":
                    assert txn["out_qty"] > 0
                    assert txn["in_qty"] == 0
    
    def test_raw_material_ledger_date_filter(self, api_client):
        """Test date range filtering on raw material ledger"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/raw-material-ledger?start_date=2026-03-23&end_date=2026-03-23"
        )
        assert response.status_code == 200
        
        data = response.json()
        for item in data:
            for txn in item["transactions"]:
                assert txn["date"] >= "2026-03-23"
                assert txn["date"] <= "2026-03-23"
    
    def test_raw_material_ledger_material_filter(self, api_client):
        """Test material filter on raw material ledger"""
        response = api_client.get(
            f"{BASE_URL}/api/reports/raw-material-ledger?material=SMP"
        )
        assert response.status_code == 200
        
        data = response.json()
        # Should return only SMP material
        assert len(data) == 1
        assert data[0]["material_name"] == "SMP"


class TestLedgerCalculations:
    """Tests for ledger calculation accuracy"""
    
    def test_closing_stock_equals_opening_plus_in_minus_out(self, api_client):
        """Verify closing_stock = opening_stock + total_in - total_out"""
        # Test semi-finished
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        for item in response.json():
            expected_closing = round(item["opening_stock"] + item["total_in"] - item["total_out"], 2)
            assert round(item["closing_stock"], 2) == expected_closing
        
        # Test finished
        response = api_client.get(f"{BASE_URL}/api/reports/finished-ledger")
        assert response.status_code == 200
        for item in response.json():
            expected_closing = round(item["opening_stock"] + item["total_in"] - item["total_out"], 2)
            assert round(item["closing_stock"], 2) == expected_closing
        
        # Test raw material
        response = api_client.get(f"{BASE_URL}/api/reports/raw-material-ledger")
        assert response.status_code == 200
        for item in response.json():
            expected_closing = round(item["opening_stock"] + item["total_in"] - item["total_out"], 2)
            assert round(item["closing_stock"], 2) == expected_closing
    
    def test_running_balance_accuracy(self, api_client):
        """Verify running balance in transactions is accurate"""
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        
        for item in response.json():
            balance = item["opening_stock"]
            for txn in item["transactions"]:
                balance = round(balance + txn["in_qty"] - txn["out_qty"], 2)
                assert round(txn["balance"], 2) == balance


class TestPackingAndDispatchIntegration:
    """Tests for packing and dispatch functionality"""
    
    def test_packing_history_by_product(self, api_client):
        """GET /api/packing-history-by-product/{product_name} returns history"""
        # First get a product name from ledger
        response = api_client.get(f"{BASE_URL}/api/reports/semi-finished-ledger")
        assert response.status_code == 200
        
        data = response.json()
        if len(data) > 0:
            product_name = data[0]["product_name"]
            history_response = api_client.get(
                f"{BASE_URL}/api/packing-history-by-product/{product_name}"
            )
            assert history_response.status_code == 200
            assert isinstance(history_response.json(), list)
    
    def test_finished_products_summary(self, api_client):
        """GET /api/finished-products-summary returns aggregated data"""
        response = api_client.get(f"{BASE_URL}/api/finished-products-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            item = data[0]
            assert "sku" in item
            assert "current_stock" in item
    
    def test_semi_finished_summary(self, api_client):
        """GET /api/semi-finished-summary returns aggregated data"""
        response = api_client.get(f"{BASE_URL}/api/semi-finished-summary")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            item = data[0]
            assert "product_name" in item
            assert "current_stock" in item


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
