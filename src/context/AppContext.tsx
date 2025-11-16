// src/context/AppContext.tsx
// FIXED: Don't load companies on USER_UPDATED if we're resetting password

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Company } from '../types';

interface AppContextType {
  user: User | null;
  loading: boolean;
  currentCompany: Company | null;
  companies: Company[];
  setCurrentCompany: (company: Company) => void;
  companySwitched: boolean;
  setCompanySwitched: (switched: boolean) => void;
  refreshCompanies: () => Promise<void>;
  signOut: () => Promise<void>;
  isPasswordRecovery: boolean;
  setIsPasswordRecovery: (isRecovery: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySwitched, setCompanySwitched] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // ✅ CORRECTED: Load companies using BOTH relationship patterns
  const loadCompanies = async (userId: string) => {
    try {
      console.log('📦 Loading companies for user:', userId);
      
      // Method 1: Get companies where user is direct owner (via user_id)
      const { data: ownedCompanies, error: ownedError } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (ownedError) {
        console.error('❌ Error loading owned companies:', ownedError);
      }

      // Method 2: Get companies via user_companies join table
      const { data: userCompaniesData, error: joinError } = await supabase
        .from('user_companies')
        .select('company_id, role, companies(*)')
        .eq('user_id', userId);

      if (joinError) {
        console.error('❌ Error loading user_companies:', joinError);
      }

      // ✅ FIXED: Properly extract and type companies from join table
      const linkedCompanies: Company[] = [];
      if (userCompaniesData) {
        userCompaniesData.forEach((uc: any) => {
          if (uc.companies && typeof uc.companies === 'object' && !Array.isArray(uc.companies)) {
            linkedCompanies.push(uc.companies as Company);
          }
        });
      }

      // Combine and deduplicate companies from both sources
      const allCompaniesMap = new Map<string, Company>();
      
      // Add owned companies
      if (ownedCompanies) {
        ownedCompanies.forEach(company => {
          allCompaniesMap.set(company.id, company);
        });
      }
      
      // Add linked companies
      linkedCompanies.forEach(company => {
        allCompaniesMap.set(company.id, company);
      });

      // Convert map to array and sort
      const companiesData = Array.from(allCompaniesMap.values())
        .sort((a, b) => {
          // ✅ FIXED: Handle potentially undefined created_at
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      console.log('📦 Found companies:', companiesData.length);
      console.log('  - Via user_id:', ownedCompanies?.length || 0);
      console.log('  - Via user_companies:', linkedCompanies.length);
      
      if (companiesData.length > 0) {
        console.log('📋 Company list:', companiesData.map(c => c.name).join(', '));
      }
      
      setCompanies(companiesData);

      // Set current company from localStorage or first company
      const savedCompanyId = localStorage.getItem('currentCompanyId');
      console.log('💾 Saved company ID:', savedCompanyId);
      
      if (savedCompanyId && companiesData.length > 0) {
        const saved = companiesData.find((c) => c.id === savedCompanyId);
        if (saved) {
          console.log('✅ Setting saved company:', saved.name);
          setCurrentCompanyState(saved);
        } else {
          console.log('⚠️ Saved company not found, using first company:', companiesData[0].name);
          setCurrentCompanyState(companiesData[0]);
          localStorage.setItem('currentCompanyId', companiesData[0].id);
        }
      } else if (companiesData.length > 0) {
        console.log('✅ Setting first company:', companiesData[0].name);
        setCurrentCompanyState(companiesData[0]);
        localStorage.setItem('currentCompanyId', companiesData[0].id);
      } else {
        console.log('⚠️ No companies found for user');
        setCurrentCompanyState(null);
        localStorage.removeItem('currentCompanyId');
      }
    } catch (error) {
      console.error('❌ Failed to load companies:', error);
      setCompanies([]);
      setCurrentCompanyState(null);
    }
  };

  const setCurrentCompany = (company: Company) => {
    console.log('🔄 Switching to company:', company.name);
    setCurrentCompanyState(company);
    setCompanySwitched(true);
    localStorage.setItem('currentCompanyId', company.id);
  };

  const refreshCompanies = async () => {
    if (user) {
      console.log('🔄 Refreshing companies...');
      await loadCompanies(user.id);
    }
  };

  const signOut = async () => {
    console.log('👋 Signing out...');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('❌ Sign out error:', error);
        throw error;
      }
      // Clear local state
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      localStorage.removeItem('currentCompanyId');
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('❌ Failed to sign out:', error);
      // Force clear state even if sign out fails
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      localStorage.removeItem('currentCompanyId');
      throw error;
    }
  };

