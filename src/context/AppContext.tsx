import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Company } from '../types';

interface AppContextType {
  user: User | null;
  loading: boolean;
  currentCompany: Company | null;
  companies: Company[];
  setCurrentCompany: (company: Company) => void;
  refreshCompanies: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshCompanies();
    } else {
      setCompanies([]);
      setCurrentCompany(null);
    }
  }, [user]);

  const refreshCompanies = async () => {
    if (!user) return;

    try {
      // Get companies the user belongs to
      const { data: userCompanies, error: ucError } = await supabase
        .from('user_companies')
        .select('company_id')
        .eq('user_id', user.id);

      if (ucError) throw ucError;

      if (userCompanies && userCompanies.length > 0) {
        const companyIds = userCompanies.map(uc => uc.company_id);
        
        const { data: companiesData, error: cError } = await supabase
          .from('companies')
          .select('*')
          .in('id', companyIds)
          .order('created_at', { ascending: false });

        if (cError) throw cError;

        setCompanies(companiesData || []);
        
        // Set current company to first one if not set
        if (!currentCompany && companiesData && companiesData.length > 0) {
          setCurrentCompany(companiesData[0]);
        }
      } else {
        setCompanies([]);
        setCurrentCompany(null);
      }
    } catch (error) {
      console.error('Error fetching companies:', error);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setCurrentCompany(null);
    setCompanies([]);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        loading,
        currentCompany,
        companies,
        setCurrentCompany,
        refreshCompanies,
        signOut,
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