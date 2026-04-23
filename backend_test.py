import requests
import sys
from datetime import datetime
import json

class DairyInventoryAPITester:
    def __init__(self, base_url="https://daily-plant-ops.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.created_resources = {
            'batch_id': None,
            'semi_finished_id': None,
            'finished_product_id': None,
            'user_id': None
        }

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {method} {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                self.failed_tests.append({
                    'name': name,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'response': response.text[:200]
                })
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            self.failed_tests.append({
                'name': name,
                'error': str(e)
            })
            return False, {}

    def test_login(self):
        """Test login with default admin credentials"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "api/auth/login",
            200,
            data={"username": "admin", "password": "admin123"}
        )
        if success and 'token' in response:
            self.token = response['token']
            print(f"   Token obtained: {self.token[:20]}...")
            return True
        return False

    def test_dashboard_stats(self):
        """Test dashboard stats endpoint"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "api/dashboard/stats",
            200
        )
        if success:
            print(f"   Stats: {response}")
        return success

    def test_create_batch(self):
        """Test batch creation"""
        batch_data = {
            "milk_kg": 100.5,
            "fat_percent": 4.2,
            "snf_percent": 8.5,
            "raw_materials": [
                {
                    "name": "Sugar",
                    "quantity": 10.0,
                    "cost_per_unit": 45.0
                }
            ],
            "output_type": "semi-finished",
            "product_name": "Paneer Block",
            "notes": "Test batch for API testing"
        }
        
        success, response = self.run_test(
            "Create Batch",
            "POST",
            "api/batches",
            200,
            data=batch_data
        )
        
        if success and 'id' in response:
            self.created_resources['batch_id'] = response['id']
            print(f"   Batch ID: {response['id']}")
        return success

    def test_get_batches(self):
        """Test getting all batches"""
        return self.run_test(
            "Get Batches",
            "GET",
            "api/batches",
            200
        )[0]

    def test_create_semi_finished_product(self):
        """Test creating semi-finished product"""
        if not self.created_resources['batch_id']:
            print("❌ Skipping - No batch ID available")
            return False
            
        product_data = {
            "batch_id": self.created_resources['batch_id'],
            "product_name": "Paneer Block",
            "quantity_kg": 50.0
        }
        
        success, response = self.run_test(
            "Create Semi-Finished Product",
            "POST",
            "api/semi-finished",
            200,
            data=product_data
        )
        
        if success and 'id' in response:
            self.created_resources['semi_finished_id'] = response['id']
            print(f"   Semi-finished ID: {response['id']}")
        return success

    def test_get_semi_finished_products(self):
        """Test getting semi-finished products"""
        return self.run_test(
            "Get Semi-Finished Products",
            "GET",
            "api/semi-finished",
            200
        )[0]

    def test_create_packing_entry(self):
        """Test creating packing entry (finished product)"""
        if not self.created_resources['semi_finished_id']:
            print("❌ Skipping - No semi-finished product ID available")
            return False
            
        packing_data = {
            "semi_finished_id": self.created_resources['semi_finished_id'],
            "sku": "Paneer-200g",
            "quantity_produced": 20.0,
            "quantity_wasted": 2.0,
            "unit": "kg"
        }
        
        success, response = self.run_test(
            "Create Packing Entry",
            "POST",
            "api/packing",
            200,
            data=packing_data
        )
        
        if success and 'id' in response:
            self.created_resources['finished_product_id'] = response['id']
            print(f"   Finished product ID: {response['id']}")
        return success

    def test_get_finished_products(self):
        """Test getting finished products"""
        return self.run_test(
            "Get Finished Products",
            "GET",
            "api/finished-products",
            200
        )[0]

    def test_create_dispatch(self):
        """Test creating dispatch"""
        if not self.created_resources['finished_product_id']:
            print("❌ Skipping - No finished product ID available")
            return False
            
        dispatch_data = {
            "dispatch_type": "delivery_challan",
            "challan_number": "CH001",
            "products": [
                {
                    "finished_product_id": self.created_resources['finished_product_id'],
                    "quantity": 5.0
                }
            ],
            "destination": "Customer A",
            "notes": "Test dispatch"
        }
        
        success, response = self.run_test(
            "Create Dispatch",
            "POST",
            "api/dispatch",
            200,
            data=dispatch_data
        )
        return success

    def test_get_dispatches(self):
        """Test getting dispatches"""
        return self.run_test(
            "Get Dispatches",
            "GET",
            "api/dispatch",
            200
        )[0]

    def test_create_raw_material_stock(self):
        """Test creating raw material stock entry"""
        stock_data = {
            "name": "Milk Powder",
            "unit": "kg",
            "opening_stock": 100.0,
            "purchased": 50.0,
            "cost_per_unit": 200.0
        }
        
        return self.run_test(
            "Create Raw Material Stock",
            "POST",
            "api/raw-material-stock",
            200,
            data=stock_data
        )[0]

    def test_get_raw_material_stock(self):
        """Test getting raw material stock"""
        return self.run_test(
            "Get Raw Material Stock",
            "GET",
            "api/raw-material-stock",
            200
        )[0]

    def test_get_product_stock_report(self):
        """Test product stock report"""
        return self.run_test(
            "Get Product Stock Report",
            "GET",
            "api/reports/product-stock",
            200
        )[0]

    def test_create_user(self):
        """Test user creation (admin only)"""
        user_data = {
            "username": f"testuser_{datetime.now().strftime('%H%M%S')}",
            "password": "testpass123",
            "role": "modify",
            "full_name": "Test User"
        }
        
        success, response = self.run_test(
            "Create User",
            "POST",
            "api/auth/register",
            200,
            data=user_data
        )
        
        if success and 'id' in response:
            self.created_resources['user_id'] = response['id']
            print(f"   User ID: {response['id']}")
        return success

    def test_get_users(self):
        """Test getting all users"""
        return self.run_test(
            "Get Users",
            "GET",
            "api/users",
            200
        )[0]

    def test_delete_user(self):
        """Test user deletion"""
        if not self.created_resources['user_id']:
            print("❌ Skipping - No user ID available")
            return False
            
        return self.run_test(
            "Delete User",
            "DELETE",
            f"api/users/{self.created_resources['user_id']}",
            200
        )[0]

