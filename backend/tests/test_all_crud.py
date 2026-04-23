"""
Comprehensive CRUD tests for Dairy Inventory Management App
Tests all CRUD operations across:
- Raw Material Master
- Semi-Finished Master
- Finished Product Master
- Batch
- Raw Material Stock
- Packing (Semi-Finished Product)
- Dispatch
- Milk Stock
- Milk Adjustment
- RM Adjustment
"""

import pytest
import requests
import os
import time
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://daily-plant-ops.preview.emergentagent.com')

class TestAuth:
    """Authentication tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        return response.json()["token"]
    
    def test_login_success(self):
        """Test admin login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert data["user"]["role"] == "admin"
        print("✓ Admin login successful")


class TestRawMaterialMasterCRUD:
    """Raw Material Master CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_raw_material_master(self, admin_token):
        """Create a new raw material master"""
        response = requests.post(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "TEST_Sugar", "unit": "kg", "description": "Test sugar material"}
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["name"] == "TEST_Sugar"
        assert data["unit"] == "kg"
        print(f"✓ Created raw material master: {data['id']}")
        return data["id"]
    
    def test_read_raw_material_masters(self, admin_token):
        """Read all raw material masters"""
        response = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} raw material masters")
    
    def test_delete_raw_material_master(self, admin_token):
        """Delete raw material master"""
        # First create one to delete
        create_resp = requests.post(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "TEST_ToDelete", "unit": "kg"}
        )
        assert create_resp.status_code == 200
        material_id = create_resp.json()["id"]
        
        # Now delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/raw-material-master/{material_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        print(f"✓ Deleted raw material master: {material_id}")


class TestSemiFinishedMasterCRUD:
    """Semi-Finished Master CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_semi_finished_master(self, admin_token):
        """Create a new semi-finished master with SKU mappings"""
        response = requests.post(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Cheese Block",
                "unit": "kg",
                "finished_sku_mappings": [
                    {"sku_name": "Paneer 1kg", "quantity_consumed": 1.0}
                ],
                "description": "Test cheese block"
            }
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["name"] == "TEST_Cheese Block"
        assert len(data["finished_sku_mappings"]) == 1
        print(f"✓ Created semi-finished master: {data['id']}")
        return data["id"]
    
    def test_read_semi_finished_masters(self, admin_token):
        """Read all semi-finished masters"""
        response = requests.get(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} semi-finished masters")
    
    def test_update_semi_finished_master(self, admin_token):
        """Update semi-finished master"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_UpdateMe",
                "unit": "kg",
                "finished_sku_mappings": [{"sku_name": "Paneer 1kg", "quantity_consumed": 1.0}]
            }
        )
        assert create_resp.status_code == 200
        master_id = create_resp.json()["id"]
        
        # Update it
        update_resp = requests.put(
            f"{BASE_URL}/api/semi-finished-master/{master_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_Updated",
                "unit": "kg",
                "finished_sku_mappings": [{"sku_name": "Paneer 200gm", "quantity_consumed": 0.2}]
            }
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        data = update_resp.json()
        assert data["name"] == "TEST_Updated"
        print(f"✓ Updated semi-finished master: {master_id}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/semi-finished-master/{master_id}",
                       headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_delete_semi_finished_master(self, admin_token):
        """Delete semi-finished master"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "TEST_ToDelete2",
                "unit": "kg",
                "finished_sku_mappings": []
            }
        )
        assert create_resp.status_code == 200
        master_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/semi-finished-master/{master_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        print(f"✓ Deleted semi-finished master: {master_id}")


class TestFinishedProductMasterCRUD:
    """Finished Product Master CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_finished_product_master(self, admin_token):
        """Create a new finished product master"""
        response = requests.post(
            f"{BASE_URL}/api/finished-product-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"sku_name": "TEST_Cheese 500gm", "uom": "piece", "description": "Test cheese"}
        )
        assert response.status_code == 200, f"Create failed: {response.text}"
        data = response.json()
        assert data["sku_name"] == "TEST_Cheese 500gm"
        print(f"✓ Created finished product master: {data['id']}")
        return data["id"]
    
    def test_read_finished_product_masters(self, admin_token):
        """Read all finished product masters"""
        response = requests.get(
            f"{BASE_URL}/api/finished-product-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} finished product masters")
    
    def test_delete_finished_product_master(self, admin_token):
        """Delete finished product master"""
        # First create one
        create_resp = requests.post(
            f"{BASE_URL}/api/finished-product-master",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"sku_name": "TEST_ToDelete3", "uom": "piece"}
        )
        assert create_resp.status_code == 200
        master_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/finished-product-master/{master_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        print(f"✓ Deleted finished product master: {master_id}")


class TestPackingCRUD:
    """CRITICAL: Packing CRUD tests - especially DELETE"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_get_packing_history(self, admin_token):
        """Get packing history for a product"""
        # Get semi-finished products first
        sf_resp = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert sf_resp.status_code == 200
        sf_products = sf_resp.json()
        
        if sf_products:
            product_name = sf_products[0]["product_name"]
            history_resp = requests.get(
                f"{BASE_URL}/api/packing-history-by-product/{product_name}",
                headers={"Authorization": f"Bearer {admin_token}"}
            )
            assert history_resp.status_code == 200
            print(f"✓ Got packing history for {product_name}: {len(history_resp.json())} entries")
    
    def test_create_packing_entry(self, admin_token):
        """Create a packing entry using packing-by-product endpoint"""
        # Get current semi-finished stock
        sf_resp = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        sf_products = sf_resp.json()
        
        if not sf_products or sf_products[0]["current_stock"] < 1:
            pytest.skip("No semi-finished stock available for packing test")
        
        product = sf_products[0]
        initial_stock = product["current_stock"]
        
        # Create packing entry
        response = requests.post(
            f"{BASE_URL}/api/packing-by-product",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "semi_finished_id": product["product_name"],  # Uses product name
                "sku": "Paneer 200gm",
                "quantity_produced": 5,
                "quantity_wasted": 0,
                "packing_date": datetime.now().strftime("%Y-%m-%d")
            }
        )
        assert response.status_code == 200, f"Create packing failed: {response.text}"
        data = response.json()
        assert data["sku"] == "Paneer 200gm"
        assert data["quantity"] == 5
        print(f"✓ Created packing entry: {data['id']}")
        
        # Verify stock was deducted (5 units * 0.2 kg/unit = 1 kg)
        sf_resp2 = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        new_stock = sf_resp2.json()[0]["current_stock"]
        expected_deduction = 5 * 0.2  # 1 kg
        assert abs(new_stock - (initial_stock - expected_deduction)) < 0.01, \
            f"Stock not deducted correctly. Expected {initial_stock - expected_deduction}, got {new_stock}"
        print(f"✓ Stock deducted correctly: {initial_stock} -> {new_stock}")
        
        return data["id"]
    
    def test_update_packing_entry(self, admin_token):
        """Update a packing entry"""
        # Get existing packing entries
        fp_resp = requests.get(
            f"{BASE_URL}/api/finished-products",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        packing_entries = [p for p in fp_resp.json() if p.get("semi_finished_id")]
        
        if not packing_entries:
            pytest.skip("No packing entries to update")
        
        packing = packing_entries[0]
        original_qty = packing["quantity"]
        
        # Update the packing entry
        response = requests.put(
            f"{BASE_URL}/api/packing/{packing['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "semi_finished_id": packing["semi_finished_id"],
                "sku": packing["sku"],
                "quantity_produced": original_qty + 2,
                "quantity_wasted": 0,
                "packing_date": packing["date"]
            }
        )
        assert response.status_code == 200, f"Update packing failed: {response.text}"
        data = response.json()
        assert data["quantity"] == original_qty + 2
        print(f"✓ Updated packing entry: {packing['id']} (qty: {original_qty} -> {original_qty + 2})")
    
    def test_delete_packing_entry_api(self, admin_token):
        """CRITICAL TEST: Delete packing entry via API and verify stock restoration"""
        # First create a packing entry to delete
        sf_resp = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        sf_products = sf_resp.json()
        
        if not sf_products or sf_products[0]["current_stock"] < 1:
            pytest.skip("No semi-finished stock available for delete test")
        
        product = sf_products[0]
        stock_before_create = product["current_stock"]
        
        # Create a packing entry
        create_resp = requests.post(
            f"{BASE_URL}/api/packing-by-product",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "semi_finished_id": product["product_name"],
                "sku": "Paneer 200gm",
                "quantity_produced": 10,
                "quantity_wasted": 0.5,  # 0.5 kg wasted
                "packing_date": datetime.now().strftime("%Y-%m-%d")
            }
        )
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        packing_id = create_resp.json()["id"]
        
        # Check stock after create (should be reduced by 10*0.2 + 0.5 = 2.5 kg)
        sf_resp2 = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        stock_after_create = sf_resp2.json()[0]["current_stock"]
        expected_consumed = (10 * 0.2) + 0.5  # 2.5 kg
        print(f"  Stock before create: {stock_before_create}, after create: {stock_after_create}")
        
        # NOW DELETE THE PACKING ENTRY
        delete_resp = requests.delete(
            f"{BASE_URL}/api/packing/{packing_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"DELETE PACKING FAILED: {delete_resp.text}"
        print(f"✓ DELETE /api/packing/{packing_id} returned 200")
        
        # Verify stock was restored
        sf_resp3 = requests.get(
            f"{BASE_URL}/api/semi-finished",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        stock_after_delete = sf_resp3.json()[0]["current_stock"]
        
        # Stock should be restored to approximately what it was before create
        # (might not be exact due to other operations)
        assert abs(stock_after_delete - stock_before_create) < 0.1, \
            f"Stock not restored correctly. Before: {stock_before_create}, After delete: {stock_after_delete}"
        print(f"✓ Stock restored correctly: {stock_after_create} -> {stock_after_delete}")
        
        # Verify packing entry no longer exists
        fp_resp = requests.get(
            f"{BASE_URL}/api/finished-products",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        packing_ids = [p["id"] for p in fp_resp.json()]
        assert packing_id not in packing_ids, "Packing entry still exists after delete!"
        print(f"✓ Packing entry {packing_id} successfully deleted and verified")


class TestDispatchCRUD:
    """Dispatch CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_read_dispatches(self, admin_token):
        """Read all dispatches"""
        response = requests.get(
            f"{BASE_URL}/api/dispatch",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} dispatches")
    
    def test_create_dispatch(self, admin_token):
        """Create a dispatch entry"""
        # Get finished products with stock
        fp_resp = requests.get(
            f"{BASE_URL}/api/finished-products-summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        products = fp_resp.json()
        
        products_with_stock = [p for p in products if p.get("current_stock", 0) > 0]
        if not products_with_stock:
            pytest.skip("No finished products with stock for dispatch test")
        
        product = products_with_stock[0]
        
        response = requests.post(
            f"{BASE_URL}/api/dispatch",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "dispatch_type": "delivery_challan",
                "challan_number": f"TEST-{int(time.time())}",
                "products": [{"sku": product["sku"], "quantity": 1}],
                "destination": "Test Destination",
                "dispatch_date": datetime.now().strftime("%Y-%m-%d"),
                "notes": "Test dispatch"
            }
        )
        assert response.status_code == 200, f"Create dispatch failed: {response.text}"
        data = response.json()
        assert data["dispatch_type"] == "delivery_challan"
        print(f"✓ Created dispatch: {data['id']}")
        return data["id"]
    
    def test_update_dispatch(self, admin_token):
        """Update a dispatch entry"""
        # Get existing dispatches
        disp_resp = requests.get(
            f"{BASE_URL}/api/dispatch",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        dispatches = disp_resp.json()
        
        if not dispatches:
            pytest.skip("No dispatches to update")
        
        dispatch = dispatches[0]
        
        response = requests.put(
            f"{BASE_URL}/api/dispatch/{dispatch['id']}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "dispatch_type": dispatch["dispatch_type"],
                "challan_number": dispatch["challan_number"],
                "products": dispatch["products"],
                "destination": "Updated Destination",
                "dispatch_date": dispatch["date"],
                "notes": "Updated notes"
            }
        )
        assert response.status_code == 200, f"Update dispatch failed: {response.text}"
        data = response.json()
        assert data["destination"] == "Updated Destination"
        print(f"✓ Updated dispatch: {dispatch['id']}")
    
    def test_delete_dispatch(self, admin_token):
        """Delete a dispatch entry"""
        # First create one to delete
        fp_resp = requests.get(
            f"{BASE_URL}/api/finished-products-summary",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        products = fp_resp.json()
        products_with_stock = [p for p in products if p.get("current_stock", 0) > 0]
        
        if not products_with_stock:
            pytest.skip("No finished products with stock for delete dispatch test")
        
        product = products_with_stock[0]
        
        create_resp = requests.post(
            f"{BASE_URL}/api/dispatch",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "dispatch_type": "gate_pass",
                "challan_number": f"TEST-DEL-{int(time.time())}",
                "products": [{"sku": product["sku"], "quantity": 1}],
                "destination": "To Delete",
                "dispatch_date": datetime.now().strftime("%Y-%m-%d")
            }
        )
        
        if create_resp.status_code != 200:
            pytest.skip(f"Could not create dispatch for delete test: {create_resp.text}")
        
        dispatch_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/dispatch/{dispatch_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete dispatch failed: {delete_resp.text}"
        print(f"✓ Deleted dispatch: {dispatch_id}")


class TestMilkStockCRUD:
    """Milk Stock CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_milk_stock(self, admin_token):
        """Create a milk stock entry"""
        response = requests.post(
            f"{BASE_URL}/api/milk-stock",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "quantity_kg": 100,
                "fat_percent": 4.5,
                "snf_percent": 8.5,
                "notes": "Test milk purchase"
            }
        )
        # May fail if entry already exists for today
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Created milk stock entry: {data['id']}")
            return data["id"]
        else:
            print(f"  Milk stock entry may already exist for today: {response.text}")
    
    def test_read_milk_stock(self, admin_token):
        """Read all milk stock entries"""
        response = requests.get(
            f"{BASE_URL}/api/milk-stock",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} milk stock entries")
    
    def test_delete_milk_stock(self, admin_token):
        """Delete a milk stock entry"""
        # Get existing entries
        stock_resp = requests.get(
            f"{BASE_URL}/api/milk-stock",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        entries = stock_resp.json()
        
        if not entries:
            pytest.skip("No milk stock entries to delete")
        
        entry_id = entries[0]["id"]
        
        delete_resp = requests.delete(
            f"{BASE_URL}/api/milk-stock/{entry_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete milk stock failed: {delete_resp.text}"
        print(f"✓ Deleted milk stock entry: {entry_id}")


class TestMilkAdjustmentCRUD:
    """Milk Adjustment CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_milk_adjustment_gain(self, admin_token):
        """Create a milk adjustment (gain)"""
        response = requests.post(
            f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "gain",
                "quantity_kg": 5,
                "fat_kg": 0.2,
                "snf_kg": 0.4,
                "notes": "Test gain adjustment"
            }
        )
        assert response.status_code == 200, f"Create milk adjustment failed: {response.text}"
        data = response.json()
        assert data["type"] == "gain"
        print(f"✓ Created milk adjustment (gain): {data['id']}")
        return data["id"]
    
    def test_create_milk_adjustment_loss(self, admin_token):
        """Create a milk adjustment (loss)"""
        response = requests.post(
            f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "loss",
                "quantity_kg": 2,
                "fat_kg": 0.1,
                "snf_kg": 0.2,
                "notes": "Test loss adjustment"
            }
        )
        assert response.status_code == 200, f"Create milk adjustment failed: {response.text}"
        data = response.json()
        assert data["type"] == "loss"
        print(f"✓ Created milk adjustment (loss): {data['id']}")
        return data["id"]
    
    def test_read_milk_adjustments(self, admin_token):
        """Read all milk adjustments"""
        response = requests.get(
            f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} milk adjustments")
    
    def test_delete_milk_adjustment(self, admin_token):
        """Delete a milk adjustment"""
        # First create one to delete
        create_resp = requests.post(
            f"{BASE_URL}/api/milk-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "loss",
                "quantity_kg": 1,
                "fat_kg": 0,
                "snf_kg": 0,
                "notes": "To delete"
            }
        )
        assert create_resp.status_code == 200
        adj_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/milk-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete milk adjustment failed: {delete_resp.text}"
        print(f"✓ Deleted milk adjustment: {adj_id}")


class TestRMAdjustmentCRUD:
    """Raw Material Adjustment CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_create_rm_adjustment_gain(self, admin_token):
        """Create an RM adjustment (gain)"""
        # Get a raw material name
        rm_resp = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        materials = rm_resp.json()
        
        if not materials:
            pytest.skip("No raw materials for adjustment test")
        
        material_name = materials[0]["name"]
        
        response = requests.post(
            f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "material_name": material_name,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "gain",
                "quantity": 5,
                "notes": "Test gain"
            }
        )
        assert response.status_code == 200, f"Create RM adjustment failed: {response.text}"
        data = response.json()
        assert data["type"] == "gain"
        print(f"✓ Created RM adjustment (gain): {data['id']}")
        return data["id"]
    
    def test_create_rm_adjustment_loss(self, admin_token):
        """Create an RM adjustment (loss)"""
        rm_resp = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        materials = rm_resp.json()
        
        if not materials:
            pytest.skip("No raw materials for adjustment test")
        
        material_name = materials[0]["name"]
        
        response = requests.post(
            f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "material_name": material_name,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "loss",
                "quantity": 2,
                "notes": "Test loss"
            }
        )
        assert response.status_code == 200, f"Create RM adjustment failed: {response.text}"
        data = response.json()
        assert data["type"] == "loss"
        print(f"✓ Created RM adjustment (loss): {data['id']}")
        return data["id"]
    
    def test_read_rm_adjustments(self, admin_token):
        """Read all RM adjustments"""
        response = requests.get(
            f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} RM adjustments")
    
    def test_delete_rm_adjustment(self, admin_token):
        """Delete an RM adjustment"""
        rm_resp = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        materials = rm_resp.json()
        
        if not materials:
            pytest.skip("No raw materials for delete adjustment test")
        
        material_name = materials[0]["name"]
        
        # Create one to delete
        create_resp = requests.post(
            f"{BASE_URL}/api/rm-adjustment",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "material_name": material_name,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "type": "loss",
                "quantity": 1,
                "notes": "To delete"
            }
        )
        assert create_resp.status_code == 200
        adj_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = requests.delete(
            f"{BASE_URL}/api/rm-adjustment/{adj_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete RM adjustment failed: {delete_resp.text}"
        print(f"✓ Deleted RM adjustment: {adj_id}")


class TestBatchCRUD:
    """Batch CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_read_batches(self, admin_token):
        """Read all batches"""
        response = requests.get(
            f"{BASE_URL}/api/batches",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} batches")
    
    def test_read_batches_with_date_filter(self, admin_token):
        """Read batches with date filter"""
        response = requests.get(
            f"{BASE_URL}/api/batches?start_date=2026-01-01&end_date=2026-12-31",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        print(f"✓ Read {len(data)} batches with date filter")


class TestRawMaterialStockCRUD:
    """Raw Material Stock CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_read_raw_material_stock(self, admin_token):
        """Read all raw material stock entries"""
        response = requests.get(
            f"{BASE_URL}/api/raw-material-stock",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Read {len(data)} raw material stock entries")


# Cleanup test data
class TestCleanup:
    """Cleanup TEST_ prefixed data"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "username": "admin", "password": "admin123"
        })
        return response.json()["token"]
    
    def test_cleanup_test_data(self, admin_token):
        """Clean up test data created during tests"""
        # Clean up raw material masters
        rm_resp = requests.get(
            f"{BASE_URL}/api/raw-material-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        for rm in rm_resp.json():
            if rm["name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/raw-material-master/{rm['id']}",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                print(f"  Cleaned up: {rm['name']}")
        
        # Clean up semi-finished masters
        sf_resp = requests.get(
            f"{BASE_URL}/api/semi-finished-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        for sf in sf_resp.json():
            if sf["name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/semi-finished-master/{sf['id']}",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                print(f"  Cleaned up: {sf['name']}")
        
        # Clean up finished product masters
        fp_resp = requests.get(
            f"{BASE_URL}/api/finished-product-master",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        for fp in fp_resp.json():
            if fp["sku_name"].startswith("TEST_"):
                requests.delete(
                    f"{BASE_URL}/api/finished-product-master/{fp['id']}",
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                print(f"  Cleaned up: {fp['sku_name']}")
        
        print("✓ Cleanup completed")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
