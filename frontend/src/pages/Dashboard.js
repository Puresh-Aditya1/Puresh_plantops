import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Truck, AlertTriangle, TrendingUp, Lock, Search } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Dashboard = ({ user }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lockDate, setLockDate] = useState('');

  // Wastage & Loss Tracker State (for admin and modify roles)
  const [wastageData, setWastageData] = useState({ entries: [], summary: [], total_entries: 0 });
  const [wastageFilters, setWastageFilters] = useState({ start_date: '', end_date: '' });
  const [wastageLoading, setWastageLoading] = useState(false);
  const [wastageLoaded, setWastageLoaded] = useState(false);

  useEffect(() => {
    fetchStats();
    fetchLockDate();
    // Don't auto-load wastage data - wait for date selection
  }, [user]);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${BACKEND_URL}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLockDate = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/settings/lock-date`, { headers: { Authorization: `Bearer ${token}` } });
      setLockDate(res.data.lock_date || '');
    } catch (err) { console.error(err); }
  };

  const fetchWastageSummary = async (filtersOverride = null) => {
    const f = filtersOverride || wastageFilters;
    // Require at least one date to be set
    if (!f.start_date && !f.end_date) {
      return;
    }
    setWastageLoading(true);
    try {
      const token = localStorage.getItem('token');
      const qp = new URLSearchParams();
      if (f.start_date) qp.append('start_date', f.start_date);
      if (f.end_date) qp.append('end_date', f.end_date);
      const res = await axios.get(`${BACKEND_URL}/api/reports/wastage-loss-summary?${qp.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      setWastageData(res.data);
      setWastageLoaded(true);
    } catch (err) { console.error(err); }
    finally { setWastageLoading(false); }
  };

  if (loading) {
    return <div className="text-slate-600">Loading...</div>;
  }

  const statCards = [
    {
      title: 'Batches Today',
      value: stats?.batches_today || 0,
      icon: Package,
      color: 'bg-blue-500'
    },
    {
      title: 'Dispatches Today',
      value: stats?.dispatches_today || 0,
      icon: Truck,
      color: 'bg-green-500'
    },
    {
      title: 'Total Stock Items',
      value: Math.round(stats?.total_stock_items || 0),
      icon: TrendingUp,
      color: 'bg-slate-700'
    },
    {
      title: 'Low Stock Alerts',
      value: stats?.low_stock_count || 0,
      icon: AlertTriangle,
      color: 'bg-orange-500'
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-slate-600">Welcome back, {user?.username}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              data-testid={`stat-card-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
              className="bg-white border border-slate-200 shadow-sm rounded-sm p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    {stat.title}
                  </p>
                  <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 ${stat.color} rounded-sm flex items-center justify-center`}>
                  <Icon className="text-white" size={24} strokeWidth={1.5} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Low Stock Alerts */}
      {stats?.low_stock_products && stats.low_stock_products.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">
            Low Stock Alerts
          </h2>
          <div className="space-y-2">
            {stats.low_stock_products.map((product) => (
              <div
                key={product.sku}
                data-testid={`low-stock-item-${product.sku}`}
                className="flex items-center justify-between py-2 px-3 bg-orange-50 border border-orange-200 rounded-sm"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{product.sku}</p>
                  <p className="text-xs text-slate-500">Stock: {product.current_stock} {product.unit}</p>
                </div>
                <AlertTriangle className="text-orange-500" size={20} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Wastage & Loss Tracker - Admin and Modify roles */}
      {(user?.role === 'admin' || user?.role === 'modify') && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900">Wastage & Loss Tracker</h2>
              {wastageData.total_entries > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-sm font-medium">{wastageData.total_entries} entries</span>}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-end gap-3 mb-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input data-testid="wastage-start-date" type="date" value={wastageFilters.start_date}
                onChange={(e) => setWastageFilters({ ...wastageFilters, start_date: e.target.value })}
                className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input data-testid="wastage-end-date" type="date" value={wastageFilters.end_date}
                onChange={(e) => setWastageFilters({ ...wastageFilters, end_date: e.target.value })}
                className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <button data-testid="wastage-apply-btn" onClick={() => fetchWastageSummary()} 
              disabled={!wastageFilters.start_date && !wastageFilters.end_date}
              className="h-10 px-4 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"><Search size={15} /> Apply</button>
            <button data-testid="wastage-reset-btn" onClick={() => { const r = { start_date: '', end_date: '' }; setWastageFilters(r); setWastageData({ entries: [], summary: [], total_entries: 0 }); setWastageLoaded(false); }} className="h-10 px-4 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>

          {/* Prompt to select dates */}
          {!wastageLoaded && !wastageLoading && (
            <div className="text-center py-8 text-slate-500">
              <AlertTriangle size={24} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm">Select a date range and click <strong>Apply</strong> to view wastage & loss records.</p>
            </div>
          )}

          {/* Summary Cards */}
          {wastageLoaded && wastageData.summary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
              {wastageData.summary.map((s, idx) => (
                <div key={idx} className={`rounded-sm p-3 border ${s.total_gain > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{s.category}</p>
                  <div className="flex items-baseline gap-2">
                    {s.total_loss > 0 && <p className="text-lg font-bold text-red-600">-{s.total_loss.toFixed(2)}</p>}
                    {s.total_gain > 0 && <p className="text-lg font-bold text-green-600">+{s.total_gain.toFixed(2)}</p>}
                  </div>
                  <p className="text-[10px] text-slate-400">{s.count} entries</p>
                </div>
              ))}
            </div>
          )}

          {/* Detail Table */}
          {wastageLoaded && wastageLoading ? (
            <p className="text-slate-500 text-sm py-4 text-center">Loading...</p>
          ) : wastageLoaded && wastageData.entries.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No wastage or loss entries found for the selected date range.</p>
          ) : wastageLoaded ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Date</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Category</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Item</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-center border-b border-slate-200">Type</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b border-slate-200">Quantity</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b border-slate-200">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {wastageData.entries.map((e, idx) => (
                    <tr key={idx} data-testid={`wastage-entry-${idx}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-sm text-slate-700">{e.date}</td>
                      <td className="px-4 py-2.5 text-sm">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-sm ${
                          e.category === 'Book Wastage' ? 'bg-red-100 text-red-700' :
                          e.category === 'Packing Wastage' ? 'bg-orange-100 text-orange-700' :
                          e.category === 'Repack Wastage' ? 'bg-amber-100 text-amber-700' :
                          e.category === 'Milk Adjustment' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>{e.category}</span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 font-medium">{e.item}</td>
                      <td className="px-4 py-2.5 text-sm text-center">
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-sm ${e.type === 'loss' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{e.type.toUpperCase()}</span>
                      </td>
                      <td className={`px-4 py-2.5 text-sm text-right font-semibold tabular-nums ${e.type === 'loss' ? 'text-red-600' : 'text-green-600'}`}>
                        {e.type === 'loss' ? '-' : '+'}{e.quantity} {e.unit}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-500 truncate max-w-[250px]">{e.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* Non-admin: Show lock info */}
      {user?.role !== 'admin' && lockDate && (
        <div className="bg-amber-50 border border-amber-200 rounded-sm p-4 flex items-center gap-3">
          <Lock size={18} className="text-amber-600" />
          <p className="text-sm text-amber-700">Entries are locked by admin on or before <span className="font-semibold">{lockDate}</span>. You cannot create or edit entries for those dates.</p>
        </div>
      )}

      {/* Quick Info */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-100">
          System Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">User Role</p>
            <p className="text-sm text-slate-900 capitalize">{user?.role}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Current Date</p>
            <p className="text-sm text-slate-900">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
