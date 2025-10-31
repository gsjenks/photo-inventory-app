import { useState } from 'react';
import { X, Building2, Plus, Check, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';

interface SettingsModalProps {
  onClose: () => void;
}

interface DeleteConfirmation {
  company: {
    id: string;
    name: string;
  };
  stats: {
    sales: number;
    lots: number;
    photos: number;
    contacts: number;
    documents: number;
  };
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, companies, currentCompany, setCurrentCompany, refreshCompanies } = useApp();
  const [activeTab, setActiveTab] = useState<'companies' | 'profile'>('companies');
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmation | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // New company form state
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [units, setUnits] = useState<'metric' | 'imperial'>('imperial');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name,
          address,
          currency,
          units,
        })
        .select()
        .single();

      if (companyError) throw companyError;

      const { error: linkError} = await supabase
        .from('user_companies')
        .insert({
          user_id: user!.id,
          company_id: company.id,
          role: 'owner',
        });

      if (linkError) throw linkError;

      await refreshCompanies();
      
      // Reset form
      setName('');
      setAddress('');
      setCurrency('USD');
      setUnits('imperial');
      setShowNewCompany(false);
      
      alert('Company created successfully!');
    } catch (err: any) {
      console.error('Error creating company:', err);
      setError(err.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = async (companyId: string, companyName: string) => {
    try {
      // Get statistics for what will be deleted
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId);

      const saleIds = sales?.map(s => s.id) || [];

      let lotsCount = 0;
      let photosCount = 0;

      if (saleIds.length > 0) {
        const { data: lots } = await supabase
          .from('lots')
          .select('id')
          .in('sale_id', saleIds);

        lotsCount = lots?.length || 0;

        const lotIds = lots?.map(l => l.id) || [];

        if (lotIds.length > 0) {
          const { count } = await supabase
            .from('photos')
            .select('*', { count: 'exact', head: true })
            .in('lot_id', lotIds);

          photosCount = count || 0;
        }
      }

      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      const { count: documentsCount } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);

      setDeleteConfirmation({
        company: { id: companyId, name: companyName },
        stats: {
          sales: sales?.length || 0,
          lots: lotsCount,
          photos: photosCount,
          contacts: contactsCount || 0,
          documents: documentsCount || 0,
        },
      });
    } catch (err) {
      console.error('Error fetching company stats:', err);
      alert('Failed to load company statistics');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;

    setDeleteLoading(true);

    try {
      const companyId = deleteConfirmation.company.id;

      // Step 1: Get all sales for this company
      const { data: sales, error: salesFetchError } = await supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId);

      if (salesFetchError) throw salesFetchError;

      const saleIds = sales?.map(s => s.id) || [];

      if (saleIds.length > 0) {
        // Step 2: Get all lots for these sales
        const { data: lots, error: lotsFetchError } = await supabase
          .from('lots')
          .select('id')
          .in('sale_id', saleIds);

        if (lotsFetchError) throw lotsFetchError;

        const lotIds = lots?.map(l => l.id) || [];

        if (lotIds.length > 0) {
          // Step 3: Delete all photos and their storage files
          const { data: photos, error: photosFetchError } = await supabase
            .from('photos')
            .select('file_path')
            .in('lot_id', lotIds);

          if (photosFetchError) throw photosFetchError;

          // Delete photo files from storage
          if (photos && photos.length > 0) {
            const filePaths = photos.map(p => p.file_path);
            const { error: storageError } = await supabase.storage
              .from('photos')
              .remove(filePaths);

            if (storageError) {
              console.warn('Error deleting some photo files:', storageError);
              // Continue anyway - files might already be deleted or not exist
            }
          }

          // Delete photo records
          const { error: photosDeleteError } = await supabase
            .from('photos')
            .delete()
            .in('lot_id', lotIds);

          if (photosDeleteError) throw photosDeleteError;

          // Step 4: Delete all lots
          const { error: lotsDeleteError } = await supabase
            .from('lots')
            .delete()
            .in('sale_id', saleIds);

          if (lotsDeleteError) throw lotsDeleteError;
        }

        // Step 5: Delete sale-level contacts
        const { error: saleContactsError } = await supabase
          .from('contacts')
          .delete()
          .in('sale_id', saleIds);

        if (saleContactsError) throw saleContactsError;

        // Step 6: Delete sale-level documents and their storage files
        const { data: saleDocuments, error: saleDocsError } = await supabase
          .from('documents')
          .select('file_path')
          .in('sale_id', saleIds);

        if (saleDocsError) throw saleDocsError;

        if (saleDocuments && saleDocuments.length > 0) {
          const docPaths = saleDocuments.map(d => d.file_path).filter(Boolean);
          if (docPaths.length > 0) {
            await supabase.storage.from('documents').remove(docPaths);
          }
        }

        const { error: saleDocsDeleteError } = await supabase
          .from('documents')
          .delete()
          .in('sale_id', saleIds);

        if (saleDocsDeleteError) throw saleDocsDeleteError;

        // Step 7: Delete all sales
        const { error: salesDeleteError } = await supabase
          .from('sales')
          .delete()
          .in('id', saleIds);

        if (salesDeleteError) throw salesDeleteError;
      }

      // Step 8: Delete company-level contacts
      const { error: companyContactsError } = await supabase
        .from('contacts')
        .delete()
        .eq('company_id', companyId)
        .is('sale_id', null);

      if (companyContactsError) throw companyContactsError;

      // Step 9: Delete company-level documents and their storage files
      const { data: companyDocuments, error: companyDocsError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('company_id', companyId)
        .is('sale_id', null);

      if (companyDocsError) throw companyDocsError;

      if (companyDocuments && companyDocuments.length > 0) {
        const docPaths = companyDocuments.map(d => d.file_path).filter(Boolean);
        if (docPaths.length > 0) {
          await supabase.storage.from('documents').remove(docPaths);
        }
      }

      const { error: companyDocsDeleteError } = await supabase
        .from('documents')
        .delete()
        .eq('company_id', companyId)
        .is('sale_id', null);

      if (companyDocsDeleteError) throw companyDocsDeleteError;

      // Step 10: Delete user_companies relationship
      const { error: userCompanyError } = await supabase
        .from('user_companies')
        .delete()
        .eq('company_id', companyId)
        .eq('user_id', user!.id);

      if (userCompanyError) throw userCompanyError;

      // Step 11: Delete the company
      const { error: companyDeleteError } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId);

      if (companyDeleteError) throw companyDeleteError;

      // Step 12: Refresh companies and handle UI updates
      await refreshCompanies();

      // If we deleted the current company, switch to another one
      if (currentCompany?.id === companyId) {
        const remainingCompanies = companies.filter(c => c.id !== companyId);
        if (remainingCompanies.length > 0) {
          setCurrentCompany(remainingCompanies[0]);
        }
        // If no companies remain, refreshCompanies() will handle setting currentCompany to null
      }

      setDeleteConfirmation(null);
      alert('Company deleted successfully');
    } catch (err: any) {
      console.error('Error deleting company:', err);
      alert(`Failed to delete company: ${err.message}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-6">
            <button
              onClick={() => setActiveTab('companies')}
              className={`py-3 px-4 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'companies'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Companies
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-3 px-4 font-medium text-sm transition-all border-b-2 -mb-px ${
                activeTab === 'profile'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Profile
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            {activeTab === 'companies' ? (
              <div className="space-y-6">
                {/* Current Companies */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Your Companies</h3>
                    <button
                      onClick={() => setShowNewCompany(!showNewCompany)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-sm font-medium"
                    >
                      <Plus className="w-4 h-4" />
                      New Company
                    </button>
                  </div>

                  {/* Company List */}
                  <div className="space-y-2">
                    {companies.map((company) => (
                      <div
                        key={company.id}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                          company.id === currentCompany?.id
                            ? 'border-indigo-600 bg-indigo-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <button
                          onClick={() => setCurrentCompany(company)}
                          className="flex-1 flex items-center gap-3 text-left"
                        >
                          <Building2 className={`w-5 h-5 flex-shrink-0 ${
                            company.id === currentCompany?.id ? 'text-indigo-600' : 'text-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">{company.name}</div>
                            {company.address && (
                              <div className="text-sm text-gray-500 truncate">{company.address}</div>
                            )}
                          </div>
                          {company.id === currentCompany?.id && (
                            <Check className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                          )}
                        </button>

                        {/* Delete Button - Only show if there's more than one company */}
                        {companies.length > 1 && (
                          <button
                            onClick={() => handleDeleteClick(company.id, company.name)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-all flex-shrink-0"
                            aria-label="Delete company"
                            title="Delete company"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {companies.length === 1 && (
                    <p className="text-sm text-gray-500 mt-3 italic">
                      You must have at least one company. Create a new company before deleting this one.
                    </p>
                  )}
                </div>

                {/* New Company Form */}
                {showNewCompany && (
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Company</h3>
                    
                    {error && (
                      <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleCreateCompany} className="space-y-4">
                      {/* Company Name */}
                      <div>
                        <label htmlFor="company-name" className="block text-sm font-medium text-gray-700 mb-1">
                          Company Name *
                        </label>
                        <input
                          id="company-name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                          placeholder="Acme Auctions"
                        />
                      </div>

                      {/* Address */}
                      <div>
                        <label htmlFor="company-address" className="block text-sm font-medium text-gray-700 mb-1">
                          Address <span className="text-gray-400 font-normal">(Optional)</span>
                        </label>
                        <textarea
                          id="company-address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10 resize-none"
                          placeholder="123 Main St, City, State, ZIP"
                        />
                      </div>

                      {/* Currency & Units */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="company-currency" className="block text-sm font-medium text-gray-700 mb-1">
                            Currency
                          </label>
                          <select
                            id="company-currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                          >
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="JPY">JPY (¥)</option>
                            <option value="CAD">CAD ($)</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="company-units" className="block text-sm font-medium text-gray-700 mb-1">
                            Units
                          </label>
                          <select
                            id="company-units"
                            value={units}
                            onChange={(e) => setUnits(e.target.value as 'metric' | 'imperial')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                          >
                            <option value="imperial">Imperial</option>
                            <option value="metric">Metric</option>
                          </select>
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewCompany(false);
                            setName('');
                            setAddress('');
                            setError('');
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                        >
                          {loading ? 'Creating...' : 'Create Company'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              // Profile Tab
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium text-gray-500">Email</span>
                        <p className="text-gray-900">{user?.email}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">User ID</span>
                        <p className="text-gray-900 text-xs font-mono">{user?.id}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-start gap-4 p-6 border-b border-gray-200">
              <div className="p-3 rounded-full bg-red-100">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Delete Company?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This action cannot be undone
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-2">
                  You are about to permanently delete:
                </p>
                <div className="space-y-1 text-sm text-red-800">
                  <p className="font-semibold">Company: {deleteConfirmation.company.name}</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>{deleteConfirmation.stats.sales} sale(s)</li>
                    <li>{deleteConfirmation.stats.lots} lot(s)</li>
                    <li>{deleteConfirmation.stats.photos} photo(s)</li>
                    <li>{deleteConfirmation.stats.contacts} contact(s)</li>
                    <li>{deleteConfirmation.stats.documents} document(s)</li>
                  </ul>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900">
                  <strong>Warning:</strong> All data including photos and documents will be permanently deleted from storage. This cannot be recovered.
                </p>
              </div>

              {currentCompany?.id === deleteConfirmation.company.id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900">
                    <strong>Note:</strong> This is your active company. You will be switched to another company after deletion.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-2xl">
              <button
                onClick={() => setDeleteConfirmation(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Company</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}