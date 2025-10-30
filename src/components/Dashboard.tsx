import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  LogOut, 
  Settings,
  Package,
  TrendingUp,
  Calendar,
  FileText,
  Users
} from 'lucide-react';
import SalesList from './SalesList';
import ContactsList from './ContactsList';
import DocumentsList from './DocumentsList';

export default function Dashboard() {
  const { user, currentCompany, signOut } = useApp();
  const [activeTab, setActiveTab] = useState<'sales' | 'contacts' | 'documents'>('sales');
  const [sales, setSales] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  
  // Stats - replace with actual data from Supabase
  const stats = {
    activeSales: 12,
    upcomingSales: 5,
    totalLots: 1847
  };

  const loadDashboardData = async () => {
    // Load your data from Supabase here
    // This is a placeholder function
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with gradient - using PhotoInventory Indigo colors */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Top bar */}
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-white">
                {currentCompany?.name || 'CatalogPro'}
              </h1>
              <p className="text-sm text-indigo-100 mt-1">
                {user?.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => alert('Settings coming soon')}
                className="p-2 rounded-full hover:bg-indigo-500 text-white transition-all"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">Sign Out</span>
              </button>
            </div>
          </div>

          {/* Stats Cards - Single Row */}
          <div className="grid grid-cols-3 gap-4 pb-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-indigo-100 text-xs font-medium">Active Sales</p>
                  <p className="text-white text-2xl font-bold">{stats.activeSales}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-indigo-100 text-xs font-medium">Upcoming</p>
                  <p className="text-white text-2xl font-bold">{stats.upcomingSales}</p>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-indigo-100 text-xs font-medium">Total Lots</p>
                  <p className="text-white text-2xl font-bold">{stats.totalLots.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
        <div className="bg-white rounded-lg shadow-md">
          {/* Tab Navigation - PhotoInventory style */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-2 px-6 pt-4" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('sales')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === 'sales'
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Calendar className="w-4 h-4" />
                Sales
              </button>
              <button
                onClick={() => setActiveTab('contacts')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === 'contacts'
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Users className="w-4 h-4" />
                Contacts
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                  activeTab === 'documents'
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                Documents
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'sales' && (
              <SalesList sales={sales} onRefresh={loadDashboardData} />
            )}
            {activeTab === 'contacts' && (
              <ContactsList 
                contacts={contacts} 
                companyId={currentCompany?.id}
                onRefresh={loadDashboardData} 
              />
            )}
            {activeTab === 'documents' && (
              <DocumentsList 
                documents={documents} 
                companyId={currentCompany?.id}
                onRefresh={loadDashboardData} 
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}