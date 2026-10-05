import { createClient } from '@supabase/supabase-js';

// Les liens d'invitation et de réinitialisation arrivent avec un fragment d'adresse (#type=invite…).
// On le lit AVANT que la bibliothèque ne le consomme.
const hashParams = new URLSearchParams((typeof window !== 'undefined' ? window.location.hash : '').replace(/^#/, ''));
export const initialUrlType = hashParams.get('type');
export const initialUrlError = hashParams.get('error_description') || hashParams.get('error');

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'clé-manquante', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
