import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Filter, Calendar, Download, ChevronDown, ChevronRight, TrendingUp, TrendingDown, Settings, Save, AlertTriangle, CheckCircle, Container } from 'lucide-react';
import * as XLSX from 'xlsx';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const MilkTSSheet = ({ user }) => {
  const [tsData, setTsData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdjForm, setShowAdjForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [editingAdj, setEditingAdj] = useState(null);
  const [showTransactions, setShowTransactions] = useState(false);
  const [expandedDays, setExpandedDays] = useState({});
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    quantity_kg: '', fat_percent: '', snf_percent: '', supplier: '', notes: ''
  });

  const [adjFormData, setAdjFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'loss', quantity_kg: '', fat_kg: '', snf_kg: '', notes: ''
  });

  const [filters, setFilters] = useState({ start_date: '', end_date: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [milkEntries, setMilkEntries] = useState([]);
  const [adjEntries, setAdjEntries] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [showSupplierMgmt, setShowSupplierMgmt] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('purchases');

  // Silo state
  const [siloDate, setSiloDate] = useState(new Date().toISOString().split('T')[0]);
  const [siloData, setSiloData] = useState(null);
  const [siloEntries, setSiloEntries] = useState([]);
  const [siloSaving, setSiloSaving] = useState(false);
  const [siloMsg, setSiloMsg] = useState('');
  const [showSiloMgmt, setShowSiloMgmt] = useState(false);
  const [newSilo, setNewSilo] = useState('');
  const [siloMasters, setSiloMasters] = useState([]);
  const [editingSiloId, setEditingSiloId] = useState(null);
  const [editingSiloName, setEditingSiloName] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => { 
    // Only fetch suppliers and silo masters on load, not the heavy data
    fetchSuppliers();
    fetchSiloMasters();
  }, []);

  const fetchAll = async (filterParams = null) => {
    const params = filterParams || filters;
    if (!params.start_date && !params.end_date) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await Promise.all([fetchTsReport(params), fetchMilkEntries(params), fetchAdjEntries(params)]);
    setDataLoaded(true);
    setLoading(false);
  };

  const fetchTsReport = async (filterParams = null) => {
    const params = filterParams || filters;
    // Require at least one date to load data
    if (!params.start_date && !params.end_date) {
      setLoading(false);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      const res = await axios.get(`${BACKEND_URL}/api/reports/milk-ts?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTsData(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchMilkEntries = async (filterParams = null) => {
    const params = filterParams || filters;
    if (!params.start_date && !params.end_date) return;
    try {
      const token = localStorage.getItem('token');
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      const res = await axios.get(`${BACKEND_URL}/api/milk-stock?${qp.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      setMilkEntries(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchAdjEntries = async (filterParams = null) => {
    const params = filterParams || filters;
    if (!params.start_date && !params.end_date) return;
    try {
      const token = localStorage.getItem('token');
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      const res = await axios.get(`${BACKEND_URL}/api/milk-adjustment?${qp.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      setAdjEntries(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchSuppliers = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/suppliers`, { headers: { Authorization: `Bearer ${token}` } });
      setSuppliers(res.data);
    } catch (err) { console.error(err); }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/suppliers`, { name: newSupplier.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setNewSupplier('');
      fetchSuppliers();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to add supplier'); }
  };

  const handleDeleteSupplier = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Supplier', message: 'Delete this supplier?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/suppliers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          fetchSuppliers();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  // === Silo Functions ===
  const fetchSiloMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const siloRes = await axios.get(`${BACKEND_URL}/api/silos`, { headers: { Authorization: `Bearer ${token}` } });
      setSiloMasters(siloRes.data);
    } catch (err) { console.error(err); }
  };

  const fetchSiloEntry = async (d) => {
    try {
      const token = localStorage.getItem('token');
      const [entryRes, siloRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/daily-silo-entry?date=${d || siloDate}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/silos`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSiloData(entryRes.data);
      setSiloMasters(siloRes.data);
      setSiloEntries(entryRes.data.silos.map(s => ({
        silo_name: s.silo_name, quantity_kg: s.quantity_kg || '', fat_percent: s.fat_percent || '', snf_percent: s.snf_percent || ''
      })));
    } catch (err) { console.error(err); }
  };

  const updateSiloEntry = (idx, field, value) => {
    const updated = [...siloEntries];
    updated[idx] = { ...updated[idx], [field]: value };
    setSiloEntries(updated);
  };

  const calcSiloFatKg = (e) => e.quantity_kg && e.fat_percent ? (parseFloat(e.quantity_kg) * parseFloat(e.fat_percent) / 100).toFixed(2) : '0.00';
  const calcSiloSnfKg = (e) => e.quantity_kg && e.snf_percent ? (parseFloat(e.quantity_kg) * parseFloat(e.snf_percent) / 100).toFixed(2) : '0.00';

  const handleSaveSiloEntries = async () => {
    setSiloSaving(true); setSiloMsg('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/daily-silo-entry`, {
        date: siloDate, entries: siloEntries.map(e => ({
          silo_name: e.silo_name, quantity_kg: parseFloat(e.quantity_kg) || 0,
          fat_percent: parseFloat(e.fat_percent) || 0, snf_percent: parseFloat(e.snf_percent) || 0
        }))
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSiloMsg('Saved successfully!');
      fetchSiloEntry(siloDate);
      setTimeout(() => setSiloMsg(''), 3000);
    } catch (err) { setSiloMsg(err.response?.data?.detail || 'Failed to save'); }
    finally { setSiloSaving(false); }
  };

  const handleAddSilo = async () => {
    if (!newSilo.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/silos`, { name: newSilo.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setNewSilo('');
      fetchSiloEntry(siloDate);
    } catch (err) { setSiloMsg(err.response?.data?.detail || 'Failed to add silo'); }
  };

  const handleDeleteSilo = (siloId) => {
    setConfirmDialog({
      open: true, title: 'Delete Silo', message: 'Delete this silo?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/silos/${siloId}`, { headers: { Authorization: `Bearer ${token}` } });
          fetchSiloEntry(siloDate);
        } catch (err) { setSiloMsg(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  const handleRenameSilo = async (siloId) => {
    if (!editingSiloName.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${BACKEND_URL}/api/silos/${siloId}`, { name: editingSiloName.trim() }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingSiloId(null);
      setEditingSiloName('');
      fetchSiloEntry(siloDate);
    } catch (err) { setSiloMsg(err.response?.data?.detail || 'Failed to rename'); }
  };

  const siloTotalQty = siloEntries.reduce((s, e) => s + (parseFloat(e.quantity_kg) || 0), 0);
  const siloTotalFat = siloEntries.reduce((s, e) => s + (parseFloat(calcSiloFatKg(e)) || 0), 0);
  const siloTotalSnf = siloEntries.reduce((s, e) => s + (parseFloat(calcSiloSnfKg(e)) || 0), 0);
  const sysMilk = siloData?.system_closing?.milk_kg || 0;
  const sysFat = siloData?.system_closing?.fat_kg || 0;
  const sysSnf = siloData?.system_closing?.snf_kg || 0;
  const siloDiffMilk = (siloTotalQty - sysMilk).toFixed(2);
  const siloDiffFat = (siloTotalFat - sysFat).toFixed(2);
  const siloDiffSnf = (siloTotalSnf - sysSnf).toFixed(2);
  const siloHasError = Math.abs(siloDiffMilk) > 0.01 || Math.abs(siloDiffFat) > 0.01 || Math.abs(siloDiffSnf) > 0.01;
  const siloAllFilled = siloEntries.length > 0 && siloEntries.every(e => parseFloat(e.quantity_kg) > 0);

  const handleApplyFilters = () => { 
    if (!filters.start_date && !filters.end_date) {
      setError('Please select at least one date to load data');
      setTimeout(() => setError(''), 3000);
      return;
    }
    fetchAll(filters); 
  };
  const handleResetFilters = () => { 
    const r = { start_date: '', end_date: '' }; 
    setFilters(r); 
    setTsData(null);
    setMilkEntries([]);
    setAdjEntries([]);
    setDataLoaded(false);
    setLoading(false);
  };
  const toggleDay = (date) => setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }));

  const filteredMilkEntries = milkEntries.filter(e => {
    if (filters.start_date && e.date < filters.start_date) return false;
    if (filters.end_date && e.date > filters.end_date) return false;
    return true;
  });
  const filteredAdjEntries = adjEntries.filter(e => {
    if (filters.start_date && e.date < filters.start_date) return false;
    if (filters.end_date && e.date > filters.end_date) return false;
    return true;
  });

  // Milk Purchase handlers
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { date: formData.date, quantity_kg: parseFloat(formData.quantity_kg),
        fat_percent: parseFloat(formData.fat_percent), snf_percent: parseFloat(formData.snf_percent), supplier: formData.supplier, notes: formData.notes };
      if (editingEntry) {
        await axios.put(`${BACKEND_URL}/api/milk-stock/${editingEntry.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Milk stock updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/milk-stock`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Milk stock added!');
      }
      setShowForm(false); setEditingEntry(null);
      setFormData({ date: new Date().toISOString().split('T')[0], quantity_kg: '', fat_percent: '', snf_percent: '', supplier: '', notes: '' });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save'); }
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({ date: entry.date, quantity_kg: entry.quantity_kg, fat_percent: entry.fat_percent, snf_percent: entry.snf_percent, supplier: entry.supplier || '', notes: entry.notes || '' });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Entry', message: 'Delete this entry?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/milk-stock/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Deleted!'); fetchAll();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  // Adjustment handlers
  const handleAdjSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    const qtyKg = parseFloat(adjFormData.quantity_kg) || 0;
    const fatKg = parseFloat(adjFormData.fat_kg) || 0;
    const snfKg = parseFloat(adjFormData.snf_kg) || 0;
    if (qtyKg === 0 && fatKg === 0 && snfKg === 0) { setError('At least one value must be greater than 0'); return; }
    try {
      const token = localStorage.getItem('token');
      const payload = { date: adjFormData.date, type: adjFormData.type, quantity_kg: qtyKg, fat_kg: fatKg, snf_kg: snfKg, notes: adjFormData.notes };
      if (editingAdj) {
        await axios.put(`${BACKEND_URL}/api/milk-adjustment/${editingAdj.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Adjustment updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/milk-adjustment`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Adjustment recorded!');
      }
      setShowAdjForm(false); setEditingAdj(null);
      setAdjFormData({ date: new Date().toISOString().split('T')[0], type: 'loss', quantity_kg: '', fat_kg: '', snf_kg: '', notes: '' });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save'); }
  };

  const handleEditAdj = (entry) => {
    setEditingAdj(entry);
    setAdjFormData({ date: entry.date, type: entry.type, quantity_kg: entry.quantity_kg, fat_kg: entry.fat_kg, snf_kg: entry.snf_kg, notes: entry.notes || '' });
    setShowAdjForm(true);
  };

  const handleDeleteAdj = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Adjustment', message: 'Delete this adjustment?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/milk-adjustment/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          setSuccess('Adjustment deleted!'); fetchAll();
        } catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  const fatKg = formData.quantity_kg && formData.fat_percent
    ? (parseFloat(formData.fat_percent) * parseFloat(formData.quantity_kg) / 100).toFixed(2) : '-';
  const snfKg = formData.quantity_kg && formData.snf_percent
    ? (parseFloat(formData.snf_percent) * parseFloat(formData.quantity_kg) / 100).toFixed(2) : '-';

  const handleExportToExcel = () => {
    if (!tsData) return;
    const rows = tsData.daily_summary.map(d => ({
      Date: d.date,
      'Opening Milk (kg)': d.opening_milk_kg, 'Opening Fat (kg)': d.opening_fat_kg, 'Opening SNF (kg)': d.opening_snf_kg,
      'Purchased Milk (kg)': d.purchased_milk_kg, 'Purchased Fat (kg)': d.purchased_fat_kg, 'Purchased SNF (kg)': d.purchased_snf_kg,
      'Used Milk (kg)': d.used_milk_kg, 'Used Fat (kg)': d.used_fat_kg, 'Used SNF (kg)': d.used_snf_kg,
      'Gain Milk (kg)': d.gain_milk_kg || 0, 'Gain Fat (kg)': d.gain_fat_kg || 0, 'Gain SNF (kg)': d.gain_snf_kg || 0,
      'Loss Milk (kg)': d.loss_milk_kg || 0, 'Loss Fat (kg)': d.loss_fat_kg || 0, 'Loss SNF (kg)': d.loss_snf_kg || 0,
      'Closing Milk (kg)': d.closing_milk_kg, 'Closing Fat (kg)': d.closing_fat_kg, 'Closing SNF (kg)': d.closing_snf_kg
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Milk TS');
    XLSX.writeFile(wb, `milk-ts-sheet-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPurchases = () => {
    const rows = filteredMilkEntries.map(e => ({
      Date: e.date, Supplier: e.supplier || '-', 'Milk (kg)': e.quantity_kg,
      'Fat %': e.fat_percent, 'Fat (kg)': e.fat_kg, 'SNF %': e.snf_percent,
      'SNF (kg)': e.snf_kg, Notes: e.notes || ''
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchases');
    const dateLabel = filters.start_date || filters.end_date
      ? `-${filters.start_date || 'start'}-to-${filters.end_date || 'end'}` : '';
    XLSX.writeFile(wb, `milk-purchases${dateLabel}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';
  if (loading) return <div className="text-slate-600">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Milk TS Sheet</h1>
          <p className="text-slate-600">Total Solid sheet tracking milk, fat and SNF stock movements</p>
        </div>
        <div className="flex gap-3">
          <button data-testid="export-excel-btn" onClick={handleExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
            <Download size={18} /> Export
          </button>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700">
            <Filter size={18} /> {showFilters ? 'Hide' : 'Filter'}
          </button>
          {canModify && (
            <>
              <button data-testid="add-adjustment-btn" onClick={() => {
                setShowAdjForm(true); setEditingAdj(null);
                setAdjFormData({ date: new Date().toISOString().split('T')[0], type: 'loss', quantity_kg: '', fat_kg: '', snf_kg: '', notes: '' });
              }} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white font-medium rounded-sm hover:bg-amber-700">
                <TrendingDown size={18} /> Gain / Loss
              </button>
              <button data-testid="add-milk-stock-btn" onClick={() => {
                setShowForm(true); setEditingEntry(null);
                setFormData({ date: new Date().toISOString().split('T')[0], quantity_kg: '', fat_percent: '', snf_percent: '', supplier: '', notes: '' });
              }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
                <Plus size={18} /> Add Milk Purchase
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}
      {success && <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}

      {/* Date Filter */}
      {showFilters && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4"><Calendar size={18} className="text-slate-600" /><h2 className="text-lg font-semibold text-slate-900">Date Range</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input data-testid="start-date-filter" type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input data-testid="end-date-filter" type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
          </div>
          <div className="flex gap-3">
            <button data-testid="apply-filters-btn" onClick={handleApplyFilters} className="px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">Apply</button>
            <button data-testid="reset-filters-btn" onClick={handleResetFilters} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      )}

      {/* Add/Edit Milk Stock Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingEntry ? 'Edit Milk Purchase' : 'Add Milk Purchase'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                <input data-testid="milk-date-input" type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Supplier</label>
                  {user?.role === 'admin' && (
                    <button type="button" data-testid="manage-suppliers-btn" onClick={() => setShowSupplierMgmt(!showSupplierMgmt)}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"><Settings size={12} /> Manage</button>
                  )}
                </div>
                <SearchableSelect
                  testId="milk-supplier-select"
                  value={formData.supplier}
                  onChange={(val) => setFormData({ ...formData, supplier: val })}
                  placeholder="Select supplier..."
                  searchPlaceholder="Search suppliers..."
                  options={suppliers.map(s => ({ value: s.name, label: s.name }))}
                />
                {showSupplierMgmt && user?.role === 'admin' && (
                  <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-sm">
                    <div className="flex gap-2 mb-2">
                      <input data-testid="new-supplier-input" type="text" value={newSupplier}
                        onChange={(e) => setNewSupplier(e.target.value)} placeholder="New supplier name"
                        className="flex-1 h-8 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                      <button type="button" data-testid="add-supplier-btn" onClick={handleAddSupplier}
                        className="h-8 px-3 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">Add</button>
                    </div>
                    {suppliers.length > 0 ? (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {suppliers.map(s => (
                          <div key={s.id} className="flex items-center justify-between py-1 px-2 bg-white rounded-sm text-sm">
                            <span>{s.name}</span>
                            <button type="button" onClick={() => handleDeleteSupplier(s.id)}
                              className="p-0.5 text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-slate-400">No suppliers yet</p>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Milk Qty (kg)</label>
                  <input data-testid="milk-qty-input" type="number" step="0.01" value={formData.quantity_kg} onChange={(e) => setFormData({ ...formData, quantity_kg: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fat %</label>
                  <input data-testid="milk-fat-input" type="number" step="0.01" value={formData.fat_percent} onChange={(e) => setFormData({ ...formData, fat_percent: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SNF %</label>
                  <input data-testid="milk-snf-input" type="number" step="0.01" value={formData.snf_percent} onChange={(e) => setFormData({ ...formData, snf_percent: e.target.value })} required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-sm p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Calculated Values</p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-slate-500">Fat (kg):</span> <span className="font-semibold text-slate-900">{fatKg}</span></div>
                  <div><span className="text-slate-500">SNF (kg):</span> <span className="font-semibold text-slate-900">{snfKg}</span></div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes (Optional)</label>
                <input data-testid="milk-notes-input" type="text" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
              </div>
              <div className="flex gap-3">
                <button data-testid="submit-milk-btn" type="submit" className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">{editingEntry ? 'Update' : 'Add'}</button>
                <button type="button" onClick={() => { setShowForm(false); setEditingEntry(null); }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Adjustment Modal */}
      {showAdjForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-1">{editingAdj ? 'Edit Adjustment' : 'Record Gain / Loss'}</h2>
            <p className="text-sm text-slate-500 mb-4">Add gain or loss to match physical stock</p>
            <form onSubmit={handleAdjSubmit} className="space-y-4">
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
                    <button type="button" data-testid="adj-type-gain" onClick={() => setAdjFormData({ ...adjFormData, type: 'gain' })}
                      className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-sm font-medium text-sm border transition-colors ${
                        adjFormData.type === 'gain' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                      <TrendingUp size={16} /> Gain
                    </button>
                    <button type="button" data-testid="adj-type-loss" onClick={() => setAdjFormData({ ...adjFormData, type: 'loss' })}
                      className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-sm font-medium text-sm border transition-colors ${
                        adjFormData.type === 'loss' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}>
                      <TrendingDown size={16} /> Loss
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity (kg)</label>
                  <input data-testid="adj-qty-input" type="number" step="0.01" min="0" value={adjFormData.quantity_kg}
                    onChange={(e) => setAdjFormData({ ...adjFormData, quantity_kg: e.target.value })} placeholder="0"
                    className={`w-full h-10 px-3 bg-white border rounded-sm focus:outline-none focus:ring-1 text-slate-900 ${
                      adjFormData.type === 'gain' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Fat (kg)</label>
                  <input data-testid="adj-fat-input" type="number" step="0.01" min="0" value={adjFormData.fat_kg}
                    onChange={(e) => setAdjFormData({ ...adjFormData, fat_kg: e.target.value })} placeholder="0"
                    className={`w-full h-10 px-3 bg-white border rounded-sm focus:outline-none focus:ring-1 text-slate-900 ${
                      adjFormData.type === 'gain' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">SNF (kg)</label>
                  <input data-testid="adj-snf-input" type="number" step="0.01" min="0" value={adjFormData.snf_kg}
                    onChange={(e) => setAdjFormData({ ...adjFormData, snf_kg: e.target.value })} placeholder="0"
                    className={`w-full h-10 px-3 bg-white border rounded-sm focus:outline-none focus:ring-1 text-slate-900 ${
                      adjFormData.type === 'gain' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-red-300 focus:border-red-500 focus:ring-red-500'}`} />
                </div>
              </div>
              <div className={`rounded-sm p-3 text-xs ${adjFormData.type === 'gain' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {adjFormData.type === 'gain' ? 'Gain will be added to closing stock. Enter any combination of the three parameters.' : 'Loss will be deducted from closing stock. Enter any combination of the three parameters.'}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reason / Notes</label>
                <input data-testid="adj-notes-input" type="text" value={adjFormData.notes}
                  onChange={(e) => setAdjFormData({ ...adjFormData, notes: e.target.value })}
                  placeholder="e.g. Physical count correction, spillage, cream recovery..."
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

      {/* Summary Cards */}
      {tsData && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            { label: 'Opening', data: tsData.opening, bg: '' },
            { label: 'Purchased', data: tsData.total_purchased, bg: 'text-green-600' },
            { label: 'Used in Batches', data: tsData.total_used, bg: 'text-red-600' },
            { label: 'Gain', data: tsData.total_gain, bg: 'text-emerald-600' },
            { label: 'Loss', data: tsData.total_loss, bg: 'text-orange-600' },
            { label: 'Closing', data: tsData.closing, bg: 'text-slate-900 font-bold' }
          ].map(card => (
            <div key={card.label} data-testid={`summary-card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`bg-white border shadow-sm rounded-sm p-4 ${card.label === 'Gain' ? 'border-emerald-200' : card.label === 'Loss' ? 'border-orange-200' : 'border-slate-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${card.bg || 'text-slate-500'}`}>{card.label}</p>
              <div className="space-y-2">
                {['milk_kg', 'fat_kg', 'snf_kg'].map(k => (
                  <div key={k} className="flex justify-between text-sm">
                    <span className="text-slate-500">{k === 'milk_kg' ? 'Milk' : k === 'fat_kg' ? 'Fat' : 'SNF'}</span>
                    <span className={`font-semibold ${card.bg || 'text-slate-700'}`}>{card.data[k].toFixed(2)} kg</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Daily Summary Table */}
      {!dataLoaded && !loading && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 mb-2">Select a date range and click <strong>Apply</strong> to load TS Sheet data.</p>
          <p className="text-sm text-slate-400">This helps maintain fast page load times as data grows.</p>
        </div>
      )}
      
      {loading && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto mb-3"></div>
          <p className="text-slate-600">Loading data...</p>
        </div>
      )}

      {dataLoaded && tsData && tsData.daily_summary.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Daily Summary</h2>
            <button data-testid="toggle-transactions-btn" onClick={() => setShowTransactions(!showTransactions)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              {showTransactions ? 'Hide Details' : 'Show Transaction Details'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th rowSpan={2} className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-3 py-2 text-left border-b border-r border-slate-200">Date</th>
                  <th colSpan={3} className="bg-blue-50 text-blue-600 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-r border-slate-200">Opening</th>
                  <th colSpan={3} className="bg-green-50 text-green-600 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-r border-slate-200">Purchased</th>
                  <th colSpan={3} className="bg-red-50 text-red-600 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-r border-slate-200">Used in Batches</th>
                  <th colSpan={3} className="bg-emerald-50 text-emerald-600 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-r border-slate-200">Gain</th>
                  <th colSpan={3} className="bg-orange-50 text-orange-600 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-r border-slate-200">Loss</th>
                  <th colSpan={3} className="bg-slate-100 text-slate-700 text-xs uppercase font-semibold px-3 py-2 text-center border-b border-slate-200">Closing</th>
                </tr>
                <tr>
                  {['blue', 'green', 'red', 'emerald', 'orange', 'slate'].map(c => (
                    ['Milk', 'Fat', 'SNF'].map((h, i) => (
                      <th key={`${c}-${h}`} className={`bg-${c === 'slate' ? 'slate-100' : c + '-50'} text-${c === 'slate' ? 'slate-600' : c + '-500'} text-xs font-medium px-3 py-1.5 text-right border-b ${i === 2 ? 'border-r' : ''} border-slate-200`}>{h}</th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {tsData.daily_summary.map(day => (
                  <React.Fragment key={day.date}>
                    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => showTransactions && toggleDay(day.date)} data-testid={`ts-row-${day.date}`}>
                      <td className="px-3 py-2.5 text-sm text-slate-700 font-medium border-r border-slate-100">
                        <div className="flex items-center gap-1">
                          {showTransactions && (expandedDays[day.date] ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                          {day.date}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-600">{day.opening_milk_kg.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-600">{day.opening_fat_kg.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-600 border-r border-slate-100">{day.opening_snf_kg.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-green-600 font-medium">{day.purchased_milk_kg > 0 ? `+${day.purchased_milk_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-green-600 font-medium">{day.purchased_fat_kg > 0 ? `+${day.purchased_fat_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-green-600 font-medium border-r border-slate-100">{day.purchased_snf_kg > 0 ? `+${day.purchased_snf_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-red-600 font-medium">{day.used_milk_kg > 0 ? `-${day.used_milk_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-red-600 font-medium">{day.used_fat_kg > 0 ? `-${day.used_fat_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-red-600 font-medium border-r border-slate-100">{day.used_snf_kg > 0 ? `-${day.used_snf_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-emerald-600 font-medium">{(day.gain_milk_kg || 0) > 0 ? `+${day.gain_milk_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-emerald-600 font-medium">{(day.gain_fat_kg || 0) > 0 ? `+${day.gain_fat_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-emerald-600 font-medium border-r border-slate-100">{(day.gain_snf_kg || 0) > 0 ? `+${day.gain_snf_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-orange-600 font-medium">{(day.loss_milk_kg || 0) > 0 ? `-${day.loss_milk_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-orange-600 font-medium">{(day.loss_fat_kg || 0) > 0 ? `-${day.loss_fat_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-orange-600 font-medium border-r border-slate-100">{(day.loss_snf_kg || 0) > 0 ? `-${day.loss_snf_kg.toFixed(2)}` : '-'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-900 font-semibold">{day.closing_milk_kg.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-900 font-semibold">{day.closing_fat_kg.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums text-right text-slate-900 font-semibold">{day.closing_snf_kg.toFixed(2)}</td>
                    </tr>
                    {showTransactions && expandedDays[day.date] && (
                      tsData.transactions.filter(t => t.date === day.date).map((t, idx) => (
                        <tr key={idx} className="bg-slate-50/80 border-b border-slate-100">
                          <td className="px-3 py-2 text-xs text-slate-500 pl-8 border-r border-slate-100">
                            <span className={`px-2 py-0.5 rounded-sm font-medium ${
                              t.type === 'Purchase' ? 'bg-green-100 text-green-700' :
                              t.type.includes('Gain') ? 'bg-emerald-100 text-emerald-700' :
                              t.type.includes('Loss') ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>{t.type}</span>
                          </td>
                          <td colSpan={18} className="px-3 py-2 text-xs text-slate-600">
                            {t.description}
                            {t.type === 'Purchase' && <span className="ml-2 text-green-600 font-medium">+{t.milk_kg_in} kg milk, +{t.fat_kg_in.toFixed(2)} kg fat, +{t.snf_kg_in.toFixed(2)} kg SNF</span>}
                            {t.type === 'Batch Usage' && <span className="ml-2 text-red-600 font-medium">-{t.milk_kg_out} kg milk, -{t.fat_kg_out.toFixed(2)} kg fat, -{t.snf_kg_out.toFixed(2)} kg SNF</span>}
                            {t.type.includes('Gain') && <span className="ml-2 text-emerald-600 font-medium">
                              {t.gain_milk > 0 ? `+${t.gain_milk} kg milk ` : ''}{t.gain_fat > 0 ? `+${t.gain_fat.toFixed(2)} kg fat ` : ''}{t.gain_snf > 0 ? `+${t.gain_snf.toFixed(2)} kg SNF` : ''}
                            </span>}
                            {t.type.includes('Loss') && <span className="ml-2 text-orange-600 font-medium">
                              {t.loss_milk > 0 ? `-${t.loss_milk} kg milk ` : ''}{t.loss_fat > 0 ? `-${t.loss_fat.toFixed(2)} kg fat ` : ''}{t.loss_snf > 0 ? `-${t.loss_snf.toFixed(2)} kg SNF` : ''}
                            </span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </React.Fragment>
                ))}
                <tr className="bg-slate-100 font-semibold border-t-2 border-slate-300">
                  <td className="px-3 py-3 text-sm text-slate-900 border-r border-slate-200">Totals</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-600">{tsData.opening.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-600">{tsData.opening.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-600 border-r border-slate-200">{tsData.opening.snf_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-green-700">{tsData.total_purchased.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-green-700">{tsData.total_purchased.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-green-700 border-r border-slate-200">{tsData.total_purchased.snf_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-red-700">{tsData.total_used.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-red-700">{tsData.total_used.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-red-700 border-r border-slate-200">{tsData.total_used.snf_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-emerald-700">{tsData.total_gain.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-emerald-700">{tsData.total_gain.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-emerald-700 border-r border-slate-200">{tsData.total_gain.snf_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-orange-700">{tsData.total_loss.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-orange-700">{tsData.total_loss.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-orange-700 border-r border-slate-200">{tsData.total_loss.snf_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-900">{tsData.closing.milk_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-900">{tsData.closing.fat_kg.toFixed(2)}</td>
                  <td className="px-3 py-3 text-sm tabular-nums text-right text-slate-900">{tsData.closing.snf_kg.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dataLoaded && tsData && tsData.daily_summary.length === 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600">No milk data found for the selected date range.</p>
        </div>
      )}

      {/* Tabs for entries */}
      {dataLoaded && (
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="border-b border-slate-200 flex">
          <button data-testid="tab-purchases" onClick={() => setActiveTab('purchases')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'purchases' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Milk Purchases ({filteredMilkEntries.length})
          </button>
          <button data-testid="tab-adjustments" onClick={() => setActiveTab('adjustments')}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'adjustments' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            Adjustments ({filteredAdjEntries.length})
          </button>
          <button data-testid="tab-silo" onClick={() => { setActiveTab('silo'); fetchSiloEntry(siloDate); }}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'silo' ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <span className="flex items-center gap-1.5"><Container size={14} /> Daily Silo Closing</span>
          </button>
          <div className="ml-auto flex items-center pr-3">
            {activeTab === 'purchases' && (
              <button data-testid="export-purchases-btn" onClick={handleExportPurchases}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-sm hover:bg-green-700">
                <Download size={14} /> Export Purchases
              </button>
            )}
          </div>
        </div>

        {activeTab === 'purchases' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Date</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Supplier</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Milk (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat %</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF %</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Notes</th>
                  {canModify && <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredMilkEntries.length === 0 ? (
                  <tr><td colSpan={canModify ? 9 : 8} className="px-4 py-8 text-center text-slate-500">No milk purchase entries found for selected date range</td></tr>
                ) : filteredMilkEntries.map(entry => (
                  <tr key={entry.id} data-testid={`milk-entry-${entry.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{entry.date}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{entry.supplier || '-'}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right">{entry.quantity_kg.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right">{entry.fat_percent}%</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-medium">{entry.fat_kg.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right">{entry.snf_percent}%</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right font-medium">{entry.snf_kg.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.notes || '-'}</td>
                    {canModify && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button data-testid={`edit-milk-${entry.id}`} onClick={() => handleEdit(entry)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm"><Edit size={16} /></button>
                          {user?.role === 'admin' && <button data-testid={`delete-milk-${entry.id}`} onClick={() => handleDelete(entry.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm"><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'adjustments' && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Date</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Type</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Qty (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF (kg)</th>
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Reason</th>
                  {canModify && <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAdjEntries.length === 0 ? (
                  <tr><td colSpan={canModify ? 7 : 6} className="px-4 py-8 text-center text-slate-500">No adjustment entries found for selected date range</td></tr>
                ) : filteredAdjEntries.map(entry => (
                  <tr key={entry.id} data-testid={`adj-entry-${entry.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-700">{entry.date}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-0.5 rounded-sm text-xs font-semibold ${entry.type === 'gain' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {entry.type === 'gain' ? 'GAIN' : 'LOSS'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums text-right font-medium ${entry.type === 'gain' ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {entry.quantity_kg > 0 ? `${entry.type === 'gain' ? '+' : '-'}${entry.quantity_kg.toFixed(2)}` : '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums text-right font-medium ${entry.type === 'gain' ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {entry.fat_kg > 0 ? `${entry.type === 'gain' ? '+' : '-'}${entry.fat_kg.toFixed(2)}` : '-'}
                    </td>
                    <td className={`px-4 py-3 text-sm tabular-nums text-right font-medium ${entry.type === 'gain' ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {entry.snf_kg > 0 ? `${entry.type === 'gain' ? '+' : '-'}${entry.snf_kg.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{entry.notes || '-'}</td>
                    {canModify && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button data-testid={`edit-adj-${entry.id}`} onClick={() => handleEditAdj(entry)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm"><Edit size={16} /></button>
                          {user?.role === 'admin' && <button data-testid={`delete-adj-${entry.id}`} onClick={() => handleDeleteAdj(entry.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm"><Trash2 size={16} /></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Daily Silo Closing Tab */}
        {activeTab === 'silo' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Date:</label>
                <input data-testid="silo-date-input" type="date" value={siloDate}
                  onChange={(e) => { setSiloDate(e.target.value); fetchSiloEntry(e.target.value); }}
                  max={new Date().toISOString().split('T')[0]}
                  className="h-9 px-3 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
              </div>
              {user?.role === 'admin' && (
                <button data-testid="manage-silos-btn" onClick={() => setShowSiloMgmt(!showSiloMgmt)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">
                  <Settings size={14} /> Manage Silos
                </button>
              )}
            </div>

            {siloMsg && <p className={`text-sm ${siloMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{siloMsg}</p>}

            {showSiloMgmt && user?.role === 'admin' && (
              <div className="bg-slate-50 border border-slate-200 rounded-sm p-4">
                <h4 className="font-semibold text-slate-900 mb-2 text-sm">Silo Management</h4>
                <div className="flex gap-2 mb-2">
                  <input data-testid="new-silo-input" type="text" value={newSilo}
                    onChange={(e) => setNewSilo(e.target.value)} placeholder="New silo name"
                    className="flex-1 h-8 px-2 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                  <button data-testid="add-silo-btn" onClick={handleAddSilo}
                    className="h-8 px-3 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">Add</button>
                </div>
                {siloMasters.length > 0 && (
                  <div className="space-y-1">
                    {siloMasters.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-1.5 px-2 bg-white rounded-sm text-sm border border-slate-100">
                        {editingSiloId === s.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <input type="text" value={editingSiloName} onChange={(e) => setEditingSiloName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSilo(s.id); if (e.key === 'Escape') setEditingSiloId(null); }}
                              autoFocus className="flex-1 h-7 px-2 text-sm bg-white border border-blue-400 rounded-sm focus:outline-none text-slate-900" />
                            <button onClick={() => handleRenameSilo(s.id)} className="text-xs px-2 py-1 bg-slate-900 text-white rounded-sm">Save</button>
                            <button onClick={() => setEditingSiloId(null)} className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700">Cancel</button>
                          </div>
                        ) : (
                          <>
                            <span>{s.name}</span>
                            <div className="flex items-center gap-1">
                              <button onClick={() => { setEditingSiloId(s.id); setEditingSiloName(s.name); }}
                                className="p-0.5 text-blue-500 hover:text-blue-700" title="Rename"><Edit size={12} /></button>
                              <button onClick={() => handleDeleteSilo(s.id)}
                                className="p-0.5 text-red-500 hover:text-red-700" title="Delete"><Trash2 size={12} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {siloEntries.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                No silos configured. {user?.role === 'admin' ? 'Click "Manage Silos" to add silos.' : 'Ask admin to add silos.'}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Silo</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Qty (kg)</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat %</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF %</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Fat (kg)</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">SNF (kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siloEntries.map((e, i) => (
                        <tr key={e.silo_name} data-testid={`silo-row-${i}`} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-sm text-slate-700 font-medium">{e.silo_name}</td>
                          <td className="px-4 py-2">
                            <input data-testid={`silo-qty-${i}`} type="number" step="0.01" value={e.quantity_kg}
                              onChange={(ev) => updateSiloEntry(i, 'quantity_kg', ev.target.value)} disabled={!canModify}
                              className="w-28 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                          </td>
                          <td className="px-4 py-2">
                            <input data-testid={`silo-fat-${i}`} type="number" step="0.01" value={e.fat_percent}
                              onChange={(ev) => updateSiloEntry(i, 'fat_percent', ev.target.value)} disabled={!canModify}
                              className="w-24 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                          </td>
                          <td className="px-4 py-2">
                            <input data-testid={`silo-snf-${i}`} type="number" step="0.01" value={e.snf_percent}
                              onChange={(ev) => updateSiloEntry(i, 'snf_percent', ev.target.value)} disabled={!canModify}
                              className="w-24 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                          </td>
                          <td className="px-4 py-3 text-sm tabular-nums text-right text-slate-700">{calcSiloFatKg(e)}</td>
                          <td className="px-4 py-3 text-sm tabular-nums text-right text-slate-700">{calcSiloSnfKg(e)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 border-t-2 border-slate-300">
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">Total (Silo)</td>
                        <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{siloTotalQty.toFixed(2)}</td>
                        <td className="px-4 py-3"></td><td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{siloTotalFat.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{siloTotalSnf.toFixed(2)}</td>
                      </tr>
                      <tr className="bg-blue-50">
                        <td className="px-4 py-3 text-sm font-semibold text-blue-700">System Closing</td>
                        <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysMilk.toFixed(2)}</td>
                        <td className="px-4 py-3"></td><td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysFat.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysSnf.toFixed(2)}</td>
                      </tr>
                      <tr className={siloAllFilled ? (siloHasError ? 'bg-red-50' : 'bg-green-50') : 'bg-slate-50'}>
                        <td className="px-4 py-3 text-sm font-semibold flex items-center gap-1.5">
                          {siloAllFilled && siloHasError && <AlertTriangle size={14} className="text-red-600" />}
                          {siloAllFilled && !siloHasError && <CheckCircle size={14} className="text-green-600" />}
                          <span className={siloAllFilled ? (siloHasError ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}>Difference</span>
                        </td>
                        <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${siloAllFilled ? (Math.abs(siloDiffMilk) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                          {siloDiffMilk > 0 ? '+' : ''}{siloDiffMilk}
                        </td>
                        <td className="px-4 py-3"></td><td className="px-4 py-3"></td>
                        <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${siloAllFilled ? (Math.abs(siloDiffFat) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                          {siloDiffFat > 0 ? '+' : ''}{siloDiffFat}
                        </td>
                        <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${siloAllFilled ? (Math.abs(siloDiffSnf) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                          {siloDiffSnf > 0 ? '+' : ''}{siloDiffSnf}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {canModify && (
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      {siloAllFilled && siloHasError && (
                        <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> Silo total does not match system closing. Please verify.</p>
                      )}
                      {siloAllFilled && !siloHasError && (
                        <p className="text-sm text-green-600 flex items-center gap-1.5"><CheckCircle size={14} /> Silo total matches system closing.</p>
                      )}
                    </div>
                    <button data-testid="save-silo-entry-btn" onClick={handleSaveSiloEntries} disabled={siloSaving}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 disabled:opacity-50">
                      <Save size={16} /> {siloSaving ? 'Saving...' : 'Save Entries'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      )}
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default MilkTSSheet;
