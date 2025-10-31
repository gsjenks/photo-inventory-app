import { useState } from 'react';
import { X, Building2, Plus, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import type { Company } from '../types';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, companies, currentCompany, setCurrentCompany, refreshCompanies } = useApp();
  const [activeTab, setActiveTab] = useState<'companies' | 'profile'>('companies');
  const [showNewCompany, setShowNewCompany] = useState(false);
  
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

      const { error: linkError } = await supabase
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

  return (
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
                    <button
                      key={company.id}
                      onClick={() => setCurrentCompany(company)}
                      className={`w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                        company.id === currentCompany?.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <Building2 className={`w-5 h-5 ${
                        company.id === currentCompany?.id ? 'text-indigo-600' : 'text-gray-400'
                      }`} />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{company.name}</div>
                        {company.address && (
                          <div className="text-sm text-gray-500">{company.address}</div>
                        )}
                      </div>
                      {company.id === currentCompany?.id && (
                        <Check className="w-5 h-5 text-indigo-600" />
                      )}
                    </button>
                  ))}
                </div>
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
  );
}