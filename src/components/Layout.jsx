import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { signOut } from '../lib/api';
import { CONTACT } from '../config';

export const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ARROW_BACK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
);

export function Logos({ className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <img className="logo-on-light" src="/logo.png" alt="Gomand Consult" />
      <img className="logo-on-dark" src="/logo-white.png" alt="" aria-hidden="true" />
    </span>
  );
}

export function Header({ navLabel }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'admin';
  const who = profile ? (profile.full_name || profile.email || '') : '';
  const logout = async () => { await signOut(); navigate('/connexion', { replace: true }); };
  return (
    <header className="site-header">
      <div className="container">
        <Link to={isAdmin ? '/admin' : '/'} aria-label="Gomand Consult, accueil"><Logos /></Link>
        <nav className="nav-desktop" aria-label="Navigation principale">
          <Link to={isAdmin ? '/admin' : '/'} aria-current="page">{navLabel || (isAdmin ? 'Back-office' : 'Documents')}</Link>
        </nav>
        <div className="who">
          <span className="who-name">{who}</span>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Se déconnecter</button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <Logos />
        <p>Espace client sécurisé de Gomand Consult SRL, Walhain (Belgique).</p>
      </div>
    </footer>
  );
}

export function Shell({ children, navLabel }) {
  return (<><Header navLabel={navLabel} /><main>{children}</main><Footer /></>);
}

export function Loading({ label = 'Chargement…' }) {
  return <p className="loading" role="status">{label}</p>;
}

export function ErrorBox({ children }) {
  return children ? <p className="error-box" role="alert">{children}</p> : null;
}

export function ContactBand({ name, company }) {
  const intro = `Bonjour Anthony, ici ${name || ''}${company ? ` (${company})` : ''}. `;
  const wa = `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(intro)}`;
  const mail = `mailto:${CONTACT.email}?subject=${encodeURIComponent('Ma mission avec Gomand Consult')}&body=${encodeURIComponent(intro)}`;
  return (
    <section className="cta-band">
      <div className="container cta-band-inner">
        <div>
          <h2>Une question en dehors des documents ?</h2>
          <p>Écrivez-moi directement, je vous réponds personnellement sous 48 h.</p>
        </div>
        <div className="cta-actions">
          <a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">Écrire sur WhatsApp</a>
          <a className="btn btn-ghost" href={mail}>Écrire par email</a>
        </div>
      </div>
    </section>
  );
}
