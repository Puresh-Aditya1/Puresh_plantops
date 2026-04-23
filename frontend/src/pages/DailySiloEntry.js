import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Settings, Plus, Trash2, Save, AlertTriangle, CheckCircle } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const DailySiloEntry = ({ user }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [siloData, setSiloData] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [showSiloMgmt, setShowSiloMgmt] = useState(false);
  const [newSilo, setNewSilo] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const canModify = user?.role === 'admin' || user?.role === 'modify' || user?.role === 'plant_supervisor';

  useEffect(() => { fetchSiloEntry(); }, [date]);

  const fetchSiloEntry = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${BACKEND_URL}/api/daily-silo-entry?date=${date}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSiloData(res.data);
      setEntries(res.data.silos.map(s => ({
        silo_name: s.silo_name,
        quantity_kg: s.quantity_kg || '',
        fat_percent: s.fat_percent || '',
        snf_percent: s.snf_percent || ''
      })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const updateEntry = (idx, field, value) => {
    const updated = [...entries];
    updated[idx] = { ...updated[idx], [field]: value };
    setEntries(updated);
  };

  const calcFatKg = (e) => e.quantity_kg && e.fat_percent ? (parseFloat(e.quantity_kg) * parseFloat(e.fat_percent) / 100).toFixed(2) : '0.00';
  const calcSnfKg = (e) => e.quantity_kg && e.snf_percent ? (parseFloat(e.quantity_kg) * parseFloat(e.snf_percent) / 100).toFixed(2) : '0.00';

  const totalQty = entries.reduce((s, e) => s + (parseFloat(e.quantity_kg) || 0), 0);
  const totalFat = entries.reduce((s, e) => s + (parseFloat(calcFatKg(e)) || 0), 0);
  const totalSnf = entries.reduce((s, e) => s + (parseFloat(calcSnfKg(e)) || 0), 0);

  const handleSave = async () => {
    setSaving(true); setMsg('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/daily-silo-entry`, {
        date, entries: entries.map(e => ({
          silo_name: e.silo_name,
          quantity_kg: parseFloat(e.quantity_kg) || 0,
          fat_percent: parseFloat(e.fat_percent) || 0,
          snf_percent: parseFloat(e.snf_percent) || 0
        }))
      }, { headers: { Authorization: `Bearer ${token}` } });
      setMsg('Saved successfully!');
      fetchSiloEntry();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) { setMsg(err.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleAddSilo = async () => {
    if (!newSilo.trim()) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${BACKEND_URL}/api/silos`, { name: newSilo.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNewSilo('');
      fetchSiloEntry();
    } catch (err) { setMsg(err.response?.data?.detail || 'Failed to add silo'); }
  };

  const handleDeleteSilo = (id) => {
    setConfirmDialog({
      open: true, title: 'Delete Silo', message: 'This will remove the silo from the list. Existing entries will be preserved.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem('token');
          await axios.delete(`${BACKEND_URL}/api/silos/${id}`, { headers: { Authorization: `Bearer ${token}` } });
          fetchSiloEntry();
        } catch (err) { setMsg(err.response?.data?.detail || 'Failed to delete silo'); }
      }
    });
  };

  const sysMilk = siloData?.system_closing?.milk_kg || 0;
  const sysFat = siloData?.system_closing?.fat_kg || 0;
  const sysSnf = siloData?.system_closing?.snf_kg || 0;
  const diffMilk = (totalQty - sysMilk).toFixed(2);
  const diffFat = (totalFat - sysFat).toFixed(2);
  const diffSnf = (totalSnf - sysSnf).toFixed(2);
  const hasError = Math.abs(diffMilk) > 0.01 || Math.abs(diffFat) > 0.01 || Math.abs(diffSnf) > 0.01;
  const allFilled = entries.length > 0 && entries.every(e => parseFloat(e.quantity_kg) > 0);

  if (loading) return <div className="text-slate-600">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Daily Silo Closing</h1>
          <p className="text-slate-600">Record closing milk stock across all silos</p>
        </div>
        <div className="flex items-center gap-3">
          <input data-testid="silo-date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]}
            className="h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
          {user?.role === 'admin' && (
            <button data-testid="manage-silos-btn" onClick={() => setShowSiloMgmt(!showSiloMgmt)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-sm font-medium rounded-sm hover:bg-slate-800">
              <Settings size={15} /> Manage Silos
            </button>
          )}
        </div>
      </div>

      {msg && <p className={`text-sm ${msg.includes('Failed') || msg.includes('already') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>}

      {/* Silo Management */}
      {showSiloMgmt && user?.role === 'admin' && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Silo Management</h3>
          <div className="flex gap-2 mb-3">
            <input data-testid="new-silo-input" type="text" value={newSilo}
              onChange={(e) => setNewSilo(e.target.value)} placeholder="New silo name (e.g., Silo 1)"
              className="flex-1 h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900" />
            <button data-testid="add-silo-btn" onClick={handleAddSilo}
              className="h-10 px-4 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 flex items-center gap-1.5">
              <Plus size={16} /> Add Silo
            </button>
          </div>
          {entries.length > 0 ? (
            <div className="space-y-1">
              {entries.map((e, i) => (
                <SiloItem key={e.silo_name} name={e.silo_name} onDelete={(id) => handleDeleteSilo(id)}
                  silos={siloData?.silos} />
              ))}
            </div>
          ) : <p className="text-sm text-slate-400">No silos configured. Add one to get started.</p>}
        </div>
      )}

      {/* Entry Table */}
      {entries.length === 0 ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-8 text-center text-slate-500">
          No silos configured. {user?.role === 'admin' ? 'Click "Manage Silos" to add silos.' : 'Ask admin to add silos.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
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
                {entries.map((e, i) => (
                  <tr key={e.silo_name} data-testid={`silo-row-${i}`} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{e.silo_name}</td>
                    <td className="px-4 py-2">
                      <input data-testid={`silo-qty-${i}`} type="number" step="0.01" value={e.quantity_kg}
                        onChange={(ev) => updateEntry(i, 'quantity_kg', ev.target.value)}
                        disabled={!canModify}
                        className="w-28 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                    </td>
                    <td className="px-4 py-2">
                      <input data-testid={`silo-fat-${i}`} type="number" step="0.01" value={e.fat_percent}
                        onChange={(ev) => updateEntry(i, 'fat_percent', ev.target.value)}
                        disabled={!canModify}
                        className="w-24 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                    </td>
                    <td className="px-4 py-2">
                      <input data-testid={`silo-snf-${i}`} type="number" step="0.01" value={e.snf_percent}
                        onChange={(ev) => updateEntry(i, 'snf_percent', ev.target.value)}
                        disabled={!canModify}
                        className="w-24 h-9 px-2 text-sm text-right bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 text-slate-900 disabled:bg-slate-100" />
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-slate-700">{calcFatKg(e)}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-right text-slate-700">{calcSnfKg(e)}</td>
                  </tr>
                ))}
                {/* Totals Row */}
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td className="px-4 py-3 text-sm font-bold text-slate-900">Total (Silo)</td>
                  <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{totalQty.toFixed(2)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{totalFat.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-bold tabular-nums text-right text-slate-900">{totalSnf.toFixed(2)}</td>
                </tr>
                {/* System Closing Row */}
                <tr className="bg-blue-50">
                  <td className="px-4 py-3 text-sm font-semibold text-blue-700">System Closing</td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysMilk.toFixed(2)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysFat.toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right text-blue-700">{sysSnf.toFixed(2)}</td>
                </tr>
                {/* Difference Row */}
                <tr className={allFilled ? (hasError ? 'bg-red-50' : 'bg-green-50') : 'bg-slate-50'}>
                  <td className="px-4 py-3 text-sm font-semibold flex items-center gap-1.5">
                    {allFilled && hasError && <AlertTriangle size={14} className="text-red-600" />}
                    {allFilled && !hasError && <CheckCircle size={14} className="text-green-600" />}
                    <span className={allFilled ? (hasError ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}>
                      Difference
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${allFilled ? (Math.abs(diffMilk) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                    {diffMilk > 0 ? '+' : ''}{diffMilk}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${allFilled ? (Math.abs(diffFat) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                    {diffFat > 0 ? '+' : ''}{diffFat}
                  </td>
                  <td className={`px-4 py-3 text-sm font-bold tabular-nums text-right ${allFilled ? (Math.abs(diffSnf) > 0.01 ? 'text-red-700' : 'text-green-700') : 'text-slate-500'}`}>
                    {diffSnf > 0 ? '+' : ''}{diffSnf}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Save Button */}
          {canModify && (
            <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                {allFilled && hasError && (
                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    Silo total does not match system closing stock. Please verify the quantities.
                  </p>
                )}
                {allFilled && !hasError && (
                  <p className="text-sm text-green-600 flex items-center gap-1.5">
                    <CheckCircle size={14} />
                    Silo total matches system closing stock.
                  </p>
                )}
              </div>
              <button data-testid="save-silo-entry-btn" onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 disabled:opacity-50">
                <Save size={16} /> {saving ? 'Saving...' : 'Save Entries'}
              </button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog open={confirmDialog.open} title={confirmDialog.title} description={confirmDialog.message}
        onConfirm={() => confirmDialog.onConfirm?.()} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))} />
    </div>
  );
};

const SiloItem = ({ name, onDelete, silos }) => {
  const silo = silos?.find(s => s.silo_name === name);
  const siloList = silos || [];
  const siloMaster = siloList.find(s => s.silo_name === name);
  // Find silo ID from the API response — we need the original silos list
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white rounded-sm border border-slate-100">
      <span className="text-sm text-slate-700">{name}</span>
    </div>
  );
};

export default DailySiloEntry;
