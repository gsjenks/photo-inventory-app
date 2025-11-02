import { useState, useEffect } from 'react';
import { X, Building2, Plus, Trash2, AlertTriangle, Users, Mail, Shield, UserPlus, CheckCircle } from 'lucide-react';
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

interface TeamMember {
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, companies, currentCompany, setCurrentCompany, refreshCompanies } = useApp();
  const [activeTab, setActiveTab] = useState<'companies' | 'team' | 'profile'>('companies');
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

  // Team management state - ENHANCED with success message
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member'>('member');
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberSuccess, setAddMemberSuccess] = useState(''); // NEW: Success message
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'admin' | 'member' | null>(null);

  // Load team members when team tab is active
  useEffect(() => {
    if (activeTab === 'team' && currentCompany) {
      loadTeamMembers();
    }
  }, [activeTab, currentCompany]);

  // Clear success message after 5 seconds
  useEffect(() => {
    if (addMemberSuccess) {
      const timer = setTimeout(() => {
        setAddMemberSuccess('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [addMemberSuccess]);

  const loadTeamMembers = async () => {
    if (!currentCompany || !user) return;

    setTeamLoading(true);
    try {
      // Use the enhanced RPC function to get team members with emails
      const { data, error } = await supabase
        .rpc('get_company_team_members', { company_uuid: currentCompany.id });

      if (error) throw error;

      if (data) {
        setTeamMembers(data as TeamMember[]);

        // Set current user's role
        const currentMember = data.find((m: TeamMember) => m.user_id === user.id);
        if (currentMember) {
          setCurrentUserRole(currentMember.role as 'owner' | 'admin' | 'member');
        }
      }
    } catch (err) {
      console.error('Error loading team members:', err);
      // Fallback to basic approach if RPC function doesn't exist yet
      try {
        const { data: userCompanies, error: ucError } = await supabase
          .from('user_companies')
          .select('user_id, role, created_at')
          .eq('company_id', currentCompany.id)
          .order('created_at', { ascending: true });

        if (ucError) throw ucError;

        if (userCompanies) {
          const members = userCompanies.map(uc => ({
            user_id: uc.user_id,
            email: uc.user_id === user.id ? user.email || 'Unknown' : `User ${uc.user_id.slice(0, 8)}...`,
            role: uc.role as 'owner' | 'admin' | 'member',
            created_at: uc.created_at,
          }));
          
          setTeamMembers(members);

          const currentMember = userCompanies.find(uc => uc.user_id === user.id);
          if (currentMember) {
            setCurrentUserRole(currentMember.role as 'owner' | 'admin' | 'member');
          }
        }
      } catch (fallbackErr) {
        console.error('Fallback error:', fallbackErr);
      }
    } finally {
      setTeamLoading(false);
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCompany) return;

    setAddMemberLoading(true);
    setAddMemberError('');
    setAddMemberSuccess(''); // Clear any previous success message

    try {
      // Check if the email is already a member
      const existingMember = teamMembers.find(
        m => m.email.toLowerCase() === newMemberEmail.toLowerCase()
      );
      
      if (existingMember) {
        setAddMemberError('This user is already a member of this company');
        setAddMemberLoading(false);
        return;
      }

      // Get user ID by email using RPC function
      const { data: userData, error: userError } = await supabase
        .rpc('get_user_id_by_email', { user_email: newMemberEmail });

      if (userError || !userData) {
        setAddMemberError(
          'User not found. They must create an account first before you can add them.'
        );
        setAddMemberLoading(false);
        return;
      }

      // Add the user to the company
      const { error: insertError } = await supabase
        .from('user_companies')
        .insert({
          user_id: userData,
          company_id: currentCompany.id,
          role: newMemberRole,
        });

      if (insertError) {
        if (insertError.code === '23505') {
          setAddMemberError('This user is already a member of this company');
        } else {
          throw insertError;
        }
      } else {
        // Success - show confirmation with email
        setAddMemberSuccess(`Successfully added ${newMemberEmail} as ${newMemberRole}`);
        
        // Reload team members
        await loadTeamMembers();
        
        // Clear form after short delay
        setTimeout(() => {
          setShowAddMember(false);
          setNewMemberEmail('');
          setNewMemberRole('member');
        }, 1500);
      }
    } catch (err: any) {
      console.error('Error adding team member:', err);
      setAddMemberError(err.message || 'Failed to add team member');
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member') => {
    if (!currentCompany) return;

    try {
      const { error } = await supabase
        .from('user_companies')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      // Reload team members
      await loadTeamMembers();
    } catch (err) {
      console.error('Error changing role:', err);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentCompany) return;
    if (!window.confirm('Are you sure you want to remove this team member?')) return;

    try {
      const { error } = await supabase
        .from('user_companies')
        .delete()
        .eq('user_id', userId)
        .eq('company_id', currentCompany.id);

      if (error) throw error;

      // Reload team members
      await loadTeamMembers();
    } catch (err) {
      console.error('Error removing team member:', err);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

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

      const { error: userCompanyError } = await supabase
        .from('user_companies')
        .insert({
          user_id: user.id,
          company_id: company.id,
          role: 'owner',
        });

      if (userCompanyError) throw userCompanyError;

      await refreshCompanies();
      setCurrentCompany(company);
      setName('');
      setAddress('');
      setShowNewCompany(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateDelete = async (company: { id: string; name: string }) => {
    try {
      const [salesCount, lotsCount, photosCount, contactsCount, documentsCount] = await Promise.all([
        supabase.from('sales').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('lots').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('photos').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
        supabase.from('documents').select('id', { count: 'exact', head: true }).eq('company_id', company.id),
      ]);

      setDeleteConfirmation({
        company,
        stats: {
          sales: salesCount.count || 0,
          lots: lotsCount.count || 0,
          photos: photosCount.count || 0,
          contacts: contactsCount.count || 0,
          documents: documentsCount.count || 0,
        },
      });
    } catch (err) {
      console.error('Error loading company stats:', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation || !user) return;

    setDeleteLoading(true);

    try {
      const { data: photos } = await supabase
        .from('photos')
        .select('file_path')
        .eq('company_id', deleteConfirmation.company.id);

      if (photos) {
        const filePaths = photos.map(p => p.file_path);
        if (filePaths.length > 0) {
          await supabase.storage.from('photos').remove(filePaths);
        }
      }

      const { data: documents } = await supabase
        .from('documents')
        .select('file_path')
        .eq('company_id', deleteConfirmation.company.id);

      if (documents) {
        const filePaths = documents.map(d => d.file_path);
        if (filePaths.length > 0) {
          await supabase.storage.from('documents').remove(filePaths);
        }
      }

      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', deleteConfirmation.company.id);

      if (error) throw error;

      await refreshCompanies();

      if (currentCompany?.id === deleteConfirmation.company.id) {
        const remainingCompanies = companies.filter(c => c.id !== deleteConfirmation.company.id);
        if (remainingCompanies.length > 0) {
          setCurrentCompany(remainingCompanies[0]);
        } else {
          setCurrentCompany(null as any);
        }
      }

      setDeleteConfirmation(null);
    } catch (err: any) {
      console.error('Error deleting company:', err);
      alert('Failed to delete company: ' + err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 px-6">
            <nav className="flex gap-8">
              <button
                onClick={() => setActiveTab('companies')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                  activeTab === 'companies'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Companies
                </div>
              </button>
              <button
                onClick={() => setActiveTab('team')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                  activeTab === 'team'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Team
                </div>
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-all ${
                  activeTab === 'profile'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Profile
                </div>
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {activeTab === 'companies' ? (
              // Companies Tab
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Your Companies</h3>
                  <button
                    onClick={() => setShowNewCompany(!showNewCompany)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    New Company
                  </button>
                </div>

                {/* New Company Form */}
                {showNewCompany && (
                  <div className="p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-4">Create New Company</h4>
                    {error && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                        {error}
                      </div>
                    )}
                    <form onSubmit={handleCreateCompany} className="space-y-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                          Company Name *
                        </label>
                        <input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                        />
                      </div>
                      <div>
                        <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                          Address
                        </label>
                        <input
                          id="address"
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                            Currency
                          </label>
                          <select
                            id="currency"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                          >
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="JPY">JPY (¥)</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="units" className="block text-sm font-medium text-gray-700 mb-1">
                            Units
                          </label>
                          <select
                            id="units"
                            value={units}
                            onChange={(e) => setUnits(e.target.value as 'metric' | 'imperial')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                          >
                            <option value="imperial">Imperial</option>
                            <option value="metric">Metric</option>
                          </select>
                        </div>
                      </div>
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

                {/* Companies List */}
                <div className="space-y-3">
                  {companies.map((company) => (
                    <div
                      key={company.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        currentCompany?.id === company.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-900">{company.name}</h4>
                            {currentCompany?.id === company.id && (
                              <span className="px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-full">
                                Active
                              </span>
                            )}
                          </div>
                          {company.address && (
                            <p className="text-sm text-gray-600 mt-1">{company.address}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span>Currency: {company.currency}</span>
                            <span>Units: {company.units}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          {currentCompany?.id !== company.id && (
                            <button
                              onClick={() => setCurrentCompany(company)}
                              className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all"
                            >
                              Switch
                            </button>
                          )}
                          <button
                            onClick={() => handleInitiateDelete(company)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeTab === 'team' ? (
              // Team Tab - ENHANCED
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Team Members</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Manage who has access to {currentCompany?.name}
                    </p>
                  </div>
                  {canManageTeam && (
                    <button
                      onClick={() => {
                        setShowAddMember(!showAddMember);
                        setAddMemberError('');
                        setAddMemberSuccess('');
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                    >
                      <UserPlus className="w-5 h-5" />
                      Add Member
                    </button>
                  )}
                </div>

                {/* SUCCESS MESSAGE - NEW */}
                {addMemberSuccess && (
                  <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-green-900">Team member added successfully!</p>
                      <p className="text-sm text-green-700 mt-1">{addMemberSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Team Members List - ENHANCED with prominent email display */}
                {teamLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {teamMembers.map((member) => (
                      <div
                        key={member.user_id}
                        className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              {/* Email Icon - NEW */}
                              <div className="p-2 bg-indigo-100 rounded-lg">
                                <Mail className="w-5 h-5 text-indigo-600" />
                              </div>
                              <div>
                                {/* Email prominently displayed - ENHANCED */}
                                <p className="font-semibold text-gray-900">{member.email}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    member.role === 'owner'
                                      ? 'bg-purple-100 text-purple-800'
                                      : member.role === 'admin'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                                  </span>
                                  {member.user_id === user?.id && (
                                    <span className="text-xs text-gray-500">(You)</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          {canManageTeam && member.role !== 'owner' && member.user_id !== user?.id && (
                            <div className="flex items-center gap-2 ml-4">
                              <select
                                value={member.role}
                                onChange={(e) => handleChangeRole(member.user_id, e.target.value as 'admin' | 'member')}
                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600"
                              >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Member Form - ENHANCED */}
                {showAddMember && canManageTeam && (
                  <div className="mt-6 p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">Add Team Member</h4>
                      <button
                        onClick={() => {
                          setShowAddMember(false);
                          setNewMemberEmail('');
                          setAddMemberError('');
                          setAddMemberSuccess('');
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                      <p className="font-medium mb-1">📧 Email Required:</p>
                      <p>Enter the team member's email address. They must already have an account to be added.</p>
                    </div>

                    {addMemberError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                        {addMemberError}
                      </div>
                    )}

                    <form onSubmit={handleAddTeamMember} className="space-y-4">
                      <div>
                        <label htmlFor="member-email" className="block text-sm font-medium text-gray-700 mb-1">
                          Email Address *
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="w-5 h-5 text-gray-400" />
                          </div>
                          <input
                            id="member-email"
                            type="email"
                            value={newMemberEmail}
                            onChange={(e) => setNewMemberEmail(e.target.value)}
                            required
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                            placeholder="teammate@example.com"
                          />
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          The user will be added to this company with the email you provide
                        </p>
                      </div>

                      <div>
                        <label htmlFor="member-role" className="block text-sm font-medium text-gray-700 mb-1">
                          Role
                        </label>
                        <select
                          id="member-role"
                          value={newMemberRole}
                          onChange={(e) => setNewMemberRole(e.target.value as 'admin' | 'member')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 focus:ring-opacity-10"
                        >
                          <option value="member">Member - Can view and edit data</option>
                          <option value="admin">Admin - Can manage team and settings</option>
                        </select>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddMember(false);
                            setNewMemberEmail('');
                            setAddMemberError('');
                            setAddMemberSuccess('');
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={addMemberLoading}
                          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
                        >
                          {addMemberLoading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Adding...</span>
                            </>
                          ) : (
                            <>
                              <UserPlus className="w-4 h-4" />
                              <span>Add Member</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {!canManageTeam && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      You need to be an Owner or Admin to manage team members.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // Profile Tab
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-lg">
                          <Mail className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">Email</span>
                          <p className="text-gray-900 font-medium">{user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <Shield className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <span className="text-sm font-medium text-gray-500">User ID</span>
                          <p className="text-gray-900 text-xs font-mono">{user?.id}</p>
                        </div>
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