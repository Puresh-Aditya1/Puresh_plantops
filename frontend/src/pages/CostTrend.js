import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Filter, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import SearchableSelect from '../components/SearchableSelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const CostTrend = ({ user }) => {
  const [tab, setTab] = useState('semi-finished');
  const [sfProducts, setSfProducts] = useState([]);
  const [finishedSkus, setFinishedSkus] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [filters, setFilters] = useState({ start_date: '', end_date: '' });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMasters();
  }, []);

  useEffect(() => {
    setSelectedProduct('');
    setData([]);
  }, [tab]);

  const fetchMasters = async () => {
    try {
      const token = localStorage.getItem('token');
      const [sfRes, fpRes] = await Promise.all([
        axios.get(`${BACKEND_URL}/api/semi-finished-master`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${BACKEND_URL}/api/finished-product-master`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSfProducts(sfRes.data);
      setFinishedSkus(fpRes.data);
    } catch (err) { console.error(err); }
  };

  const fetchData = async () => {
    if (!selectedProduct) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (tab === 'semi-finished') {
        params.append('product_name', selectedProduct);
      } else {
        params.append('sku', selectedProduct);
      }
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);

      const endpoint = tab === 'semi-finished'
        ? `${BACKEND_URL}/api/reports/cost-trend/semi-finished`
        : `${BACKEND_URL}/api/reports/cost-trend/finished`;

      const res = await axios.get(`${endpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Add unique label for chart x-axis (batch + qty to differentiate same batches)
      const dataWithLabel = res.data.map((d, idx) => ({
        ...d,
        chart_label: tab === 'semi-finished' 
          ? `${d.batch_number} (${d.quantity_produced}kg)`
          : `${d.batch_number} (${d.quantity}pcs)`
      }));
      setData(dataWithLabel);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleExport = () => {
    if (data.length === 0) return;
    const wb = XLSX.utils.book_new();
    let rows;
    if (tab === 'semi-finished') {
      rows = data.map(d => ({
        Batch: d.batch_number, Date: d.date, Product: d.product_name,
        'Qty Produced': d.quantity_produced, 'Milk Cost': d.milk_cost,
        'RM Cost': d.raw_material_cost, 'Total Cost': d.total_cost, 'Cost/Unit': d.cost_per_unit
      }));
    } else {
      rows = data.map(d => ({
        Batch: d.batch_number, Date: d.date, SKU: d.sku, Qty: d.quantity,
        'Batch Cost/Unit': d.batch_cost_per_unit, 'Conversion Cost/Unit': d.conversion_cost_per_unit,
        'Final Cost/Unit': d.final_cost_per_unit, 'Total Packing Cost': d.total_packing_cost
      }));
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Cost Trend');
    XLSX.writeFile(wb, `cost_trend_${tab}_${selectedProduct}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Calculate summary stats
  const costField = tab === 'semi-finished' ? 'cost_per_unit' : 'final_cost_per_unit';
  const validData = data.filter(d => d[costField] !== undefined);
  const avgCost = validData.length > 0
    ? validData.reduce((s, d) => s + (d[costField] || 0), 0) / validData.length
    : 0;
  const minCost = validData.length > 0
    ? Math.min(...validData.map(d => d[costField] || 0))
    : 0;
  const maxCost = validData.length > 0
    ? Math.max(...validData.map(d => d[costField] || 0))
    : 0;

  const CustomTooltipSF = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d || d.cost_per_unit === undefined) return null;
    return (
      <div className="bg-white border border-slate-200 shadow-lg rounded-sm p-3 text-sm">
        <p className="font-semibold text-slate-900 mb-1">{d.batch_number}</p>
        <p className="text-slate-500">Date: {d.date}</p>
        <p className="text-slate-500">Qty: {d.quantity_produced} kg</p>
        <div className="border-t border-slate-100 mt-1.5 pt-1.5">
          <p className="text-blue-600">Milk Cost: {d.milk_cost?.toFixed(2)}</p>
          <p className="text-amber-600">RM Cost: {d.raw_material_cost?.toFixed(2)}</p>
          <p className="font-semibold text-slate-900">Cost/Unit: {d.cost_per_unit?.toFixed(2)}</p>
        </div>
      </div>
    );
  };

  const CustomTooltipFP = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d || d.final_cost_per_unit === undefined) return null;
    return (
      <div className="bg-white border border-slate-200 shadow-lg rounded-sm p-3 text-sm">
        <p className="font-semibold text-slate-900 mb-1">{d.batch_number || d.sku}</p>
        <p className="text-slate-500">Date: {d.date} | Qty: {d.quantity}</p>
        <div className="border-t border-slate-100 mt-1.5 pt-1.5">
          <p className="text-blue-600">Batch Cost/Unit: {d.batch_cost_per_unit?.toFixed(2)}</p>
          <p className="text-amber-600">Conversion Cost/Unit: {d.conversion_cost_per_unit?.toFixed(2)}</p>
          <p className="font-semibold text-slate-900">Final Cost/Unit: {d.final_cost_per_unit?.toFixed(2)}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cost Trend Analysis</h1>
          <p className="text-sm text-slate-500 mt-1">Track cost per unit across batches over time</p>
        </div>
        {validData.length > 0 && (
          <button data-testid="export-cost-btn" onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
            <Download size={18} /> Export Excel
          </button>
        )}
      </div>

      {/* Tab toggle */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-sm w-fit">
        <button data-testid="tab-semi-finished"
          onClick={() => setTab('semi-finished')}
          className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
            tab === 'semi-finished' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          Semi-Finished Products
        </button>
        <button data-testid="tab-finished"
          onClick={() => setTab('finished')}
          className={`px-4 py-2 text-sm font-medium rounded-sm transition-colors ${
            tab === 'finished' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          Finished Products
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={18} className="text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {tab === 'semi-finished' ? 'Product' : 'SKU'}
            </label>
            <SearchableSelect
              testId="product-select"
              value={selectedProduct}
              onChange={(val) => setSelectedProduct(val)}
              placeholder={`Select ${tab === 'semi-finished' ? 'product' : 'SKU'}...`}
              searchPlaceholder={`Search ${tab === 'semi-finished' ? 'products' : 'SKUs'}...`}
              options={tab === 'semi-finished'
                ? sfProducts.map(p => ({ value: p.name, label: p.name }))
                : finishedSkus.map(p => ({ value: p.sku_name, label: p.sku_name }))
              }
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
            <input data-testid="cost-start-date" type="date" value={filters.start_date}
              onChange={(e) => setFilters(prev => ({ ...prev, start_date: e.target.value }))}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
            <input data-testid="cost-end-date" type="date" value={filters.end_date}
              onChange={(e) => setFilters(prev => ({ ...prev, end_date: e.target.value }))}
              className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
          </div>
          <div className="flex items-end gap-2">
            <button data-testid="fetch-cost-btn" onClick={fetchData} disabled={!selectedProduct || loading}
              className="flex-1 h-10 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800 disabled:opacity-50">
              {loading ? 'Loading...' : 'Show Trend'}
            </button>
            <button data-testid="reset-cost-btn" onClick={() => { setFilters({ start_date: '', end_date: '' }); setData([]); }}
              className="h-10 px-4 bg-white border border-slate-300 text-slate-600 rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      {validData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total Entries</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{data.length}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Avg Cost/Unit</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{avgCost.toFixed(2)}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Min Cost/Unit</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{minCost.toFixed(2)}</p>
          </div>
          <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase">Max Cost/Unit</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{maxCost.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {validData.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">
            {tab === 'semi-finished' ? 'Batch Cost/Unit Trend' : 'Finished Product Cost/Unit Trend'}
            <span className="text-sm font-normal text-slate-500 ml-2">({selectedProduct})</span>
          </h3>
          <div style={{ width: '100%', height: 400 }}>
            <ResponsiveContainer>
              {tab === 'semi-finished' ? (
                <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="chart_label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} height={100} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltipSF />} />
                  <Legend />
                  <Bar dataKey="cost_per_unit" name="Cost/Unit" radius={[4, 4, 0, 0]} maxBarSize={50}>
                    {data.map((entry, index) => (
                      <Cell key={index} fill={entry.cost_per_unit > avgCost ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="chart_label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-45} textAnchor="end" interval={0} height={100} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip content={<CustomTooltipFP />} />
                  <Legend />
                  <Bar dataKey="batch_cost_per_unit" name="Batch Cost" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={50} />
                  <Bar dataKey="conversion_cost_per_unit" name="Conversion Cost" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Data Table */}
      {validData.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {tab === 'semi-finished' ? (
                  <tr>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b">Batch</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b">Date</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Qty (kg)</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Milk Cost</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">RM Cost</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Total Cost</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Cost/Unit</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b">Batch</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-left border-b">Date</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Qty</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Batch Cost/Unit</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Conversion/Unit</th>
                    <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-2.5 text-right border-b">Final Cost/Unit</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {tab === 'semi-finished'
                  ? validData.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{d.batch_number}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{d.date}</td>
                      <td className="px-4 py-2.5 text-sm text-right">{d.quantity_produced}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-blue-600">{(d.milk_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-amber-600">{(d.raw_material_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right">{(d.total_cost || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{(d.cost_per_unit || 0).toFixed(2)}</td>
                    </tr>
                  ))
                  : validData.map((d, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{d.batch_number}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-600">{d.date}</td>
                      <td className="px-4 py-2.5 text-sm text-right">{d.quantity}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-blue-600">{(d.batch_cost_per_unit || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-amber-600">{(d.conversion_cost_per_unit || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900">{(d.final_cost_per_unit || 0).toFixed(2)}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {validData.length === 0 && !loading && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-12 text-center">
          <TrendingUp className="mx-auto mb-3 text-slate-300" size={40} />
          <p className="text-slate-500">Select a {tab === 'semi-finished' ? 'product' : 'SKU'} and click "Show Trend" to view cost analysis</p>
        </div>
      )}
    </div>
  );
};

export default CostTrend;
