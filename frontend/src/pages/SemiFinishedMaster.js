import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { Switch } from '../components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const SemiFinishedMaster = ({ user }) => {
  const [masters, setMasters] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [formData, setFormData] = useState({
    name: '',
    unit: 'kg',
    description: '',
    finished_sku_mappings: [{ sku_name: '', quantity_consumed: '' }]
  });

  const [finishedProductMasters, setFinishedProductMasters] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMasters();
    fetchFinishedMasters();
  }, []);

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/semi-finished-master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Sort alphabetically by name (case-insensitive)
      const sorted = response.data.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      setMasters(sorted);
    } catch (error) {
      console.error('Failed to fetch masters:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFinishedMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/finished-product-master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFinishedProductMasters(response.data);
    } catch (error) {
      console.error('Failed to fetch finished masters:', error);
    }
  };

  const handleAddSKUMapping = () => {
    setFormData({
      ...formData,
      finished_sku_mappings: [...formData.finished_sku_mappings, { sku_name: '', quantity_consumed: '' }]
    });
  };

  const handleRemoveSKUMapping = (index) => {
    setFormData({
      ...formData,
      finished_sku_mappings: formData.finished_sku_mappings.filter((_, i) => i !== index)
    });
  };

  const handleSKUMappingChange = (index, field, value) => {
    const updated = [...formData.finished_sku_mappings];
    updated[index][field] = value;
    setFormData({ ...formData, finished_sku_mappings: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const payload = {
        name: formData.name,
        unit: formData.unit,
        description: formData.description,
        finished_sku_mappings: formData.finished_sku_mappings.map(m => ({
          sku_name: m.sku_name,
          quantity_consumed: parseFloat(m.quantity_consumed)
        }))
      };

      if (editingMaster) {
        await axios.put(`${BACKEND_URL}/api/semi-finished-master/${editingMaster.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Master updated successfully!');
      } else {
        await axios.post(`${BACKEND_URL}/api/semi-finished-master`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Master created successfully!');
      }

      setShowForm(false);
      setEditingMaster(null);
      setFormData({
        name: '',
        unit: 'kg',
        description: '',
        finished_sku_mappings: [{ sku_name: '', quantity_consumed: '' }]
      });
      fetchMasters();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save master');
    }
  };

  const handleEdit = (master) => {
    setEditingMaster(master);
    setFormData({
      name: master.name,
      unit: master.unit,
      description: master.description || '',
      finished_sku_mappings: master.finished_sku_mappings
    });
    setShowForm(true);
  };

  const handleDelete = (masterId) => {
    setConfirmDialog({
      open: true, title: 'Delete Master', message: 'Are you sure you want to delete this master?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/semi-finished-master/${masterId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess('Master deleted successfully!');
          fetchMasters();
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to delete master');
        }
      }
    });
  };

  const handleToggleStatus = (master) => {
    const action = master.is_active !== false ? 'Deactivate' : 'Activate';
    setConfirmDialog({
      open: true, title: `${action} Master`, message: `Are you sure you want to ${action.toLowerCase()} "${master.name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.patch(`${BACKEND_URL}/api/semi-finished-master/${master.id}/toggle-status`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess(`Master ${action.toLowerCase()}d successfully!`);
          fetchMasters();
        } catch (err) {
          setError(err.response?.data?.detail || `Failed to ${action.toLowerCase()} master`);
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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Semi-Finished Product Master</h1>
          <p className="text-slate-600">Define semi-finished products and their SKU mappings</p>
        </div>
        {canModify && (
          <button
            data-testid="create-master-btn"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
          >
            <Plus size={18} />
            Create Master
          </button>
        )}
      </div>

      {error && (
        <div data-testid="error-message" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">
          {error}
        </div>
      )}

      {success && (
        <div data-testid="success-message" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-sm text-sm">
          {success}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-sm max-w-2xl w-full p-6 my-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingMaster ? 'Edit Master' : 'Create Master'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Product Name
                  </label>
                  <input
                    data-testid="product-name-input"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                    placeholder="e.g., Paneer Block"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Unit
                  </label>
                  <select
                    data-testid="unit-select"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                  >
                    <option value="kg">kg</option>
                    <option value="ltr">ltr</option>
                    <option value="unit">unit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  data-testid="description-input"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Finished SKU Mappings
                  </label>
                  <button
                    data-testid="add-sku-btn"
                    type="button"
                    onClick={handleAddSKUMapping}
                    className="px-3 py-1 bg-slate-900 text-white text-xs font-medium rounded-sm hover:bg-slate-800"
                  >
                    Add SKU
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.finished_sku_mappings.map((mapping, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex-1">
                        <select
                          data-testid={`sku-name-${index}`}
                          value={mapping.sku_name}
                          onChange={(e) => handleSKUMappingChange(index, 'sku_name', e.target.value)}
                          required
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                        >
                          <option value="">Select SKU...</option>
                          {finishedProductMasters.map(master => (
                            <option key={master.id} value={master.sku_name}>{master.sku_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-40">
                        <input
                          data-testid={`quantity-consumed-${index}`}
                          type="number"
                          step="0.01"
                          placeholder="Qty consumed"
                          value={mapping.quantity_consumed}
                          onChange={(e) => handleSKUMappingChange(index, 'quantity_consumed', e.target.value)}
                          required
                          className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                        />
                      </div>
                      {formData.finished_sku_mappings.length > 1 && (
                        <button
                          data-testid={`remove-sku-${index}`}
                          type="button"
                          onClick={() => handleRemoveSKUMapping(index)}
                          className="h-10 px-3 bg-red-600 text-white rounded-sm hover:bg-red-700"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Define which finished product SKUs can be packed from this semi-finished product and how much gets consumed per SKU.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  data-testid="submit-master-btn"
                  type="submit"
                  className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
                >
                  {editingMaster ? 'Update' : 'Create'}
                </button>
                <button
                  data-testid="cancel-master-btn"
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingMaster(null);
                    setFormData({
                      name: '',
                      unit: 'kg',
                      description: '',
                      finished_sku_mappings: [{ sku_name: '', quantity_consumed: '' }]
                    });
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

      {/* Masters List */}
      <div className="space-y-4">
        {masters.length === 0 ? (
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
            <Package size={32} className="mx-auto mb-2" />
            <p>No semi-finished product masters yet</p>
          </div>
        ) : (
          masters.map(master => (
            <div key={master.id} data-testid={`master-${master.id}`} className={`bg-white border border-slate-200 shadow-sm rounded-sm ${master.is_active === false ? 'opacity-60' : ''}`}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-900">{master.name}</h3>
                    {master.is_active === false && (
                      <span className="text-xs bg-slate-300 text-slate-600 px-2 py-0.5 rounded">Inactive</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Unit: {master.unit}</p>
                  {master.description && (
                    <p className="text-sm text-slate-600 mt-2">{master.description}</p>
                  )}
                </div>
                {canModify && (
                  <div className="flex items-center gap-2">
                    {user?.role === 'admin' && (
                      <div className="flex items-center gap-1">
                        <Switch
                          data-testid={`toggle-master-${master.id}`}
                          checked={master.is_active !== false}
                          onCheckedChange={() => handleToggleStatus(master)}
                          className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                        />
                        <span className={`text-xs ${master.is_active !== false ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {master.is_active !== false ? 'On' : 'Off'}
                        </span>
                      </div>
                    )}
                    <button
                      data-testid={`edit-master-${master.id}`}
                      onClick={() => handleEdit(master)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit size={18} />
                    </button>
                    {user?.role === 'admin' && (
                      <button
                        data-testid={`delete-master-${master.id}`}
                        onClick={() => handleDelete(master.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="p-5">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">SKU Mappings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {master.finished_sku_mappings.map((mapping, index) => (
                    <div key={index} className="p-3 bg-slate-50 border border-slate-200 rounded-sm">
                      <p className="text-sm font-medium text-slate-900">{mapping.sku_name}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Consumes: <span className="font-semibold">{mapping.quantity_consumed} {master.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default SemiFinishedMaster;
