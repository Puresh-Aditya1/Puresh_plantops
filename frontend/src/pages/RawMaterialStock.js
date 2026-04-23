import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Plus, Filter, Calendar, Edit, Trash2, ChevronDown, ChevronRight, TrendingUp, TrendingDown, PackageMinus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const RawMaterialStock = ({ user }) => {
  const [ledgerData, setLedgerData] = useState([]);
  const [rawMaterialMasters, setRawMaterialMasters] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [editingAdj, setEditingAdj] = useState(null);
  const [expandedMaterials, setExpandedMaterials] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [formData, setFormData] = useState({
    name: '', date: new Date().toISOString().split('T')[0], purchased: ''
  });
  const [adjFormData, setAdjFormData] = useState({
    material_name: '', date: new Date().toISOString().split('T')[0], type: 'loss', quantity: '', notes: ''
  });
  const [adjEntries, setAdjEntries] = useState([]);
  const [showConsumptionForm, setShowConsumptionForm] = useState(false);
  const [editingConsumption, setEditingConsumption] = useState(null);
  const [consumptionEntries, setConsumptionEntries] = useState([]);
  const [consumptionForm, setConsumptionForm] = useState({
    material_name: '', quantity: '', consumption_date: new Date().toISOString().split('T')[0], reason: '', notes: ''
  });

  const [filters, setFilters] = useState({ material: 'all', start_date: '', end_date: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('ledger');
  const [duFilter, setDuFilter] = useState({ material: 'all', start_date: '', end_date: '' });

  const filteredConsumptionEntries = consumptionEntries.filter(dc => {
    if (duFilter.material !== 'all' && dc.material_name !== duFilter.material) return false;
    if (duFilter.start_date && dc.date < duFilter.start_date) return false;
    if (duFilter.end_date && dc.date > duFilter.end_date) return false;
    return true;
  });

  useEffect(() => {
    fetchMasters();
    fetchLedger();
    fetchAdjEntries();
    fetchConsumptionEntries();
  }, []);

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/raw-material-master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRawMaterialMasters(res.data);
    } catch (err) { console.error('Failed to fetch masters:', err); }
  };

  const fetchLedger = async (filterParams = null) => {
    try {
      const token = localStorage.getItem('token');
      const params = filterParams || filters;
      const qp = new URLSearchParams();
      if (params.material && params.material !== 'all') qp.append('material', params.material);
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);

      const res = await axios.get(`${BACKEND_URL}/api/reports/raw-material-ledger?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLedgerData(res.data);
    } catch (err) { console.error('Failed to fetch ledger:', err); }
    finally { setLoading(false); }
  };

  const handleApplyFilters = () => { setLoading(true); fetchLedger(filters); };
  const handleResetFilters = () => {
    const r = { material: 'all', start_date: '', end_date: '' };
    setFilters(r); setLoading(true); fetchLedger(r);
  };

  const toggleExpand = (name) => {
    setExpandedMaterials(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { name: formData.name, date: formData.date, purchased: parseFloat(formData.purchased) };
      if (editingStock) {
        await axios.put(`${BACKEND_URL}/api/raw-material-stock/${editingStock.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Stock entry updated successfully!');
      } else {
        await axios.post(`${BACKEND_URL}/api/raw-material-stock`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Stock entry created successfully!');
      }
      setShowCreateForm(false); setEditingStock(null);
      setFormData({ name: '', date: new Date().toISOString().split('T')[0], purchased: '' });
      fetchLedger();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save stock entry'); }
  };

  const handleEditStock = (stock) => {
    setEditingStock(stock);
    setFormData({ name: stock.name, date: stock.date, purchased: stock.purchased });
    setShowCreateForm(true);
  };

  const handleDeleteStock = (stockId) => {
    setConfirmDialog({
      open: true, title: 'Delete Stock Entry', message: 'Delete this stock entry?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/raw-material-stock/${stockId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess('Stock entry deleted!');
          fetchLedger();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete stock entry'); }
      }
    });
  };

  const fetchAdjEntries = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/rm-adjustment`, { headers: { Authorization: `Bearer ${token}` } });
      setAdjEntries(res.data);
    } catch (err) { console.error(err); }
  };

  const handleAdjSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { material_name: adjFormData.material_name, date: adjFormData.date, type: adjFormData.type,
        quantity: parseFloat(adjFormData.quantity), notes: adjFormData.notes };
      if (editingAdj) {
        await axios.put(`${BACKEND_URL}/api/rm-adjustment/${editingAdj.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Adjustment updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/rm-adjustment`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Adjustment recorded!');
      }
      setShowAdjForm(false); setEditingAdj(null);
      setAdjFormData({ material_name: '', date: new Date().toISOString().split('T')[0], type: 'loss', quantity: '', notes: '' });
      fetchLedger(); fetchAdjEntries();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save adjustment'); }
  };

  const handleEditAdj = (entry) => {
    setEditingAdj(entry);
    setAdjFormData({ material_name: entry.material_name, date: entry.date, type: entry.type, quantity: entry.quantity, notes: entry.notes || '' });
    setShowAdjForm(true);
  };

  const handleDeleteAdj = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Adjustment', message: 'Delete this adjustment?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/rm-adjustment/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Adjustment deleted!'); fetchLedger(); fetchAdjEntries();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  // ========== DIRECT CONSUMPTION ==========
  const fetchConsumptionEntries = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/rm-direct-consumption`, { headers: { Authorization: `Bearer ${token}` } });
      setConsumptionEntries(res.data);
    } catch (err) { console.error(err); }
  };

  const handleConsumptionSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { material_name: consumptionForm.material_name, quantity: parseFloat(consumptionForm.quantity), consumption_date: consumptionForm.consumption_date, reason: consumptionForm.reason, notes: consumptionForm.notes };
      if (editingConsumption) {
        await axios.put(`${BACKEND_URL}/api/rm-direct-consumption/${editingConsumption.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Consumption updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/rm-direct-consumption`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Consumption recorded!');
      }
      setShowConsumptionForm(false); setEditingConsumption(null);
      setConsumptionForm({ material_name: '', quantity: '', consumption_date: new Date().toISOString().split('T')[0], reason: '', notes: '' });
      fetchLedger(); fetchConsumptionEntries();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save consumption'); }
  };

  const handleEditConsumption = (entry) => {
    setEditingConsumption(entry);
    setConsumptionForm({ material_name: entry.material_name, quantity: entry.quantity, consumption_date: entry.date, reason: entry.reason, notes: entry.notes || '' });
    setShowConsumptionForm(true);
  };

  const handleDeleteConsumption = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Consumption', message: 'Delete this consumption entry?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/rm-direct-consumption/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Consumption deleted!'); fetchLedger(); fetchConsumptionEntries();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExportToExcel = () => {
    if (ledgerData.length === 0) {
      toast.error('No data to export. Please select a material first.');
      return;
    }
    const wb = XLSX.utils.book_new();
    ledgerData.forEach(item => {
      const rows = [
        { Date: '', Type: 'Opening Stock', In: '', Out: '', Balance: item.opening_stock },
        ...item.transactions.map(t => ({
          Date: t.date, Type: t.type, Description: t.description,
          In: t.in_qty || '', Out: t.out_qty || '', Balance: t.balance,
          'Cost/Unit': t.cost_per_unit || ''
        })),
        { Date: '', Type: 'Closing Stock', In: item.total_in, Out: item.total_out, Balance: item.closing_stock }
      ];
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, item.material_name.substring(0, 31));
    });
    XLSX.writeFile(wb, `raw-material-ledger-${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportMenu(false);
  };

  const handleExportSummary = () => {
    if (ledgerData.length === 0) {
      toast.error('No data to export.');
      return;
    }
    const wb = XLSX.utils.book_new();
    const rows = ledgerData.map(item => ({
      Material: item.material_name,
      Unit: item.unit || 'kg',
      Opening: item.opening_stock,
      Purchased: item.total_in,
      Used: item.total_out,
      'Gain/Loss': item.total_adjustment || 0,
      Closing: item.closing_stock
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'RM Summary');
    XLSX.writeFile(wb, `raw-material-summary-${new Date().toISOString().split('T')[0]}.xlsx`);
    setShowExportMenu(false);
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';

  if (loading) return <div className="text-slate-600">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Raw Material Stock</h1>
          <p className="text-slate-600">Stock ledger with purchase and batch usage details</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <button data-testid="export-excel-btn" onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
              <Download size={18} /> Export Excel <ChevronDown size={14} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 shadow-lg rounded-sm z-50">
                <button data-testid="export-summary-btn" onClick={handleExportSummary}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100">
                  Summary (All Materials)
                </button>
                <button data-testid="export-detailed-btn" onClick={handleExportToExcel}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50">
                  Detailed (Per Material Sheet)
                </button>
              </div>
            )}
          </div>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700">
            <Filter size={18} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {canModify && (
            <>
              <button data-testid="add-rm-adjustment-btn" onClick={() => {
                setShowAdjForm(true); setEditingAdj(null);
                setAdjFormData({ material_name: '', date: new Date().toISOString().split('T')[0], type: 'loss', quantity: '', notes: '' });
              }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-medium rounded-sm hover:bg-amber-700">
                <TrendingDown size={18} /> Gain / Loss
              </button>
              <button data-testid="add-rm-consumption-btn" onClick={() => {
                setShowConsumptionForm(true); setEditingConsumption(null);
                setConsumptionForm({ material_name: '', quantity: '', consumption_date: new Date().toISOString().split('T')[0], reason: '', notes: '' });
              }} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700">
                <PackageMinus size={18} /> Direct Use
              </button>
              <button data-testid="create-stock-btn" onClick={() => { setShowCreateForm(true); setEditingStock(null); setFormData({ name: '', date: new Date().toISOString().split('T')[0], purchased: '' }); }}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
                <Plus size={18} /> Add Purchase
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}
      {success && <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}

      {/* Tabs */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
        <div className="flex border-b border-slate-200">
          <button onClick={() => setActiveTab('ledger')} data-testid="tab-ledger"
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'ledger' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
            Stock Ledger
          </button>
          <button onClick={() => setActiveTab('direct-use')} data-testid="tab-direct-use"
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'direct-use' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}>
            Direct Use ({consumptionEntries.length})
          </button>
        </div>
      </div>

      {activeTab === 'ledger' && (<>
      {/* Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material</label>
              <select data-testid="material-filter" value={filters.material}
                onChange={(e) => setFilters({ ...filters, material: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900">
                <option value="all">All Materials</option>
                {rawMaterialMasters.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
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

      {/* Direct Consumption Entries - moved to own tab */}
      </>)}

      {/* Modals - rendered outside tabs so they work from any tab */}
      {/* Add/Edit Stock Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingStock ? 'Edit Purchase Entry' : 'Add Purchase Entry'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material Name</label>
                <SearchableSelect
                  testId="material-name-select"
                  value={formData.name}
                  onChange={(val) => setFormData({ ...formData, name: val })}
                  placeholder="Select material..."
                  searchPlaceholder="Search materials..."
                  options={rawMaterialMasters.filter(m => m.is_active !== false).map(m => ({ value: m.name, label: `${m.name} (${m.unit})` }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                <input data-testid="date-input" type="date" value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })} required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity Purchased</label>
                <input data-testid="purchased-input" type="number" step="0.01" value={formData.purchased}
                  onChange={(e) => setFormData({ ...formData, purchased: e.target.value })} required placeholder="Quantity purchased"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                <p className="text-xs text-slate-500 mt-1">Cost/unit auto-fetched from master by date</p>
              </div>
              <div className="flex gap-3">
                <button data-testid="submit-stock-btn" type="submit" className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
                  {editingStock ? 'Update' : 'Create'}
                </button>
                <button data-testid="cancel-stock-btn" type="button"
                  onClick={() => { setShowCreateForm(false); setEditingStock(null); }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit RM Adjustment Modal */}
      {showAdjForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">{editingAdj ? 'Edit Adjustment' : 'Record Gain / Loss'}</h2>
            <p className="text-sm text-slate-500 mb-4">Adjust raw material stock to match physical count</p>
            <form onSubmit={handleAdjSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material Name</label>
                <SearchableSelect
                  testId="adj-material-select"
                  value={adjFormData.material_name}
                  onChange={(val) => setAdjFormData({ ...adjFormData, material_name: val })}
                  placeholder="Select material..."
                  searchPlaceholder="Search materials..."
                  options={rawMaterialMasters.filter(m => m.is_active !== false).map(m => ({ value: m.name, label: `${m.name} (${m.unit})` }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input data-testid="adj-date-input" type="date" value={adjFormData.date}
                    onChange={(e) => setAdjFormData({ ...adjFormData, date: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                  <div className="flex gap-2">
                    <button type="button" data-testid="rm-adj-type-gain" onClick={() => setAdjFormData({ ...adjFormData, type: 'gain' })}
                      className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-sm font-medium text-sm border transition-colors ${
                        adjFormData.type === 'gain' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                      <TrendingUp size={16} /> Gain
                    </button>
                    <button type="button" data-testid="rm-adj-type-loss" onClick={() => setAdjFormData({ ...adjFormData, type: 'loss' })}
                      className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-sm font-medium text-sm border transition-colors ${
                        adjFormData.type === 'loss' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                      <TrendingDown size={16} /> Loss
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity</label>
                <input data-testid="adj-qty-input" type="number" step="0.01" min="0.01" value={adjFormData.quantity}
                  onChange={(e) => setAdjFormData({ ...adjFormData, quantity: e.target.value })} required
                  className={`w-full h-10 px-3 bg-white border rounded-sm focus:outline-none focus:ring-1 text-slate-900 ${
                    adjFormData.type === 'gain' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reason / Notes</label>
                <input data-testid="adj-notes-input" type="text" value={adjFormData.notes}
                  onChange={(e) => setAdjFormData({ ...adjFormData, notes: e.target.value })}
                  placeholder="e.g. Physical count correction, spillage..."
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="flex gap-3">
                <button data-testid="submit-adj-btn" type="submit"
                  className={`flex-1 h-10 text-white font-medium rounded-sm ${adjFormData.type === 'gain' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {editingAdj ? 'Update' : `Record ${adjFormData.type === 'gain' ? 'Gain' : 'Loss'}`}
                </button>
                <button type="button" onClick={() => { setShowAdjForm(false); setEditingAdj(null); }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Consumption Form Modal */}
      {showConsumptionForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-lg w-full p-6 my-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">{editingConsumption ? 'Edit Direct Use' : 'Record Direct Use'}</h2>
            <p className="text-sm text-slate-500 mb-4">Stock out raw material without attaching to any batch</p>
            <form onSubmit={handleConsumptionSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material</label>
                  <SearchableSelect
                    testId="consumption-material-select"
                    value={consumptionForm.material_name}
                    onChange={(val) => setConsumptionForm({ ...consumptionForm, material_name: val })}
                    placeholder="Select material..."
                    searchPlaceholder="Search materials..."
                    options={rawMaterialMasters.filter(m => m.is_active !== false).map(m => ({ value: m.name, label: m.name }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity</label>
                  <input data-testid="consumption-qty-input" type="number" step="0.01" value={consumptionForm.quantity}
                    onChange={(e) => setConsumptionForm({ ...consumptionForm, quantity: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reason / Cause</label>
                  <input data-testid="consumption-reason-input" type="text" value={consumptionForm.reason}
                    onChange={(e) => setConsumptionForm({ ...consumptionForm, reason: e.target.value })} required
                    placeholder="e.g., Cleaning, Daily use, Expired"
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                  <input data-testid="consumption-date-input" type="date" value={consumptionForm.consumption_date}
                    onChange={(e) => setConsumptionForm({ ...consumptionForm, consumption_date: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                <textarea data-testid="consumption-notes-input" value={consumptionForm.notes}
                  onChange={(e) => setConsumptionForm({ ...consumptionForm, notes: e.target.value })} rows={2}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="flex gap-3">
                <button data-testid="submit-consumption-btn" type="submit" className="flex-1 h-10 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700">
                  {editingConsumption ? 'Update' : 'Record Direct Use'}
                </button>
                <button type="button" onClick={() => { setShowConsumptionForm(false); setEditingConsumption(null); }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'direct-use' && (
        <>
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Material</label>
              <select data-testid="du-material-filter" value={duFilter.material}
                onChange={(e) => setDuFilter({ ...duFilter, material: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900">
                <option value="all">All Materials</option>
                {rawMaterialMasters.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input type="date" data-testid="du-start-date" value={duFilter.start_date}
                onChange={(e) => setDuFilter({ ...duFilter, start_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input type="date" data-testid="du-end-date" value={duFilter.end_date}
                onChange={(e) => setDuFilter({ ...duFilter, end_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
          </div>
          {(duFilter.material !== 'all' || duFilter.start_date || duFilter.end_date) && (
            <button onClick={() => setDuFilter({ material: 'all', start_date: '', end_date: '' })}
              className="mt-3 text-sm text-blue-600 hover:underline">Clear filters</button>
          )}
        </div>
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Direct Use Entries ({filteredConsumptionEntries.length})</h2>
          </div>
          {filteredConsumptionEntries.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No direct use entries found.</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Date</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Material</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Quantity</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Reason</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Notes</th>
                {canModify && <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>}
              </tr></thead>
              <tbody>
                {filteredConsumptionEntries.map(dc => (
                  <tr key={dc.id} data-testid={`consumption-${dc.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{dc.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{dc.material_name}</td>
                    <td className="px-4 py-3 text-sm text-red-600 tabular-nums text-right font-semibold">{dc.quantity} {dc.unit}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{dc.reason}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 truncate max-w-[200px]">{dc.notes || '-'}</td>
                    {canModify && (<td className="px-4 py-3"><div className="flex items-center justify-center gap-2">
                      <button data-testid={`edit-consumption-${dc.id}`} onClick={() => handleEditConsumption(dc)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm" title="Edit"><Edit size={16} /></button>
                      {user?.role === 'admin' && <button data-testid={`delete-consumption-${dc.id}`} onClick={() => handleDeleteConsumption(dc.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16} /></button>}
                    </div></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
        </>
      )}

      {activeTab === 'ledger' && (
      <>
      {ledgerData.length === 0 ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
          <p>No raw material stock data found. Try adjusting filters or add purchase entries.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ledgerData.map(item => {
            const isExpanded = expandedMaterials[item.material_name];
            return (
              <div key={item.material_name} className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(item.material_name)} data-testid={`toggle-${item.material_name}`}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{item.material_name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{item.unit} | {item.transactions.length} transaction(s)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase">Opening</p>
                      <p className="font-semibold text-slate-700">{item.opening_stock.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-green-600 uppercase">Purchased</p>
                      <p className="font-semibold text-green-600">+{item.total_in.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-red-600 uppercase">Used</p>
                      <p className="font-semibold text-red-600">-{item.total_out.toFixed(2)}</p>
                    </div>
                    {(item.total_adjustment || 0) !== 0 && (
                      <div className="text-center">
                        <p className={`text-xs uppercase ${item.total_adjustment > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>Adjustment</p>
                        <p className={`font-semibold ${item.total_adjustment > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {item.total_adjustment > 0 ? '+' : ''}{item.total_adjustment.toFixed(2)}
                        </p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-xs text-slate-500 uppercase">Closing</p>
                      <p className="font-bold text-slate-900">{item.closing_stock.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

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
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Adj</th>
                          <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Balance</th>
                          {canModify && <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-center border-b border-slate-200 w-20">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-blue-50/50">
                          <td className="px-4 py-2.5 text-sm text-slate-500" colSpan={3}>Opening Stock</td>
                          <td className="px-4 py-2.5 text-sm text-right">-</td>
                          <td className="px-4 py-2.5 text-sm text-right">-</td>
                          <td className="px-4 py-2.5 text-sm text-right">-</td>
                          <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-700">{item.opening_stock.toFixed(2)}</td>
                          {canModify && <td />}
                        </tr>
                        {item.transactions.map((t, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2.5 text-sm text-slate-700">{t.date}</td>
                            <td className="px-4 py-2.5 text-sm">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                                t.type === 'Purchase' ? 'bg-green-100 text-green-700' :
                                t.type === 'Direct Consumption' ? 'bg-red-100 text-red-700' :
                                t.type.includes('Gain') ? 'bg-emerald-100 text-emerald-700' :
                                t.type.includes('Loss') ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {t.type}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-slate-600">{t.description}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-green-600">{t.in_qty > 0 ? `+${t.in_qty.toFixed(2)}` : '-'}</td>
                            <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600">{t.out_qty > 0 ? `-${t.out_qty.toFixed(2)}` : '-'}</td>
                            <td className={`px-4 py-2.5 text-sm text-right font-medium ${(t.adj_qty || 0) > 0 ? 'text-emerald-600' : (t.adj_qty || 0) < 0 ? 'text-orange-600' : ''}`}>
                              {(t.adj_qty || 0) > 0 ? `+${t.adj_qty.toFixed(2)}` : (t.adj_qty || 0) < 0 ? `${t.adj_qty.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{t.balance.toFixed(2)}</td>
                            {canModify && (
                              <td className="px-4 py-2.5 text-center">
                                {t.entry_id && t.type === 'Purchase' && (
                                  <div className="flex items-center justify-center gap-1">
                                    <button data-testid={`edit-purchase-${t.entry_id}`} onClick={() => handleEditStock({ id: t.entry_id, name: item.material_name, date: t.date, purchased: t.in_qty })}
                                      className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit size={14} /></button>
                                    <button data-testid={`delete-purchase-${t.entry_id}`} onClick={() => handleDeleteStock(t.entry_id)}
                                      className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 size={14} /></button>
                                  </div>
                                )}
                                {t.entry_id && t.type.includes('Adjustment') && (
                                  <div className="flex items-center justify-center gap-1">
                                    <button data-testid={`edit-adj-${t.entry_id}`} onClick={() => handleEditAdj({ id: t.entry_id, material_name: item.material_name, date: t.date, type: t.adj_type, quantity: t.adj_raw_qty, notes: t.adj_notes || '' })}
                                      className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit size={14} /></button>
                                    <button data-testid={`delete-adj-${t.entry_id}`} onClick={() => handleDeleteAdj(t.entry_id)}
                                      className="p-1 text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                        <tr className="bg-slate-100 font-semibold">
                          <td className="px-4 py-2.5 text-sm text-slate-900" colSpan={3}>Closing Stock</td>
                          <td className="px-4 py-2.5 text-sm text-right text-green-700">{item.total_in.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-sm text-right text-red-700">{item.total_out.toFixed(2)}</td>
                          <td className={`px-4 py-2.5 text-sm text-right ${(item.total_adjustment || 0) > 0 ? 'text-emerald-700' : (item.total_adjustment || 0) < 0 ? 'text-orange-700' : ''}`}>
                            {(item.total_adjustment || 0) !== 0 ? (item.total_adjustment > 0 ? '+' : '') + item.total_adjustment.toFixed(2) : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-right text-slate-900">{item.closing_stock.toFixed(2)}</td>
                          {canModify && <td />}
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
      </>
      )}

      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default RawMaterialStock;
