import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Download, Calendar, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ProductStock = ({ user }) => {
  const [stockData, setStockData] = useState({ semi_finished: [], finished: [] });
  const [filters, setFilters] = useState({ start_date: '', end_date: '' });
  const [showFilters, setShowFilters] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStockReport(); }, []);

  const fetchStockReport = async (filterParams = null) => {
    try {
      const token = localStorage.getItem('token');
      const params = filterParams || filters;
      const qp = new URLSearchParams();
      if (params.start_date) qp.append('start_date', params.start_date);
      if (params.end_date) qp.append('end_date', params.end_date);
      const response = await axios.get(`${BACKEND_URL}/api/reports/product-stock?${qp.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStockData(response.data);
    } catch (error) {
      console.error('Failed to fetch stock report:', error);
    } finally { setLoading(false); }
  };

  const handleApplyFilters = () => { setLoading(true); fetchStockReport(filters); };
  const handleResetFilters = () => { const r = { start_date: '', end_date: '' }; setFilters(r); setLoading(true); fetchStockReport(r); };

  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const dateLabel = filters.start_date || filters.end_date
      ? ` (${filters.start_date || '...'} to ${filters.end_date || '...'})`
      : '';

    const wsSemi = XLSX.utils.json_to_sheet(stockData.semi_finished.map(p => ({
      'Product Name': p.product_name,
      'Opening Stock (kg)': p.opening_stock,
      'Produced (kg)': p.produced,
      'Packed Out (kg)': p.packed_out,
      'Closing Stock (kg)': p.closing_stock,
      'Batches': p.batch_count
    })));
    XLSX.utils.book_append_sheet(wb, wsSemi, 'Semi-Finished');

    const wsFinished = XLSX.utils.json_to_sheet(stockData.finished.map(p => ({
      'SKU': p.sku,
      'Unit': p.unit,
      'Opening Stock': p.opening_stock,
      'Produced': p.produced,
      'Packing Waste': p.wasted || 0,
      'Dispatched': p.dispatched,
      'Repack Out': p.repack_out || 0,
      'Book Wastage': p.wastage_booked || 0,
      'Closing Stock': p.closing_stock
    })));
    XLSX.utils.book_append_sheet(wb, wsFinished, 'Finished');

    XLSX.writeFile(wb, `product-stock-report${dateLabel.replace(/\s/g, '')}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return <div className="text-slate-600">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Product Stock Report</h1>
          <p className="text-slate-600">Stock levels with opening &amp; closing for date range</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="export-excel-btn" onClick={handleExportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-sm hover:bg-green-700">
            <Download size={18} /> Export
          </button>
          <button data-testid="toggle-filters-btn" onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700">
            <Filter size={18} /> {showFilters ? 'Hide' : 'Filter'}
          </button>
        </div>
      </div>

      {/* Date Range Filters */}
      {showFilters && (
        <div className="bg-white border border-slate-200 shadow-sm rounded-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-slate-500" />
            <h3 className="font-semibold text-slate-900">Date Range</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Start Date</label>
              <input data-testid="start-date-input" type="date" value={filters.start_date}
                onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">End Date</label>
              <input data-testid="end-date-input" type="date" value={filters.end_date}
                onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                className="w-full h-10 px-3 bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-900" />
            </div>
          </div>
          <div className="flex gap-3">
            <button data-testid="apply-filters-btn" onClick={handleApplyFilters}
              className="px-4 py-2 bg-slate-900 text-white font-medium rounded-sm hover:bg-slate-800">Apply</button>
            <button data-testid="reset-filters-btn" onClick={handleResetFilters}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-300 font-medium rounded-sm hover:bg-slate-50">Reset</button>
          </div>
        </div>
      )}

      {/* Semi-Finished Products */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Semi-Finished Products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Product Name</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Opening (kg)</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Produced (kg)</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Packed Out (kg)</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Closing (kg)</th>
              </tr>
            </thead>
            <tbody>
              {stockData.semi_finished.length === 0 ? (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-500">No semi-finished products</td></tr>
              ) : (
                stockData.semi_finished.map(p => (
                  <tr key={p.product_name} data-testid={`semi-stock-${p.product_name}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{p.product_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{p.opening_stock.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-green-600 tabular-nums text-right font-medium">+{p.produced.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-red-600 tabular-nums text-right font-medium">-{p.packed_out.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-bold">{p.closing_stock.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Finished Products */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Finished Products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">SKU</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-left border-b border-slate-200">Unit</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Opening</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Produced</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Packing Waste</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Dispatched</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Repack Out</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Book Wastage</th>
                <th className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold px-4 py-3 text-right border-b border-slate-200">Closing</th>
              </tr>
            </thead>
            <tbody>
              {stockData.finished.length === 0 ? (
                <tr><td colSpan="9" className="px-4 py-8 text-center text-slate-500">No finished products</td></tr>
              ) : (
                stockData.finished.map(p => (
                  <tr key={p.sku} data-testid={`finished-stock-${p.sku}`} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{p.sku}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{p.unit}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 tabular-nums text-right">{p.opening_stock.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-green-600 tabular-nums text-right font-medium">+{p.produced.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-orange-500 tabular-nums text-right">{(p.wasted || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-red-600 tabular-nums text-right font-medium">-{p.dispatched.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-amber-600 tabular-nums text-right">{(p.repack_out || 0) > 0 ? `-${(p.repack_out || 0).toFixed(2)}` : '0.00'}</td>
                    <td className="px-4 py-3 text-sm text-red-500 tabular-nums text-right">{(p.wastage_booked || 0) > 0 ? `-${(p.wastage_booked || 0).toFixed(2)}` : '0.00'}</td>
                    <td className="px-4 py-3 text-sm text-slate-900 tabular-nums text-right font-bold">{p.closing_stock.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductStock;
