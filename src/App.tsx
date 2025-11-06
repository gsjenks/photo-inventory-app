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
  const { user, loading, currentCompany } = useApp();
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ stage: '', current: 0, total: 0 });
  const [syncComplete, setSyncComplete] = useState(false);

  // Initial sync when app opens with user and company
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const performInitialSync = async () => {
      if (!user || !currentCompany || syncComplete) return;

      const isOnline = ConnectivityService.getConnectionStatus();
      if (!isOnline) {
        console.log('📴 App opened offline - skipping initial sync');
        setSyncComplete(true);
        return;
      }

      try {
        console.log('🚀 App opened - starting initial sync for active sales...');
        setSyncing(true);

        // Subscribe to progress updates
        unsubscribe = SyncService.onProgressChange((progress) => {
          setSyncProgress(progress);
        });

        // Perform initial sync for active sales only
        await SyncService.performInitialSync(currentCompany.id);

        console.log('✅ Initial sync complete');
        setSyncComplete(true);
      } catch (error) {
        console.error('❌ Initial sync failed:', error);
        // Don't block app usage if sync fails
        setSyncComplete(true);
      } finally {
        setSyncing(false);
        if (unsubscribe) {
          unsubscribe();
        }
      }
    };

    performInitialSync();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [user, currentCompany]);

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

  // Show sync progress overlay
  if (syncing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <RefreshCw className="w-16 h-16 text-indigo-600 mx-auto mb-6 animate-spin" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Syncing Data</h2>
          <p className="text-gray-600 mb-6">
            Updating active sales and photos from the cloud...
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
            This only happens once when you open the app
          </p>
        </div>
      </div>
    );
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