import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { signIn } from '../lib/api';
import { Logos, ErrorBox } from '../components/Layout';
import { initialUrlError, configured } from '../supabase';

export function AuthFrame({ title, intro, children }) {
  return (
    <div className="login">
      <section className="login-hero">
        <span className="logo"><img src="/logo-white.png" alt="Gomand Consult" /></span>
        <div className="login-hero-body">
          <p className="eyebrow">Espace client</p>
          <h1>Vos documents, en toute clarté.</h1>
          <p>Devis, factures, livrables et photos de votre mission avec Gomand Consult. Consultez-les en ligne, surlignez ce qui compte et posez vos questions directement sur les pages.</p>
          <div className="clarity-line drawn" />
        </div>
        <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
      </section>
      <section className="login-side">
        <div className="login-card">
          <h2>{title}</h2>
          <p>{intro}</p>
          {children}
        </div>
      </section>
    </div>
  );
}

export default function Login() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialUrlError ? 'Ce lien n’est plus valable. Demandez-en un nouveau avec « Mot de passe oublié ».' : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session && profile) navigate(from || (profile.role === 'admin' ? '/admin' : '/'), { replace: true });
  }, [loading, session, profile, navigate, from]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await signIn(email, password); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <AuthFrame title="Connexion" intro="Accédez à l’espace de votre mission.">
      {!configured && <ErrorBox>L’application n’est pas encore reliée à Supabase (variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY).</ErrorBox>}
      <form onSubmit={submit} noValidate>
        <div className="field"><label htmlFor="email">Adresse email</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label htmlFor="pwd">Mot de passe</label>
          <input id="pwd" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <ErrorBox>{error}</ErrorBox>
        <button className="btn btn-primary" type="submit" disabled={busy || !email || !password}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <br />
        <Link className="link-quiet" to="/mot-de-passe-oublie">Mot de passe oublié</Link>
      </form>
      <p className="login-note">Votre accès a été créé par Anthony et vous a été envoyé par email. Il n’y a pas d’inscription libre.</p>
    </AuthFrame>
  );
}
