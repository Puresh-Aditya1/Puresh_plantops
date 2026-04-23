import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Edit, Package, Filter, Calendar, Download, LayoutGrid, List, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const BatchEntry = ({ user }) => {
  const [batches, setBatches] = useState([]);
  const [editingBatch, setEditingBatch] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ start_date: '', end_date: '', product: 'all' });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const printRef = useRef(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  
  // Pagination state
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total_count: 0, total_pages: 0 });

  const [formData, setFormData] = useState({
    batch_date: new Date().toISOString().split('T')[0],
    milk_kg: '', fat_percent: '', fat_rate: '', snf_percent: '', snf_rate: '',
    output_type: 'semi-finished', product_name: '', quantity_produced: '', notes: ''
  });

  const [rawMaterials, setRawMaterials] = useState([{ name: '', quantity: '' }]);
  const [additionalCosts, setAdditionalCosts] = useState([]);
  const [rawMaterialMasters, setRawMaterialMasters] = useState([]);
  const [semiFinishedMasters, setSemiFinishedMasters] = useState([]);
  const [finishedProductMasters, setFinishedProductMasters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { fetchMasters(); fetchBatches(); }, []);

  const filteredBatches = filters.product === 'all'
    ? batches
    : batches.filter(b => b.product_name === filters.product);

  const fetchBatches = async (filterParams = null, page = 1) => {
    try {
      const token = localStorage.getItem('token');
      const params = filterParams || filters;
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      qp.append('page', page);
      qp.append('page_size', 20);
      const response = await axios.get(`${BACKEND_URL}/api/batches?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBatches(response.data.batches);
      setPagination(response.data.pagination);
    } catch (err) { console.error('Failed to fetch batches:', err); }
  };

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const [rawMatsRes, semiFinRes, finishedRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/raw-material-master`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/semi-finished-master`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-master`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setRawMaterialMasters(rawMatsRes.data);
      setSemiFinishedMasters(semiFinRes.data);
      setFinishedProductMasters(finishedRes.data);
    } catch (err) { console.error('Failed to fetch masters:', err); }
  };

  const handleApplyFilters = () => fetchBatches(filters, 1);
  const handleResetFilters = () => { const r = { start_date: '', end_date: '', product: 'all' }; setFilters(r); fetchBatches(r); };

  const handleAddMaterial = () => setRawMaterials([...rawMaterials, { name: '', quantity: '' }]);
  const handleRemoveMaterial = (index) => setRawMaterials(rawMaterials.filter((_, i) => i !== index));
  const handleMaterialChange = (index, field, value) => {
    const updated = [...rawMaterials]; updated[index][field] = value; setRawMaterials(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess(''); setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const validMaterials = rawMaterials.filter(rm => rm.name && rm.quantity);
      const validCosts = additionalCosts.filter(c => c.description && c.amount);
      const payload = {
        batch_date: formData.batch_date, milk_kg: parseFloat(formData.milk_kg) || 0,
        fat_percent: parseFloat(formData.fat_percent) || 0, fat_rate: parseFloat(formData.fat_rate) || 0,
        snf_percent: parseFloat(formData.snf_percent) || 0, snf_rate: parseFloat(formData.snf_rate) || 0,
        raw_materials: validMaterials.map(rm => rm.name),
        raw_material_quantities: validMaterials.map(rm => parseFloat(rm.quantity)),
        additional_costs: validCosts.map(c => ({ description: c.description, amount: parseFloat(c.amount) })),
        output_type: formData.output_type, product_name: formData.product_name,
        quantity_produced: parseFloat(formData.quantity_produced), notes: formData.notes
      };
      if (editingBatch) {
        await axios.put(`${BACKEND_URL}/api/batches/${editingBatch.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Batch updated successfully!');
      } else {
        await axios.post(`${BACKEND_URL}/api/batches`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Batch created successfully!');
      }
      setShowForm(false); setEditingBatch(null);
      setFormData({ batch_date: new Date().toISOString().split('T')[0], milk_kg: '', fat_percent: '', fat_rate: '', snf_percent: '', snf_rate: '', output_type: 'semi-finished', product_name: '', quantity_produced: '', notes: '' });
      setRawMaterials([{ name: '', quantity: '' }]);
      setAdditionalCosts([]);
      fetchBatches();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save batch'); }
    finally { setLoading(false); }
  };

  const handleEditBatch = (batch) => {
    setEditingBatch(batch);
    setFormData({
      batch_date: batch.date, milk_kg: batch.milk_kg, fat_percent: batch.fat_percent,
      fat_rate: batch.fat_rate || '', snf_percent: batch.snf_percent, snf_rate: batch.snf_rate || '',
      output_type: batch.output_type,
      product_name: batch.product_name, quantity_produced: batch.quantity_produced, notes: batch.notes || ''
    });
    setRawMaterials(batch.raw_materials.map(rm => ({ name: rm.name, quantity: rm.quantity })));
    setAdditionalCosts(batch.additional_costs || []);
    setShowForm(true);
  };

  const handleDeleteBatch = (batchId) => {
    setConfirmDialog({
      open: true, title: 'Delete Batch', message: 'Delete this batch? Associated stock entries will NOT be reversed automatically.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/batches/${batchId}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Batch deleted!');
          fetchBatches();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete batch'); }
      }
    });
  };

  const handleExportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredBatches.map(b => ({
      'Batch No.': b.batch_number, Date: b.date, Product: b.product_name,
      Type: b.output_type, 'Milk (kg)': b.milk_kg, 'Fat %': b.fat_percent,
      'Fat Rate/kg': b.fat_rate || 0, 'SNF %': b.snf_percent, 'SNF Rate/kg': b.snf_rate || 0,
      'Qty Produced': b.quantity_produced,
      'Milk Cost': b.milk_cost?.toFixed(2) || '0.00',
      'Other RM Cost': b.other_rm_cost?.toFixed(2) || '0.00',
      'Other Costs': b.additional_costs_total?.toFixed(2) || '0.00',
      'Total Cost': b.total_raw_material_cost?.toFixed(2) || '0.00',
      'Cost/Unit': b.cost_per_unit?.toFixed(2) || '0.00',
      'Raw Materials': b.raw_materials.map(rm => `${rm.name}: ${rm.quantity} @ ${rm.cost_per_unit}/unit`).join(', ')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batches');
    XLSX.writeFile(wb, `batches-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';
  const productMasters = formData.output_type === 'semi-finished' 
    ? semiFinishedMasters.filter(m => m.is_active !== false) 
    : finishedProductMasters.filter(m => m.is_active !== false);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    const dateRange = filters.start_date || filters.end_date
      ? `${filters.start_date || '...'} to ${filters.end_date || '...'}`
      : 'All Dates';
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Production Report - ${dateRange}</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 20px; font-size: 11px; }
      .print-header { text-align: center; margin-bottom: 18px; border-bottom: 2px solid #334155; padding-bottom: 10px; }
      .print-header h1 { font-size: 18px; font-weight: 700; }
      .print-header p { font-size: 11px; color: #64748b; margin-top: 3px; }
      .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .batch-card { border: 1.5px solid #cbd5e1; border-radius: 4px; padding: 10px 12px; page-break-inside: avoid; }
      .card-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 6px; }
      .batch-num { font-size: 12px; font-weight: 700; }
      .batch-date { font-size: 10px; color: #64748b; }
      .badge { display: inline-block; padding: 1px 6px; border-radius: 2px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
      .badge-sf { background: #dbeafe; color: #1d4ed8; }
      .badge-f { background: #dcfce7; color: #15803d; }
      .info-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 5px; }
      .info-item { flex: 1; min-width: 80px; }
      .info-label { font-size: 8px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.5px; }
      .info-value { font-size: 11px; font-weight: 500; }
      .section-title { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin: 6px 0 3px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 2px; }
      .rm-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 2px; }
      .rm-table th { text-align: left; font-size: 8px; font-weight: 600; text-transform: uppercase; color: #94a3b8; padding: 2px 4px; border-bottom: 1px solid #e2e8f0; }
      .rm-table td { padding: 2px 4px; border-bottom: 1px solid #f1f5f9; }
      .rm-table .cost-col { text-align: right; }
      .cost-box { margin-top: 6px; padding: 6px 8px; background: #f8fafc; border: 1.5px solid #0f172a; border-radius: 3px; display: flex; justify-content: space-between; align-items: center; }
      .cost-label { font-size: 9px; font-weight: 600; color: #475569; }
      .cost-value { font-size: 10px; font-weight: 500; }
      .cost-highlight { font-size: 16px; font-weight: 800; color: #0f172a; }
      .notes { font-size: 9px; color: #64748b; margin-top: 4px; font-style: italic; }
      .summary-bar { margin-top: 18px; padding: 10px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; display: flex; justify-content: space-around; text-align: center; page-break-inside: avoid; }
      .summary-item .s-label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; }
      .summary-item .s-value { font-size: 14px; font-weight: 700; }
      @media print { body { padding: 10px; } .cards-grid { gap: 10px; } }
    </style></head><body>`);
    printWindow.document.write(`<div class="print-header"><h1>Production Batch Report</h1><p>Date Range: ${dateRange} | Total Batches: ${filteredBatches.length} | Printed: ${new Date().toLocaleDateString()}</p></div>`);
    printWindow.document.write('<div class="cards-grid">');
    filteredBatches.forEach(b => {
      const fatKg = (b.fat_percent * b.milk_kg / 100).toFixed(2);
      const snfKg = (b.snf_percent * b.milk_kg / 100).toFixed(2);
      printWindow.document.write(`<div class="batch-card">
        <div class="card-header">
          <div><span class="batch-num">${b.batch_number}</span><br><span class="batch-date">${b.date}</span></div>
          <div style="text-align:right"><span class="badge ${b.output_type === 'finished' ? 'badge-f' : 'badge-sf'}">${b.output_type}</span><br><span style="font-size:11px;font-weight:600">${b.product_name}</span></div>
        </div>
        <div class="section-title">Milk Intake</div>
        <div class="info-row">
          <div class="info-item"><div class="info-label">Milk Qty</div><div class="info-value">${b.milk_kg} kg</div></div>
          <div class="info-item"><div class="info-label">Fat %</div><div class="info-value">${b.fat_percent}% (${fatKg} kg)</div></div>
          <div class="info-item"><div class="info-label">SNF %</div><div class="info-value">${b.snf_percent}% (${snfKg} kg)</div></div>
          <div class="info-item"><div class="info-label">Fat Rate</div><div class="info-value">${b.fat_rate || 0}/kg</div></div>
          <div class="info-item"><div class="info-label">SNF Rate</div><div class="info-value">${b.snf_rate || 0}/kg</div></div>
        </div>
        <div class="section-title">Raw Materials Used</div>
        <table class="rm-table"><thead><tr><th>Material</th><th>Qty</th><th class="cost-col">Rate</th><th class="cost-col">Cost</th></tr></thead><tbody>
          <tr><td>Milk</td><td>${b.milk_kg} kg</td><td class="cost-col">-</td><td class="cost-col">${(b.milk_cost || 0).toFixed(2)}</td></tr>
          ${b.raw_materials.map(rm => `<tr><td>${rm.name}</td><td>${rm.quantity}</td><td class="cost-col">${(rm.cost_per_unit || 0).toFixed(2)}</td><td class="cost-col">${(rm.quantity * (rm.cost_per_unit || 0)).toFixed(2)}</td></tr>`).join('')}
        </tbody></table>
        <div class="info-row" style="margin-top:4px"><div class="info-item"><div class="info-label">Output</div><div class="info-value">${b.product_name} - ${b.quantity_produced} units</div></div></div>
        <div class="cost-box">
          <div><div class="cost-label">Milk Cost</div><div class="cost-value">${(b.milk_cost || 0).toFixed(2)}</div></div>
          <div><div class="cost-label">RM Cost</div><div class="cost-value">${(b.other_rm_cost || 0).toFixed(2)}</div></div>
          <div><div class="cost-label">Total Cost</div><div class="cost-value">${(b.total_raw_material_cost || 0).toFixed(2)}</div></div>
          <div><div class="cost-label">Cost / Unit</div><div class="cost-highlight">${(b.cost_per_unit || 0).toFixed(2)}</div></div>
        </div>
        ${b.notes ? `<div class="notes">Note: ${b.notes}</div>` : ''}
      </div>`);
    });
    printWindow.document.write('</div>');
    const totalCost = filteredBatches.reduce((s, b) => s + (b.total_raw_material_cost || 0), 0);
    const totalQty = filteredBatches.reduce((s, b) => s + (b.quantity_produced || 0), 0);
    const totalMilk = filteredBatches.reduce((s, b) => s + (b.milk_kg || 0), 0);
    printWindow.document.write(`<div class="summary-bar">
      <div class="summary-item"><div class="s-label">Total Batches</div><div class="s-value">${filteredBatches.length}</div></div>
      <div class="summary-item"><div class="s-label">Total Milk Used</div><div class="s-value">${totalMilk.toFixed(1)} kg</div></div>
      <div class="summary-item"><div class="s-label">Total Produced</div><div class="s-value">${totalQty.toFixed(1)}</div></div>
      <div class="summary-item"><div class="s-label">Total Cost</div><div class="s-value">${totalCost.toFixed(2)}</div></div>
    </div>`);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Batch Entry</h1>
          <p className="text-slate-600">Create and manage production batches</p>
        </div>
        <div className="flex gap-3">
          <div className="flex border border-slate-300 rounded-sm overflow-hidden">
            <button data-testid="table-view-btn" onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'table' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              <List size={16} /> Table
            </button>
            <button data-testid="card-view-btn" onClick={() => setViewMode('card')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'card' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
              <LayoutGrid size={16} /> Cards
            </button>
          </div>
          {viewMode === 'card' && filteredBatches.length > 0 && (
            <button data-testid="print-batches-btn" onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white font-medium rounded-sm hover:bg-violet-700">
              <Printer size={18} /> Print
            </button>
          )}
          <button data-testid="export-excel-btn" onClick={handleExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
            <Download size={18} /> Export
          </button>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700">
            <Filter size={18} /> {showFilters ? 'Hide Filters' : 'Filter'}
          </button>
          {canModify && (
            <button data-testid="create-batch-btn" onClick={() => {
              setShowForm(true); setEditingBatch(null);
              setFormData({ batch_date: new Date().toISOString().split('T')[0], milk_kg: '', fat_percent: '', fat_rate: '', snf_percent: '', snf_rate: '', output_type: 'semi-finished', product_name: '', quantity_produced: '', notes: '' });
              setRawMaterials([{ name: '', quantity: '' }]);
              setAdditionalCosts([]);
            }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
              <Plus size={18} /> Create Batch
            </button>
          )}
        </div>
      </div>

      {success && <div data-testid="batch-success" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}
      {error && <div data-testid="batch-error" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}

      {/* Date Filter */}
      {showFilters && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Product</label>
              <SearchableSelect
                testId="batch-filter-product"
                value={filters.product === 'all' ? '' : filters.product}
                onChange={(val) => setFilters({ ...filters, product: val || 'all' })}
                placeholder="All Products"
                searchPlaceholder="Search products..."
                options={[...new Set(batches.map(b => b.product_name))].sort().map(name => ({ value: name, label: name }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input data-testid="batch-filter-start" type="date" value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input data-testid="batch-filter-end" type="date" value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
          </div>
          <div className="flex gap-3">
            <button data-testid="apply-batch-filter" onClick={handleApplyFilters}
              className="px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">Apply</button>
            <button data-testid="reset-batch-filter" onClick={handleResetFilters}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      )}

      {/* Batch List - Table View */}
      {viewMode === 'table' && (
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Batches ({pagination.total_count})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Batch No.</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Date</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Product</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Type</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Milk (kg)</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat %</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF %</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Qty Produced</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Milk Cost</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Other RM Cost</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Total Cost</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Cost/Unit</th>
                {canModify && (
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={canModify ? "13" : "12"} className="px-4 py-8 text-center text-slate-500">
                    <Package className="mx-auto mb-2" size={32} />
                    <p>No batches found. {showFilters ? 'Try adjusting filters.' : 'Create your first batch!'}</p>
                  </td>
                </tr>
              ) : (
                filteredBatches.map(batch => (
                  <tr key={batch.id} data-testid={`batch-row-${batch.id}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 font-mono">{batch.batch_number}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{batch.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{batch.product_name}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${batch.output_type === 'finished' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {batch.output_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.milk_kg}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.fat_percent}%</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.snf_percent}%</td>
                    <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-semibold">{batch.quantity_produced}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.milk_cost?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.other_rm_cost?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{batch.total_raw_material_cost?.toFixed(2) || '0.00'}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-semibold">{batch.cost_per_unit?.toFixed(2) || '0.00'}</td>
                    {canModify && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button data-testid={`edit-batch-${batch.id}`} onClick={() => handleEditBatch(batch)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm transition-colors" title="Edit">
                            <Edit size={16} />
                          </button>
                          {user?.role === 'admin' && (
                            <button data-testid={`delete-batch-${batch.id}`} onClick={() => handleDeleteBatch(batch.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm transition-colors" title="Delete">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pagination Controls */}
      {pagination.total_pages > 1 && (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-sm px-4 py-3 mt-4">
          <div className="text-sm text-slate-600">
            Showing {((pagination.page - 1) * pagination.page_size) + 1} - {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count} batches
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchBatches(filters, pagination.page - 1)}
              disabled={pagination.page <= 1}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm border ${pagination.page <= 1 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                let pageNum;
                if (pagination.total_pages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= pagination.total_pages - 2) {
                  pageNum = pagination.total_pages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => fetchBatches(filters, pageNum)}
                    className={`w-8 h-8 text-sm font-medium rounded-sm ${pagination.page === pageNum ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'}`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => fetchBatches(filters, pagination.page + 1)}
              disabled={pagination.page >= pagination.total_pages}
              className={`px-3 py-1.5 text-sm font-medium rounded-sm border ${pagination.page >= pagination.total_pages ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Batch List - Card View */}
      {viewMode === 'card' && (
      <div ref={printRef}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Batches ({pagination.total_count})</h2>
          {filteredBatches.length > 0 && (
            <div className="flex gap-4 text-sm text-slate-500">
              <span>Total Milk: <strong className="text-slate-900">{filteredBatches.reduce((s, b) => s + (b.milk_kg || 0), 0).toFixed(1)} kg</strong></span>
              <span>Total Produced: <strong className="text-slate-900">{filteredBatches.reduce((s, b) => s + (b.quantity_produced || 0), 0).toFixed(1)}</strong></span>
              <span>Total Cost: <strong className="text-slate-900">{filteredBatches.reduce((s, b) => s + (b.total_raw_material_cost || 0), 0).toFixed(2)}</strong></span>
            </div>
          )}
        </div>
        {filteredBatches.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-sm p-8 text-center text-slate-500">
            <Package className="mx-auto mb-2" size={32} />
            <p>No batches found. {showFilters ? 'Try adjusting filters.' : 'Create your first batch!'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredBatches.map(batch => {
              const fatKg = (batch.fat_percent * batch.milk_kg / 100).toFixed(2);
              const snfKg = (batch.snf_percent * batch.milk_kg / 100).toFixed(2);
              return (
                <div key={batch.id} data-testid={`batch-card-${batch.id}`}
                  className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div>
                      <span className="font-mono text-sm font-bold text-slate-900">{batch.batch_number}</span>
                      <span className="ml-3 text-sm text-slate-500">{batch.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-sm ${batch.output_type === 'finished' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {batch.output_type}
                      </span>
                      {canModify && (
                        <div className="flex gap-1 ml-1">
                          <button data-testid={`card-edit-batch-${batch.id}`} onClick={() => handleEditBatch(batch)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded-sm"><Edit size={14} /></button>
                          {user?.role === 'admin' && (
                            <button data-testid={`card-delete-batch-${batch.id}`} onClick={() => handleDeleteBatch(batch.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded-sm"><Trash2 size={14} /></button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    {/* Product Output */}
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-slate-900">{batch.product_name}</span>
                      <span className="text-sm font-medium text-slate-700">Qty: <strong>{batch.quantity_produced}</strong></span>
                    </div>

                    {/* Milk Intake Section */}
                    {batch.milk_kg > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Milk Intake</p>
                      <div className="grid grid-cols-5 gap-2 text-xs">
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">Qty</div>
                          <div className="font-semibold text-slate-800">{batch.milk_kg} kg</div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">Fat</div>
                          <div className="font-semibold text-slate-800">{batch.fat_percent}% <span className="text-slate-500">({fatKg} kg)</span></div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">SNF</div>
                          <div className="font-semibold text-slate-800">{batch.snf_percent}% <span className="text-slate-500">({snfKg} kg)</span></div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">Fat Rate</div>
                          <div className="font-semibold text-slate-800">{batch.fat_rate || 0}/kg</div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">SNF Rate</div>
                          <div className="font-semibold text-slate-800">{batch.snf_rate || 0}/kg</div>
                        </div>
                      </div>
                    </div>
                    )}

                    {/* Raw Materials Table */}
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Raw Materials Used</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200">
                            <th className="text-left py-1 text-[9px] font-semibold uppercase text-slate-400">Material</th>
                            <th className="text-right py-1 text-[9px] font-semibold uppercase text-slate-400">Qty</th>
                            <th className="text-right py-1 text-[9px] font-semibold uppercase text-slate-400">Rate</th>
                            <th className="text-right py-1 text-[9px] font-semibold uppercase text-slate-400">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {batch.milk_kg > 0 && (
                          <tr className="border-b border-slate-100">
                            <td className="py-1 text-slate-700 font-medium">Milk</td>
                            <td className="py-1 text-right text-slate-600 tabular-nums">{batch.milk_kg} kg</td>
                            <td className="py-1 text-right text-slate-500 tabular-nums">-</td>
                            <td className="py-1 text-right text-slate-800 font-medium tabular-nums">{(batch.milk_cost || 0).toFixed(2)}</td>
                          </tr>
                          )}
                          {batch.raw_materials.map((rm, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                              <td className="py-1 text-slate-700 font-medium">{rm.name}</td>
                              <td className="py-1 text-right text-slate-600 tabular-nums">{rm.quantity}</td>
                              <td className="py-1 text-right text-slate-500 tabular-nums">{(rm.cost_per_unit || 0).toFixed(2)}</td>
                              <td className="py-1 text-right text-slate-800 font-medium tabular-nums">{(rm.quantity * (rm.cost_per_unit || 0)).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Other Costs */}
                    {batch.additional_costs && batch.additional_costs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Other Costs</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-1 text-[9px] font-semibold uppercase text-slate-400">Description</th>
                              <th className="text-right py-1 text-[9px] font-semibold uppercase text-slate-400">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.additional_costs.map((ac, idx) => (
                              <tr key={idx} className="border-b border-slate-100">
                                <td className="py-1 text-slate-700 font-medium">{ac.description}</td>
                                <td className="py-1 text-right text-slate-800 font-medium tabular-nums">{(ac.amount || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-slate-200">
                              <td className="py-1 text-slate-500 font-semibold text-right">Total Other Costs</td>
                              <td className="py-1 text-right text-slate-900 font-bold tabular-nums">{(batch.additional_costs_total || 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Cost Summary with highlighted Cost/Unit */}
                    <div className="flex items-stretch gap-2">
                      <div className="flex-1 grid grid-cols-4 gap-1.5 text-xs">
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5 text-center">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">Milk Cost</div>
                          <div className="font-semibold text-slate-700 tabular-nums">{(batch.milk_cost || 0).toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5 text-center">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">RM Cost</div>
                          <div className="font-semibold text-slate-700 tabular-nums">{(batch.other_rm_cost || 0).toFixed(2)}</div>
                        </div>
                        <div className="bg-amber-50 rounded-sm px-2 py-1.5 text-center">
                          <div className="text-[9px] text-amber-500 font-semibold uppercase">Other Costs</div>
                          <div className="font-semibold text-amber-700 tabular-nums">{(batch.additional_costs_total || 0).toFixed(2)}</div>
                        </div>
                        <div className="bg-slate-50 rounded-sm px-2 py-1.5 text-center">
                          <div className="text-[9px] text-slate-400 font-semibold uppercase">Total</div>
                          <div className="font-semibold text-slate-700 tabular-nums">{(batch.total_raw_material_cost || 0).toFixed(2)}</div>
                        </div>
                      </div>
                      <div data-testid={`batch-cost-highlight-${batch.id}`}
                        className="bg-slate-900 text-white rounded-sm px-4 py-2 flex flex-col items-center justify-center min-w-[100px]">
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Cost/Unit</div>
                        <div className="text-xl font-extrabold tabular-nums">{(batch.cost_per_unit || 0).toFixed(2)}</div>
                      </div>
                    </div>

                    {batch.notes && (
                      <p className="text-xs text-slate-500 italic">Note: {batch.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Batch Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-4xl w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingBatch ? 'Edit Batch' : 'Create New Batch'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">Batch Information</h3>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Batch Date</label>
                  <input data-testid="batch-date-input" type="date" value={formData.batch_date}
                    onChange={(e) => setFormData({ ...formData, batch_date: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                  <p className="text-xs text-slate-500 mt-1">Raw material rates will be fetched based on this date</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">Milk Intake <span className="text-xs font-normal text-slate-400">(Optional - leave blank if no milk used)</span></h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Milk Quantity (kg)</label>
                    <input data-testid="milk-kg-input" type="number" step="0.01" value={formData.milk_kg}
                      onChange={(e) => setFormData({ ...formData, milk_kg: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fat %</label>
                    <input data-testid="fat-percent-input" type="number" step="0.01" value={formData.fat_percent}
                      onChange={(e) => setFormData({ ...formData, fat_percent: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fat Rate (per kg)</label>
                    <input data-testid="fat-rate-input" type="number" step="0.01" value={formData.fat_rate}
                      onChange={(e) => setFormData({ ...formData, fat_rate: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SNF %</label>
                    <input data-testid="snf-percent-input" type="number" step="0.01" value={formData.snf_percent}
                      onChange={(e) => setFormData({ ...formData, snf_percent: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" placeholder="0" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SNF Rate (per kg)</label>
                    <input data-testid="snf-rate-input" type="number" step="0.01" value={formData.snf_rate}
                      onChange={(e) => setFormData({ ...formData, snf_rate: e.target.value })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" placeholder="0" />
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Raw Materials <span className="text-xs font-normal text-slate-400">(Optional)</span></h3>
                  <button data-testid="add-material-btn" type="button" onClick={handleAddMaterial}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">
                    <Plus size={16} /> Add Material
                  </button>
                </div>
                <div className="space-y-3">
                  {rawMaterials.map((material, index) => (
                    <div key={index} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material Name</label>
                        <SearchableSelect
                          testId={`material-name-${index}`}
                          value={material.name}
                          onChange={(val) => handleMaterialChange(index, 'name', val)}
                          placeholder="Select material..."
                          searchPlaceholder="Search materials..."
                          options={rawMaterialMasters.filter(m => m.is_active !== false).map(m => ({ value: m.name, label: m.name }))}
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity</label>
                        <input data-testid={`material-quantity-${index}`} type="number" step="0.01" value={material.quantity}
                          onChange={(e) => handleMaterialChange(index, 'quantity', e.target.value)} placeholder="Quantity"
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                      </div>
                      {rawMaterials.length > 1 && (
                        <button data-testid={`remove-material-${index}`} type="button" onClick={() => handleRemoveMaterial(index)}
                          className="h-10 px-3 bg-red-600 text-white rounded-sm hover:bg-red-700"><Trash2 size={16} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Other Costs */}
              <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-base font-semibold text-slate-900">Other Costs <span className="text-xs font-normal text-slate-400">(Optional)</span></h3>
                  <button data-testid="add-cost-btn" type="button" onClick={() => setAdditionalCosts([...additionalCosts, { description: '', amount: '' }])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                    <Plus size={14} /> Add Cost
                  </button>
                </div>
                {additionalCosts.length === 0 ? (
                  <p className="text-sm text-slate-400">No additional costs. Click "Add Cost" for labor, electricity, fuel, etc.</p>
                ) : (
                  <div className="space-y-3">
                    {additionalCosts.map((cost, idx) => (
                      <div key={idx} className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
                          <input data-testid={`cost-desc-${idx}`} type="text" value={cost.description}
                            onChange={(e) => { const u = [...additionalCosts]; u[idx] = { ...u[idx], description: e.target.value }; setAdditionalCosts(u); }}
                            placeholder="e.g., Labour, Electricity, Fuel"
                            className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                        </div>
                        <div className="w-36">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount</label>
                          <input data-testid={`cost-amount-${idx}`} type="number" step="0.01" value={cost.amount}
                            onChange={(e) => { const u = [...additionalCosts]; u[idx] = { ...u[idx], amount: e.target.value }; setAdditionalCosts(u); }}
                            placeholder="0.00"
                            className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                        </div>
                        <button type="button" onClick={() => setAdditionalCosts(additionalCosts.filter((_, i) => i !== idx))}
                          className="h-10 px-2 text-red-500 hover:text-red-700"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">Output</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Output Type</label>
                    <select data-testid="output-type-select" value={formData.output_type}
                      onChange={(e) => setFormData({ ...formData, output_type: e.target.value, product_name: '' })}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900">
                      <option value="semi-finished">Semi-Finished</option>
                      <option value="finished">Finished</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Product Name</label>
                    <SearchableSelect
                      testId="product-name-select"
                      value={formData.product_name}
                      onChange={(val) => setFormData({ ...formData, product_name: val })}
                      placeholder="Select product..."
                      searchPlaceholder="Search products..."
                      options={productMasters.map(m => ({
                        value: formData.output_type === 'semi-finished' ? m.name : m.sku_name,
                        label: formData.output_type === 'semi-finished' ? m.name : m.sku_name
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity Produced</label>
                    <input data-testid="quantity-produced-input" type="number" step="0.01" value={formData.quantity_produced}
                      onChange={(e) => setFormData({ ...formData, quantity_produced: e.target.value })} required placeholder="Quantity"
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                  <textarea data-testid="notes-input" value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>

              <div className="flex gap-3">
                <button data-testid="submit-batch-btn" type="submit" disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 disabled:opacity-50">
                  <Save size={18} /> {loading ? 'Saving...' : (editingBatch ? 'Update Batch' : 'Create Batch')}
                </button>
                <button data-testid="cancel-batch-btn" type="button" onClick={() => { setShowForm(false); setEditingBatch(null); }}
                  className="px-6 py-2.5 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default BatchEntry;
