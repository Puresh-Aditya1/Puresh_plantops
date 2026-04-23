import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Truck, Download, Filter, Calendar, ChevronDown, ChevronRight, Edit, Trash2, PackagePlus, RefreshCw, AlertTriangle, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import ConfirmDialog from '../components/ConfirmDialog';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const FinishedProduct = ({ user }) => {
  const [activeTab, setActiveTab] = useState('ledger');
  const [ledgerData, setLedgerData] = useState([]);
  const [finishedSummary, setFinishedSummary] = useState([]);
  const [dispatches, setDispatches] = useState([]);
  const [receives, setReceives] = useState([]);
  const [repacks, setRepacks] = useState([]);
  const [wastages, setWastages] = useState([]);
  const [expandedProducts, setExpandedProducts] = useState({});
  const [showDispatchForm, setShowDispatchForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [showRepackForm, setShowRepackForm] = useState(false);
  const [showWastageForm, setShowWastageForm] = useState(false);
  const [editingDispatch, setEditingDispatch] = useState(null);
  const [editingReceive, setEditingReceive] = useState(null);
  const [editingRepack, setEditingRepack] = useState(null);
  const [editingWastage, setEditingWastage] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [finishedMasters, setFinishedMasters] = useState([]);
  
  // Selected SKU for detailed view
  const [selectedSkuFilter, setSelectedSkuFilter] = useState('');

  const [dispatchForm, setDispatchForm] = useState({
    dispatch_type: 'delivery_challan', challan_number: '', destination: '', dispatch_date: new Date().toISOString().split('T')[0], notes: '',
    products: [{ sku: '', quantity: '' }]
  });
  const [receiveForm, setReceiveForm] = useState({
    sku: '', quantity: '', receive_date: new Date().toISOString().split('T')[0], source_name: '', cost_per_unit: '', notes: ''
  });
  const [repackForm, setRepackForm] = useState({
    source_sku: '', target_sku: '', quantity_used: '', quantity_produced: '', quantity_wasted: '0', repack_date: new Date().toISOString().split('T')[0], notes: ''
  });
  const [wastageForm, setWastageForm] = useState({
    sku: '', quantity: '', wastage_date: new Date().toISOString().split('T')[0], reason: '', notes: ''
  });

  const [filters, setFilters] = useState({ start_date: '', end_date: '', search: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    try {
      const token = localStorage.getItem('token');
      const [summaryRes, dispatchRes, receivesRes, repacksRes, wastagesRes, mastersRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/finished-products-summary`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/dispatch`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-receives`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-repacks`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-wastages`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-master`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setFinishedSummary(summaryRes.data);
      setDispatches(dispatchRes.data);
      setReceives(receivesRes.data);
      setRepacks(repacksRes.data);
      setWastages(wastagesRes.data);
      setFinishedMasters(mastersRes.data);
      setLoading(false);
    } catch (err) { console.error(err); setLoading(false); }
  };

  const fetchLedger = async (filterParams = null, skuName = null) => {
    try {
      const token = localStorage.getItem('token');
      const params = filterParams || filters;
      const sku = skuName !== null ? skuName : selectedSkuFilter;
      
      // Only fetch if a SKU is selected
      if (!sku) {
        setLedgerData([]);
        return;
      }
      
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      qp.append('sku', sku);
      
      const res = await axios.get(`${BACKEND_URL}/api/reports/finished-ledger?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLedgerData(res.data);
    } catch (err) { console.error(err); }
  };

  const handleApplyFilters = () => { 
    if (activeTab === 'ledger' && selectedSkuFilter) {
      fetchLedger(filters, selectedSkuFilter); 
    }
  };
  const handleResetFilters = () => { 
    const r = { start_date: '', end_date: '', search: '' }; 
    setFilters(r);
    setSelectedSkuFilter('');
    setLedgerData([]);
  };
  const toggleExpand = (sku) => setExpandedProducts(prev => ({ ...prev, [sku]: !prev[sku] }));

  // Date-filtered data for tabs
  const filterByDate = (items, dateField = 'date') => {
    return items.filter(item => {
      const d = item[dateField];
      if (filters.start_date && d < filters.start_date) return false;
      if (filters.end_date && d > filters.end_date) return false;
      return true;
    });
  };
  const filteredDispatches = useMemo(() => filterByDate(dispatches), [dispatches, filters.start_date, filters.end_date]);
  const filteredReceives = useMemo(() => filterByDate(receives), [receives, filters.start_date, filters.end_date]);
  const filteredRepacks = useMemo(() => filterByDate(repacks), [repacks, filters.start_date, filters.end_date]);
  const filteredWastages = useMemo(() => filterByDate(wastages), [wastages, filters.start_date, filters.end_date]);

  // Search-filtered ledger data
  const filteredLedger = useMemo(() => {
    if (!filters.search) return ledgerData;
    const q = filters.search.toLowerCase();
    return ledgerData.filter(item => item.sku.toLowerCase().includes(q));
  }, [ledgerData, filters.search]);

  // ========== DISPATCH ==========
  const handleAddProduct = () => setDispatchForm({ ...dispatchForm, products: [...dispatchForm.products, { sku: '', quantity: '' }] });
  const handleRemoveProduct = (index) => setDispatchForm({ ...dispatchForm, products: dispatchForm.products.filter((_, i) => i !== index) });
  const handleProductChange = (index, field, value) => {
    const updated = [...dispatchForm.products]; updated[index][field] = value;
    setDispatchForm({ ...dispatchForm, products: updated });
  };
  const handleDispatchSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { ...dispatchForm, products: dispatchForm.products.map(p => ({ sku: p.sku, quantity: parseFloat(p.quantity) })) };
      if (editingDispatch) {
        await axios.put(`${BACKEND_URL}/api/dispatch/${editingDispatch.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Dispatch updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/dispatch`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Dispatch created!');
      }
      setShowDispatchForm(false); setEditingDispatch(null);
      setDispatchForm({ dispatch_type: 'delivery_challan', challan_number: '', destination: '', dispatch_date: new Date().toISOString().split('T')[0], notes: '', products: [{ sku: '', quantity: '' }] });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save dispatch'); }
  };
  const handleEditDispatch = (d) => {
    setEditingDispatch(d);
    setDispatchForm({ dispatch_type: d.dispatch_type, challan_number: d.challan_number, destination: d.destination, dispatch_date: d.date, notes: d.notes || '', products: d.products.map(p => ({ sku: p.sku || '', quantity: p.quantity })) });
    setShowDispatchForm(true);
  };
  const handleDeleteDispatch = (id) => {
    setConfirmDialog({ open: true, title: 'Delete Dispatch', message: 'Delete this dispatch? Stock will be restored.', onConfirm: async () => {
      setConfirmDialog(prev => ({ ...prev, open: false }));
      try { const token = localStorage.getItem('token'); await axios.delete(`${BACKEND_URL}/api/dispatch/${id}`, { headers: { Authorization: `Bearer ${token}` } }); setSuccess('Dispatch deleted!'); fetchAll(); }
      catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
    }});
  };

  // ========== RECEIVE ==========
  const handleReceiveSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { sku: receiveForm.sku, quantity: parseFloat(receiveForm.quantity), receive_date: receiveForm.receive_date, source_name: receiveForm.source_name, cost_per_unit: parseFloat(receiveForm.cost_per_unit || 0), notes: receiveForm.notes };
      if (editingReceive) {
        await axios.put(`${BACKEND_URL}/api/finished-product-receive/${editingReceive.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Receive updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/finished-product-receive`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Stock received!');
      }
      setShowReceiveForm(false); setEditingReceive(null);
      setReceiveForm({ sku: '', quantity: '', receive_date: new Date().toISOString().split('T')[0], source_name: '', cost_per_unit: '', notes: '' });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save receive'); }
  };
  const handleEditReceive = (r) => {
    setEditingReceive(r);
    setReceiveForm({ sku: r.sku, quantity: r.quantity, receive_date: r.date, source_name: r.source_name, cost_per_unit: r.cost_per_unit || '', notes: r.notes || '' });
    setShowReceiveForm(true);
  };
  const handleDeleteReceive = (id) => {
    setConfirmDialog({ open: true, title: 'Delete Receive', message: 'Delete this receive? Stock will be removed.', onConfirm: async () => {
      setConfirmDialog(prev => ({ ...prev, open: false }));
      try { const token = localStorage.getItem('token'); await axios.delete(`${BACKEND_URL}/api/finished-product-receive/${id}`, { headers: { Authorization: `Bearer ${token}` } }); setSuccess('Receive deleted!'); fetchAll(); }
      catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
    }});
  };

  // ========== REPACK ==========
  const handleRepackSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { source_sku: repackForm.source_sku, target_sku: repackForm.target_sku, quantity_used: parseFloat(repackForm.quantity_used), quantity_produced: parseFloat(repackForm.quantity_produced), quantity_wasted: parseFloat(repackForm.quantity_wasted || 0), repack_date: repackForm.repack_date, notes: repackForm.notes };
      if (editingRepack) {
        await axios.put(`${BACKEND_URL}/api/finished-product-repack/${editingRepack.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Repack updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/finished-product-repack`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Repack created!');
      }
      setShowRepackForm(false); setEditingRepack(null);
      setRepackForm({ source_sku: '', target_sku: '', quantity_used: '', quantity_produced: '', quantity_wasted: '0', repack_date: new Date().toISOString().split('T')[0], notes: '' });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save repack'); }
  };
  const handleEditRepack = (rp) => {
    setEditingRepack(rp);
    setRepackForm({ source_sku: rp.source_sku, target_sku: rp.target_sku, quantity_used: rp.quantity_used, quantity_produced: rp.quantity_produced, quantity_wasted: rp.quantity_wasted || '0', repack_date: rp.date, notes: rp.notes || '' });
    setShowRepackForm(true);
  };
  const handleDeleteRepack = (id) => {
    setConfirmDialog({ open: true, title: 'Delete Repack', message: 'Delete this repack? Source stock will be restored.', onConfirm: async () => {
      setConfirmDialog(prev => ({ ...prev, open: false }));
      try { const token = localStorage.getItem('token'); await axios.delete(`${BACKEND_URL}/api/finished-product-repack/${id}`, { headers: { Authorization: `Bearer ${token}` } }); setSuccess('Repack deleted!'); fetchAll(); }
      catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
    }});
  };

  // ========== WASTAGE ==========
  const handleWastageSubmit = async (e) => {
    e.preventDefault(); setError(''); setSuccess('');
    try {
      const token = localStorage.getItem('token');
      const payload = { sku: wastageForm.sku, quantity: parseFloat(wastageForm.quantity), wastage_date: wastageForm.wastage_date, reason: wastageForm.reason, notes: wastageForm.notes };
      if (editingWastage) {
        await axios.put(`${BACKEND_URL}/api/finished-product-wastage/${editingWastage.id}`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Wastage updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/finished-product-wastage`, payload, { headers: { Authorization: `Bearer ${token}` } });
        setSuccess('Wastage booked!');
      }
      setShowWastageForm(false); setEditingWastage(null);
      setWastageForm({ sku: '', quantity: '', wastage_date: new Date().toISOString().split('T')[0], reason: '', notes: '' });
      fetchAll();
    } catch (err) { setError(err.response?.data?.detail || 'Failed to save wastage'); }
  };
  const handleEditWastage = (w) => {
    setEditingWastage(w);
    setWastageForm({ sku: w.sku, quantity: w.quantity, wastage_date: w.date, reason: w.reason, notes: w.notes || '' });
    setShowWastageForm(true);
  };
  const handleDeleteWastage = (id) => {
    setConfirmDialog({ open: true, title: 'Delete Wastage', message: 'Delete this wastage? Stock will be restored.', onConfirm: async () => {
      setConfirmDialog(prev => ({ ...prev, open: false }));
      try { const token = localStorage.getItem('token'); await axios.delete(`${BACKEND_URL}/api/finished-product-wastage/${id}`, { headers: { Authorization: `Bearer ${token}` } }); setSuccess('Wastage deleted!'); fetchAll(); }
      catch (err) { setError(err.response?.data?.detail || 'Failed to delete'); }
    }});
  };

  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];
    
    if (activeTab === 'ledger') {
      // Export Stock Ledger
      if (filteredLedger.length === 0) {
        toast.error('No data to export. Please select a product first.');
        return;
      }
      filteredLedger.forEach(item => {
        const rows = [
          { Date: '', Type: 'Opening Stock', In: '', Out: '', Balance: item.opening_stock },
          ...item.transactions.map(t => ({ Date: t.date, Type: t.type, Description: t.description, In: t.in_qty || '', Out: t.out_qty || '', Balance: t.balance })),
          { Date: '', Type: 'Closing Stock', In: item.total_in, Out: item.total_out, Balance: item.closing_stock }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), item.sku.substring(0, 31));
      });
      XLSX.writeFile(wb, `finished-product-ledger-${dateStr}.xlsx`);
    } else if (activeTab === 'dispatch') {
      // Export Dispatches
      if (filteredDispatches.length === 0) {
        toast.error('No dispatches to export.');
        return;
      }
      const rows = filteredDispatches.map(d => ({
        'Date': d.date,
        'Type': d.dispatch_type === 'delivery_challan' ? 'Delivery Challan' : 'Gate Pass',
        'Challan/Pass No': d.challan_number,
        'Destination': d.destination,
        'Products': d.products.map(p => `${p.sku} x ${p.quantity}`).join(', '),
        'Notes': d.notes || '',
        'Created By': d.created_by || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Dispatches');
      XLSX.writeFile(wb, `finished-product-dispatches-${dateStr}.xlsx`);
    } else if (activeTab === 'receive') {
      // Export Receives
      if (filteredReceives.length === 0) {
        toast.error('No receives to export.');
        return;
      }
      const rows = filteredReceives.map(r => ({
        'Date': r.date,
        'SKU': r.sku,
        'Quantity': r.quantity,
        'Unit': r.unit,
        'Source': r.source || '',
        'Notes': r.notes || '',
        'Created By': r.created_by || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Receives');
      XLSX.writeFile(wb, `finished-product-receives-${dateStr}.xlsx`);
    } else if (activeTab === 'repack') {
      // Export Repacks
      if (filteredRepacks.length === 0) {
        toast.error('No repacks to export.');
        return;
      }
      const rows = filteredRepacks.map(r => ({
        'Date': r.date,
        'Batch': r.batch_number || '',
        'Source SKU': r.source_sku,
        'Source Qty': r.source_quantity,
        'Target SKU': r.target_sku,
        'Target Qty': r.target_quantity,
        'Wastage': r.wastage || 0,
        'Notes': r.notes || '',
        'Created By': r.created_by || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Repacks');
      XLSX.writeFile(wb, `finished-product-repacks-${dateStr}.xlsx`);
    } else if (activeTab === 'wastage') {
      // Export Wastages
      if (filteredWastages.length === 0) {
        toast.error('No wastages to export.');
        return;
      }
      const rows = filteredWastages.map(w => ({
        'Date': w.date,
        'SKU': w.sku,
        'Quantity': w.quantity,
        'Unit': w.unit,
        'Reason': w.reason || '',
        'Notes': w.notes || '',
        'Created By': w.created_by || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Wastages');
      XLSX.writeFile(wb, `finished-product-wastages-${dateStr}.xlsx`);
    }
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';
  if (loading) return <div className="text-slate-600">Loading...</div>;

  const tabs = [
    { id: 'ledger', label: 'Stock Ledger' },
    { id: 'dispatch', label: `Dispatches (${filteredDispatches.length})` },
    { id: 'receive', label: `Receives (${filteredReceives.length})` },
    { id: 'repack', label: `Repacks (${filteredRepacks.length})` },
    // Wastage tab - admin and modify only (not for plant_supervisor)
    ...(user?.role === 'admin' || user?.role === 'modify' ? [{ id: 'wastage', label: `Wastage (${filteredWastages.length})` }] : []),
  ];

  const txnTypeColor = (type) => {
    switch (type) {
      case 'Batch Production': return 'bg-blue-100 text-blue-700';
      case 'Packing': return 'bg-green-100 text-green-700';
      case 'Receive': return 'bg-teal-100 text-teal-700';
      case 'Repack': return 'bg-indigo-100 text-indigo-700';
      case 'Repack Out': return 'bg-orange-100 text-orange-700';
      case 'Book Wastage': return 'bg-red-100 text-red-700';
      case 'Initial Stock': return 'bg-slate-100 text-slate-700';
      default: return 'bg-purple-100 text-purple-700';
    }
  };

  const inputCls = "w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900";
  const labelCls = "block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5";
  const thCls = "bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 border-b border-slate-200";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 data-testid="page-title" className="text-3xl font-bold text-slate-900 mb-2">Finished Products</h1>
          <p className="text-slate-600">Stock ledger, dispatch, receive &amp; repack</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button data-testid="export-excel-btn" onClick={handleExportToExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700 text-sm">
            <Download size={16} /> Export {activeTab === 'ledger' ? 'Ledger' : activeTab === 'dispatch' ? 'Dispatches' : activeTab === 'receive' ? 'Receives' : activeTab === 'repack' ? 'Repacks' : 'Wastages'}
          </button>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700 text-sm"><Filter size={16} /> {showFilters ? 'Hide' : 'Filter'}</button>
          {canModify && (
            <>
              <button data-testid="create-receive-btn" onClick={() => { setEditingReceive(null); setReceiveForm({ sku: '', quantity: '', receive_date: new Date().toISOString().split('T')[0], source_name: '', cost_per_unit: '', notes: '' }); setShowReceiveForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-medium rounded-sm hover:bg-teal-700 text-sm"><PackagePlus size={16} /> Receive</button>
              <button data-testid="create-repack-btn" onClick={() => { setEditingRepack(null); setRepackForm({ source_sku: '', target_sku: '', quantity_used: '', quantity_produced: '', quantity_wasted: '0', repack_date: new Date().toISOString().split('T')[0], notes: '' }); setShowRepackForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-sm hover:bg-indigo-700 text-sm"><RefreshCw size={16} /> Repack</button>
              {(user?.role === 'admin' || user?.role === 'modify') && (
                <button data-testid="create-wastage-btn" onClick={() => { setEditingWastage(null); setWastageForm({ sku: '', quantity: '', wastage_date: new Date().toISOString().split('T')[0], reason: '', notes: '' }); setShowWastageForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700 text-sm"><AlertTriangle size={16} /> Book Wastage</button>
              )}
              <button data-testid="create-dispatch-btn" onClick={() => { setEditingDispatch(null); setDispatchForm({ dispatch_type: 'delivery_challan', challan_number: '', destination: '', dispatch_date: new Date().toISOString().split('T')[0], notes: '', products: [{ sku: '', quantity: '' }] }); setShowDispatchForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 text-sm"><Truck size={16} /> Dispatch</button>
            </>
          )}
        </div>
      </div>

      {error && <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}
      {success && <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map(tab => (
          <button key={tab.id} data-testid={`tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters - Always visible for ledger tab, toggle for others */}
      {(activeTab === 'ledger' || showFilters) && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4"><Calendar size={18} className="text-slate-600" /><h2 className="text-lg font-semibold text-slate-900">Filters</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {activeTab === 'ledger' && (
              <div>
                <label className={labelCls}>Select SKU</label>
                <SearchableSelect
                  testId="search-sku-select"
                  value={selectedSkuFilter}
                  onChange={(val) => setSelectedSkuFilter(val)}
                  placeholder="Select SKU..."
                  searchPlaceholder="Search SKUs..."
                  options={finishedSummary.map(p => ({ 
                    value: p.sku, 
                    label: `${p.sku} (${p.current_stock.toFixed(2)} ${p.unit})` 
                  }))}
                />
              </div>
            )}
            <div>
              <label className={labelCls}>Start Date</label>
              <input data-testid="start-date-filter" type="date" value={filters.start_date} onChange={(e) => setFilters({ ...filters, start_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>End Date</label>
              <input data-testid="end-date-filter" type="date" value={filters.end_date} onChange={(e) => setFilters({ ...filters, end_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3">
            <button data-testid="apply-filters-btn" onClick={handleApplyFilters} className="px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">Apply</button>
            <button data-testid="reset-filters-btn" onClick={handleResetFilters} className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      )}

      {/* ========== DISPATCH FORM MODAL ========== */}
      {showDispatchForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-2xl w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingDispatch ? 'Edit Dispatch' : 'Create Dispatch'}</h2>
            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Dispatch Type</label>
                  <select data-testid="dispatch-type-select" value={dispatchForm.dispatch_type} onChange={(e) => setDispatchForm({ ...dispatchForm, dispatch_type: e.target.value })} className={inputCls}><option value="delivery_challan">Delivery Challan</option><option value="gate_pass">Gate Pass</option></select></div>
                <div><label className={labelCls}>Challan Number</label>
                  <input data-testid="challan-number-input" type="text" value={dispatchForm.challan_number} onChange={(e) => setDispatchForm({ ...dispatchForm, challan_number: e.target.value })} required className={inputCls} /></div>
                <div><label className={labelCls}>Dispatch Date</label>
                  <input data-testid="dispatch-date-input" type="date" value={dispatchForm.dispatch_date} onChange={(e) => setDispatchForm({ ...dispatchForm, dispatch_date: e.target.value })} required className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Destination</label>
                <input data-testid="destination-input" type="text" value={dispatchForm.destination} onChange={(e) => setDispatchForm({ ...dispatchForm, destination: e.target.value })} required className={inputCls} /></div>
              <div>
                <div className="flex items-center justify-between mb-2"><label className={labelCls}>Products</label>
                  <button data-testid="add-dispatch-product-btn" type="button" onClick={handleAddProduct} className="px-3 py-1 bg-slate-900 text-white text-xs font-medium rounded-sm hover:bg-slate-800">Add Product</button></div>
                <div className="space-y-3">
                  {dispatchForm.products.map((product, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex-1">
                        <SearchableSelect
                          testId={`product-select-${index}`}
                          value={product.sku}
                          onChange={(val) => handleProductChange(index, 'sku', val)}
                          placeholder="Select product..."
                          searchPlaceholder="Search products..."
                          options={finishedSummary.map(p => ({ value: p.sku, label: `${p.sku} (Stock: ${p.current_stock.toFixed(2)} ${p.unit})` }))}
                        />
                      </div>
                      <div className="w-32"><input data-testid={`product-quantity-${index}`} type="number" step="0.01" placeholder="Qty" value={product.quantity} onChange={(e) => handleProductChange(index, 'quantity', e.target.value)} required className={inputCls} /></div>
                      {dispatchForm.products.length > 1 && (<button data-testid={`remove-product-${index}`} type="button" onClick={() => handleRemoveProduct(index)} className="h-10 px-3 bg-red-600 text-white rounded-sm hover:bg-red-700 text-sm">Remove</button>)}
                    </div>
                  ))}
                </div>
              </div>
              <div><label className={labelCls}>Notes (Optional)</label><textarea data-testid="dispatch-notes-input" value={dispatchForm.notes} onChange={(e) => setDispatchForm({ ...dispatchForm, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" /></div>
              <div className="flex gap-3">
                <button data-testid="submit-dispatch-btn" type="submit" className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">{editingDispatch ? 'Update Dispatch' : 'Create Dispatch'}</button>
                <button data-testid="cancel-dispatch-btn" type="button" onClick={() => { setShowDispatchForm(false); setEditingDispatch(null); }} className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== RECEIVE FORM MODAL ========== */}
      {showReceiveForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-lg w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingReceive ? 'Edit Receive' : 'Receive Finished Product'}</h2>
            <p className="text-sm text-slate-500 mb-4">Receive finished products directly from an external source</p>
            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>SKU</label>
                  <SearchableSelect
                    testId="receive-sku-select"
                    value={receiveForm.sku}
                    onChange={(val) => setReceiveForm({ ...receiveForm, sku: val })}
                    placeholder="Select SKU..."
                    searchPlaceholder="Search SKUs..."
                    options={finishedMasters.filter(m => m.is_active !== false).map(m => ({ value: m.sku_name, label: m.sku_name }))}
                  />
                </div>
                <div><label className={labelCls}>Quantity</label><input data-testid="receive-quantity-input" type="number" step="0.01" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} required className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Source / Supplier</label><input data-testid="receive-source-input" type="text" value={receiveForm.source_name} onChange={(e) => setReceiveForm({ ...receiveForm, source_name: e.target.value })} required placeholder="e.g., ABC Dairy" className={inputCls} /></div>
                <div><label className={labelCls}>Date</label><input data-testid="receive-date-input" type="date" value={receiveForm.receive_date} onChange={(e) => setReceiveForm({ ...receiveForm, receive_date: e.target.value })} required className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Cost per Unit (Optional)</label><input data-testid="receive-cost-input" type="number" step="0.01" value={receiveForm.cost_per_unit} onChange={(e) => setReceiveForm({ ...receiveForm, cost_per_unit: e.target.value })} placeholder="0.00" className={inputCls} /></div>
              <div><label className={labelCls}>Notes (Optional)</label><textarea data-testid="receive-notes-input" value={receiveForm.notes} onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" /></div>
              <div className="flex gap-3">
                <button data-testid="submit-receive-btn" type="submit" className="flex-1 h-10 bg-teal-600 text-white font-medium rounded-sm hover:bg-teal-700">{editingReceive ? 'Update Receive' : 'Receive Stock'}</button>
                <button data-testid="cancel-receive-btn" type="button" onClick={() => { setShowReceiveForm(false); setEditingReceive(null); }} className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== REPACK FORM MODAL ========== */}
      {showRepackForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-lg w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingRepack ? 'Edit Repack' : 'Repack Finished Product'}</h2>
            <p className="text-sm text-slate-500 mb-4">Repack existing stock into a different SKU. A unique R-series batch number will be auto-generated.</p>
            <form onSubmit={handleRepackSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Source SKU (Take From)</label>
                  <SearchableSelect
                    testId="repack-source-select"
                    value={repackForm.source_sku}
                    onChange={(val) => setRepackForm({ ...repackForm, source_sku: val })}
                    placeholder="Select source SKU..."
                    searchPlaceholder="Search SKUs..."
                    options={finishedSummary.filter(s => s.current_stock > 0).map(p => ({ value: p.sku, label: `${p.sku} (Stock: ${p.current_stock.toFixed(2)} ${p.unit})` }))}
                  />
                </div>
                <div><label className={labelCls}>Target SKU (Produce)</label>
                  <SearchableSelect
                    testId="repack-target-select"
                    value={repackForm.target_sku}
                    onChange={(val) => setRepackForm({ ...repackForm, target_sku: val })}
                    placeholder="Select target SKU..."
                    searchPlaceholder="Search SKUs..."
                    options={finishedMasters.filter(m => m.is_active !== false).map(m => ({ value: m.sku_name, label: m.sku_name }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Qty Used</label><input data-testid="repack-qty-used-input" type="number" step="0.01" value={repackForm.quantity_used} onChange={(e) => setRepackForm({ ...repackForm, quantity_used: e.target.value })} required className={inputCls} /></div>
                <div><label className={labelCls}>Qty Produced</label><input data-testid="repack-qty-produced-input" type="number" step="0.01" value={repackForm.quantity_produced} onChange={(e) => setRepackForm({ ...repackForm, quantity_produced: e.target.value })} required className={inputCls} /></div>
                <div><label className={labelCls}>Wastage</label><input data-testid="repack-wastage-input" type="number" step="0.01" value={repackForm.quantity_wasted} onChange={(e) => setRepackForm({ ...repackForm, quantity_wasted: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Repack Date</label><input data-testid="repack-date-input" type="date" value={repackForm.repack_date} onChange={(e) => setRepackForm({ ...repackForm, repack_date: e.target.value })} required className={inputCls} /></div>
              <div><label className={labelCls}>Notes (Optional)</label><textarea data-testid="repack-notes-input" value={repackForm.notes} onChange={(e) => setRepackForm({ ...repackForm, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" /></div>
              <div className="flex gap-3">
                <button data-testid="submit-repack-btn" type="submit" className="flex-1 h-10 bg-indigo-600 text-white font-medium rounded-sm hover:bg-indigo-700">{editingRepack ? 'Update Repack' : 'Create Repack'}</button>
                <button data-testid="cancel-repack-btn" type="button" onClick={() => { setShowRepackForm(false); setEditingRepack(null); }} className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== WASTAGE FORM MODAL ========== */}
      {showWastageForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-lg w-full p-6 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingWastage ? 'Edit Wastage' : 'Book Wastage'}</h2>
            <p className="text-sm text-slate-500 mb-4">Record wastage of finished product stock</p>
            <form onSubmit={handleWastageSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>SKU</label>
                  <SearchableSelect
                    testId="wastage-sku-select"
                    value={wastageForm.sku}
                    onChange={(val) => setWastageForm({ ...wastageForm, sku: val })}
                    placeholder="Select SKU..."
                    searchPlaceholder="Search SKUs..."
                    options={finishedSummary.filter(s => s.current_stock > 0).map(p => ({ value: p.sku, label: `${p.sku} (Stock: ${p.current_stock.toFixed(2)} ${p.unit})` }))}
                  />
                </div>
                <div><label className={labelCls}>Quantity</label><input data-testid="wastage-quantity-input" type="number" step="0.01" value={wastageForm.quantity} onChange={(e) => setWastageForm({ ...wastageForm, quantity: e.target.value })} required className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelCls}>Reason</label><input data-testid="wastage-reason-input" type="text" value={wastageForm.reason} onChange={(e) => setWastageForm({ ...wastageForm, reason: e.target.value })} required placeholder="e.g., Expired, Damaged" className={inputCls} /></div>
                <div><label className={labelCls}>Date</label><input data-testid="wastage-date-input" type="date" value={wastageForm.wastage_date} onChange={(e) => setWastageForm({ ...wastageForm, wastage_date: e.target.value })} required className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Notes (Optional)</label><textarea data-testid="wastage-notes-input" value={wastageForm.notes} onChange={(e) => setWastageForm({ ...wastageForm, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" /></div>
              <div className="flex gap-3">
                <button data-testid="submit-wastage-btn" type="submit" className="flex-1 h-10 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700">{editingWastage ? 'Update Wastage' : 'Book Wastage'}</button>
                <button data-testid="cancel-wastage-btn" type="button" onClick={() => { setShowWastageForm(false); setEditingWastage(null); }} className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========== TAB: STOCK LEDGER ========== */}
      {activeTab === 'ledger' && (
        <>
          {!selectedSkuFilter ? (
            <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
              <Truck className="mx-auto mb-2" size={32} />
              <p>Select a SKU from the filters above and click <strong>Apply</strong> to view its stock ledger</p>
            </div>
          ) : ledgerData.length === 0 ? (
            <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
              <Truck className="mx-auto mb-2" size={32} />
              <p>No transactions found for <strong>{selectedSkuFilter}</strong>. Try adjusting the date range or click Apply.</p>
            </div>
          ) : loading ? (
            <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500"><p>Loading...</p></div>
          ) : (
            <div className="space-y-4">
              {filteredLedger.map(item => {
                const isExpanded = expandedProducts[item.sku];
                return (
                  <div key={item.sku} className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
                    <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleExpand(item.sku)} data-testid={`toggle-${item.sku}`}>
                      <div className="flex items-center gap-3">
                        {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                        <div><h3 className="text-base font-semibold text-slate-900">{item.sku}</h3><p className="text-xs text-slate-500 mt-0.5">{item.unit} | {item.transactions.length} transaction(s)</p></div>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center"><p className="text-xs text-slate-500 uppercase">Opening</p><p className="font-semibold text-slate-700">{item.opening_stock.toFixed(2)}</p></div>
                        <div className="text-center"><p className="text-xs text-green-600 uppercase">In</p><p className="font-semibold text-green-600">+{item.total_in.toFixed(2)}</p></div>
                        <div className="text-center"><p className="text-xs text-red-600 uppercase">Out</p><p className="font-semibold text-red-600">-{item.total_out.toFixed(2)}</p></div>
                        <div className="text-center"><p className="text-xs text-slate-500 uppercase">Closing</p><p className="font-bold text-slate-900">{item.closing_stock.toFixed(2)}</p></div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-200">
                        <table className="w-full">
                          <thead><tr>
                            <th className={`${thCls} text-left`}>Date</th><th className={`${thCls} text-left`}>Type</th><th className={`${thCls} text-left`}>Description</th>
                            <th className={`${thCls} text-right`}>In</th><th className={`${thCls} text-right`}>Out</th><th className={`${thCls} text-right`}>Balance</th>
                          </tr></thead>
                          <tbody>
                            <tr className="bg-blue-50/50"><td className="px-4 py-2.5 text-sm text-slate-500" colSpan={3}>Opening Stock</td><td className="px-4 py-2.5 text-sm text-right">-</td><td className="px-4 py-2.5 text-sm text-right">-</td><td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-700">{item.opening_stock.toFixed(2)}</td></tr>
                            {item.transactions.map((t, idx) => (
                              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-2.5 text-sm text-slate-700">{t.date}</td>
                                <td className="px-4 py-2.5 text-sm"><span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${txnTypeColor(t.type)}`}>{t.type}</span></td>
                                <td className="px-4 py-2.5 text-sm text-slate-600">{t.description}</td>
                                <td className="px-4 py-2.5 text-sm text-right font-medium text-green-600">{t.in_qty > 0 ? `+${t.in_qty.toFixed(2)}` : '-'}</td>
                                <td className="px-4 py-2.5 text-sm text-right font-medium text-red-600">{t.out_qty > 0 ? `-${t.out_qty.toFixed(2)}` : '-'}</td>
                                <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{t.balance.toFixed(2)}</td>
                              </tr>
                            ))}
                            <tr className="bg-slate-100 font-semibold"><td className="px-4 py-2.5 text-sm text-slate-900" colSpan={3}>Closing Stock</td><td className="px-4 py-2.5 text-sm text-right text-green-700">{item.total_in.toFixed(2)}</td><td className="px-4 py-2.5 text-sm text-right text-red-700">{item.total_out.toFixed(2)}</td><td className="px-4 py-2.5 text-sm text-right text-slate-900">{item.closing_stock.toFixed(2)}</td></tr>
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

      {/* ========== TAB: DISPATCHES ========== */}
      {activeTab === 'dispatch' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">All Dispatches ({filteredDispatches.length})</h2></div>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr>
            <th className={`${thCls} text-left`}>Type</th><th className={`${thCls} text-left`}>Challan No.</th><th className={`${thCls} text-left`}>Destination</th><th className={`${thCls} text-left`}>Products</th><th className={`${thCls} text-left`}>Date</th>
            {canModify && <th className={`${thCls} text-center`}>Actions</th>}
          </tr></thead><tbody>
            {filteredDispatches.length === 0 ? (<tr><td colSpan={canModify ? "6" : "5"} className="px-4 py-8 text-center text-slate-500">No dispatches found</td></tr>) : (
              filteredDispatches.map(d => (
                <tr key={d.id} data-testid={`dispatch-${d.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm text-slate-700 capitalize">{d.dispatch_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-mono">{d.challan_number}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{d.destination}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{d.products.map((p, i) => <span key={i}>{p.sku || 'Product'} x{p.quantity}{i < d.products.length - 1 ? ', ' : ''}</span>)}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{d.date}</td>
                  {canModify && (<td className="px-4 py-3"><div className="flex items-center justify-center gap-2">
                    <button data-testid={`edit-dispatch-${d.id}`} onClick={() => handleEditDispatch(d)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm" title="Edit"><Edit size={16} /></button>
                    {user?.role === 'admin' && <button data-testid={`delete-dispatch-${d.id}`} onClick={() => handleDeleteDispatch(d.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16} /></button>}
                  </div></td>)}
                </tr>
              ))
            )}
          </tbody></table></div>
        </div>
      )}

      {/* ========== TAB: RECEIVES ========== */}
      {activeTab === 'receive' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">External Receives ({filteredReceives.length})</h2></div>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr>
            <th className={`${thCls} text-left`}>Date</th><th className={`${thCls} text-left`}>SKU</th><th className={`${thCls} text-right`}>Quantity</th><th className={`${thCls} text-left`}>Source</th><th className={`${thCls} text-right`}>Cost/Unit</th><th className={`${thCls} text-right`}>Total Cost</th><th className={`${thCls} text-left`}>Notes</th>
            {canModify && <th className={`${thCls} text-center`}>Actions</th>}
          </tr></thead><tbody>
            {filteredReceives.length === 0 ? (<tr><td colSpan={canModify ? "8" : "7"} className="px-4 py-8 text-center text-slate-500">No receives found</td></tr>) : (
              filteredReceives.map(r => (
                <tr key={r.id} data-testid={`receive-${r.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm text-slate-700">{r.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">{r.sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-semibold">{r.quantity} {r.unit}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{r.source_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{r.cost_per_unit?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-medium">{r.total_cost?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 truncate max-w-[200px]">{r.notes || '-'}</td>
                  {canModify && (<td className="px-4 py-3"><div className="flex items-center justify-center gap-2">
                    <button data-testid={`edit-receive-${r.id}`} onClick={() => handleEditReceive(r)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm" title="Edit"><Edit size={16} /></button>
                    {user?.role === 'admin' && <button data-testid={`delete-receive-${r.id}`} onClick={() => handleDeleteReceive(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16} /></button>}
                  </div></td>)}
                </tr>
              ))
            )}
          </tbody></table></div>
        </div>
      )}

      {/* ========== TAB: REPACKS ========== */}
      {activeTab === 'repack' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Repacking History ({filteredRepacks.length})</h2></div>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr>
            <th className={`${thCls} text-left`}>Repack Batch</th><th className={`${thCls} text-left`}>Date</th><th className={`${thCls} text-left`}>Source SKU</th><th className={`${thCls} text-left`}>Target SKU</th><th className={`${thCls} text-right`}>Qty Used</th><th className={`${thCls} text-right`}>Qty Produced</th><th className={`${thCls} text-right`}>Wastage</th><th className={`${thCls} text-left`}>Notes</th>
            {canModify && <th className={`${thCls} text-center`}>Actions</th>}
          </tr></thead><tbody>
            {filteredRepacks.length === 0 ? (<tr><td colSpan={canModify ? "9" : "8"} className="px-4 py-8 text-center text-slate-500">No repack entries found</td></tr>) : (
              filteredRepacks.map(rp => (
                <tr key={rp.id} data-testid={`repack-${rp.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm text-indigo-700 font-mono font-semibold">{rp.repack_batch_number}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{rp.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{rp.source_sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">{rp.target_sku}</td>
                  <td className="px-4 py-3 text-sm text-red-600 tabular-nums text-right font-medium">{rp.quantity_used}</td>
                  <td className="px-4 py-3 text-sm text-green-600 tabular-nums text-right font-semibold">{rp.quantity_produced}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 tabular-nums text-right">{rp.quantity_wasted}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 truncate max-w-[200px]">{rp.notes || '-'}</td>
                  {canModify && (<td className="px-4 py-3"><div className="flex items-center justify-center gap-2">
                    <button data-testid={`edit-repack-${rp.id}`} onClick={() => handleEditRepack(rp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm" title="Edit"><Edit size={16} /></button>
                    {user?.role === 'admin' && <button data-testid={`delete-repack-${rp.id}`} onClick={() => handleDeleteRepack(rp.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16} /></button>}
                  </div></td>)}
                </tr>
              ))
            )}
          </tbody></table></div>
        </div>
      )}

      {/* ========== TAB: WASTAGE ========== */}
      {activeTab === 'wastage' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-lg font-semibold text-slate-900">Book Wastage History ({filteredWastages.length})</h2></div>
          <div className="overflow-x-auto"><table className="w-full"><thead><tr>
            <th className={`${thCls} text-left`}>Date</th><th className={`${thCls} text-left`}>SKU</th><th className={`${thCls} text-right`}>Quantity</th><th className={`${thCls} text-left`}>Reason</th><th className={`${thCls} text-left`}>Notes</th><th className={`${thCls} text-left`}>Created By</th>
            {canModify && <th className={`${thCls} text-center`}>Actions</th>}
          </tr></thead><tbody>
            {filteredWastages.length === 0 ? (<tr><td colSpan={canModify ? "7" : "6"} className="px-4 py-8 text-center text-slate-500">No wastage entries found</td></tr>) : (
              filteredWastages.map(w => (
                <tr key={w.id} data-testid={`wastage-${w.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm text-slate-700">{w.date}</td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-medium">{w.sku}</td>
                  <td className="px-4 py-3 text-sm text-red-600 tabular-nums text-right font-semibold">{w.quantity} {w.unit}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{w.reason}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 truncate max-w-[200px]">{w.notes || '-'}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{w.created_by}</td>
                  {canModify && (<td className="px-4 py-3"><div className="flex items-center justify-center gap-2">
                    <button data-testid={`edit-wastage-${w.id}`} onClick={() => handleEditWastage(w)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm" title="Edit"><Edit size={16} /></button>
                    {user?.role === 'admin' && <button data-testid={`delete-wastage-${w.id}`} onClick={() => handleDeleteWastage(w.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16} /></button>}
                  </div></td>)}
                </tr>
              ))
            )}
          </tbody></table></div>
        </div>
      )}

      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default FinishedProduct;
