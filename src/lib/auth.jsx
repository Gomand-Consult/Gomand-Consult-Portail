import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { fetchProfile } from './api';

const Ctx = createContext({ loading: true, session: null, profile: null, profileError: null, refresh: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, profileError: null });

  const load = useCallback(async (session) => {
    if (!session) { setState({ loading: false, session: null, profile: null, profileError: null }); return; }
    try {
      const profile = await fetchProfile(session.user.id);
      setState({ loading: false, session, profile, profileError: profile ? null : 'missing' });
    } catch {
      setState({ loading: false, session, profile: null, profileError: 'error' });
    }
  }, []);

  // Recharge le profil (par exemple après avoir pris connaissance de la politique de confidentialité).
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await load(data.session);
  }, [load]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') { setState((s) => ({ ...s, session })); return; }
      setTimeout(() => load(session), 0); // évite un blocage connu quand on appelle Supabase dans ce rappel
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  return <Ctx.Provider value={{ ...state, refresh }}>{children}</Ctx.Provider>;
}
