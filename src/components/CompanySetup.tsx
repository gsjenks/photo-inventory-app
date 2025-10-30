import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { Building2, LogOut, ArrowRight, Globe, Ruler, MapPin } from 'lucide-react';

export default function CompanySetup() {
  const { user, refreshCompanies, signOut } = useApp();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [units, setUnits] = useState<'metric' | 'imperial'>('imperial');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      setError('Authentication required. Please sign in again.');
      return;
    }
    
    if (!user) {
      setError('User data not available. Please refresh the page.');
      return;
    }

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
          user_id: user.id,
          company_id: company.id,
          role: 'owner',
        });

      if (linkError) throw linkError;

      await refreshCompanies();
    } catch (err: any) {
      console.error('Error creating company:', err);
      
      let errorMessage = err.message || 'Failed to create company';
      
      if (err.code === '42501' || err.message?.includes('row-level security')) {
        errorMessage = 'Permission error. Please contact support.';
      } else if (err.message?.includes('duplicate')) {
        errorMessage = 'A company with this name already exists.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      {/* Header with Indigo gradient */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 pt-8 pb-32 px-4 relative">
        {/* Logout button */}
        <button
          onClick={signOut}
          className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all backdrop-blur-sm"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-medium">Sign Out</span>
        </button>

        <div className="max-w-2xl mx-auto text-center pt-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Create Your Company
          </h1>
          <p className="text-indigo-100 text-lg">
            Let's set up your inventory workspace
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="max-w-2xl mx-auto px-4 -mt-20">
        <div className="bg-white rounded-3xl shadow-xl p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl font-medium text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Company Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                Company Name
              </label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 placeholder-gray-400"
                  placeholder="Acme Auctions"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className="block text-sm font-semibold text-gray-700 mb-2">
                Address <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <div className="absolute left-4 top-4 text-gray-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <textarea
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 placeholder-gray-400 resize-none"
                  placeholder="123 Main St, City, State, ZIP"
                />
              </div>
            </div>

            {/* Settings Row */}
            <div className="bg-gray-50 rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm mb-4">Preferences</h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Currency */}
                <div>
                  <label htmlFor="currency" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    Currency
                  </label>
                  <select
                    id="currency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 cursor-pointer"
                  >
                    <option value="USD">🇺🇸 USD ($)</option>
                    <option value="EUR">🇪🇺 EUR (€)</option>
                    <option value="GBP">🇬🇧 GBP (£)</option>
                    <option value="JPY">🇯🇵 JPY (¥)</option>
                    <option value="CAD">🇨🇦 CAD ($)</option>
                  </select>
                </div>

                {/* Units */}
                <div>
                  <label htmlFor="units" className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                    <Ruler className="w-4 h-4 text-indigo-600" />
                    Units
                  </label>
                  <select
                    id="units"
                    value={units}
                    onChange={(e) => setUnits(e.target.value as 'metric' | 'imperial')}
                    className="w-full px-4 py-3 bg-white border-2 border-gray-100 rounded-xl focus:outline-none focus:border-indigo-600 transition-all text-gray-900 cursor-pointer"
                  >
                    <option value="imperial">📏 Imperial</option>
                    <option value="metric">📐 Metric</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-4 rounded-2xl font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 mt-8"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Creating...</span>
                </div>
              ) : (
                <>
                  <span>Create Company</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Helper Text */}
          <p className="text-center text-sm text-gray-500 mt-6">
            You can invite team members and customize settings later
          </p>
        </div>

        {/* Bottom spacing */}
        <div className="h-12" />
      </div>
    </div>
  );
}