import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Archive, ArrowLeft, ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ArchiveView = ({ user }) => {
  const { archiveId } = useParams();
  const navigate = useNavigate();
  const [archive, setArchive] = useState(null);
  const [activeCollection, setActiveCollection] = useState('batches');
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total_count: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const collections = [
    { id: 'batches', label: 'Batches' },
    { id: 'packing_entries', label: 'Packing Entries' },
    { id: 'dispatches', label: 'Dispatches' },
    { id: 'receives', label: 'Receives' },
    { id: 'repacks', label: 'Repacks' },
    { id: 'wastages', label: 'Wastages' },
    { id: 'milk_entries', label: 'Milk Entries' },
    { id: 'raw_material_stocks', label: 'Raw Material Purchases' },
    { id: 'raw_material_adjustments', label: 'Raw Material Adjustments' },
    { id: 'raw_material_consumptions', label: 'Raw Material Consumptions' },
    { id: 'closing_stock_summary', label: 'Closing Stock' },
  ];

  useEffect(() => {
    fetchArchiveData(activeCollection, 1);
  }, [archiveId, activeCollection]);

  const fetchArchiveData = async (collection, page) => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(
        `${BACKEND_URL}/api/archive/${archiveId}/view?collection=${collection}&page=${page}&page_size=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setArchive({ archive_id: res.data.archive_id, archive_date: res.data.archive_date });
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch archive data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
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

  const renderTableHeaders = () => {
    switch (activeCollection) {
      case 'batches':
        return ['Batch #', 'Date', 'Type', 'Product', 'Qty Produced', 'Remaining', 'Total Cost', 'Cost/Unit'];
      case 'packing_entries':
        return ['Date', 'Semi-Finished', 'Finished SKU', 'Qty Produced', 'SF Consumed', 'Cost', 'Stock At Archive'];
      case 'dispatches':
        return ['Challan #', 'Date', 'Type', 'Destination', 'Products'];
      case 'receives':
        return ['Date', 'SKU', 'Quantity', 'Source', 'Cost/Unit'];
      case 'repacks':
        return ['Date', 'Source SKU', 'Target SKU', 'Used', 'Produced'];
      case 'wastages':
        return ['Date', 'SKU', 'Quantity', 'Reason'];
      case 'milk_entries':
        return ['Date', 'Supplier', 'Qty (kg)', 'Fat %', 'SNF %', 'Fat (kg)', 'SNF (kg)'];
      case 'raw_material_stocks':
        return ['Date', 'Material', 'Opening', 'Purchased', 'Used', 'Closing', 'Rate'];
      case 'raw_material_adjustments':
        return ['Date', 'Material', 'Type', 'Quantity', 'Reason'];
      case 'raw_material_consumptions':
        return ['Date', 'Material', 'Quantity', 'Purpose'];
      case 'closing_stock_summary':
        return ['SKU / Product', 'Type', 'Produced', 'Received', 'Dispatched', 'Repacked Out', 'Wastage', 'Closing Stock'];
      default:
        return [];
    }
  };

  const renderTableRow = (item, index) => {
    switch (activeCollection) {
      case 'batches':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.batch_number}</td>
            <td className="py-2 px-3 text-sm">{item.date}</td>
            <td className="py-2 px-3 text-sm capitalize">{item.output_type}</td>
            <td className="py-2 px-3 text-sm">{item.product_name}</td>
            <td className="py-2 px-3 text-sm">{item.quantity_produced}</td>
            <td className="py-2 px-3 text-sm font-medium text-blue-600">{item.remaining_stock ?? '-'}</td>
            <td className="py-2 px-3 text-sm">₹{item.total_cost?.toFixed(2) || '0.00'}</td>
            <td className="py-2 px-3 text-sm font-medium">₹{item.cost_per_unit?.toFixed(2) || '0.00'}</td>
          </tr>
        );
      case 'packing_entries':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date || item.packing_date}</td>
            <td className="py-2 px-3 text-sm">{item.product_name || item.semi_finished_product || ''}</td>
            <td className="py-2 px-3 text-sm">{item.sku || item.finished_product_sku}</td>
            <td className="py-2 px-3 text-sm">{item.quantity ?? item.quantity_produced ?? ''}</td>
            <td className="py-2 px-3 text-sm">{item.semi_finished_consumed ?? ''}</td>
            <td className="py-2 px-3 text-sm">₹{item.total_packing_cost?.toFixed(2) || '0.00'}</td>
            <td className="py-2 px-3 text-sm font-medium text-blue-600">{item.current_stock ?? '-'}</td>
          </tr>
        );
      case 'dispatches':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.challan_number}</td>
            <td className="py-2 px-3 text-sm">{item.date || item.dispatch_date}</td>
            <td className="py-2 px-3 text-sm capitalize">{item.dispatch_type?.replace('_', ' ')}</td>
            <td className="py-2 px-3 text-sm">{item.destination}</td>
            <td className="py-2 px-3 text-sm">{item.products?.map(p => `${p.sku}: ${p.quantity}`).join(', ')}</td>
          </tr>
        );
      case 'receives':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.receive_date || item.date}</td>
            <td className="py-2 px-3 text-sm">{item.sku}</td>
            <td className="py-2 px-3 text-sm">{item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.source_name}</td>
            <td className="py-2 px-3 text-sm">₹{item.cost_per_unit?.toFixed(2) || '0.00'}</td>
          </tr>
        );
      case 'repacks':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date || item.repack_date}</td>
            <td className="py-2 px-3 text-sm">{item.source_sku}</td>
            <td className="py-2 px-3 text-sm">{item.target_sku}</td>
            <td className="py-2 px-3 text-sm">{item.quantity_used}</td>
            <td className="py-2 px-3 text-sm">{item.quantity_produced}</td>
          </tr>
        );
      case 'wastages':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date || item.wastage_date}</td>
            <td className="py-2 px-3 text-sm">{item.sku}</td>
            <td className="py-2 px-3 text-sm">{item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.reason}</td>
          </tr>
        );
      case 'milk_entries':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date}</td>
            <td className="py-2 px-3 text-sm">{item.supplier || '-'}</td>
            <td className="py-2 px-3 text-sm">{item.quantity_kg ?? item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.fat_percent ?? item.fat}%</td>
            <td className="py-2 px-3 text-sm">{item.snf_percent ?? item.snf}%</td>
            <td className="py-2 px-3 text-sm">{item.fat_kg ?? '-'}</td>
            <td className="py-2 px-3 text-sm">{item.snf_kg ?? '-'}</td>
          </tr>
        );
      case 'raw_material_stocks':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date}</td>
            <td className="py-2 px-3 text-sm">{item.name}</td>
            <td className="py-2 px-3 text-sm">{item.opening_stock}</td>
            <td className="py-2 px-3 text-sm text-green-700">+{item.purchased}</td>
            <td className="py-2 px-3 text-sm text-red-600">-{item.used}</td>
            <td className="py-2 px-3 text-sm font-medium">{item.closing_stock}</td>
            <td className="py-2 px-3 text-sm">₹{item.cost_per_unit?.toFixed(2) || '0.00'}</td>
          </tr>
        );
      case 'raw_material_adjustments':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date || item.adjustment_date}</td>
            <td className="py-2 px-3 text-sm">{item.material_name}</td>
            <td className="py-2 px-3 text-sm capitalize">{item.type || item.adjustment_type}</td>
            <td className="py-2 px-3 text-sm">{item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.reason || item.notes || ''}</td>
          </tr>
        );
      case 'raw_material_consumptions':
        return (
          <tr key={index} className="border-b border-slate-100 hover:bg-slate-50">
            <td className="py-2 px-3 text-sm">{item.date || item.consumption_date}</td>
            <td className="py-2 px-3 text-sm">{item.material_name}</td>
            <td className="py-2 px-3 text-sm">{item.quantity}</td>
            <td className="py-2 px-3 text-sm">{item.reason || item.purpose || ''}</td>
          </tr>
        );
      case 'closing_stock_summary':
        return (
          <tr key={index} className={`border-b border-slate-100 hover:bg-slate-50 ${item.type === 'Semi-Finished' ? 'bg-amber-50/50' : ''}`}>
            <td className="py-2 px-3 text-sm font-medium">{item.name}</td>
            <td className="py-2 px-3 text-sm">
              <span className={`px-2 py-0.5 text-xs rounded-sm ${item.type === 'Finished' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {item.type}
              </span>
            </td>
            <td className="py-2 px-3 text-sm">{item.produced}</td>
            <td className="py-2 px-3 text-sm">{item.received}</td>
            <td className="py-2 px-3 text-sm">{item.dispatched}</td>
            <td className="py-2 px-3 text-sm">{item.repacked_out}</td>
            <td className="py-2 px-3 text-sm">{item.wastage}</td>
            <td className="py-2 px-3 text-sm font-bold text-blue-700">{item.closing_stock}</td>
          </tr>
        );
      default:
        return null;
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center text-slate-500">
        <AlertTriangle className="mx-auto mb-2" size={32} />
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/data-management')}
            className="p-2 hover:bg-slate-100 rounded-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">View Archive</h1>
            {archive && (
              <p className="text-slate-600">Archive Date: {archive.archive_date}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-sm hover:bg-blue-700"
        >
          <Download size={16} /> Download Excel
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-sm text-sm">{error}</div>
      )}

      {/* Collection Tabs */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-sm">
        <div className="border-b border-slate-200 overflow-x-auto">
          <div className="flex">
            {collections.map(col => (
              <button
                key={col.id}
                onClick={() => setActiveCollection(col.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeCollection === col.id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {col.label}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : data.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Archive className="mx-auto mb-2" size={32} />
              <p>No {collections.find(c => c.id === activeCollection)?.label} in this archive</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      {renderTableHeaders().map((header, i) => (
                        <th key={i} className="py-2 px-3 text-xs font-semibold text-slate-600 uppercase">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((item, index) => renderTableRow(item, index))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pagination.total_pages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                  <p className="text-sm text-slate-600">
                    Showing {((pagination.page - 1) * pagination.page_size) + 1} - {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of {pagination.total_count}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchArchiveData(activeCollection, pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className={`p-2 rounded-sm ${pagination.page <= 1 ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm text-slate-600">
                      Page {pagination.page} of {pagination.total_pages}
                    </span>
                    <button
                      onClick={() => fetchArchiveData(activeCollection, pagination.page + 1)}
                      disabled={pagination.page >= pagination.total_pages}
                      className={`p-2 rounded-sm ${pagination.page >= pagination.total_pages ? 'text-slate-300' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-sm">
        <p className="text-sm text-blue-800">
          <strong>Read-only view:</strong> This is archived data and cannot be edited. 
          Use the "Download Excel" button to get a local copy before deleting the archive.
        </p>
      </div>
    </div>
  );
};

export default ArchiveView;
