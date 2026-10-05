import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthFrame } from './Login';
import { useAuth } from '../lib/auth';
import { updatePassword } from '../lib/api';
import { ErrorBox, Loading } from '../components/Layout';
import { MIN_PASSWORD } from '../config';
import { initialUrlError } from '../supabase';

export default function SetPassword() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!session || initialUrlError) {
    return (
      <AuthFrame title="Lien expiré" intro="Ce lien n’est plus valable ou a déjà été utilisé.">
        <p><Link className="btn btn-primary" to="/mot-de-passe-oublie">Recevoir un nouveau lien</Link></p>
      </AuthFrame>
    );
  }

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (pwd.length < MIN_PASSWORD) return setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
    if (pwd !== again) return setError('Les deux mots de passe ne sont pas identiques.');
    setBusy(true);
    try { await updatePassword(pwd); navigate(profile?.role === 'admin' ? '/admin' : '/', { replace: true }); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <AuthFrame title="Choisissez votre mot de passe" intro="Il vous servira à vous connecter à votre espace.">
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="pwd">Nouveau mot de passe</label>
          <input id="pwd" type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
          <span className="hint">Au moins {MIN_PASSWORD} caractères. Une phrase simple à retenir fonctionne très bien.</span></div>
        <div className="field"><label htmlFor="pwd2">Confirmer le mot de passe</label>
          <input id="pwd2" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer et continuer'}</button>
      </form>
    </AuthFrame>
  );
}
