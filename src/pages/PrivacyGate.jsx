import { useState } from 'react';
import { Header, ErrorBox } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { acceptPrivacy } from '../lib/api';
import { PRIVACY_VERSION } from '../config';
import { fr } from '../lib/format';

// Affiché une fois à chaque client (et à chaque nouvelle version de la politique). Ce n'est pas un « consentement » :
// l'utilisation des données repose sur le contrat de mission. C'est une preuve que l'information a bien été donnée.
export default function PrivacyGate() {
  const { refresh } = useAuth();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await acceptPrivacy(PRIVACY_VERSION); await refresh(); }
    catch { setError('Votre choix n’a pas pu être enregistré. Réessayez dans un instant.'); setBusy(false); }
  };

  return (
    <>
      <Header />
      <main>
        <div className="container">
          <form className="gate" onSubmit={submit}>
            <p className="eyebrow">Avant de continuer</p>
            <h1 style={{ fontSize: 'clamp(1.8rem,3vw,2.3rem)', margin: '12px 0 16px' }}>Vos données, en toute transparence</h1>
            <p>{fr('Votre espace client utilise votre nom, votre adresse email, vos documents et vos échanges uniquement pour la réalisation de votre mission. Il n’y a ni cookie publicitaire, ni outil de suivi, ni revente de données.')}</p>
            <p style={{ marginTop: 12 }}>{fr('Vous pouvez à tout moment consulter, corriger ou faire supprimer vos données. Tous les détails figurent dans la politique de confidentialité.')}</p>
            <p style={{ marginTop: 16 }}><a href="/confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: 3 }}>Lire la politique de confidentialité</a></p>
            <label className="check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>J’ai pris connaissance de la politique de confidentialité.</span>
            </label>
            <ErrorBox>{error}</ErrorBox>
            <button className="btn btn-primary" type="submit" disabled={!checked || busy}>{busy ? 'Enregistrement…' : 'Continuer'}</button>
          </form>
        </div>
      </main>
    </>
  );
}
