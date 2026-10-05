import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminPending, listClients, inviteClient } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { fmtDateTime, plural } from '../../lib/format';
import { Shell, Loading, ErrorBox, ARROW } from '../../components/Layout';

const KIND = { doc_thread: 'Message sur un document', photo_thread: 'Commentaire sur une photo', selection: 'Sélection de photos envoyée' };
const linkFor = (r) => (r.kind === 'doc_thread' ? `/documents/${r.parent_id}?thread=${r.ref_id}` : r.kind === 'photo_thread' ? `/galeries/${r.parent_id}?photo=${r.ref_id}` : `/galeries/${r.ref_id}`);

export default function AdminHome() {
  const toast = useToast();
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ company: '', full_name: '', email: '', project_title: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const [p, c] = await Promise.all([adminPending(), listClients()]); setPending(p); setClients(c); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const invite = async (e) => {
    e.preventDefault(); setFormError('');
    if (!form.company.trim() || !form.email.trim()) return setFormError('Indiquez le nom de l’entreprise et l’adresse email.');
    setBusy(true);
    try {
      const { client_id: id } = await inviteClient(form);
      toast('Invitation envoyée par email.');
      navigate(`/admin/clients/${id}`);
    } catch (err) { setFormError(err.message); setBusy(false); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (error) return <Shell><div className="container"><ErrorBox>{error}</ErrorBox></div></Shell>;
  if (!pending || !clients) return <Shell><Loading /></Shell>;
  const company = (id) => clients.find((c) => c.id === id)?.company || 'Client';

  return (
    <Shell>
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Back-office</p>
          <h1>Vos clients et leurs documents</h1>
          <p className="lede">Ce qui attend votre réponse, l’accès à chaque espace client et l’ajout de nouveaux clients.</p>
        </div>
        <div className="clarity-line drawn" />

        <section className="cat">
          <h2 className="cat-title">À traiter</h2>
          {pending.length === 0 ? <p className="empty">Rien en attente. Les nouvelles questions de vos clients apparaîtront ici.</p> : (
            <ul className="doc-list">
              {pending.map((r) => (
                <li className="doc-row" key={`${r.kind}-${r.ref_id}`} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div className="doc-main">
                    <p style={{ fontWeight: 600, color: 'var(--ink)' }}>{company(r.client_id)}, {r.title}</p>
                    <p className="doc-meta">{KIND[r.kind]}, {fmtDateTime(r.happened_at)}</p>
                    {r.excerpt && <p style={{ fontSize: '.92rem', marginTop: 4, color: 'var(--ink)' }}>{r.excerpt}</p>}
                  </div>
                  <div className="doc-actions"><Link className="btn btn-primary btn-sm" to={linkFor(r)}>{r.kind === 'selection' ? 'Voir la sélection' : 'Répondre'}</Link></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cat" style={{ marginTop: 56 }}>
          <h2 className="cat-title" style={{ marginBottom: 16 }}>Clients</h2>
          {clients.length === 0 ? <p className="empty">Aucun client pour l’instant. Invitez le premier avec le formulaire ci-dessous.</p> : (
            <div className="card-grid">
              {clients.map((c) => (
                <article className="service-card" key={c.id}>
                  <span className="tag">Client</span>
                  <h3>{c.company}</h3>
                  <p>{[c.contact_name, c.project_title].filter(Boolean).join('. ')}</p>
                  <p className="stat">{plural(c.documents?.[0]?.count || 0, 'document', 'documents')}, {plural(c.galleries?.[0]?.count || 0, 'galerie', 'galeries')}</p>
                  <Link className="link-btn" to={`/admin/clients/${c.id}`}>Ouvrir la fiche {ARROW}</Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="cat section" style={{ marginTop: 56 }}>
          <h2 className="cat-title" style={{ marginBottom: 6 }}>Inviter un nouveau client</h2>
          <p style={{ marginBottom: 24, maxWidth: '56ch' }}>Le client reçoit un email pour choisir son mot de passe. Il n’y a pas d’inscription libre.</p>
          <form className="add-form" onSubmit={invite} noValidate>
            <div className="two">
              <div className="field"><label htmlFor="i-company">Entreprise</label><input id="i-company" value={form.company} onChange={set('company')} /></div>
              <div className="field"><label htmlFor="i-name">Nom du contact</label><input id="i-name" value={form.full_name} onChange={set('full_name')} autoComplete="off" /></div>
            </div>
            <div className="two">
              <div className="field"><label htmlFor="i-email">Adresse email</label><input id="i-email" type="email" value={form.email} onChange={set('email')} autoComplete="off" /></div>
              <div className="field"><label htmlFor="i-project">Intitulé de la mission</label><input id="i-project" value={form.project_title} onChange={set('project_title')} placeholder="Positionnement et plan marketing" /></div>
            </div>
            <ErrorBox>{formError}</ErrorBox>
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Créer l’accès et envoyer l’invitation'}</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
