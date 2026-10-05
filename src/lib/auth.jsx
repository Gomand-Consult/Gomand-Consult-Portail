import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { fetchProfile } from './api';

const Ctx = createContext({ loading: true, session: null, profile: null, profileError: null });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, session: null, profile: null, profileError: null });

  useEffect(() => {
    let alive = true;
    const load = async (session) => {
      if (!session) { if (alive) setState({ loading: false, session: null, profile: null, profileError: null }); return; }
      try {
        const profile = await fetchProfile(session.user.id);
        if (alive) setState({ loading: false, session, profile, profileError: profile ? null : 'missing' });
      } catch {
        if (alive) setState({ loading: false, session, profile: null, profileError: 'error' });
      }
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') { setState((s) => ({ ...s, session })); return; }
      setTimeout(() => load(session), 0); // évite un blocage connu quand on appelle Supabase dans ce rappel
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
