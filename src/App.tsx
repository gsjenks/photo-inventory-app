// src/App.tsx
// FIXED: Password recovery no longer blocks dashboard access after password update

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { FooterProvider } from './context/FooterContext';
import Auth from './components/Auth';
import CompanySetup from './components/CompanySetup';
import Dashboard from './components/Dashboard';
import SaleDetail from './components/SaleDetail';
import LotDetail from './components/LotDetail';
import Header from './components/Header';
import ContextFooter from './components/Contextfooter';
import ConnectivityService from './services/ConnectivityService';
import SyncService from './services/SyncService';
import { RefreshCw } from 'lucide-react';

function AppContent() {
  const { user, loading, currentCompany, companySwitched, setCompanySwitched, isPasswordRecovery } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ stage: '', current: 0, total: 0 });
  const [syncComplete, setSyncComplete] = useState(false);

  // Sync on initial load or company switch
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const performSync = async () => {
      // Skip if no user or company
      if (!user || !currentCompany) return;

      // Skip if in password recovery mode
      if (isPasswordRecovery) return;

      // Skip if already synced and company hasn't changed
      if (syncComplete && !companySwitched) return;

      const isOnline = ConnectivityService.getConnectionStatus();
      if (!isOnline) {
        console.log('🔴 Offline - skipping sync');
        setSyncComplete(true);
        setCompanySwitched(false);
        return;
      }

      try {
        if (companySwitched) {
          console.log(`🔄 Company switched to: ${currentCompany.name}`);
        } else {
          console.log('🚀 App opened - starting initial sync...');
        }

        setSyncing(true);

        // Subscribe to progress updates
        unsubscribe = SyncService.onProgressChange((progress) => {
          setSyncProgress(progress);
        });

        // Perform priority sync for active sales
        await SyncService.performInitialSync(currentCompany.id);

        console.log('✅ Sync complete');
        setSyncComplete(true);
        setCompanySwitched(false);
      } catch (error) {
        console.error('❌ Sync failed:', error);
        // Don't block app usage if sync fails
        setSyncComplete(true);
        setCompanySwitched(false);
      } finally {
        setSyncing(false);
        if (unsubscribe) {
          unsubscribe();
        }
      }
    };

    performSync();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, currentCompany, companySwitched, isPasswordRecovery]);

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

  // Show Auth component if no user OR in password recovery mode
  if (!user || isPasswordRecovery) {
    return <Auth />;
  }

  if (!currentCompany) {
    return <CompanySetup />;
  }

  // Show sync progress overlay
  if (syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <RefreshCw className="w-16 h-16 text-indigo-600 mx-auto mb-6 animate-spin" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {companySwitched ? 'Switching Company' : 'Syncing Data'}
          </h2>
          <p className="text-gray-600 mb-6">
            {companySwitched 
              ? `Loading data for ${currentCompany.name}...`
              : 'Updating active sales and photos from the cloud...'}
          </p>
          
          {/* Progress indicator */}
          {syncProgress.total > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span className="capitalize">{syncProgress.stage}</span>
                <span>{syncProgress.current} / {syncProgress.total}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4">
            {companySwitched 
              ? 'Syncing active sales first, remaining data in background'
              : 'This only happens when you open the app or switch companies'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="content-with-footer">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sales/:saleId" element={<SaleDetail />} />
          <Route path="/sales/:saleId/lots/:lotId" element={<LotDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ContextFooter />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <FooterProvider>
          <AppContent />
        </FooterProvider>
      </AppProvider>
    </BrowserRouter>
  );
}

export default App;