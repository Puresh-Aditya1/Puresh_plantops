import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Toaster } from 'sonner';
import '@/App.css';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import BatchEntry from '@/pages/BatchEntry';
import SemiFinishedProduct from '@/pages/SemiFinishedProduct';
import FinishedProduct from '@/pages/FinishedProduct';
import RawMaterialStock from '@/pages/RawMaterialStock';
import ProductStock from '@/pages/ProductStock';
import UserManagement from '@/pages/UserManagement';
import RawMaterialMaster from '@/pages/RawMaterialMaster';
import SemiFinishedMaster from '@/pages/SemiFinishedMaster';
import FinishedProductMaster from '@/pages/FinishedProductMaster';
import MilkTSSheet from '@/pages/MilkTSSheet';
import CostTrend from '@/pages/CostTrend';
import ActivityLog from '@/pages/ActivityLog';
import DataManagement from '@/pages/DataManagement';
import ArchiveView from '@/pages/ArchiveView';
import Layout from '@/components/Layout';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setIsAuthenticated(true);
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    setUser(null);
  };

  // Auto-logout on 401 (token expired/invalid)
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          const isLoginRequest = error.config?.url?.includes('/api/auth/login');
          if (!isLoginRequest && localStorage.getItem('token')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setIsAuthenticated(false);
            setUser(null);
          }
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/" /> : <Login onLogin={handleLogin} />
        } />
        
        <Route path="/" element={
          isAuthenticated ? <Layout user={user} onLogout={handleLogout} /> : <Navigate to="/login" />
        }>
          <Route index element={<Dashboard user={user} />} />
          <Route path="batch-entry" element={<BatchEntry user={user} />} />
          <Route path="semi-finished" element={<SemiFinishedProduct user={user} />} />
          <Route path="finished-products" element={<FinishedProduct user={user} />} />
          <Route path="raw-material-stock" element={<RawMaterialStock user={user} />} />
          <Route path="milk-total-solid" element={<MilkTSSheet user={user} />} />
          <Route path="product-stock" element={<ProductStock user={user} />} />
          {/* Cost Trend - not for plant_supervisor */}
          {user?.role !== 'plant_supervisor' && (
            <Route path="cost-trend" element={<CostTrend user={user} />} />
          )}
          {/* Masters - not for plant_supervisor */}
          {user?.role !== 'plant_supervisor' && (
            <>
              <Route path="raw-material-master" element={<RawMaterialMaster user={user} />} />
              <Route path="semi-finished-master" element={<SemiFinishedMaster user={user} />} />
              <Route path="finished-product-master" element={<FinishedProductMaster user={user} />} />
            </>
          )}
          {user?.role === 'admin' && (
            <Route path="users" element={<UserManagement user={user} />} />
          )}
          {user?.role === 'admin' && (
            <Route path="activity-log" element={<ActivityLog user={user} />} />
          )}
          <Route path="data-management" element={<DataManagement user={user} />} />
          <Route path="archive/:archiveId" element={<ArchiveView user={user} />} />
        </Route>
      </Routes>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
