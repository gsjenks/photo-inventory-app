import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Auth from './components/Auth';
import CompanySetup from './components/CompanySetup';
import Dashboard from './components/Dashboard';
import SaleDetail from './components/SaleDetail';
import LotDetail from './components/LotDetail';
import Header from './components/Header';

function AppContent() {
  const { user, loading, currentCompany } = useApp();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  if (!currentCompany) {
    return <CompanySetup />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/sales/:saleId" element={<SaleDetail />} />
        <Route path="/sales/:saleId/lots/:lotId" element={<LotDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;