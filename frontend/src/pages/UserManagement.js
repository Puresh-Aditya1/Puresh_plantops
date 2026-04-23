import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, UserPlus, Pencil } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { Switch } from '../components/ui/switch';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const UserManagement = ({ user }) => {
  const [users, setUsers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'view',
    full_name: ''
  });
  const [editFormData, setEditFormData] = useState({
    username: '',
    password: '',
    role: '',
    full_name: ''
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
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
      await axios.post(`${BACKEND_URL}/api/auth/register`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess('User created successfully!');
      setShowCreateForm(false);
      setFormData({
        username: '',
        password: '',
        role: 'view',
        full_name: ''
      });
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create user');
    }
  };

  const handleEdit = (u) => {
    setEditUser(u);
    setEditFormData({
      username: u.username,
      password: '',
      role: u.role,
      full_name: u.full_name || ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const payload = {};
      if (editFormData.username !== editUser.username) payload.username = editFormData.username;
      if (editFormData.password) payload.password = editFormData.password;
      if (editFormData.full_name !== (editUser.full_name || '')) payload.full_name = editFormData.full_name;
      if (editFormData.role !== editUser.role) payload.role = editFormData.role;

      if (Object.keys(payload).length === 0) {
        setError('No changes to save');
        return;
      }

      await axios.put(`${BACKEND_URL}/api/users/${editUser.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSuccess('User updated successfully!');
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update user');
    }
  };

  const handleToggleStatus = (u) => {
    const action = u.is_active !== false ? 'Disable' : 'Enable';
    setConfirmDialog({
      open: true,
      title: `${action} User`,
      message: `Are you sure you want to ${action.toLowerCase()} "${u.username}"? ${action === 'Disable' ? 'They will be logged out and unable to log in.' : 'They will be able to log in again.'}`,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.put(`${BACKEND_URL}/api/users/${u.id}/toggle-status`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess(`User "${u.username}" has been ${action.toLowerCase()}d successfully!`);
          fetchUsers();
        } catch (err) {
          setError(err.response?.data?.detail || `Failed to ${action.toLowerCase()} user`);
        }
      }
    });
  };

  const handleDelete = (userId) => {
    setConfirmDialog({
      open: true, title: 'Delete User', message: 'Are you sure you want to delete this user?', confirmText: 'Delete',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/users/${userId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setSuccess('User deleted successfully!');
          fetchUsers();
        } catch (err) {
          setError(err.response?.data?.detail || 'Failed to delete user');
        }
      }
    });
  };

  if (loading) {
    return <div className="text-slate-600">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">User Management</h1>
          <p className="text-slate-600">Manage system users and permissions</p>
        </div>
        <button
          data-testid="create-user-btn"
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
        >
          <Plus size={18} />
          Create User
        </button>
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

      {/* Create Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Create New User</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <input
                  data-testid="username-input"
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  data-testid="fullname-input"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <input
                  data-testid="password-input"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Role
                </label>
                <select
                  data-testid="role-select"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                >
                  <option value="view">View Only</option>
                  <option value="modify">Modify</option>
                  <option value="plant_supervisor">Plant Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  <strong>View:</strong> Can only view data. <strong>Modify:</strong> Can create/edit entries. <strong>Plant Supervisor:</strong> Like Modify, but no access to Masters & Cost Trend. <strong>Admin:</strong> Full access.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  data-testid="submit-user-btn"
                  type="submit"
                  className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
                >
                  Create User
                </button>
                <button
                  data-testid="cancel-user-btn"
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Form Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-sm max-w-lg w-full p-6">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">Edit User</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Username
                </label>
                <input
                  data-testid="edit-username-input"
                  type="text"
                  value={editFormData.username}
                  onChange={(e) => setEditFormData({ ...editFormData, username: e.target.value })}
                  required
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Full Name
                </label>
                <input
                  data-testid="edit-fullname-input"
                  type="text"
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  New Password
                </label>
                <input
                  data-testid="edit-password-input"
                  type="password"
                  value={editFormData.password}
                  onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Role
                </label>
                <select
                  data-testid="edit-role-select"
                  value={editFormData.role}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                  disabled={editUser.username === 'admin'}
                  className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900 disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <option value="view">View Only</option>
                  <option value="modify">Modify</option>
                  <option value="plant_supervisor">Plant Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
                {editUser.username === 'admin' && (
                  <p className="mt-1 text-xs text-slate-500">Root admin role cannot be changed.</p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  data-testid="save-edit-btn"
                  type="submit"
                  className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800"
                >
                  Save Changes
                </button>
                <button
                  data-testid="cancel-edit-btn"
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="flex-1 h-10 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Username</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Full Name</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Role</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Status</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Created At</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-500">
                    <UserPlus className="mx-auto mb-2" size={32} />
                    <p>No users yet</p>
                  </td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{u.full_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                        u.role === 'modify' ? 'bg-green-100 text-green-700' :
                        u.role === 'plant_supervisor' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {u.role === 'plant_supervisor' ? 'Plant Supervisor' : u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span data-testid={`user-status-${u.id}`} className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        u.is_active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {u.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 flex gap-2 items-center">
                      <button
                        data-testid={`edit-user-${u.id}`}
                        onClick={() => handleEdit(u)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit user"
                      >
                        <Pencil size={16} />
                      </button>
                      {u.username !== 'admin' && (
                        <div className="flex items-center gap-2">
                          <Switch
                            data-testid={`toggle-status-${u.id}`}
                            checked={u.is_active !== false}
                            onCheckedChange={() => handleToggleStatus(u)}
                            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300"
                          />
                          <span className={`text-xs ${u.is_active !== false ? 'text-emerald-600' : 'text-slate-500'}`}>
                            {u.is_active !== false ? 'On' : 'Off'}
                          </span>
                        </div>
                      )}
                      {u.username !== 'admin' && (
                        <button
                          data-testid={`delete-user-${u.id}`}
                          onClick={() => handleDelete(u.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message} confirmText={confirmDialog.confirmText || 'Confirm'} onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

export default UserManagement;