  useEffect(() => {
    // Check and clean session on mount
    const checkAndCleanSession = async () => {
      try {
        console.log('🔍 Checking session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('❌ Session error:', error);
          console.log('🧹 Clearing corrupted auth data...');
          
          // Clear all Supabase auth data from storage
          const keys = Object.keys(localStorage);
          keys.forEach(key => {
            if (key.startsWith('sb-') || key.includes('supabase')) {
              localStorage.removeItem(key);
            }
          });
          
          setUser(null);
          setCurrentCompanyState(null);
          setCompanies([]);
        } else if (session?.user) {
          console.log('✅ Session found for user:', session.user.email);
          setUser(session.user);
          
          // Load companies for the session user
          console.log('📦 Loading companies for initial session...');
          await loadCompanies(session.user.id);
        } else {
          console.log('ℹ️ No session found');
          setUser(null);
          setCurrentCompanyState(null);
          setCompanies([]);
        }
      } catch (err) {
        console.error('❌ Failed to check session:', err);
        // Clear everything and start fresh
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith('sb-') || key.includes('supabase') || key === 'currentCompanyId') {
            localStorage.removeItem(key);
          }
        });
        setUser(null);
        setCurrentCompanyState(null);
        setCompanies([]);
      } finally {
        console.log('✅ Session check complete, setting loading = false');
        setLoading(false);
      }
    };

    checkAndCleanSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth event:', event);

      if (event === 'SIGNED_IN') {
        console.log('✅ User signed in:', session?.user?.email);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadCompanies(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        setUser(null);
        setCurrentCompanyState(null);
        setCompanies([]);
        setIsPasswordRecovery(false);
        localStorage.removeItem('currentCompanyId');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token refreshed successfully');
        setUser(session?.user ?? null);
      } else if (event === 'USER_UPDATED') {
        console.log('✅ User updated');
        setUser(session?.user ?? null);
        
        // ✅ FIXED: Don't load companies if in password recovery OR on reset-password route
        const isOnResetRoute = window.location.pathname.includes('/reset-password') || 
                               window.location.hash.includes('reset-password') ||
                               window.location.hash.includes('type=recovery');
        
        if (isPasswordRecovery || isOnResetRoute) {
          console.log('🔑 Skipping company load - password reset in progress');
        } else if (session?.user) {
          console.log('📦 Loading companies after user update');
          await loadCompanies(session.user.id);
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        console.log('🔑 PASSWORD RECOVERY DETECTED - Showing password reset form');
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
      } else if (event === 'INITIAL_SESSION') {
        console.log('🔐 Initial session event');
        setUser(session?.user ?? null);
      }

      // Handle auth errors
      if (!session && user && event !== 'SIGNED_OUT' && event !== 'PASSWORD_RECOVERY') {
        console.warn('⚠️ Session lost - possible token refresh failure');
      }
    });

    return () => subscription.unsubscribe();
  }, []); // Empty dependency array - only run once on mount

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        currentCompany,
        companies,
        setCurrentCompany,
        companySwitched,
        setCompanySwitched,
        refreshCompanies,
        signOut,
        isPasswordRecovery,
        setIsPasswordRecovery,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}