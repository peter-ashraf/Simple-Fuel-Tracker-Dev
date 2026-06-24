import { createClient } from '@supabase/supabase-js';
import { CLOUD_CONFIGURED, SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/appConfig';

const createDisabledSupabaseProxy = () => {
  const disabledCall = async () => ({
    data: null,
    error: new Error('Cloud is disabled in this development build.')
  });

  const disabledResult = { data: null, error: new Error('Cloud is disabled in this development build.') };
  const chain = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'then') return (resolve) => Promise.resolve(disabledResult).then(resolve);
      return () => chain;
    }
  });

  return {
    auth: {
      getSession: disabledCall,
      getUser: disabledCall,
      signInWithPassword: disabledCall,
      signUp: disabledCall,
      updateUser: disabledCall,
      resetPasswordForEmail: disabledCall,
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } })
    },
    from: () => chain,
    rpc: disabledCall
  };
};

export const supabase = CLOUD_CONFIGURED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : createDisabledSupabaseProxy();

console.log(CLOUD_CONFIGURED ? '[Supabase] client initialized' : '[Supabase] cloud disabled for dev build');
