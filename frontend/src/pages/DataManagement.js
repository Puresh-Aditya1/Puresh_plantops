import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Archive, Download, Trash2, AlertTriangle, Calendar, Loader2, Calculator, Eye,
  Lock, Unlock, Upload, Pencil, Plus, Database, Clock, Play, Settings, Activity,
  CheckCircle, XCircle, RotateCcw, RefreshCw
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const DataManagement = ({ user }) => {
  const navigate = useNavigate();
  
  // Archive State
  const [archiveDate, setArchiveDate] = useState('');
  const [preview, setPreview] = useState(null);
  const [closingStock, setClosingStock] = useState(null);
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [recalculatedStock, setRecalculatedStock] = useState(null);
  const [recalculating, setRecalculating] = useState(false);

  // Entry Lock State
  const [lockDate, setLockDate] = useState('');
  const [newLockDate, setNewLockDate] = useState('');
  const [lockMsg, setLockMsg] = useState('');

  // Initial Stocks State
  const [initialStocks, setInitialStocks] = useState([]);
  const [showInitialForm, setShowInitialForm] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [initForm, setInitForm] = useState({ type: 'raw_material', name: '', quantity: '', date: '', unit: '' });
  const [initMsg, setInitMsg] = useState('');
  const [masters, setMasters] = useState({ raw: [], semi: [], finished: [] });

  // Backup State
  const [backupMsg, setBackupMsg] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [backupHistory, setBackupHistory] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);

  // Reset State
  const [resetStep, setResetStep] = useState(0);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const [resetting, setResetting] = useState(false);

  // Archive Delete State (double confirmation)
  const [deleteArchiveStep, setDeleteArchiveStep] = useState(0);
  const [archiveToDelete, setArchiveToDelete] = useState(null);
  const [deleteArchiveConfirmText, setDeleteArchiveConfirmText] = useState('');

  // Transaction Logs State
  const [txLogs, setTxLogs] = useState({ logs: [], summary: { total: 0, failed: 0, rolled_back: 0 } });
  const [txLogsLoading, setTxLogsLoading] = useState(false);
  const [txStatusFilter, setTxStatusFilter] = useState('');

  // Active Tab
  const [activeTab, setActiveTab] = useState('txlogs');

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchArchives();
      fetchLockDate();
      fetchInitialStocks();
      fetchMasters();
      fetchBackupHistory();
    }
  }, [user]);

  // Fetch transaction logs when tab is selected
  useEffect(() => {
    if (activeTab === 'txlogs' && user?.role === 'admin') {
      fetchTransactionLogs(txStatusFilter);
    }
  }, [activeTab, user]);

  // Archive Functions
  const fetchArchives = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/archive/list`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setArchives(res.data);
    } catch (err) {
      console.error('Failed to fetch archives:', err);
    }
  };

  // Transaction Logs Functions
  const fetchTransactionLogs = async (statusFilter = '') => {
    setTxLogsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.append('status', statusFilter);
      const res = await axios.get(`${BACKEND_URL}/api/transaction-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTxLogs(res.data);
    } catch (err) {
      console.error('Failed to fetch transaction logs:', err);
    } finally {
      setTxLogsLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!archiveDate) {
      setError('Please select an archive date');
      return;
    }
    
    setPreviewLoading(true);
    setError('');
    setPreview(null);
    setClosingStock(null);
    
    try {
      const token = localStorage.getItem('token');
      const [previewRes, stockRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/archive/preview?archive_date=${archiveDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${BACKEND_URL}/api/archive/closing-stock?archive_date=${archiveDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      setPreview(previewRes.data);
      setClosingStock(stockRes.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to preview archive');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleArchive = () => {
    if (!preview || preview.total_records === 0) {
      setError('No records to archive for the selected date');
      return;
    }
    
    setConfirmDialog({
      open: true,
      title: 'Confirm Archive',
      message: `Are you sure you want to archive ${preview.total_records} records dated on or before ${archiveDate}? This will move the data to archive storage and create opening balances for the next day.`,
      onConfirm: executeArchive
    });
  };

  const executeArchive = async () => {
    setArchiving(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${BACKEND_URL}/api/archive/execute?archive_date=${archiveDate}`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSuccess(`Successfully archived ${res.data.total_records} records. Opening balances created for ${archiveDate}.`);
      setPreview(null);
      setClosingStock(null);
      setArchiveDate('');
      fetchArchives();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to execute archive');
    } finally {
      setArchiving(false);
    }
  };

  const handleDownloadArchive = async (archiveId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/archive/download/${archiveId}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${archiveId}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      setError('Failed to download archive');
    }
  };

  const handleDeleteArchive = (archive) => {
    // Start double confirmation process
    setArchiveToDelete(archive);
    setDeleteArchiveStep(1);
    setDeleteArchiveConfirmText('');
  };

  const executeDeleteArchive = async () => {
    if (deleteArchiveConfirmText !== 'DELETE ARCHIVE') return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${BACKEND_URL}/api/archive/${archiveToDelete.archive_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(`Archive from ${archiveToDelete.archive_date} deleted successfully`);
      fetchArchives();
      // Reset delete state
      setDeleteArchiveStep(0);
      setArchiveToDelete(null);
      setDeleteArchiveConfirmText('');
    } catch (err) {
      setError('Failed to delete archive');
    }
  };

  const cancelDeleteArchive = () => {
    setDeleteArchiveStep(0);
    setArchiveToDelete(null);
    setDeleteArchiveConfirmText('');
  };

  const handleRecalculateStock = async () => {
    setRecalculating(true);
    setRecalculatedStock(null);
    setError('');
    
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/archive/recalculate-stock`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecalculatedStock(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to recalculate stock');
    } finally {
      setRecalculating(false);
    }
  };

  // Lock Date Functions
  const fetchLockDate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/settings/lock-date`, { headers: { Authorization: `Bearer ${token}` } });
      setLockDate(res.data.lock_date || '');
      setNewLockDate(res.data.lock_date || '');
    } catch (err) { console.error(err); }
  };

  const handleSetLockDate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${BACKEND_URL}/api/settings/lock-date`, { lock_date: newLockDate }, { headers: { Authorization: `Bearer ${token}` } });
      setLockDate(res.data.lock_date);
      setLockMsg(res.data.message);
      setTimeout(() => setLockMsg(''), 3000);
    } catch (err) { setLockMsg(err.response?.data?.detail || 'Failed'); }
  };

  const handleClearLockDate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${BACKEND_URL}/api/settings/lock-date`, { lock_date: '' }, { headers: { Authorization: `Bearer ${token}` } });
      setLockDate('');
      setNewLockDate('');
      setLockMsg(res.data.message);
      setTimeout(() => setLockMsg(''), 3000);
    } catch (err) { setLockMsg(err.response?.data?.detail || 'Failed'); }
  };

  // Initial Stocks Functions
  const fetchInitialStocks = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/initial-stocks`, { headers: { Authorization: `Bearer ${token}` } });
      setInitialStocks(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const [rawRes, semiRes, finRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/raw-material-master`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/semi-finished-master`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-master`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setMasters({ raw: rawRes.data, semi: semiRes.data, finished: finRes.data });
    } catch (err) { console.error(err); }
  };

  const getNameOptions = () => {
    if (initForm.type === 'raw_material') return masters.raw.map(m => ({ name: m.name, unit: m.unit }));
    if (initForm.type === 'semi_finished') return masters.semi.map(m => ({ name: m.name, unit: m.unit || 'kg' }));
    if (initForm.type === 'finished') return masters.finished.map(m => ({ name: m.sku_name, unit: m.uom || 'pcs' }));
    return [];
  };

  const handleInitSubmit = async (e) => {
    e.preventDefault();
    setInitMsg('');
    try {
      const token = localStorage.getItem('token');
      if (editingStock) {
        await axios.put(`${BACKEND_URL}/api/initial-stocks/${editingStock.id}`, {
          quantity: parseFloat(initForm.quantity), date: initForm.date
        }, { headers: { Authorization: `Bearer ${token}` } });
        setInitMsg('Initial stock updated!');
      } else {
        await axios.post(`${BACKEND_URL}/api/initial-stocks`, {
          type: initForm.type, name: initForm.name,
          quantity: parseFloat(initForm.quantity), date: initForm.date, unit: initForm.unit
        }, { headers: { Authorization: `Bearer ${token}` } });
        setInitMsg('Initial stock added!');
      }
      setShowInitialForm(false);
      setEditingStock(null);
      setInitForm({ type: 'raw_material', name: '', quantity: '', date: '', unit: '' });
      fetchInitialStocks();
      setTimeout(() => setInitMsg(''), 3000);
    } catch (err) { setInitMsg(err.response?.data?.detail || 'Failed to save'); }
  };

  const handleDeleteInitial = (stockId) => {
    setConfirmDialog({
      open: true, title: 'Delete Initial Stock', message: 'Are you sure you want to delete this initial stock entry?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/initial-stocks/${stockId}`, { headers: { Authorization: `Bearer ${token}` } });
          setInitMsg('Deleted!');
          fetchInitialStocks();
          setTimeout(() => setInitMsg(''), 3000);
        } catch (err) { setInitMsg(err.response?.data?.detail || 'Failed to delete'); }
      }
    });
  };

  // Backup Functions
  const fetchBackupHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/backup/history`, { headers: { Authorization: `Bearer ${token}` } });
      setBackupHistory(res.data);
    } catch (err) { console.error(err); }
  };

  const handleRunBackup = async () => {
    setBackupLoading(true); setBackupMsg('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/backup/run-now`, {}, { headers: { Authorization: `Bearer ${token}` } });
      setBackupMsg('Backup completed!');
      fetchBackupHistory();
    } catch (err) { setBackupMsg('Backup failed'); }
    finally { setBackupLoading(false); }
  };

  const handleDownloadBackup = async () => {
    try {
      setBackupMsg('Downloading...');
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/backup/download`, { headers: { Authorization: `Bearer ${token}` } });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `puresh_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupMsg('Backup downloaded successfully!');
      setTimeout(() => setBackupMsg(''), 3000);
    } catch (err) { setBackupMsg(err.response?.data?.detail || 'Download failed'); }
  };

  const handleDownloadBackupFile = async (filename) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/backup/download/${filename}`, {
        headers: { Authorization: `Bearer ${token}` }, responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) { console.error(err); }
  };

  const handleDeleteBackup = (backupId) => {
    setConfirmDialog({
      open: true, title: 'Delete Backup', message: 'Delete this backup file permanently?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/backup/${backupId}`, { headers: { Authorization: `Bearer ${token}` } });
          setBackupMsg('Backup deleted');
          fetchBackupHistory();
        } catch (err) { setBackupMsg('Failed to delete'); }
      }
    });
  };

  const handleRestoreBackup = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoring(true);
    setBackupMsg('Restoring...');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      const res = await axios.post(`${BACKEND_URL}/api/backup/restore`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      setBackupMsg(`Restored: ${res.data.collections.length} collections`);
      setTimeout(() => setBackupMsg(''), 5000);
    } catch (err) { setBackupMsg(err.response?.data?.detail || 'Restore failed'); }
    finally { setRestoring(false); e.target.value = ''; }
  };

  // Reset Functions
  const handleResetData = async () => {
    if (resetConfirmText !== 'RESET ALL DATA') return;
    setResetting(true);
    setResetMsg('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${BACKEND_URL}/api/admin/reset-data`, { confirm: 'RESET ALL DATA' }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResetMsg(`Done! Dropped ${res.data.dropped_collections.length} collections. Only admin user remains.`);
      setResetStep(0);
      setResetConfirmText('');
    } catch (err) { setResetMsg(err.response?.data?.detail || 'Reset failed'); }
    finally { setResetting(false); }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-500">
        <AlertTriangle className="mx-auto mb-2" size={32} />
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  const tabs = [
    { id: 'txlogs', label: 'Transaction Logs', icon: Activity },
    { id: 'lock', label: 'Entry Lock', icon: Lock },
    { id: 'backup', label: 'Backup & Restore', icon: Download },
    { id: 'archive', label: 'Data Archive', icon: Archive },
    { id: 'initial', label: 'Initial Stock', icon: Database },
    { id: 'reset', label: 'Reset Data', icon: Trash2 },
  ];

  return (
    <div className="space-y-6">
      <ConfirmDialog 
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => { confirmDialog.onConfirm?.(); setConfirmDialog({ ...confirmDialog, open: false }); }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, open: false })}
      />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Settings size={28} className="text-slate-600" />
          Data Mgmt. - Admin
        </h1>
        <p className="text-slate-600">Manage data archiving, locks, backups, and system settings</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">{success}</div>}

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-sm">
        <div className="flex border-b border-slate-200 overflow-x-auto">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-slate-900 text-slate-900 bg-slate-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {/* Data Archive Tab */}
          {activeTab === 'archive' && (
            <div className="space-y-6">
              {/* Create Archive */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Archive size={20} className="text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Create New Archive</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                      Archive Date (data on or before this date)
                    </label>
                    <input
                      type="date"
                      data-testid="archive-date-input"
                      value={archiveDate}
                      onChange={(e) => setArchiveDate(e.target.value)}
                      className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      data-testid="archive-preview-btn"
                      onClick={handlePreview}
                      disabled={previewLoading || !archiveDate}
                      className="px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {previewLoading ? <Loader2 size={16} className="animate-spin" /> : <Calendar size={16} />}
                      Preview
                    </button>
                  </div>
                </div>

                {/* Preview Results */}
                {preview && (
                  <div className="mt-6 border-t border-slate-200 pt-6">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Records to Archive:</h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                      {Object.entries(preview.collections).map(([key, count]) => (
                        <div key={key} className="bg-slate-50 p-3 rounded-sm">
                          <p className="text-xs text-slate-500 capitalize">{key.replace(/_/g, ' ')}</p>
                          <p className="text-lg font-semibold text-slate-900">{count}</p>
                        </div>
                      ))}
                    </div>
                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-sm mb-4">
                      <p className="text-sm text-blue-800">
                        <strong>Total Records:</strong> {preview.total_records}
                      </p>
                    </div>

                    {/* Closing Stock Preview */}
                    {closingStock && (
                      <div className="mt-4">
                        <h3 className="text-sm font-semibold text-slate-700 mb-3">Closing Stock (will become Opening Balance):</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="bg-slate-50 p-3 rounded-sm">
                            <p className="text-xs text-slate-500 font-semibold mb-2">Semi-Finished Products</p>
                            {Object.entries(closingStock.semi_finished_stock || {}).length === 0 ? (
                              <p className="text-sm text-slate-400">No stock</p>
                            ) : (
                              Object.entries(closingStock.semi_finished_stock).map(([name, qty]) => (
                                <p key={name} className="text-sm">{name}: <strong>{qty.toFixed(2)} kg</strong></p>
                              ))
                            )}
                          </div>
                          <div className="bg-slate-50 p-3 rounded-sm">
                            <p className="text-xs text-slate-500 font-semibold mb-2">Finished Products</p>
                            {Object.entries(closingStock.finished_stock || {}).length === 0 ? (
                              <p className="text-sm text-slate-400">No stock</p>
                            ) : (
                              Object.entries(closingStock.finished_stock).map(([sku, qty]) => (
                                <p key={sku} className="text-sm">{sku}: <strong>{qty.toFixed(2)}</strong></p>
                              ))
                            )}
                          </div>
                          <div className="bg-slate-50 p-3 rounded-sm">
                            <p className="text-xs text-slate-500 font-semibold mb-2">Raw Materials</p>
                            {Object.entries(closingStock.raw_material_stock || {}).length === 0 ? (
                              <p className="text-sm text-slate-400">No stock</p>
                            ) : (
                              Object.entries(closingStock.raw_material_stock).map(([name, qty]) => (
                                <p key={name} className="text-sm">{name}: <strong>{qty.toFixed(2)}</strong></p>
                              ))
                            )}
                          </div>
                          <div className="bg-slate-50 p-3 rounded-sm">
                            <p className="text-xs text-slate-500 font-semibold mb-2">Milk Stock</p>
                            {!closingStock.milk_stock || Object.keys(closingStock.milk_stock).length === 0 ? (
                              <p className="text-sm text-slate-400">No stock</p>
                            ) : (
                              <>
                                <p className="text-sm">Milk: <strong>{closingStock.milk_stock.Milk?.toFixed(2) || 0} kg</strong></p>
                                <p className="text-sm">Fat: <strong>{closingStock.milk_stock.Fat?.toFixed(2) || 0} kg</strong></p>
                                <p className="text-sm">SNF: <strong>{closingStock.milk_stock.SNF?.toFixed(2) || 0} kg</strong></p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex gap-3">
                      <button
                        data-testid="archive-execute-btn"
                        onClick={handleArchive}
                        disabled={archiving || preview.total_records === 0}
                        className="px-6 py-2 bg-orange-600 text-white font-medium rounded-sm hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {archiving ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                        Archive Now
                      </button>
                      <button
                        onClick={() => { setPreview(null); setClosingStock(null); }}
                        className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Archive History */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Archive size={20} className="text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Archive History</h2>
                </div>

                {archives.length === 0 ? (
                  <p className="text-slate-500 text-sm">No archives yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-600">Archive Date</th>
                          <th className="text-left py-3 px-2 font-semibold text-slate-600">Executed</th>
                          <th className="text-left py-3 px-2 font-semibold text-slate-600">By</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-600">Records</th>
                          <th className="text-right py-3 px-2 font-semibold text-slate-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {archives.map((archive) => (
                          <tr key={archive.archive_id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-2 font-medium text-slate-900">{archive.archive_date}</td>
                            <td className="py-3 px-2 text-slate-600">
                              {new Date(archive.executed_at).toLocaleString()}
                            </td>
                            <td className="py-3 px-2 text-slate-600">{archive.executed_by}</td>
                            <td className="py-3 px-2 text-right text-slate-900">{archive.total_records}</td>
                            <td className="py-3 px-2 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => navigate(`/archive/${archive.archive_id}`)}
                                  className="p-1.5 text-slate-600 hover:bg-slate-100 rounded"
                                  title="View archive data"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  onClick={() => handleDownloadArchive(archive.archive_id)}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                  title="Download Excel files"
                                >
                                  <Download size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteArchive(archive)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                  title="Delete archive"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Double Confirmation for Archive Delete */}
                {deleteArchiveStep === 1 && archiveToDelete && (
                  <div className="mt-4 bg-red-50 border border-red-200 rounded-sm p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-700">
                      Are you sure you want to permanently delete the archive from <strong>{archiveToDelete.archive_date}</strong> ({archiveToDelete.total_records} records)?
                    </p>
                    <div className="flex gap-3">
                      <button data-testid="delete-archive-confirm-step1" onClick={() => setDeleteArchiveStep(2)}
                        className="h-10 px-4 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700">
                        Yes, I want to delete
                      </button>
                      <button data-testid="delete-archive-cancel-step1" onClick={cancelDeleteArchive}
                        className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {deleteArchiveStep === 2 && archiveToDelete && (
                  <div className="mt-4 bg-red-50 border border-red-300 rounded-sm p-4 space-y-3">
                    <p className="text-sm font-semibold text-red-700">
                      Type <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">DELETE ARCHIVE</span> to confirm permanent deletion:
                    </p>
                    <input data-testid="delete-archive-confirm-input" type="text" value={deleteArchiveConfirmText}
                      onChange={(e) => setDeleteArchiveConfirmText(e.target.value)}
                      placeholder="Type DELETE ARCHIVE"
                      className="w-full max-w-sm h-10 px-3 bg-white border border-red-300 rounded-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-slate-900 placeholder:text-slate-400" />
                    <div className="flex gap-3">
                      <button data-testid="delete-archive-confirm-final" onClick={executeDeleteArchive}
                        disabled={deleteArchiveConfirmText !== 'DELETE ARCHIVE'}
                        className="h-10 px-4 bg-red-700 text-white font-medium rounded-sm hover:bg-red-800 disabled:opacity-50 flex items-center gap-2">
                        <Trash2 size={15} /> Permanently Delete
                      </button>
                      <button data-testid="delete-archive-cancel-step2" onClick={cancelDeleteArchive}
                        className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Stock Integrity Check */}
              <div className="border-t border-slate-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calculator size={20} className="text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Stock Integrity Check</h2>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Recalculate stock from all transactions to verify data integrity. Compare with displayed stock to find discrepancies.
                </p>
                <button
                  data-testid="recalculate-stock-btn"
                  onClick={handleRecalculateStock}
                  disabled={recalculating}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {recalculating ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                  Recalculate Stock
                </button>

                {recalculatedStock && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="text-xs text-slate-500 mb-3">
                      Calculated at: {new Date(recalculatedStock.calculated_at).toLocaleString()}
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-50 p-3 rounded-sm">
                        <p className="text-xs text-slate-500 font-semibold mb-2">Semi-Finished Products</p>
                        {Object.entries(recalculatedStock.semi_finished_stock || {}).length === 0 ? (
                          <p className="text-sm text-slate-400">No stock</p>
                        ) : (
                          Object.entries(recalculatedStock.semi_finished_stock).map(([name, qty]) => (
                            <p key={name} className="text-sm">{name}: <strong>{qty} kg</strong></p>
                          ))
                        )}
                      </div>
                      <div className="bg-slate-50 p-3 rounded-sm">
                        <p className="text-xs text-slate-500 font-semibold mb-2">Finished Products</p>
                        {Object.entries(recalculatedStock.finished_stock || {}).length === 0 ? (
                          <p className="text-sm text-slate-400">No stock</p>
                        ) : (
                          Object.entries(recalculatedStock.finished_stock).map(([sku, qty]) => (
                            <p key={sku} className="text-sm">{sku}: <strong>{qty}</strong></p>
                          ))
                        )}
                      </div>
                      <div className="bg-slate-50 p-3 rounded-sm">
                        <p className="text-xs text-slate-500 font-semibold mb-2">Raw Materials</p>
                        {Object.entries(recalculatedStock.raw_material_stock || {}).length === 0 ? (
                          <p className="text-sm text-slate-400">No stock</p>
                        ) : (
                          Object.entries(recalculatedStock.raw_material_stock).map(([name, qty]) => (
                            <p key={name} className="text-sm">{name}: <strong>{qty}</strong></p>
                          ))
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-3 italic">{recalculatedStock.note}</p>
                  </div>
                )}
              </div>

              {/* Info Box */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-sm">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">About Data Archiving</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Archived data is moved to separate storage but remains accessible for download</li>
                      <li>Opening balances are automatically created to maintain stock continuity</li>
                      <li><strong>Opening balance entries are read-only</strong> - they cannot be edited or deleted</li>
                      <li>Download archived data as Excel files anytime from the history below</li>
                      <li>Deleting an archive permanently removes the data - this cannot be undone</li>
                      <li>Activity logs older than 30 days are automatically cleaned up</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Entry Lock Tab */}
          {activeTab === 'lock' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock size={20} className="text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">Entry Lock</h2>
                {lockDate && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-sm font-medium ml-2">Locked till {lockDate}</span>}
              </div>
              <p className="text-sm text-slate-500 mb-4">Non-admin users cannot create or edit entries on or before the lock date.</p>
              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Lock Date</label>
                  <input data-testid="lock-date-input" type="date" value={newLockDate}
                    onChange={(e) => setNewLockDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <button data-testid="set-lock-btn" onClick={handleSetLockDate} disabled={!newLockDate}
                  className="h-10 px-4 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                  <Lock size={15} /> Set Lock
                </button>
                {lockDate && (
                  <button data-testid="clear-lock-btn" onClick={handleClearLockDate}
                    className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50 flex items-center gap-2">
                    <Unlock size={15} /> Clear Lock
                  </button>
                )}
              </div>
              {lockMsg && <p className="text-sm text-green-600 mt-3">{lockMsg}</p>}
            </div>
          )}

          {/* Initial Stock Tab */}
          {activeTab === 'initial' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Database size={20} className="text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Initial Stock Balances</h2>
                </div>
                <button data-testid="add-initial-stock-btn" onClick={() => { setEditingStock(null); setInitForm({ type: 'raw_material', name: '', quantity: '', date: '', unit: '' }); setShowInitialForm(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">
                  <Plus size={14} /> Add
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">Set starting stock balances for items already in inventory before this system went live.</p>

              {initMsg && <p className={`text-sm mb-3 ${initMsg.includes('Failed') || initMsg.includes('already') ? 'text-red-600' : 'text-green-600'}`}>{initMsg}</p>}

              {/* Form Modal */}
              {showInitialForm && (
                <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-sm max-w-lg w-full p-6">
                    <h2 className="text-xl font-semibold text-slate-900 mb-4">{editingStock ? 'Edit' : 'Add'} Initial Stock</h2>
                    <form onSubmit={handleInitSubmit} className="space-y-4">
                      {!editingStock && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
                            <select data-testid="init-type-select" value={initForm.type}
                              onChange={(e) => setInitForm({ ...initForm, type: e.target.value, name: '', unit: '' })}
                              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900">
                              <option value="raw_material">Raw Material</option>
                              <option value="semi_finished">Semi-Finished Product</option>
                              <option value="finished">Finished Product (SKU)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Item</label>
                            <select data-testid="init-name-select" value={initForm.name}
                              onChange={(e) => {
                                const opt = getNameOptions().find(o => o.name === e.target.value);
                                setInitForm({ ...initForm, name: e.target.value, unit: opt?.unit || '' });
                              }}
                              required className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900">
                              <option value="">Select item...</option>
                              {getNameOptions().map(o => (
                                <option key={o.name} value={o.name}>{o.name} ({o.unit})</option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Quantity</label>
                          <input data-testid="init-qty-input" type="number" step="0.01" value={initForm.quantity}
                            onChange={(e) => setInitForm({ ...initForm, quantity: e.target.value })}
                            required className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
                          <input data-testid="init-date-input" type="date" value={initForm.date}
                            onChange={(e) => setInitForm({ ...initForm, date: e.target.value })}
                            max={new Date().toISOString().split('T')[0]}
                            required className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button data-testid="init-submit-btn" type="submit"
                          className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">
                          {editingStock ? 'Save Changes' : 'Add Initial Stock'}
                        </button>
                        <button type="button" onClick={() => { setShowInitialForm(false); setEditingStock(null); }}
                          className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Cancel</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Table */}
              {initialStocks.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Type</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Name</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Quantity</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Date</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {initialStocks.map(s => (
                        <tr key={s.id} data-testid={`init-stock-${s.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 text-sm">
                            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
                              s.type === 'raw_material' ? 'bg-blue-100 text-blue-700' :
                              s.type === 'semi_finished' ? 'bg-amber-100 text-amber-700' :
                              'bg-green-100 text-green-700'
                            }`}>{s.type === 'raw_material' ? 'Raw Material' : s.type === 'semi_finished' ? 'Semi-Finished' : 'Finished'}</span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-700 font-medium">{s.name}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums text-right">{s.quantity} {s.unit}</td>
                          <td className="px-4 py-2.5 text-sm text-slate-700">{s.date}</td>
                          <td className="px-4 py-2.5 flex gap-1">
                            <button data-testid={`edit-init-${s.id}`} onClick={() => {
                              setEditingStock(s);
                              setInitForm({ type: s.type, name: s.name, quantity: s.quantity, date: s.date, unit: s.unit });
                              setShowInitialForm(true);
                            }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Pencil size={14} /></button>
                            <button data-testid={`delete-init-${s.id}`} onClick={() => handleDeleteInitial(s.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-4">No initial stocks set yet.</p>
              )}
            </div>
          )}

          {/* Backup & Restore Tab */}
          {activeTab === 'backup' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Download size={20} className="text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">Data Backup & Restore</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">Automatic daily backups run every 24 hours. You can also trigger a manual backup or restore from a file.</p>
              <div className="flex items-center gap-3 mb-5">
                <button data-testid="download-backup-btn" onClick={handleDownloadBackup}
                  className="h-10 px-4 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700 flex items-center gap-2">
                  <Download size={15} /> Download Backup
                </button>
                <label className="h-10 px-4 bg-amber-600 text-white font-medium rounded-sm hover:bg-amber-700 flex items-center gap-2 cursor-pointer">
                  <Upload size={15} /> {restoring ? 'Restoring...' : 'Restore from Backup'}
                  <input data-testid="restore-backup-input" type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" disabled={restoring} />
                </label>
                <button data-testid="run-backup-btn" onClick={handleRunBackup} disabled={backupLoading}
                  className="h-10 px-4 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
                  <Play size={15} /> {backupLoading ? 'Running...' : 'Backup Now'}
                </button>
              </div>
              {backupMsg && <p className="text-sm text-blue-600 mb-4">{backupMsg}</p>}

              {/* Backup History Table */}
              {backupHistory.length > 0 && (
                <div className="border border-slate-200 rounded-sm overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <Clock size={15} className="text-slate-500" />
                    <h3 className="text-sm font-semibold text-slate-700">Backup History (last {backupHistory.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead><tr>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Date & Time</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">File</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Size</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-center border-b border-slate-200">Type</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-center border-b border-slate-200">Actions</th>
                      </tr></thead>
                      <tbody>
                        {backupHistory.map(b => (
                          <tr key={b.id} data-testid={`backup-${b.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 text-sm text-slate-700">{new Date(b.created_at).toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-sm text-slate-700 font-mono text-xs">{b.filename}</td>
                            <td className="px-4 py-2.5 text-sm text-slate-700 tabular-nums text-right">{(b.size_bytes / 1024).toFixed(1)} KB</td>
                            <td className="px-4 py-2.5 text-sm text-center">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${b.type === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{b.type}</span>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button data-testid={`download-backup-${b.id}`} onClick={() => handleDownloadBackupFile(b.filename)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-sm" title="Download"><Download size={15} /></button>
                                <button data-testid={`delete-backup-${b.id}`} onClick={() => handleDeleteBackup(b.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={15} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Transaction Logs Tab */}
          {activeTab === 'txlogs' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={20} className="text-blue-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Transaction Logs</h2>
                </div>
                <button 
                  data-testid="refresh-txlogs-btn"
                  onClick={() => fetchTransactionLogs(txStatusFilter)}
                  disabled={txLogsLoading}
                  className="h-9 px-3 bg-slate-100 text-slate-700 font-medium rounded-sm hover:bg-slate-200 flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={txLogsLoading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>
              
              <p className="text-sm text-slate-500 mb-4">
                Monitor all critical operations (batch creation, packing, dispatch) for atomicity. 
                Failed transactions are automatically rolled back to prevent inventory mismatches.
              </p>

              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div className="bg-slate-50 border border-slate-200 rounded-sm p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total</p>
                  <p className="text-2xl font-bold text-slate-900">{txLogs.summary.total}</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-sm p-4">
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Failed</p>
                  <p className="text-2xl font-bold text-red-600">{txLogs.summary.failed}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-sm p-4">
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-1">Rolled Back</p>
                  <p className="text-2xl font-bold text-amber-600">{txLogs.summary.rolled_back}</p>
                </div>
              </div>

              {/* Filter */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filter by Status:</label>
                <select 
                  data-testid="txlogs-status-filter"
                  value={txStatusFilter}
                  onChange={(e) => { setTxStatusFilter(e.target.value); fetchTransactionLogs(e.target.value); }}
                  className="h-9 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 text-sm"
                >
                  <option value="">All</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="rolled_back">Rolled Back</option>
                </select>
              </div>

              {/* Logs Table */}
              {txLogsLoading ? (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                  <p className="text-sm">Loading transaction logs...</p>
                </div>
              ) : txLogs.logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Activity size={24} className="mx-auto mb-2 text-slate-400" />
                  <p className="text-sm">No transaction logs found. Logs are created when batch, packing, or dispatch operations run.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-sm">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Time</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Type</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-center border-b border-slate-200">Status</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Steps</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">User</th>
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txLogs.logs.map((log, idx) => (
                        <tr key={log.transaction_id || idx} data-testid={`txlog-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-sm text-slate-700 whitespace-nowrap">
                            {log.logged_at ? new Date(log.logged_at).toLocaleString() : '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                              log.transaction_type === 'batch_create' ? 'bg-blue-100 text-blue-700' :
                              log.transaction_type === 'packing' ? 'bg-purple-100 text-purple-700' :
                              log.transaction_type === 'dispatch' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {log.transaction_type?.replace('_', ' ').toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-center">
                            {log.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm bg-green-100 text-green-700">
                                <CheckCircle size={12} /> Completed
                              </span>
                            )}
                            {log.status === 'failed' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm bg-red-100 text-red-700">
                                <XCircle size={12} /> Failed
                              </span>
                            )}
                            {log.status === 'rolled_back' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-sm bg-amber-100 text-amber-700">
                                <RotateCcw size={12} /> Rolled Back
                              </span>
                            )}
                            {!['completed', 'failed', 'rolled_back'].includes(log.status) && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-sm bg-slate-100 text-slate-600">
                                {log.status}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            <div className="flex flex-wrap gap-1">
                              {log.steps?.map((step, i) => (
                                <span 
                                  key={i} 
                                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                    step.completed ? 'bg-green-100 text-green-700' : 
                                    step.error ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                                  }`}
                                  title={step.error || (step.completed ? 'Completed' : 'Pending')}
                                >
                                  {step.name?.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-600">
                            {log.metadata?.user || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-red-600 max-w-[200px] truncate" title={log.error || ''}>
                            {log.error || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Info Box */}
              <div className="mt-6 bg-blue-50 border border-blue-200 p-4 rounded-sm">
                <div className="flex items-start gap-3">
                  <Activity size={20} className="text-blue-600 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold mb-1">About Transaction Atomicity</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li><strong>Batch Create</strong>: Insert batch → Update raw materials → Create semi/finished product</li>
                      <li><strong>Packing</strong>: Deduct semi-finished (FIFO) → Update raw materials → Create finished product</li>
                      <li><strong>Dispatch</strong>: Deduct finished stock (FIFO) → Create dispatch record</li>
                      <li>If any step fails, all previous steps are <strong>automatically rolled back</strong></li>
                      <li>This prevents inventory mismatches from partial failures</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reset Data Tab */}
          {activeTab === 'reset' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trash2 size={20} className="text-red-600" />
                <h2 className="text-lg font-semibold text-red-700">Reset All Data</h2>
              </div>
              <p className="text-sm text-slate-500 mb-4">Permanently delete all data including masters, transactions, and non-admin users. Only the admin account will remain. This action cannot be undone.</p>

              {resetStep === 0 && (
                <button data-testid="reset-data-btn" onClick={() => setResetStep(1)}
                  className="h-10 px-4 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700 flex items-center gap-2">
                  <Trash2 size={15} /> Reset All Data
                </button>
              )}

              {resetStep === 1 && (
                <div className="bg-red-50 border border-red-200 rounded-sm p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Are you sure? This will permanently delete ALL data.</p>
                  <div className="flex gap-3">
                    <button data-testid="reset-confirm-step1" onClick={() => setResetStep(2)}
                      className="h-10 px-4 bg-red-600 text-white font-medium rounded-sm hover:bg-red-700">
                      Yes, I want to reset
                    </button>
                    <button data-testid="reset-cancel-step1" onClick={() => { setResetStep(0); setResetMsg(''); }}
                      className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {resetStep === 2 && (
                <div className="bg-red-50 border border-red-300 rounded-sm p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-700">Type <span className="font-mono bg-red-100 px-1.5 py-0.5 rounded">RESET ALL DATA</span> to confirm:</p>
                  <input data-testid="reset-confirm-input" type="text" value={resetConfirmText}
                    onChange={(e) => setResetConfirmText(e.target.value)}
                    placeholder="Type RESET ALL DATA"
                    className="w-full max-w-sm h-10 px-3 bg-white border border-red-300 rounded-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-slate-900 placeholder:text-slate-400" />
                  <div className="flex gap-3">
                    <button data-testid="reset-confirm-final" onClick={handleResetData}
                      disabled={resetConfirmText !== 'RESET ALL DATA' || resetting}
                      className="h-10 px-4 bg-red-700 text-white font-medium rounded-sm hover:bg-red-800 disabled:opacity-50 flex items-center gap-2">
                      <Trash2 size={15} /> {resetting ? 'Resetting...' : 'Permanently Reset'}
                    </button>
                    <button data-testid="reset-cancel-step2" onClick={() => { setResetStep(0); setResetConfirmText(''); setResetMsg(''); }}
                      className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {resetMsg && <p className={`text-sm mt-3 ${resetMsg.startsWith('Done') ? 'text-green-600' : 'text-red-600'}`}>{resetMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataManagement;
