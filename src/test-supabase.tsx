import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

export function TestSupabase() {
  const [status, setStatus] = useState('Checking connection...');

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from('items').select('count');
      
      if (error) {
        setStatus(`❌ Error: ${error.message}`);
      } else {
        setStatus('✅ Connected to Supabase!');
      }
    }
    
    testConnection();
  }, []);

  return <div className="p-4">{status}</div>;
}