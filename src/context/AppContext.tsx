// src/context/AppContext.tsx
// FIXED: Better error handling, uses cached companies on query failures, prevents unnecessary reloads

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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

// Helper: Wraps a promise with a timeout
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentCompany, setCurrentCompanyState] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySwitched, setCompanySwitched] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  
  const loadingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const companiesLoadedRef = useRef(false); // Track if we've successfully loaded companies at least once

  const loadCompanies = async (userId: string, isInitialLoad: boolean = false) => {
    try {
      console.log('📦 Loading companies for user:', userId);
      
      // 🔧 FIX 1: If companies are already loaded and this isn't the initial load, skip
      if (companiesLoadedRef.current && !isInitialLoad) {
        console.log('✓ Companies already loaded, skipping reload');
        return;
      }
      
      // PARALLEL execution with individual timeouts (reduced to 5 seconds)
      const [ownedResult, linkedResult] = await Promise.allSettled([
        // Query 1: Direct owned companies (5 second timeout)
        withTimeout(
          (async () => {
            return await supabase
              .from('companies')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });
          })(),
          5000, // Reduced from 8000
          'Owned companies query timeout'
        ),
        
        // Query 2: User_companies relationships (5 second timeout)
        withTimeout(
          (async () => {
            return await supabase
              .from('user_companies')
              .select('company_id, role, companies(*)')
              .eq('user_id', userId);
          })(),
          5000, // Reduced from 8000
          'User companies query timeout'
        )
      ]);

      // Process owned companies result
      let ownedCompanies: Company[] = [];
      if (ownedResult.status === 'fulfilled') {
        const { data, error } = ownedResult.value;
        if (error) {
          console.error('❌ Error loading owned companies:', error);
        } else if (data) {
          ownedCompanies = data;
          console.log('✅ Owned companies:', ownedCompanies.length);
        }
      } else {
        console.error('❌ Owned companies query failed:', ownedResult.reason);
      }

      // Process linked companies result
      let linkedCompanies: Company[] = [];
      if (linkedResult.status === 'fulfilled') {
        const { data, error } = linkedResult.value;
        if (error) {
          console.error('❌ Error loading user_companies:', error);
        } else if (data) {
          data.forEach((uc: any) => {
            if (uc.companies && typeof uc.companies === 'object' && !Array.isArray(uc.companies)) {
              linkedCompanies.push(uc.companies as Company);
            }
          });
          console.log('✅ User_companies relationships:', linkedCompanies.length);
        }
      } else {
        console.error('❌ User companies query failed:', linkedResult.reason);
      }

      // 🔧 FIX 2: If BOTH queries failed, use cached companies
      if (ownedCompanies.length === 0 && linkedCompanies.length === 0) {
        console.warn('⚠️ Both queries failed or returned no data - checking cache');
        
        const cachedCompanies = localStorage.getItem('cachedCompanies');
        if (cachedCompanies) {
          try {
            const parsed = JSON.parse(cachedCompanies);
            if (parsed && parsed.length > 0) {
              console.log('✅ Using cached companies:', parsed.length);
              setCompanies(parsed);
              
              // Restore current company
              const savedCompanyId = localStorage.getItem('currentCompanyId');
              if (savedCompanyId) {
                const saved = parsed.find((c: Company) => c.id === savedCompanyId);
                if (saved) {
                  setCurrentCompanyState(saved);
                  console.log('✅ Restored cached company:', saved.name);
                  companiesLoadedRef.current = true;
                  return; // Exit early - we have cached data
                }
              }
              
              // If no saved company but we have companies, use first
              if (parsed.length > 0) {
                setCurrentCompanyState(parsed[0]);
                localStorage.setItem('currentCompanyId', parsed[0].id);
                console.log('✅ Using first cached company:', parsed[0].name);
                companiesLoadedRef.current = true;
                return;
              }
            }
          } catch (e) {
            console.error('❌ Failed to parse cached companies:', e);
          }
        }
        
        // If we get here, we have no data and no cache
        console.error('❌ No companies loaded and no cache available');
        setCompanies([]);
        setCurrentCompanyState(null);
        localStorage.removeItem('currentCompanyId');
        return;
      }

      // Combine and deduplicate companies
      const allCompaniesMap = new Map<string, Company>();
      
      ownedCompanies.forEach(company => allCompaniesMap.set(company.id, company));
      linkedCompanies.forEach(company => allCompaniesMap.set(company.id, company));

      const companiesData = Array.from(allCompaniesMap.values())
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });

      console.log('✅ Total companies found:', companiesData.length);
      if (companiesData.length > 0) {
        console.log('   Companies:', companiesData.map(c => c.name).join(', '));
      }
      
      setCompanies(companiesData);
      companiesLoadedRef.current = true; // Mark as successfully loaded

      // Cache companies
      try {
        localStorage.setItem('cachedCompanies', JSON.stringify(companiesData));
      } catch (e) {
        console.error('Failed to cache companies:', e);
      }

      // Set current company
      const savedCompanyId = localStorage.getItem('currentCompanyId');
      
      if (savedCompanyId && companiesData.length > 0) {
        const saved = companiesData.find((c) => c.id === savedCompanyId);
        if (saved) {
          console.log('✅ Setting saved company:', saved.name);
          setCurrentCompanyState(saved);
        } else {
          console.log('⚠️ Saved company not found, using first company');
          setCurrentCompanyState(companiesData[0]);
          localStorage.setItem('currentCompanyId', companiesData[0].id);
        }
      } else if (companiesData.length > 0) {
        console.log('✅ Setting first company:', companiesData[0].name);
        setCurrentCompanyState(companiesData[0]);
        localStorage.setItem('currentCompanyId', companiesData[0].id);
      } else {
        console.log('⚠️ No companies found - showing setup');
        setCurrentCompanyState(null);
        localStorage.removeItem('currentCompanyId');
      }
    } catch (error) {
      console.error('❌ Failed to load companies:', error);
      
      // 🔧 FIX 3: Always try to use cache on any error
      const cachedCompanies = localStorage.getItem('cachedCompanies');
      if (cachedCompanies) {
        try {
          const parsed = JSON.parse(cachedCompanies);
          console.log('✅ Using cached companies after error:', parsed.length);
          setCompanies(parsed);
          if (parsed.length > 0) {
            const savedCompanyId = localStorage.getItem('currentCompanyId');
            const saved = parsed.find((c: Company) => c.id === savedCompanyId);
            setCurrentCompanyState(saved || parsed[0]);
            companiesLoadedRef.current = true;
          }
          return;
        } catch (e) {
          console.error('❌ Failed to parse cached companies');
        }
      }
      
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
      companiesLoadedRef.current = false; // Force reload
      await loadCompanies(user.id, true);
    }
  };

  const signOut = async () => {
    console.log('👋 Signing out...');
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      companiesLoadedRef.current = false;
      localStorage.removeItem('currentCompanyId');
      localStorage.removeItem('cachedCompanies');
      console.log('✅ Signed out successfully');
    } catch (error) {
      console.error('❌ Failed to sign out:', error);
      // Force logout even if API call fails
      setUser(null);
      setCurrentCompanyState(null);
      setCompanies([]);
      setIsPasswordRecovery(false);
      companiesLoadedRef.current = false;
      localStorage.removeItem('currentCompanyId');
      localStorage.removeItem('cachedCompanies');
      throw error;
    }
  };

  useEffect(() => {
    // 15-second master timeout (reduced from 20)
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('⏰ Master timeout (15s) - forcing app to load');
      setLoading(false);
    }, 15000);

    const checkAndCleanSession = async () => {
      try {
        console.log('🔍 Checking session...');
        
        // Get session WITH timeout (5 seconds)
        const sessionResult = await withTimeout(
          (async () => {
            return await supabase.auth.getSession();
          })(),
          5000,
          'Session check timeout'
        );
        
        const { data: { session }, error } = sessionResult;
        
        if (error) {
          console.error('❌ Session error:', error);
          
          // Clean up corrupted session data
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
          
          // Load companies with initial load flag
          console.log('📦 Loading companies...');
          await loadCompanies(session.user.id, true); // true = initial load
        } else {
          console.log('ℹ️ No session found');
          setUser(null);
          setCurrentCompanyState(null);
          setCompanies([]);
        }
      } catch (err) {
        console.error('❌ Failed to check session:', err);
        
        // Clean up on error
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
        
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        
        setLoading(false);
      }
    };

    checkAndCleanSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth event:', event);

      if (event === 'SIGNED_IN') {
        console.log('✅ User signed in:', session?.user?.email);
        setUser(session?.user ?? null);
        
        // 🔧 FIX 4: Only load companies on initial sign in, not on token refresh
        if (session?.user && !companiesLoadedRef.current) {
          console.log('📦 Loading companies (initial sign in)');
          await loadCompanies(session.user.id, true);
        } else {
          console.log('✓ Companies already loaded, skipping reload on token refresh');
        }
      } else if (event === 'SIGNED_OUT') {
        console.log('👋 User signed out');
        setUser(null);
        setCurrentCompanyState(null);
        setCompanies([]);
        setIsPasswordRecovery(false);
        companiesLoadedRef.current = false;
        localStorage.removeItem('currentCompanyId');
        localStorage.removeItem('cachedCompanies');
      } else if (event === 'TOKEN_REFRESHED') {
        console.log('✅ Token refreshed');
        setUser(session?.user ?? null);
        // 🔧 FIX 5: Don't reload companies on token refresh
        console.log('✓ Token refreshed, keeping existing companies');
      } else if (event === 'USER_UPDATED') {
        console.log('✅ User updated');
        setUser(session?.user ?? null);
        
        const isOnResetRoute = window.location.pathname.includes('/reset-password') || 
                               window.location.hash.includes('reset-password') ||
                               window.location.hash.includes('type=recovery');
        
        if (isPasswordRecovery || isOnResetRoute) {
          console.log('🔒 Skipping company load - password reset in progress');
        } else if (session?.user && !companiesLoadedRef.current) {
          console.log('📦 Loading companies after user update');
          await loadCompanies(session.user.id, true);
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        console.log('🔒 PASSWORD RECOVERY DETECTED');
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
      } else if (event === 'INITIAL_SESSION') {
        console.log('🔍 Initial session event');
        setUser(session?.user ?? null);
      }
    });

    return () => {
      subscription.unsubscribe();
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // Cache companies whenever they change (but don't overwrite if empty due to error)
  useEffect(() => {
    if (companies.length > 0) {
      try {
        localStorage.setItem('cachedCompanies', JSON.stringify(companies));
      } catch (e) {
        console.error('Failed to cache companies:', e);
      }
    }
  }, [companies]);

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