import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthFrame } from './Login';
import { sendReset } from '../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    await sendReset(email);
    setDone(true); setBusy(false);
  };
  return (
    <AuthFrame title="Mot de passe oublié" intro="Indiquez votre adresse email, nous vous envoyons un lien pour choisir un nouveau mot de passe.">
      {done ? (
        <p className="gal-sent" role="status">Si cette adresse correspond à un compte, un lien vient d’être envoyé. Pensez à vérifier vos courriers indésirables.</p>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="field"><label htmlFor="email">Adresse email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit" disabled={busy || !email}>{busy ? 'Envoi…' : 'Envoyer le lien'}</button>
        </form>
      )}
      <p><Link className="link-quiet" to="/connexion">Retour à la connexion</Link></p>
    </AuthFrame>
  );
}
