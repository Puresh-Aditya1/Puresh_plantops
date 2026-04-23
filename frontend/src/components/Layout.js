import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { 
  LayoutDashboard, Package, PackageOpen, Truck, FileText, Users, LogOut,
  Menu, X, Milk, PanelLeftClose, PanelLeftOpen, TrendingUp, History, Settings, AlertTriangle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const Layout = ({ user, onLogout }) => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [archiveAlert, setArchiveAlert] = useState(null);

  useEffect(() => {
    // Check archive alert status for admin
    if (user?.role === 'admin') {
      const checkArchiveAlert = async () => {
        try {
          const token = localStorage.getItem('token');
          const res = await axios.get(`${BACKEND_URL}/api/archive/alert-status`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.data.show_alert) {
            setArchiveAlert(res.data);
          }
        } catch (err) {
          console.error('Failed to check archive alert:', err);
        }
      };
      checkArchiveAlert();
    }
  }, [user]);

  // Base navigation items
  let navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Batch Production', href: '/batch-entry', icon: Package },
    { name: 'Semi-Finished Products', href: '/semi-finished', icon: PackageOpen },
    { name: 'Finished Products', href: '/finished-products', icon: Truck },
    { name: 'Raw Material', href: '/raw-material-stock', icon: FileText },
    { name: 'TS Sheet', href: '/milk-total-solid', icon: Milk },
    { name: 'Product Stock Report', href: '/product-stock', icon: FileText },
  ];

  // Cost Trend - not for plant_supervisor
  if (user?.role !== 'plant_supervisor') {
    navigation.push({ name: 'Cost Trend', href: '/cost-trend', icon: TrendingUp });
  }

  // Masters section - not for plant_supervisor
  if (user?.role !== 'plant_supervisor') {
    navigation.push({ name: '---', href: '#', icon: null });
    navigation.push({ name: 'Raw Material Master', href: '/raw-material-master', icon: Package });
    navigation.push({ name: 'Semi-Finished Master', href: '/semi-finished-master', icon: PackageOpen });
    navigation.push({ name: 'Finished Product Master', href: '/finished-product-master', icon: Truck });
  }

  // Admin-only pages
  if (user?.role === 'admin') {
    navigation.push({ name: 'User Management', href: '/users', icon: Users });
    navigation.push({ name: 'Activity Log', href: '/activity-log', icon: History });
    navigation.push({ name: 'Data Mgmt.', href: '/data-management', icon: Settings });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        data-testid="sidebar"
        className={`
          fixed top-0 left-0 z-50 h-full bg-white border-r border-slate-200
          transform transition-all duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'}
          md:translate-x-0 ${collapsed ? 'md:w-16' : 'md:w-64'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={`h-16 flex items-center border-b border-slate-200 ${collapsed ? 'md:justify-center md:px-2' : ''} px-4`}>
            {!collapsed && <h1 className="text-lg font-bold text-slate-900 truncate flex-1">Puresh Daily</h1>}
            <button data-testid="close-sidebar-btn" onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
            <button data-testid="collapse-sidebar-btn" onClick={() => setCollapsed(!collapsed)}
              className="hidden md:flex p-1.5 hover:bg-slate-100 rounded-sm text-slate-500 hover:text-slate-900 transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className={`space-y-1 ${collapsed ? 'md:px-1.5' : 'px-3'}`}>
              {navigation.map((item, index) => {
                if (item.name === '---') {
                  return (
                    <li key={index} className="py-2">
                      <div className="border-t border-slate-200"></div>
                      {!collapsed && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3 px-3">Masters</p>}
                    </li>
                  );
                }
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.name} className="relative group">
                    <Link
                      data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 rounded-sm text-sm font-medium transition-colors
                        ${collapsed ? 'md:justify-center md:px-0 md:py-2.5 px-3 py-2.5' : 'px-3 py-2.5'}
                        ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}
                      `}
                    >
                      <Icon size={18} strokeWidth={1.5} className="shrink-0" />
                      <span className={collapsed ? 'md:hidden' : ''}>{item.name}</span>
                    </Link>
                    {/* Tooltip when collapsed */}
                    {collapsed && (
                      <div className="hidden md:group-hover:flex absolute left-full top-1/2 -translate-y-1/2 ml-2 z-[60]
                        px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded shadow-lg whitespace-nowrap pointer-events-none">
                        {item.name}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* User section */}
          <div className="border-t border-slate-200 p-4">
            {collapsed ? (
              <div className="hidden md:flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center" title={`${user?.username} (${user?.role})`}>
                  <span className="text-slate-700 font-semibold text-xs">{user?.username?.charAt(0).toUpperCase()}</span>
                </div>
                <button data-testid="logout-btn" onClick={onLogout}
                  className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-sm transition-colors" title="Logout">
                  <LogOut size={16} strokeWidth={1.5} />
                </button>
              </div>
            ) : null}
            <div className={collapsed ? 'md:hidden' : ''}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                  <span className="text-slate-700 font-semibold text-sm">{user?.username?.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{user?.username}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
              </div>
              <button data-testid="logout-btn-full" onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-sm transition-colors">
                <LogOut size={18} strokeWidth={1.5} /> Logout
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`transition-all duration-200 ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="h-full px-4 flex items-center justify-between">
            <button data-testid="open-sidebar-btn" onClick={() => setSidebarOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 rounded"><Menu size={20} /></button>
            <div className="flex-1" />
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <div className="max-w-7xl mx-auto">
            {/* Archive Alert Banner */}
            {archiveAlert && archiveAlert.show_alert && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-sm p-4 flex items-start gap-3">
                <AlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={20} />
                <div className="flex-1">
                  <p className="text-sm text-amber-800">{archiveAlert.message}</p>
                  <Link to="/data-management" className="text-sm text-amber-700 font-medium hover:underline">
                    Go to Data Management →
                  </Link>
                </div>
                <button 
                  onClick={() => setArchiveAlert(null)} 
                  className="text-amber-600 hover:text-amber-800"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
