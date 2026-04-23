import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Plus, Filter, Calendar, History, Edit, Trash2, ChevronDown, ChevronRight, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SemiFinishedProduct = ({ user }) => {
  const [ledgerData, setLedgerData] = useState([]);
  const [productSummary, setProductSummary] = useState([]);
  const [finishedProductMasters, setFinishedProductMasters] = useState([]);
  const [semiFinishedMasters, setSemiFinishedMasters] = useState([]);
  const [rawMaterialMasters, setRawMaterialMasters] = useState([]);
  const [expandedProducts, setExpandedProducts] = useState({});
  
  // Selected product for detailed view
  const [selectedProductFilter, setSelectedProductFilter] = useState('');

  const [showPackingForm, setShowPackingForm] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [packingHistory, setPackingHistory] = useState([]);
  const [editingPacking, setEditingPacking] = useState(null);
  const [batchesForPacking, setBatchesForPacking] = useState([]);
  const [historyFilters, setHistoryFilters] = useState({ start_date: '', end_date: '' });

  const [packingForm, setPackingForm] = useState({
    batch_id: '',
    skus: [{ sku: '', quantity_produced: '' }],
    quantity_wasted: '',
    packing_date: new Date().toISOString().split('T')[0],
    additional_materials: [], 
    additional_costs: [],
    notes: ''
  });

  const [filters, setFilters] = useState({ start_date: '', end_date: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    fetchSummary();
    fetchFinishedMasters();
    fetchSemiFinishedMasters();
    fetchRawMaterialMasters();
    setLoading(false);
  }, []);

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/semi-finished-summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setProductSummary(res.data);
    } catch (err) { console.error('Failed to fetch summary:', err); }
  };

  const fetchLedger = async (filterParams = null, productName = null) => {
    try {
      const token = localStorage.getItem('token');
      const params = filterParams || filters;
      const product = productName !== null ? productName : selectedProductFilter;
      
      // Only fetch if a product is selected
      if (!product) {
        setLedgerData([]);
        setLoading(false);
        return;
      }
      
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      qp.append('product_name', product);
      
      const res = await axios.get(`${BACKEND_URL}/api/reports/semi-finished-ledger?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLedgerData(res.data);
    } catch (err) { console.error('Failed to fetch ledger:', err); }
    finally { setLoading(false); }
  };

  const fetchFinishedMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/finished-product-master`, { headers: { Authorization: `Bearer ${token}` } });
      setFinishedProductMasters(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchSemiFinishedMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/semi-finished-master`, { headers: { Authorization: `Bearer ${token}` } });
      setSemiFinishedMasters(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchRawMaterialMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/raw-material-master`, { headers: { Authorization: `Bearer ${token}` } });
      setRawMaterialMasters(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchBatchesForPacking = async (productName) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/batches-for-packing/${encodeURIComponent(productName)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBatchesForPacking(res.data);
    } catch (err) { console.error(err); setBatchesForPacking([]); }
  };

  const fetchPackingHistory = async (productName) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/packing-history-by-product/${encodeURIComponent(productName)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPackingHistory(res.data);
    } catch (err) { console.error(err); }
  };

  const handleProductFilterChange = (productName) => {
    setSelectedProductFilter(productName);
    if (productName) {
      setLoading(true);
      fetchLedger(filters, productName);
    } else {
      setLedgerData([]);
    }
  };

  const handleApplyFilters = () => { 
    if (selectedProductFilter) {
      setLoading(true); 
      fetchLedger(filters, selectedProductFilter); 
    }
  };
  const handleResetFilters = () => {
    const r = { start_date: '', end_date: '' };
    setFilters(r); 
    if (selectedProductFilter) {
      setLoading(true); 
      fetchLedger(r, selectedProductFilter);
    }
  };

  const toggleExpand = (name) => {
    setExpandedProducts(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const getSkuOptionsForProduct = (productName) => {
    const master = semiFinishedMasters.find(m => m.name === productName);
    if (!master) return finishedProductMasters.filter(fp => fp.is_active !== false);
    const skuNames = master.finished_sku_mappings.map(m => m.sku_name);
    return finishedProductMasters.filter(fp => skuNames.includes(fp.sku_name) && fp.is_active !== false);
  };

  const isManualConsumption = (productName, skuName) => {
    if (!productName || !skuName) return false;
    const master = semiFinishedMasters.find(m => m.name === productName);
    if (!master) return false;
    const mapping = master.finished_sku_mappings.find(m => m.sku_name === skuName);
    return mapping && mapping.quantity_consumed === 0;
  };

  // Check if any selected SKU uses manual consumption
  const anySkuIsManual = () => {
    if (!selectedProduct) return false;
    return packingForm.skus.some(s => s.sku && isManualConsumption(selectedProduct.product_name, s.sku));
  };

  const selectedBatch = batchesForPacking.find(b => b.batch_id === packingForm.batch_id);

  const handleOpenPackingForm = (product) => {
    setSelectedProduct(product);
    setEditingPacking(null);
    setPackingForm({ batch_id: '', skus: [{ sku: '', quantity_produced: '', semi_finished_consumed: '' }], quantity_wasted: '', packing_date: new Date().toISOString().split('T')[0], additional_materials: [], additional_costs: [], notes: '' });
    fetchBatchesForPacking(product.product_name);
    setShowPackingForm(true);
  };

  const handlePackingSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const validSkus = packingForm.skus.filter(s => s.sku && s.quantity_produced);
      if (validSkus.length === 0) { setError('At least one SKU with quantity is required'); return; }

      if (editingPacking) {
        const s = validSkus[0];
        // Determine if this SKU uses manual consumption mode
        const isManual = isManualConsumption(selectedProduct?.product_name || editingPacking.product_name, s.sku);
        // For manual mode: send the user-entered consumption value
        // For non-manual mode: send null so backend recalculates based on new quantity
        const consumedValue = isManual && s.semi_finished_consumed ? parseFloat(s.semi_finished_consumed) : null;
        const payload = {
          semi_finished_id: editingPacking.semi_finished_id,
          batch_id: packingForm.batch_id || null,
          sku: s.sku,
          quantity_produced: parseFloat(s.quantity_produced),
          quantity_wasted: parseFloat(packingForm.quantity_wasted || 0),
          semi_finished_consumed: consumedValue,
          packing_date: packingForm.packing_date,
          additional_materials: packingForm.additional_materials.filter(m => m.name && m.quantity > 0),
          additional_costs: packingForm.additional_costs.filter(c => c.description && c.amount).map(c => ({ description: c.description, amount: parseFloat(c.amount) })),
          notes: packingForm.notes || ''
        };
        await axios.put(`${BACKEND_URL}/api/packing/${editingPacking.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Packing updated successfully!');
      } else {
        const totalWasted = parseFloat(packingForm.quantity_wasted || 0);
        const validCosts = packingForm.additional_costs.filter(c => c.description && c.amount);
        for (let i = 0; i < validSkus.length; i++) {
          const s = validSkus[i];
          const payload = {
            semi_finished_id: selectedProduct.product_name,
            batch_id: packingForm.batch_id || null,
            sku: s.sku,
            quantity_produced: parseFloat(s.quantity_produced),
            quantity_wasted: i === 0 ? totalWasted : 0,
            semi_finished_consumed: s.semi_finished_consumed ? parseFloat(s.semi_finished_consumed) : null,
            packing_date: packingForm.packing_date,
            additional_materials: i === 0 ? packingForm.additional_materials.filter(m => m.name && m.quantity > 0) : [],
            additional_costs: i === 0 ? validCosts.map(c => ({ description: c.description, amount: parseFloat(c.amount) })) : [],
            notes: packingForm.notes || ''
          };
          await axios.post(`${BACKEND_URL}/api/packing-by-product`, payload, { headers: { Authorization: `Bearer ${token}` } });
        }
        setSuccess(`${validSkus.length} packing ${validSkus.length > 1 ? 'entries' : 'entry'} created!`);
      }
      setShowPackingForm(false); setEditingPacking(null); setSelectedProduct(null);
      resetPackingForm();
      fetchSummary(); fetchLedger();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save packing entry'); }
  };

  const resetPackingForm = () => {
    setPackingForm({ batch_id: '', skus: [{ sku: '', quantity_produced: '', semi_finished_consumed: '' }], quantity_wasted: '', packing_date: new Date().toISOString().split('T')[0], additional_materials: [], additional_costs: [], notes: '' });
  };

  const addSkuLine = () => {
    setPackingForm({ ...packingForm, skus: [...packingForm.skus, { sku: '', quantity_produced: '', semi_finished_consumed: '' }] });
  };

  const removeSkuLine = (idx) => {
    if (packingForm.skus.length <= 1) return;
    setPackingForm({ ...packingForm, skus: packingForm.skus.filter((_, i) => i !== idx) });
  };

  const updateSkuLine = (idx, field, value) => {
    const updated = [...packingForm.skus];
    updated[idx] = { ...updated[idx], [field]: value };
    setPackingForm({ ...packingForm, skus: updated });
  };

  const handleEditPacking = (packing) => {
    setEditingPacking(packing);
    setPackingForm({
      batch_id: packing.batch_id || '',
      skus: [{ sku: packing.sku, quantity_produced: packing.quantity, semi_finished_consumed: packing.semi_finished_consumed || '' }],
      quantity_wasted: packing.quantity_wasted,
      packing_date: packing.date,
      additional_materials: packing.additional_materials || [],
      additional_costs: packing.additional_costs || [],
      notes: packing.notes || ''
    });
    setShowPackingForm(true);
  };

  const handleDeletePacking = (packingId) => {
    setConfirmDialog({
      open: true, title: 'Delete Packing Entry', message: 'Delete this packing entry? Stock will be restored.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/packing/${packingId}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Packing deleted!');
          fetchSummary(); fetchLedger();
          if (showHistoryModal && selectedProduct) fetchPackingHistory(selectedProduct.product_name);
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete packing'); }
      }
    });
  };

  const addAdditionalMaterial = () => {
    setPackingForm(prev => ({
      ...prev,
      additional_materials: [...prev.additional_materials, { name: '', quantity: '' }]
    }));
  };

  const updateAdditionalMaterial = (index, field, value) => {
    setPackingForm(prev => {
      const mats = [...prev.additional_materials];
      mats[index] = { ...mats[index], [field]: field === 'quantity' ? parseFloat(value) || '' : value };
      return { ...prev, additional_materials: mats };
    });
  };

  const removeAdditionalMaterial = (index) => {
    setPackingForm(prev => ({
      ...prev,
      additional_materials: prev.additional_materials.filter((_, i) => i !== index)
    }));
  };

  const handleExportToExcel = () => {
    if (ledgerData.length === 0) {
      toast.error('No data to export. Please select a product first.');
      return;
    }
    const wb = XLSX.utils.book_new();
    ledgerData.forEach(item => {
      const rows = [
        { Date: '', Type: 'Opening Stock', In: '', Out: '', Balance: item.opening_stock },
        ...item.transactions.map(t => ({
          Date: t.date, Type: t.type, Description: t.description,
          In: t.in_qty || '', Out: t.out_qty || '', Balance: t.balance
        })),
        { Date: '', Type: 'Closing Stock', In: item.total_in, Out: item.total_out, Balance: item.closing_stock }
      ];
      const ws = XLSX.utils.json_to_sheet(rows);
      const safeName = item.product_name.replace(/[\\/*?[\]:]/g, '_').substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });
    XLSX.writeFile(wb, `semi_finished_ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredPackingHistory = packingHistory.filter(pk => {
    if (historyFilters.start_date && pk.date < historyFilters.start_date) return false;
    if (historyFilters.end_date && pk.date > historyFilters.end_date) return false;
    return true;
  });

  const handleExportHistory = () => {
    const rows = filteredPackingHistory.map(pk => ({
      Date: pk.date,
      Batch: pk.batch_number || '',
      SKU: pk.sku,
      'Qty Produced': pk.quantity,
      Unit: pk.unit,
      'Qty Wasted': pk.quantity_wasted || 0,
      'Current Stock': pk.current_stock,
      'Semi-Finished Cost': pk.semi_finished_cost || 0,
      'Add. Materials Cost': pk.additional_materials_cost || 0,
      'Other Costs': pk.additional_costs_total || 0,
      'Total Packing Cost': pk.total_packing_cost || 0,
      'Cost/Unit': pk.cost_per_finished_unit || 0,
      'Add. Materials': (pk.additional_materials || []).map(m => `${m.name}: ${m.quantity} x ${m.cost_per_unit}`).join('; '),
      'Other Costs Detail': (pk.additional_costs || []).map(c => `${c.description}: ${c.amount}`).join('; ')
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    const name = selectedProduct?.product_name || 'Packing';
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
    XLSX.writeFile(wb, `packing_history_${name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Semi-Finished Products</h1>
          <p className="text-sm text-slate-500 mt-1">Track semi-finished inventory and packing</p>
        </div>
        <div className="flex gap-3">
          <button data-testid="export-excel-btn" onClick={handleExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
            <Download size={18} /> Export Excel
          </button>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700">
            <Filter size={18} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      {error && <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}
      {success && <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}

      {/* Product Summary Cards - Products with Stock */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Products with Stock</h2>
        {productSummary.filter(p => p.current_stock > 0).length === 0 ? (
          <p className="text-slate-500 text-sm">No products with stock available</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {productSummary.filter(p => p.current_stock > 0).map(p => (
              <div 
                key={p.product_name}
                onClick={() => handleProductFilterChange(p.product_name)}
                className={`p-3 rounded-sm border cursor-pointer transition-all ${
                  selectedProductFilter === p.product_name 
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <p className="font-semibold text-slate-900 truncate">{p.product_name}</p>
                <p className="text-sm text-slate-600">{p.current_stock.toFixed(2)} kg</p>
                {canModify && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleOpenPackingForm(p); }}
                    className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1 bg-slate-900 text-white text-xs font-medium rounded-sm hover:bg-slate-800"
                  >
                    <Plus size={12} /> Pack
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product Selector Dropdown */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-md">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Select Product to View Ledger</label>
            <SearchableSelect
              testId="product-filter-select"
              value={selectedProductFilter}
              onChange={handleProductFilterChange}
              placeholder="Select a product..."
              searchPlaceholder="Search products..."
              options={productSummary.map(p => ({ 
                value: p.product_name, 
                label: `${p.product_name} (${p.current_stock.toFixed(2)} kg)` 
              }))}
            />
          </div>
          {selectedProductFilter && (
            <button 
              onClick={() => handleProductFilterChange('')}
              className="mt-5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Date Range Filter */}
      {showFilters && selectedProductFilter && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Date Range</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input data-testid="start-date-filter" type="date" value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input data-testid="end-date-filter" type="date" value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
          </div>
          <div className="flex gap-3">
            <button data-testid="apply-filters-btn" onClick={handleApplyFilters}
              className="px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">Apply</button>
            <button data-testid="reset-filters-btn" onClick={handleResetFilters}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      )}

      {/* Packing Form Modal */}
      {showPackingForm && selectedProduct && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-2xl w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">{editingPacking ? 'Edit Packing' : 'Pack Product'}</h2>
            <p className="text-sm text-slate-600 mb-4">{selectedProduct.product_name}</p>
            <form onSubmit={handlePackingSubmit} className="space-y-4">
              {/* Batch selector */}
              {!editingPacking && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Select Batch</label>
                  <select data-testid="batch-select" value={packingForm.batch_id}
                    onChange={(e) => setPackingForm({ ...packingForm, batch_id: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900">
                    <option value="">Select batch...</option>
                    {batchesForPacking.map(b => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_number} ({b.batch_date}) - {b.available_stock} kg available
                      </option>
                    ))}
                  </select>
                  {selectedBatch && (
                    <p className="text-sm text-blue-600 mt-1">
                      Available: <span className="font-semibold">{selectedBatch.available_stock} kg</span> | Cost: <span className="font-semibold">{selectedBatch.batch_cost_per_kg}/kg</span>
                    </p>
                  )}
                  {batchesForPacking.length === 0 && (
                    <p className="text-sm text-amber-600 mt-1">No batches with available stock found.</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Packing Date</label>
                <input data-testid="packing-date-input" type="date" value={packingForm.packing_date}
                  onChange={(e) => setPackingForm({ ...packingForm, packing_date: e.target.value })} required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>

              {/* Multi-SKU Lines */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU Lines</label>
                  {!editingPacking && (
                    <button data-testid="add-sku-line-btn" type="button" onClick={addSkuLine}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                      <Plus size={14} /> Add SKU
                    </button>
                  )}
                </div>
                {packingForm.skus.map((skuLine, idx) => (
                  <div key={idx} className="flex items-end gap-3 mb-3 pb-3 border-b border-slate-100 last:border-0">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SKU Name</label>
                      <select data-testid={`sku-select-${idx}`} value={skuLine.sku}
                        onChange={(e) => updateSkuLine(idx, 'sku', e.target.value)} required
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900">
                        <option value="">Select SKU...</option>
                        {getSkuOptionsForProduct(selectedProduct.product_name).map(m => (
                          <option key={m.id} value={m.sku_name}>{m.sku_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Qty</label>
                      <input data-testid={`qty-produced-${idx}`} type="number" step="0.01" value={skuLine.quantity_produced}
                        onChange={(e) => updateSkuLine(idx, 'quantity_produced', e.target.value)} required
                        className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                    </div>
                    {isManualConsumption(selectedProduct.product_name, skuLine.sku) && (
                      <div className="w-40">
                        <label className="block text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1.5">
                          {selectedProduct.product_name} Used
                        </label>
                        <input data-testid={`sf-consumed-${idx}`} type="number" step="0.01" value={skuLine.semi_finished_consumed}
                          onChange={(e) => updateSkuLine(idx, 'semi_finished_consumed', e.target.value)} required
                          placeholder="kg consumed"
                          className="w-full h-10 px-3 bg-amber-50 border border-amber-300 rounded-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-slate-900" />
                      </div>
                    )}
                    {packingForm.skus.length > 1 && (
                      <button type="button" onClick={() => removeSkuLine(idx)}
                        className="h-10 px-2 text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                    )}
                  </div>
                ))}
              </div>

              {/* Single wastage field - hidden in manual consumption mode */}
              {!anySkuIsManual() && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Total Wastage (kg) <span className="font-normal text-slate-400">(deducted from semi-finished stock)</span></label>
                  <input data-testid="quantity-wasted-input" type="number" step="0.01" value={packingForm.quantity_wasted}
                    onChange={(e) => setPackingForm({ ...packingForm, quantity_wasted: e.target.value })}
                    placeholder="0"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
              )}

              {/* Additional Raw Materials */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Additional Raw Materials (Packing Material etc.)</label>
                  <button data-testid="add-material-btn" type="button" onClick={addAdditionalMaterial}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Material
                  </button>
                </div>
                {packingForm.additional_materials.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No additional materials added</p>
                )}
                {packingForm.additional_materials.map((mat, idx) => (
                  <div key={idx} className="flex items-center gap-3 mb-2">
                    <div className="flex-1">
                      <SearchableSelect
                        testId={`mat-name-${idx}`}
                        value={mat.name}
                        onChange={(val) => updateAdditionalMaterial(idx, 'name', val)}
                        placeholder="Select material..."
                        searchPlaceholder="Search materials..."
                        options={rawMaterialMasters.filter(rm => rm.is_active !== false).map(rm => ({ value: rm.name, label: `${rm.name} (${rm.unit})` }))}
                      />
                    </div>
                    <input data-testid={`mat-qty-${idx}`} type="number" step="0.01" placeholder="Qty" value={mat.quantity}
                      onChange={(e) => updateAdditionalMaterial(idx, 'quantity', e.target.value)}
                      className="w-24 h-9 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => removeAdditionalMaterial(idx)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>

              {/* Other Costs (Labor, Electricity, Fuel, etc.) */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Other Costs <span className="font-normal text-slate-400">(Optional)</span></label>
                  <button data-testid="add-cost-btn" type="button" onClick={() => setPackingForm({ ...packingForm, additional_costs: [...packingForm.additional_costs, { description: '', amount: '' }] })}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Cost
                  </button>
                </div>
                {packingForm.additional_costs.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No additional costs. Click "Add Cost" for labor, electricity, fuel, etc.</p>
                ) : (
                  <div className="space-y-2">
                    {packingForm.additional_costs.map((cost, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <input data-testid={`cost-desc-${idx}`} type="text" value={cost.description}
                          onChange={(e) => { const u = [...packingForm.additional_costs]; u[idx] = { ...u[idx], description: e.target.value }; setPackingForm({ ...packingForm, additional_costs: u }); }}
                          placeholder="e.g., Labour, Electricity, Fuel"
                          className="flex-1 h-9 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500" />
                        <input data-testid={`cost-amount-${idx}`} type="number" step="0.01" value={cost.amount}
                          onChange={(e) => { const u = [...packingForm.additional_costs]; u[idx] = { ...u[idx], amount: e.target.value }; setPackingForm({ ...packingForm, additional_costs: u }); }}
                          placeholder="Amount"
                          className="w-28 h-9 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500" />
                        <button type="button" onClick={() => setPackingForm({ ...packingForm, additional_costs: packingForm.additional_costs.filter((_, i) => i !== idx) })}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                <input data-testid="packing-notes-input" type="text" value={packingForm.notes}
                  onChange={(e) => setPackingForm({ ...packingForm, notes: e.target.value })}
                  placeholder="Any remarks for this packing entry..."
                  className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400" />
              </div>

              <div className="flex gap-3 pt-2">
                <button data-testid="submit-packing-btn" type="submit" className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
                  {editingPacking ? 'Update' : 'Submit'}
                </button>
                <button data-testid="cancel-packing-btn" type="button" onClick={() => { setShowPackingForm(false); setSelectedProduct(null); setEditingPacking(null); }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-4xl w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Packing History</h2>
                <p className="text-sm text-slate-600 mt-1">{selectedProduct?.product_name} — {filteredPackingHistory.length} entries</p>
              </div>
              <div className="flex items-center gap-2">
                <button data-testid="export-history-btn" onClick={handleExportHistory} disabled={filteredPackingHistory.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-sm hover:bg-green-700 disabled:opacity-50">
                  <Download size={15} /> Excel
                </button>
                <button data-testid="close-history-btn" onClick={() => { setShowHistoryModal(false); setHistoryFilters({ start_date: '', end_date: '' }); }}
                  className="text-slate-400 hover:text-slate-600 text-xl px-2">x</button>
              </div>
            </div>
            {/* Date range filter */}
            <div className="flex items-end gap-3 mb-4 p-3 bg-slate-50 border border-slate-200 rounded-sm">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">From</label>
                <input data-testid="history-start-date" type="date" value={historyFilters.start_date}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, start_date: e.target.value }))}
                  className="w-full h-9 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">To</label>
                <input data-testid="history-end-date" type="date" value={historyFilters.end_date}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, end_date: e.target.value }))}
                  className="w-full h-9 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500" />
              </div>
              <button data-testid="reset-history-filter" onClick={() => setHistoryFilters({ start_date: '', end_date: '' })}
                className="h-9 px-3 text-sm bg-white border border-slate-300 text-slate-600 rounded-sm hover:bg-slate-50">Reset</button>
            </div>
            {filteredPackingHistory.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No packing history found for the selected date range</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {filteredPackingHistory.map(pk => (
                  <div key={pk.id} className="p-4 bg-slate-50 border border-slate-200 rounded-sm">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <p className="font-semibold text-slate-900">{pk.sku}</p>
                          {pk.batch_number && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-sm font-medium">{pk.batch_number}</span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-sm">
                          <div><span className="text-slate-500">Produced:</span> <span className="ml-1 font-medium text-green-600">{pk.quantity} {pk.unit}</span></div>
                          <div><span className="text-slate-500">Wasted:</span> <span className="ml-1 font-medium text-red-600">{pk.quantity_wasted || 0} kg</span></div>
                          <div><span className="text-slate-500">Stock:</span> <span className="ml-1 font-medium">{pk.current_stock} {pk.unit}</span></div>
                          <div><span className="text-slate-500">Date:</span> <span className="ml-1">{pk.date}</span></div>
                        </div>
                        {/* Cost breakdown */}
                        {pk.total_packing_cost > 0 && (
                          <div className="mt-3 p-3 bg-white border border-slate-200 rounded-sm">
                            <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Cost Breakdown</p>
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                              <div><span className="text-slate-500">Semi-finished:</span> <span className="font-medium">{pk.semi_finished_cost?.toFixed(2)}</span></div>
                              <div><span className="text-slate-500">Add. Materials:</span> <span className="font-medium">{pk.additional_materials_cost?.toFixed(2)}</span></div>
                              <div><span className="text-slate-500">Other Costs:</span> <span className="font-medium text-amber-700">{pk.additional_costs_total?.toFixed(2) || '0.00'}</span></div>
                              <div><span className="text-slate-500">Total:</span> <span className="font-semibold text-slate-900">{pk.total_packing_cost?.toFixed(2)}</span></div>
                              <div><span className="text-slate-500">Cost/Unit:</span> <span className="font-semibold text-emerald-700">{pk.cost_per_finished_unit?.toFixed(2)}</span></div>
                            </div>
                            {pk.additional_materials && pk.additional_materials.length > 0 && (
                              <div className="mt-2 text-xs text-slate-500">
                                {pk.additional_materials.map((m, i) => (
                                  <span key={i} className="mr-3">{m.name}: {m.quantity} x {m.cost_per_unit} = {m.total_cost}</span>
                                ))}
                              </div>
                            )}
                            {pk.additional_costs && pk.additional_costs.length > 0 && (
                              <div className="mt-2 text-xs text-amber-700">
                                {pk.additional_costs.map((c, i) => (
                                  <span key={i} className="mr-3">{c.description}: {c.amount?.toFixed(2)}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {pk.notes && (
                          <p className="text-xs text-slate-500 mt-1 italic">Note: {pk.notes}</p>
                        )}
                      </div>
                      {canModify && (
                        <div className="flex gap-2 ml-4">
                          <button data-testid={`edit-packing-${pk.id}`} onClick={() => { setShowHistoryModal(false); handleEditPacking(pk); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                          {user?.role === 'admin' && (
                            <button data-testid={`delete-packing-${pk.id}`} onClick={() => handleDeletePacking(pk.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock Ledger - Show only when product selected */}
      {!selectedProductFilter ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
          <Package className="mx-auto mb-2" size={32} />
          <p>Select a product above to view its stock ledger</p>
        </div>
      ) : loading ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
          <p>Loading...</p>
        </div>
      ) : ledgerData.length === 0 ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
          <Package className="mx-auto mb-2" size={32} />
          <p>No transactions found for {selectedProductFilter}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ledgerData.map(item => {
            const summaryItem = productSummary.find(p => p.product_name === item.product_name);
            const isExpanded = expandedProducts[item.product_name];
            return (
              <div key={item.product_name} className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
                {/* Product Summary Row */}
                <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(item.product_name)} data-testid={`toggle-${item.product_name}`}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                    <h3 className="text-lg font-semibold text-slate-900">{item.product_name}</h3>
                    <span className="text-sm text-slate-500">Current: <span className="font-semibold text-slate-700">{item.closing_stock.toFixed(2)} kg</span></span>
                  </div>
                  <div className="flex items-center gap-3">
                    {canModify && (
                      <button data-testid={`pack-btn-${item.product_name}`}
                        onClick={(e) => { e.stopPropagation(); handleOpenPackingForm(summaryItem || item); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">
                        <Plus size={15} /> Pack
                      </button>
                    )}
                    <button data-testid={`history-btn-${item.product_name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProduct(summaryItem || item);
                        fetchPackingHistory(item.product_name);
                        setShowHistoryModal(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-sm hover:bg-blue-700">
                      <History size={15} /> History
                    </button>
                  </div>
                </div>

                {/* Expanded Ledger */}
                {isExpanded && (
                  <div className="border-t border-slate-200">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Date</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Type</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Description</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">In</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Out</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-blue-50/50">
                          <td className="px-4 py-2.5 text-sm text-slate-500" colSpan={3}>Opening Stock</td>
                          <td className="px-4 py-2.5 text-sm text-right">-</td>
                          <td className="px-4 py-2.5 text-sm text-right">-</td>
                          <td className="px-4 py-2.5 text-sm text-right font-semibold">{item.opening_stock.toFixed(2)}</td>
                        </tr>
                        {item.transactions.map((t, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-sm text-slate-700">{t.date}</td>
                            <td className="px-4 py-2.5 text-sm">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                                t.type === 'Production' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>{t.type}</span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-slate-600">{t.description}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-green-600">{t.in_qty > 0 ? `+${t.in_qty.toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600">{t.out_qty > 0 ? `-${t.out_qty.toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-semibold">{t.balance.toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-semibold">
                          <td className="px-4 py-2.5 text-sm text-slate-900" colSpan={3}>Closing Stock</td>
                          <td className="px-4 py-2.5 text-sm text-right text-green-700">{item.total_in.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-red-700">{item.total_out.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-slate-900">{item.closing_stock.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default SemiFinishedProduct;
