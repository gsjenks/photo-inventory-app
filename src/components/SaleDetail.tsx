import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Sale, Lot, Contact, Document } from '../types';
import { ArrowLeft, Package, Users, FileText, Download } from 'lucide-react';
import LotsList from './LotsList';
import ContactsList from './ContactsList';
import DocumentsList from './DocumentsList';

type Tab = 'items' | 'contacts' | 'documents' | 'reports';

export default function SaleDetail() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  const [sale, setSale] = useState<Sale | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [lots, setLots] = useState<Lot[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (saleId) {
      loadSaleData();
    }
  }, [saleId]);

  const loadSaleData = async () => {
    if (!saleId) return;

    setLoading(true);
    try {
      // Load sale
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single();

      if (saleError) throw saleError;
      setSale(saleData);

      // Load lots
      const { data: lotsData, error: lotsError } = await supabase
        .from('lots')
        .select('*')
        .eq('sale_id', saleId)
        .order('lot_number');

      if (lotsError) throw lotsError;
      setLots(lotsData || []);

      // Load contacts
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .eq('sale_id', saleId)
        .order('first_name');

      if (contactsError) throw contactsError;
      setContacts(contactsData || []);

      // Load documents
      const { data: documentsData, error: documentsError } = await supabase
        .from('documents')
        .select('*')
        .eq('sale_id', saleId)
        .order('created_at', { ascending: false });

      if (documentsError) throw documentsError;
      setDocuments(documentsData || []);
    } catch (error) {
      console.error('Error loading sale:', error);
      alert('Failed to load sale');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading sale...</div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Sale not found</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'upcoming':
        return 'bg-indigo-100 text-indigo-700';
      case 'completed':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{sale.name}</h1>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            {sale.start_date && <span>{new Date(sale.start_date).toLocaleDateString()}</span>}
            {sale.location && <span>• {sale.location}</span>}
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(sale.status)}`}>
              {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex gap-2 px-6 pt-4" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('items')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'items'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Package className="w-4 h-4" />
              Items ({lots.length})
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
              Contacts ({contacts.length})
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
              Documents ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'reports'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Download className="w-4 h-4" />
              Reports & Tools
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'items' && (
            <LotsList lots={lots} saleId={saleId!} onRefresh={loadSaleData} />
          )}
          {activeTab === 'contacts' && (
            <ContactsList contacts={contacts} saleId={saleId} onRefresh={loadSaleData} />
          )}
          {activeTab === 'documents' && (
            <DocumentsList documents={documents} saleId={saleId} onRefresh={loadSaleData} />
          )}
          {activeTab === 'reports' && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Download className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-gray-600 mb-2">Reports and tools coming soon!</p>
              <p className="text-sm text-gray-500">Import/Export CSV, Generate Catalogs, etc.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}