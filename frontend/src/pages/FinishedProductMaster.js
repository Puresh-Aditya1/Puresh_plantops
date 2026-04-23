import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit, Trash2, Package } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { Switch } from '../components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const FinishedProductMaster = ({ user }) => {
  const [masters, setMasters] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMaster, setEditingMaster] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [formData, setFormData] = useState({
    sku_name: '',
    uom: 'kg',
    description: ''
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMasters();
  }, []);

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/finished-product-master`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Sort alphabetically by sku_name (case-insensitive)
      const sorted = response.data.sort((a, b) => a.sku_name.toLowerCase().localeCompare(b.sku_name.toLowerCase()));
      setMasters(sorted);
    } catch (error) {
      console.error('Failed to fetch masters:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');

      if (editingMaster) {
        await axios.put(`${BACKEND_URL}/api/finished-product-master/${editingMaster.id}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Master updated successfully!');
      } else {
        await axios.post(`${BACKEND_URL}/api/finished-product-master`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSuccess('Master created successfully!');
      }

      setShowForm(false);
      setEditingMaster(null);
      setFormData({ sku_name: '', uom: 'kg', description: '' });
      fetchMasters();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save master');
    }
  };

  const handleEdit = (master) => {
    setEditingMaster(master);
    setFormData({
      sku_name: master.sku_name,
      uom: master.uom,
      description: master.description || ''
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
          await axios.delete(`${BACKEND_URL}/api/finished-product-master/${masterId}`, {
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
      open: true, title: `${action} Master`, message: `Are you sure you want to ${action.toLowerCase()} "${master.sku_name}"?`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.patch(`${BACKEND_URL}/api/finished-product-master/${master.id}/toggle-status`, {}, {
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
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Finished Product Master</h1>
          <p className="text-slate-600">Define finished product SKUs and their units of measure</p>
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
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {editingMaster ? 'Edit Master' : 'Create Master'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  SKU Name
                </label>
                <input
                  data-testid="sku-name-input"
                  type="text"
                  value={formData.sku_name}
                  onChange={(e) => setFormData({ ...formData, sku_name: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                  placeholder="e.g., Paneer-200g, Paneer-500g"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Unit of Measure (UOM)
                </label>
                <select
                  data-testid="uom-select"
                  value={formData.uom}
                  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                >
                  <option value="kg">kg</option>
                  <option value="grams">grams</option>
                  <option value="ltr">ltr</option>
                  <option value="ml">ml</option>
                  <option value="piece">piece</option>
                  <option value="packet">packet</option>
                  <option value="box">box</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Description (Optional)
                </label>
                <textarea
                  data-testid="description-input"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
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
                    setFormData({ sku_name: '', uom: 'kg', description: '' });
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

      {/* Masters Table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">SKU Name</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">UOM</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Description</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Status</th>
                {canModify && (
                  <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-center border-b border-slate-200">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {masters.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">
                    <Package className="mx-auto mb-2" size={32} />
                    <p>No finished product masters yet</p>
                  </td>
                </tr>
              ) : (
                masters.map(master => (
                  <tr key={master.id} data-testid={`master-${master.id}`} className={`border-b border-slate-100 hover:bg-slate-50/50 transition-colors ${master.is_active === false ? 'opacity-60 bg-slate-50' : ''}`}>
                    <td className="px-4 py-3 text-sm text-slate-900 font-medium">
                      {master.sku_name}
                      {master.is_active === false && (
                        <span className="ml-2 text-xs bg-slate-300 text-slate-600 px-2 py-0.5 rounded">Inactive</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{master.uom}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{master.description || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {user?.role === 'admin' ? (
                          <>
                            <Switch
                              data-testid={`toggle-master-${master.id}`}
                              checked={master.is_active !== false}
                              onCheckedChange={() => handleToggleStatus(master)}
                              className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                            />
                            <span className={`text-xs ${master.is_active !== false ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {master.is_active !== false ? 'On' : 'Off'}
                            </span>
                          </>
                        ) : (
                          <span className={`text-xs ${master.is_active !== false ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {master.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                    </td>
                    {canModify && (
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            data-testid={`edit-master-${master.id}`}
                            onClick={() => handleEdit(master)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit size={16} />
                          </button>
                          {user?.role === 'admin' && (
                            <button
                              data-testid={`delete-master-${master.id}`}
                              onClick={() => handleDelete(master.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            >
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
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default FinishedProductMaster;
