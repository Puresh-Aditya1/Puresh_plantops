import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { History, Search, RotateCcw, User, Tag, Calendar, ArrowUpDown } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORY_COLORS = {
  auth: 'bg-blue-100 text-blue-700',
  user: 'bg-purple-100 text-purple-700',
  batch: 'bg-amber-100 text-amber-700',
  packing: 'bg-teal-100 text-teal-700',
  dispatch: 'bg-indigo-100 text-indigo-700',
  receive: 'bg-green-100 text-green-700',
  repack: 'bg-orange-100 text-orange-700',
  wastage: 'bg-red-100 text-red-700',
  raw_material: 'bg-lime-100 text-lime-700',
  rm_consumption: 'bg-cyan-100 text-cyan-700',
  milk: 'bg-sky-100 text-sky-700',
  admin: 'bg-slate-100 text-slate-700'
};

const ACTION_COLORS = {
  created: 'bg-emerald-100 text-emerald-700',
  updated: 'bg-blue-100 text-blue-700',
  deleted: 'bg-red-100 text-red-700',
  login: 'bg-green-100 text-green-700',
  login_failed: 'bg-red-100 text-red-700',
  login_blocked: 'bg-red-100 text-red-700',
  disabled: 'bg-amber-100 text-amber-700',
  enabled: 'bg-emerald-100 text-emerald-700',
  reset_data: 'bg-red-100 text-red-700'
};

const ActivityLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [filters, setFilters] = useState({ username: '', category: '', action: '', start_date: '', end_date: '' });
  const [filterOptions, setFilterOptions] = useState({ categories: [], usernames: [], actions: [] });

  const fetchLogs = useCallback(async (filterParams = null) => {
    const f = filterParams || filters;
    // Require at least one date to load data
    if (!f.start_date && !f.end_date) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = {};
      if (f.username) params.username = f.username;
      if (f.category) params.category = f.category;
      if (f.action) params.action = f.action;
      if (f.start_date) params.start_date = f.start_date;
      if (f.end_date) params.end_date = f.end_date;
      const res = await axios.get(`${BACKEND_URL}/api/activity-logs`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      setLogs(res.data);
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    }
    setLoading(false);
  }, [filters]);

  const fetchFilterOptions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/activity-logs/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFilterOptions(res.data);
    } catch (err) {
      console.error('Failed to fetch filter options:', err);
    }
  }, []);

  // Only fetch filter options on load, not the logs
  useEffect(() => { fetchFilterOptions(); }, [fetchFilterOptions]);

  const handleApply = () => {
    if (!filters.start_date && !filters.end_date) {
      return;
    }
    fetchLogs(filters);
  };
  const handleReset = () => {
    setFilters({ username: '', category: '', action: '', start_date: '', end_date: '' });
    setLogs([]);
    setDataLoaded(false);
  };

  const formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div data-testid="activity-log-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <History size={24} /> Activity Log
          </h1>
          <p className="text-sm text-slate-500 mt-1">Track all user actions across the system</p>
        </div>
        <span data-testid="activity-log-count" className="bg-slate-100 text-slate-600 text-sm font-medium px-3 py-1 rounded">
          {logs.length} entries
        </span>
      </div>

      {/* Filters */}
      <div data-testid="activity-log-filters" className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <User size={12} /> User
            </label>
            <select
              data-testid="filter-username"
              value={filters.username}
              onChange={e => setFilters(p => ({ ...p, username: e.target.value }))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">All Users</option>
              {filterOptions.usernames.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <Tag size={12} /> Category
            </label>
            <select
              data-testid="filter-category"
              value={filters.category}
              onChange={e => setFilters(p => ({ ...p, category: e.target.value }))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">All Categories</option>
              {filterOptions.categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <ArrowUpDown size={12} /> Action
            </label>
            <select
              data-testid="filter-action"
              value={filters.action}
              onChange={e => setFilters(p => ({ ...p, action: e.target.value }))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            >
              <option value="">All Actions</option>
              {filterOptions.actions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
              <Calendar size={12} /> From
            </label>
            <input
              data-testid="filter-start-date"
              type="date"
              value={filters.start_date}
              onChange={e => setFilters(p => ({ ...p, start_date: e.target.value }))}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1">
                <Calendar size={12} /> To
              </label>
              <input
                data-testid="filter-end-date"
                type="date"
                value={filters.end_date}
                onChange={e => setFilters(p => ({ ...p, end_date: e.target.value }))}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
            <div className="flex gap-1 items-end">
              <button
                data-testid="filter-apply-btn"
                onClick={handleApply}
                className="px-3 py-2 bg-slate-900 text-white text-sm rounded hover:bg-slate-800 transition-colors flex items-center gap-1"
              >
                <Search size={14} /> Apply
              </button>
              <button
                data-testid="filter-reset-btn"
                onClick={handleReset}
                className="px-3 py-2 border border-slate-300 text-slate-600 text-sm rounded hover:bg-slate-50 transition-colors"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Log Table */}
      {!dataLoaded && !loading && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
          <Calendar size={32} className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-600 mb-2">Select a date range and click <strong>Apply</strong> to load activity logs.</p>
          <p className="text-sm text-slate-400">This helps maintain fast page load times as data grows.</p>
        </div>
      )}

      {(dataLoaded || loading) && (
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Timestamp</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">User</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Action</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Category</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-slate-500">No activity logs found for the selected date range</td>
                </tr>
              ) : (
                logs.map((log, i) => (
                  <tr key={i} data-testid={`activity-row-${i}`} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-slate-800">{log.username}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-700'}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded capitalize ${CATEGORY_COLORS[log.category] || 'bg-slate-100 text-slate-700'}`}>
                        {log.category.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-md truncate" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
};

export default ActivityLog;
