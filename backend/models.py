from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict, Any


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "view"
    full_name: Optional[str] = None


class RawMaterialMasterCreate(BaseModel):
    name: str
    unit: str
    description: Optional[str] = None


class RawMaterialMasterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    unit: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: str


class RawMaterialRateCreate(BaseModel):
    raw_material_id: str
    rate: float
    from_date: str
    to_date: Optional[str] = None


class RawMaterialRateResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    raw_material_id: str
    raw_material_name: str
    rate: float
    from_date: str
    to_date: Optional[str] = None
    created_at: str


class FinishedSKUMapping(BaseModel):
    sku_name: str
    quantity_consumed: float


class SemiFinishedMasterCreate(BaseModel):
    name: str
    unit: str
    finished_sku_mappings: List[FinishedSKUMapping]
    description: Optional[str] = None


class SemiFinishedMasterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    unit: str
    finished_sku_mappings: List[Dict[str, Any]]
    description: Optional[str] = None
    is_active: bool = True
    created_at: str


class FinishedProductMasterCreate(BaseModel):
    sku_name: str
    uom: str
    description: Optional[str] = None


class FinishedProductMasterResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    sku_name: str
    uom: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: str


class UserResponse(BaseModel):
    id: str
    username: str
    role: str
    full_name: Optional[str] = None
    is_active: bool = True
    created_at: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    user: UserResponse


class RawMaterialInput(BaseModel):
    name: str
    quantity: float
    cost_per_unit: float


class BatchCreate(BaseModel):
    batch_date: str
    milk_kg: float = 0
    fat_percent: float = 0
    fat_rate: float = 0
    snf_percent: float = 0
    snf_rate: float = 0
    raw_materials: Optional[List[str]] = []
    raw_material_quantities: Optional[List[float]] = []
    output_type: str
    product_name: str
    quantity_produced: float
    additional_costs: Optional[List[Dict[str, Any]]] = []
    notes: Optional[str] = None


class BatchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    batch_number: str
    date: str
    milk_kg: float
    fat_percent: float
    fat_rate: float = 0
    snf_percent: float
    snf_rate: float = 0
    fat_cost: float = 0
    snf_cost: float = 0
    milk_cost: float = 0
    raw_materials: List[Dict[str, Any]]
    output_type: str
    product_name: str
    quantity_produced: float = 0
    other_rm_cost: float = 0
    additional_costs: Optional[List[Dict[str, Any]]] = []
    additional_costs_total: float = 0
    total_raw_material_cost: float = 0
    cost_per_unit: float = 0
    status: str
    notes: Optional[str] = None
    created_by: str
    created_at: str


class SemiFinishedProductCreate(BaseModel):
    batch_id: str
    product_name: str
    quantity_kg: float


class MilkStockEntry(BaseModel):
    date: str
    quantity_kg: float
    fat_percent: float
    snf_percent: float
    supplier: Optional[str] = None
    notes: Optional[str] = None


class MilkStockResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    quantity_kg: float
    fat_percent: float
    snf_percent: float
    fat_kg: float
    snf_kg: float
    supplier: Optional[str] = None
    notes: Optional[str] = None
    created_by: str
    created_at: str


class MilkWastageEntry(BaseModel):
    date: str
    quantity_kg: float = 0
    fat_kg: float = 0
    snf_kg: float = 0
    notes: Optional[str] = None


class MilkWastageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    quantity_kg: float
    fat_kg: float
    snf_kg: float
    notes: Optional[str] = None
    created_by: str
    created_at: str


class MilkAdjustmentEntry(BaseModel):
    date: str
    type: str
    quantity_kg: float = 0
    fat_kg: float = 0
    snf_kg: float = 0
    notes: Optional[str] = None


class MilkAdjustmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    date: str
    type: str
    quantity_kg: float
    fat_kg: float
    snf_kg: float
    notes: Optional[str] = None
    created_by: str
    created_at: str


class RMAdjustmentEntry(BaseModel):
    material_name: str
    date: str
    type: str
    quantity: float
    notes: Optional[str] = None


class RMAdjustmentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    material_name: str
    date: str
    type: str
    quantity: float
    notes: Optional[str] = None
    created_by: str
    created_at: str


class RMDirectConsumptionCreate(BaseModel):
    material_name: str
    quantity: float
    consumption_date: str
    reason: str
    notes: Optional[str] = None


class RMDirectConsumptionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    material_name: str
    quantity: float
    unit: str
    reason: str
    date: str
    notes: Optional[str] = None
    created_by: str
    created_at: str


class SemiFinishedProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    batch_id: str
    product_name: str
    quantity_kg: float
    current_stock: float
    date: str
    created_at: str


class PackingEntry(BaseModel):
    semi_finished_id: str
    batch_id: Optional[str] = None
    sku: str
    quantity_produced: float
    quantity_wasted: float
    semi_finished_consumed: Optional[float] = None
    packing_date: str
    additional_materials: Optional[List[Dict[str, Any]]] = None
    additional_costs: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None


class FinishedProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    semi_finished_id: str = ""
    batch_id: Optional[str] = None
    batch_number: Optional[str] = None
    sku: str
    quantity: float
    quantity_wasted: float
    unit: str
    current_stock: float
    source: Optional[str] = None
    date: str
    created_at: str
    semi_finished_consumed: Optional[float] = None
    additional_materials: Optional[List[Dict[str, Any]]] = None
    additional_costs: Optional[List[Dict[str, Any]]] = None
    semi_finished_cost: Optional[float] = None
    additional_materials_cost: Optional[float] = None
    additional_costs_total: Optional[float] = None
    total_packing_cost: Optional[float] = None
    cost_per_finished_unit: Optional[float] = None
    notes: Optional[str] = None


class DispatchCreate(BaseModel):
    dispatch_type: str
    challan_number: str
    products: List[Dict[str, Any]]
    destination: str
    dispatch_date: Optional[str] = None
    notes: Optional[str] = None


class DispatchResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    dispatch_type: str
    challan_number: str
    products: List[Dict[str, Any]]
    destination: str
    notes: Optional[str] = None
    date: str
    created_by: str
    created_at: str


class FinishedProductReceiveCreate(BaseModel):
    sku: str
    quantity: float
    receive_date: str
    source_name: str
    cost_per_unit: Optional[float] = 0
    notes: Optional[str] = None


class FinishedProductReceiveResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    sku: str
    quantity: float
    unit: str
    source_name: str
    cost_per_unit: float
    total_cost: float
    date: str
    notes: Optional[str] = None
    created_by: str
    created_at: str


class FinishedProductRepackCreate(BaseModel):
    source_sku: str
    target_sku: str
    quantity_used: float
    quantity_produced: float
    quantity_wasted: float = 0
    repack_date: str
    notes: Optional[str] = None


class FinishedProductRepackResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    repack_batch_number: str
    source_sku: str
    target_sku: str
    quantity_used: float
    quantity_produced: float
    quantity_wasted: float
    date: str
    notes: Optional[str] = None
    created_by: str
    created_at: str


class FinishedProductWastageCreate(BaseModel):
    sku: str
    quantity: float
    wastage_date: str
    reason: str
    notes: Optional[str] = None


class FinishedProductWastageResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    sku: str
    quantity: float
    unit: str
    reason: str
    date: str
    notes: Optional[str] = None
    created_by: str
    created_at: str


class RawMaterialStockCreate(BaseModel):
    name: str
    date: str
    purchased: float


class RawMaterialStockResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    unit: str
    date: str
    opening_stock: float
    purchased: float
    used: float
    closing_stock: float
    cost_per_unit: float
