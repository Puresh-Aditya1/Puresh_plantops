import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Calendar, IndianRupee, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import ConfirmDialog from '../components/ConfirmDialog';
import { Switch } from '../components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const RawMaterialMaster = ({ user }) => {
  const [activeTab, setActiveTab] = useState('materials');
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [rates, setRates] = useState([]);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [editingRate, setEditingRate] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  // Bulk Rate Entry State
  const [allRateData, setAllRateData] = useState([]);
  const [bulkRateForm, setBulkRateForm] = useState({});
  const [bulkFromDate, setBulkFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkTillDate, setBulkTillDate] = useState('');
  const [expandedRates, setExpandedRates] = useState({});

  const [materialForm, setMaterialForm] = useState({
    name: '',
    unit: 'kg',
    description: ''
  });

  const [rateForm, setRateForm] = useState({
    rate: '',
    from_date: '',
    to_date: ''
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMaterials();
    fetchAllRateData();
  }, []);

  useEffect(() => {
    if (selectedMaterial) {
      fetchRates(selectedMaterial.id);
    }
  }, [selectedMaterial]);

  const fetchAllRateData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/raw-material-rates-all`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllRateData(res.data);
    } catch (err) { console.error('Failed to fetch rate data:', err); }
  };

  const toggleRateExpand = (materialId) => {
    setExpandedRates(prev => ({ ...prev, [materialId]: !prev[materialId] }));
  };

  const handleBulkRateChange = (materialId, value) => {
    setBulkRateForm(prev => ({ ...prev, [materialId]: value }));
  };

  const handleBulkRateSubmit = async () => {
    setError(''); setSuccess('');
    const materialsToUpdate = Object.entries(bulkRateForm).filter(([_, rate]) => rate && parseFloat(rate) > 0);
    
    if (materialsToUpdate.length === 0) {
      toast.error('Please enter at least one rate');
      return;
    }

    if (!bulkFromDate) {
      toast.error('Please select a From Date');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      let successCount = 0;
      let errorCount = 0;
      let totalBatchesRecalculated = 0;

      for (const [materialId, rate] of materialsToUpdate) {
        try {
          const res = await axios.post(`${BACKEND_URL}/api/raw-material-rate`, {
            raw_material_id: materialId,
            rate: parseFloat(rate),
            from_date: bulkFromDate,
            to_date: bulkTillDate || null
          }, { headers: { Authorization: `Bearer ${token}` } });
          successCount++;
          totalBatchesRecalculated += res.data.batches_recalculated || 0;
        } catch (err) {
          console.error(`Failed to update rate for ${materialId}:`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        let msg = `Updated ${successCount} rate(s) successfully!`;
        if (errorCount > 0) msg += ` (${errorCount} failed)`;
        if (totalBatchesRecalculated > 0) msg += ` — ${totalBatchesRecalculated} batch(es) recalculated`;
        toast.success(msg);
        setBulkRateForm({});
        fetchAllRateData();
      } else {
        toast.error('Failed to update rates');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save rates');
    }
  };

  const handleEditLatestRate = async (material, rate) => {
    setEditingRate(rate);
    setSelectedMaterial({ id: material.material_id, name: material.material_name });
    setRateForm({
      rate: rate.rate,
      from_date: rate.from_date,
      to_date: rate.to_date || ''
    });
    setShowRateForm(true);
  };

  const fetchMaterials = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/raw-material-master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Sort alphabetically by name (case-insensitive)
      const sorted = response.data.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      setMaterials(sorted);
      if (sorted.length > 0 && !selectedMaterial) {
        setSelectedMaterial(sorted[0]);
      }
    } catch (error) {
      console.error('Failed to fetch materials:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRates = async (materialId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/raw-material-rate/${materialId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRates(response.data);
    } catch (error) {
      console.error('Failed to fetch rates:', error);
    }
  };

  const handleCreateMaterial = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/raw-material-master`, materialForm, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess('Material created successfully!');
      setShowMaterialForm(false);
      setMaterialForm({ name: '', unit: 'kg', description: '' });
      fetchMaterials();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create material');
    }
  };

  const handleCreateOrUpdateRate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const payload = {
        raw_material_id: selectedMaterial.id,
        rate: parseFloat(rateForm.rate),
        from_date: rateForm.from_date,
        to_date: rateForm.to_date || null
      };

      if (editingRate) {
        const res = await axios.put(`${BACKEND_URL}/api/raw-material-rate/${editingRate.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const count = res.data.batches_recalculated || 0;
        toast.success(`Rate updated${count > 0 ? ` — ${count} batch(es) recalculated` : ''}`);
      } else {
        const res = await axios.post(`${BACKEND_URL}/api/raw-material-rate`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const count = res.data.batches_recalculated || 0;
        toast.success(`Rate created${count > 0 ? ` — ${count} batch(es) recalculated` : ''}`);
      }

      setShowRateForm(false);
      setEditingRate(null);
      setRateForm({ rate: '', from_date: '', to_date: '' });
      fetchRates(selectedMaterial.id);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save rate');
    }
  };

  const handleEditRate = (rate) => {
    setEditingRate(rate);
    setRateForm({
      rate: rate.rate,
      from_date: rate.from_date,
      to_date: rate.to_date || ''
    });
    setShowRateForm(true);
  };

  const handleDeleteMaterial = (materialId) => {
    setConfirmDialog({
      open: true, title: 'Delete Material', message: 'Are you sure you want to delete this material? All associated rates will also be deleted.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/raw-material-master/${materialId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess('Material deleted successfully!');
          if (selectedMaterial?.id === materialId) {
            setSelectedMaterial(null);
          }
          fetchMaterials();
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to delete material');
        }
      }
    });
  };

  const handleToggleStatus = (material) => {
    const action = material.is_active !== false ? 'Deactivate' : 'Activate';
    setConfirmDialog({
      open: true, title: `${action} Material`, message: `Are you sure you want to ${action.toLowerCase()} "${material.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.patch(`${BACKEND_URL}/api/raw-material-master/${material.id}/toggle-status`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess(`Material ${action.toLowerCase()}d successfully!`);
          fetchMaterials();
        } catch (err) {
          setError(err.response?.data?.detail || `Failed to ${action.toLowerCase()} material`);
        }
      }
    });
  };

  const handleDeleteRate = (rateId) => {
    setConfirmDialog({
      open: true, title: 'Delete Rate', message: 'Are you sure you want to delete this rate?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/raw-material-rate/${rateId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess('Rate deleted successfully!');
          fetchRates(selectedMaterial.id);
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to delete rate');
        }
      }
    });
  };

  const canModify = user?.role === 'admin' || user?.role === 'modify';

  if (loading) {
    return <div className="text-slate-600">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Raw Material Master</h1>
          <p className="text-slate-600">Manage raw materials and pricing history</p>
        </div>
        {canModify && activeTab === 'materials' && (
          <button
            data-testid="create-material-btn"
            onClick={() => setShowMaterialForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
          >
            <Plus size={18} />
            Create Material
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('materials')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'materials' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Materials
        </button>
        <button
          onClick={() => setActiveTab('rates')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'rates' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <IndianRupee size={16} /> Rate Management
        </button>
      </div>

      {activeTab === 'materials' && (
        <>      {error && (
        <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">
          {error}
        </div>
      )}

      {success && (
        <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">
          {success}
        </div>
      )}

      {/* Material Form Modal */}
      {showMaterialForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Create Raw Material</h2>
            <form onSubmit={handleCreateMaterial} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Material Name
                </label>
                <input
                  data-testid="material-name-input"
                  type="text"
                  value={materialForm.name}
                  onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                  placeholder="e.g., Sugar, SMP, Milk Powder"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Unit
                </label>
                <select
                  data-testid="unit-select"
                  value={materialForm.unit}
                  onChange={(e) => setMaterialForm({ ...materialForm, unit: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                >
                  <option value="kg">kg</option>
                  <option value="ltr">ltr</option>
                  <option value="unit">unit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  data-testid="description-input"
                  value={materialForm.description}
                  onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div className="flex gap-3">
                <button
                  data-testid="submit-material-btn"
                  type="submit"
                  className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
                >
                  Create
                </button>
                <button
                  data-testid="cancel-material-btn"
                  type="button"
                  onClick={() => setShowMaterialForm(false)}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rate Form Modal */}
      {showRateForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingRate ? 'Edit Rate' : 'Create Rate'}
            </h2>
            <form onSubmit={handleCreateOrUpdateRate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Rate (₹)
                </label>
                <input
                  data-testid="rate-input"
                  type="number"
                  step="0.01"
                  value={rateForm.rate}
                  onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Calendar size={14} className="inline mr-1" />
                  From Date
                </label>
                <input
                  data-testid="from-date-input"
                  type="date"
                  value={rateForm.from_date}
                  onChange={(e) => setRateForm({ ...rateForm, from_date: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  <Calendar size={14} className="inline mr-1" />
                  To Date (Leave empty for 'to now')
                </label>
                <input
                  data-testid="to-date-input"
                  type="date"
                  value={rateForm.to_date}
                  onChange={(e) => setRateForm({ ...rateForm, to_date: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div className="flex gap-3">
                <button
                  data-testid="submit-rate-btn"
                  type="submit"
                  className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
                >
                  {editingRate ? 'Update' : 'Create'}
                </button>
                <button
                  data-testid="cancel-rate-btn"
                  type="button"
                  onClick={() => {
                    setShowRateForm(false);
                    setEditingRate(null);
                    setRateForm({ rate: '', from_date: '', to_date: '' });
                  }}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Materials List */}
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Materials</h2>
          </div>
          <div className="p-2 max-h-96 overflow-y-auto">
            {materials.length === 0 ? (
              <p className="text-center text-slate-500 py-4">No materials yet</p>
            ) : (
              <div className="space-y-1">
                {materials.map(material => (
                  <div
                    key={material.id}
                    data-testid={`material-item-${material.id}`}
                    onClick={() => setSelectedMaterial(material)}
                    className={`p-3 rounded-sm cursor-pointer transition-colors flex items-center justify-between group ${
                      selectedMaterial?.id === material.id
                        ? 'bg-slate-900 text-white'
                        : material.is_active === false ? 'bg-slate-100 opacity-60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-sm">{material.name}</p>
                        <p className={`text-xs ${
                          selectedMaterial?.id === material.id ? 'text-slate-300' : 'text-slate-500'
                        }`}>
                          Unit: {material.unit}
                        </p>
                      </div>
                      {material.is_active === false && (
                        <span className="text-xs bg-slate-300 text-slate-600 px-2 py-0.5 rounded">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {canModify && user?.role === 'admin' && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Switch
                            data-testid={`toggle-material-${material.id}`}
                            checked={material.is_active !== false}
                            onCheckedChange={() => handleToggleStatus(material)}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                          />
                        </div>
                      )}
                      {canModify && user?.role === 'admin' && (
                        <button
                          data-testid={`delete-material-${material.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMaterial(material.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 rounded transition-opacity"
                        >
                          <Trash2 size={14} className="text-red-600" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pricing History */}
        <div className="md:col-span-2 bg-white border border-slate-200 shadow-sm rounded-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedMaterial ? selectedMaterial.name : 'Select a material'}
              </h2>
              {selectedMaterial && (
                <p className="text-xs text-slate-500 mt-1">Pricing History</p>
              )}
            </div>
            {selectedMaterial && canModify && (
              <button
                data-testid="create-rate-btn"
                onClick={() => setShowRateForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800"
              >
                <Plus size={16} />
                Create Rate
              </button>
            )}
          </div>
          <div className="p-5">
            {!selectedMaterial ? (
              <p className="text-center text-slate-500 py-8">Select a material to view pricing history</p>
            ) : rates.length === 0 ? (
              <p className="text-center text-slate-500 py-8">No pricing history yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Rate (₹)</th>
                      <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Applicable Date Range</th>
                      {canModify && (
                        <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map(rate => (
                      <tr key={rate.id} data-testid={`rate-row-${rate.id}`} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-4 py-3 text-sm text-slate-900 font-semibold tabular-nums">₹{rate.rate.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {rate.from_date} to {rate.to_date || <span className="text-green-600 font-medium">now</span>}
                        </td>
                        {canModify && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                data-testid={`edit-rate-${rate.id}`}
                                onClick={() => handleEditRate(rate)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              >
                                <Edit size={16} />
                              </button>
                              {user?.role === 'admin' && (
                                <button
                                  data-testid={`delete-rate-${rate.id}`}
                                  onClick={() => handleDeleteRate(rate.id)}
                                  className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
        </>
      )}

      {/* Rate Management Tab */}
      {activeTab === 'rates' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Bulk Rate Entry</h2>
            <p className="text-sm text-slate-500 mt-1">Enter new rates for multiple materials at once. Previous rates will be auto-closed.</p>
          </div>
          
          {/* Common Date Fields */}
          {canModify && (
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                  <input type="date" value={bulkFromDate}
                    onChange={(e) => setBulkFromDate(e.target.value)}
                    className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Till Date</label>
                  <input type="date" value={bulkTillDate}
                    onChange={(e) => setBulkTillDate(e.target.value)}
                    className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
                </div>
                <button
                  onClick={handleBulkRateSubmit}
                  className="h-10 px-6 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 flex items-center gap-2"
                >
                  <Save size={16} /> Save All Rates
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">From Date is required. Leave Till Date empty for ongoing rates.</p>
              <div className="mt-2 bg-blue-50 border border-blue-200 rounded-sm p-3 text-sm text-blue-700">
                <strong>Note:</strong> Adding a new rate will automatically close any previous rate for that material (setting its "Till Date" to one day before the new rate's "From Date").
              </div>
            </div>
          )}

          {/* Materials Rate Table */}
          <div className="divide-y divide-slate-100">
            {allRateData.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No raw materials found. Create materials in the Materials tab first.</div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-8"></th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Material</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Current Rate</th>
                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Valid Period</th>
                    {canModify && <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-48">New Rate</th>}
                  </tr>
                </thead>
                <tbody>
                  {allRateData.map(material => (
                    <React.Fragment key={material.material_id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="px-2 py-3">
                          <button onClick={() => toggleRateExpand(material.material_id)} className="p-1 hover:bg-slate-100 rounded">
                            {expandedRates[material.material_id] ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">{material.material_name}</span>
                          <span className="text-xs text-slate-500 ml-2">({material.unit})</span>
                        </td>
                        <td className="px-4 py-3">
                          {material.current_rate ? (
                            <span className="font-semibold text-slate-900">₹{material.current_rate.toFixed(2)}</span>
                          ) : (
                            <span className="text-amber-600 text-sm">No rate set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {material.current_rate_from ? (
                            <>{material.current_rate_from} → {material.current_rate_to || <span className="text-green-600">Ongoing</span>}</>
                          ) : '-'}
                        </td>
                        {canModify && (
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Enter new rate"
                              value={bulkRateForm[material.material_id] || ''}
                              onChange={(e) => handleBulkRateChange(material.material_id, e.target.value)}
                              className="w-full h-9 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 text-sm"
                            />
                          </td>
                        )}
                      </tr>
                      {/* Rate History */}
                      {expandedRates[material.material_id] && material.rate_history.length > 0 && (
                        <tr>
                          <td colSpan={canModify ? 5 : 4} className="bg-slate-50 px-8 py-3">
                            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Rate History</h4>
                            <table className="w-full">
                              <thead>
                                <tr>
                                  <th className="text-left text-xs text-slate-500 font-medium py-1.5">Rate</th>
                                  <th className="text-left text-xs text-slate-500 font-medium py-1.5">From</th>
                                  <th className="text-left text-xs text-slate-500 font-medium py-1.5">Till</th>
                                  {canModify && <th className="text-center text-xs text-slate-500 font-medium py-1.5">Edit</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {material.rate_history.map((rate, idx) => (
                                  <tr key={rate.id} className={idx === 0 ? 'bg-green-50' : ''}>
                                    <td className="py-1.5 text-sm font-medium text-slate-900">₹{rate.rate.toFixed(2)}</td>
                                    <td className="py-1.5 text-sm text-slate-700">{rate.from_date}</td>
                                    <td className="py-1.5 text-sm text-slate-700">{rate.to_date || <span className="text-green-600 font-medium">Ongoing</span>}</td>
                                    {canModify && (
                                      <td className="py-1.5 text-center">
                                        {idx === 0 ? (
                                          <button onClick={() => handleEditLatestRate(material, rate)} className="p-1 text-blue-600 hover:bg-blue-100 rounded" title="Edit latest rate">
                                            <Edit size={14} />
                                          </button>
                                        ) : <span className="text-xs text-slate-400">-</span>}
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                      {expandedRates[material.material_id] && material.rate_history.length === 0 && (
                        <tr>
                          <td colSpan={canModify ? 5 : 4} className="bg-slate-50 px-8 py-3 text-sm text-slate-500">
                            No rate history. Enter a rate above to set the first rate.
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default RawMaterialMaster;