def main():
    print("🧪 Starting Dairy Inventory Management API Tests")
    print("=" * 60)
    
    tester = DairyInventoryAPITester()
    
    # Test sequence
    test_sequence = [
        ("Authentication", [
            tester.test_login,
        ]),
        ("Dashboard", [
            tester.test_dashboard_stats,
        ]),
        ("Batch Management", [
            tester.test_create_batch,
            tester.test_get_batches,
        ]),
        ("Semi-Finished Products", [
            tester.test_create_semi_finished_product,
            tester.test_get_semi_finished_products,
        ]),
        ("Finished Products", [
            tester.test_create_packing_entry,
            tester.test_get_finished_products,
        ]),
        ("Dispatch Management", [
            tester.test_create_dispatch,
            tester.test_get_dispatches,
        ]),
        ("Raw Material Stock", [
            tester.test_create_raw_material_stock,
            tester.test_get_raw_material_stock,
            tester.test_get_product_stock_report,
        ]),
        ("User Management", [
            tester.test_create_user,
            tester.test_get_users,
            tester.test_delete_user,
        ])
    ]
    
    # Run tests
    for category, tests in test_sequence:
        print(f"\n📋 {category} Tests")
        print("-" * 40)
        
        for test_func in tests:
            try:
                test_func()
            except Exception as e:
                print(f"❌ Test failed with exception: {str(e)}")
                tester.failed_tests.append({
                    'name': test_func.__name__,
                    'error': str(e)
                })
    
    # Print final results
    print(f"\n📊 Test Results Summary")
    print("=" * 60)
    print(f"Total Tests: {tester.tests_run}")
    print(f"Passed: {tester.tests_passed}")
    print(f"Failed: {len(tester.failed_tests)}")
    print(f"Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if tester.failed_tests:
        print(f"\n❌ Failed Tests:")
        for i, failure in enumerate(tester.failed_tests, 1):
            print(f"{i}. {failure['name']}")
            if 'error' in failure:
                print(f"   Error: {failure['error']}")
            else:
                print(f"   Expected: {failure['expected']}, Got: {failure['actual']}")
    
    return 0 if len(tester.failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())