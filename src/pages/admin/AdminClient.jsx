import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getClient, listDocuments, listGalleries, listProfiles, createDocument, updateDocumentStatus, deleteDocument,
  createGallery, deleteGallery, inviteClient, sendReset, notify, deleteClient, removeUser, exportClientData } from '../../lib/api';
import { useToast } from '../../lib/toast';
import { CATS, STATUS_PRESETS } from '../../config';
import { fmtDate, plural } from '../../lib/format';
import { Shell, Loading, ErrorBox, ARROW_BACK } from '../../components/Layout';

function DocumentForm({ clientId, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ category: 'devis', title: '', reference: '', status: 'Envoyé', notify: true });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setCat = (category) => setF({ ...f, category, status: STATUS_PRESETS[category][0] });
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!f.title.trim()) return setError('Indiquez un titre pour le document.');
    if (!file) return setError('Choisissez le fichier PDF à publier.');
    setBusy(true);
    try {
      const doc = await createDocument({ clientId, category: f.category, title: f.title.trim(), reference: f.reference.trim(), status: f.status, file });
      if (f.notify) notify('document_published', doc.id);
      toast(f.notify ? 'Document publié. Le client est prévenu par email.' : 'Document publié.');
      setF({ ...f, title: '', reference: '' }); setFile(null); e.target.reset(); onDone();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <form className="add-form" onSubmit={submit} noValidate>
      <div className="two">
        <div className="field"><label htmlFor="d-cat">Catégorie</label>
          <select id="d-cat" value={f.category} onChange={(e) => setCat(e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="d-status">Statut</label>
          <select id="d-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS_PRESETS[f.category].map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="field"><label htmlFor="d-title">Titre du document</label><input id="d-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Facture, acompte 50 %" /></div>
      <div className="field"><label htmlFor="d-ref">Référence Accountable</label><input id="d-ref" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="F-2026-030" /><span className="hint">Facultatif. Permet de retrouver la preuve d’acceptation ou la facture d’origine.</span></div>
      <div className="field"><label htmlFor="d-file">Fichier PDF</label><input id="d-file" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
      <label className="check"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Prévenir le client par email</label>
      <ErrorBox>{error}</ErrorBox>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Envoi du fichier…' : 'Publier dans l’espace client'}</button>
    </form>
  );
}

function GalleryForm({ clientId, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', note: '', notify: true, rights: false });
  const [files, setFiles] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!f.title.trim()) return setError('Indiquez un titre pour la galerie.');
    if (!files.length) return setError('Choisissez au moins une photo.');
    if (!f.rights) return setError('Confirmez que vous avez le droit de partager ces photos.');
    setProgress([0, files.length]);
    try {
      const g = await createGallery({ clientId, title: f.title.trim(), note: f.note.trim(), files, onProgress: (a, b) => setProgress([a, b]) });
      if (f.notify) notify('gallery_published', g.id);
      toast(f.notify ? 'Galerie publiée. Le client est prévenu par email.' : 'Galerie publiée.');
      setF({ ...f, title: '', note: '', rights: false }); setFiles([]); e.target.reset(); onDone();
    } catch (err) { setError(err.message); }
    setProgress(null);
  };
  return (
    <form className="add-form" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="g-title">Titre de la galerie</label><input id="g-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Séance photo du 12 octobre" /></div>
      <div className="field"><label htmlFor="g-note">Message d’accompagnement</label><textarea id="g-note" rows="2" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Voici les photos retenues après la séance." /><span className="hint">Facultatif.</span></div>
      <div className="field"><label htmlFor="g-files">Photos</label>
        <input id="g-files" type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files || []).filter((x) => x.type.startsWith('image/')).slice(0, 80))} />
        <span className="hint">{files.length ? plural(files.length, 'photo sélectionnée', 'photos sélectionnées') : 'Jusqu’à 80 photos. Elles sont allégées automatiquement avant l’envoi (2 400 px maximum).'}</span></div>
      <label className="check"><input type="checkbox" checked={f.rights} onChange={(e) => setF({ ...f, rights: e.target.checked })} /> Je confirme que les personnes identifiables sur ces photos sont d’accord pour ce partage, ou qu’il n’y en a pas.</label>
      <label className="check"><input type="checkbox" checked={f.notify} onChange={(e) => setF({ ...f, notify: e.target.checked })} /> Prévenir le client par email</label>
      {progress && <div className="upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax={progress[1]} aria-valuenow={progress[0]} aria-label="Envoi des photos"><span style={{ width: `${(progress[0] / progress[1]) * 100}%` }} /></div>}
      <ErrorBox>{error}</ErrorBox>
      <button className="btn btn-primary" type="submit" disabled={Boolean(progress)}>{progress ? `Envoi ${progress[0]} sur ${progress[1]}…` : 'Publier la galerie'}</button>
    </form>
  );
}

export default function AdminClient() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [contact, setContact] = useState({ full_name: '', email: '' });
  const [contactError, setContactError] = useState('');

  const load = useCallback(async () => {
    try {
      const [client, docs, gals, people] = await Promise.all([getClient(id), listDocuments(id), listGalleries(id), listProfiles(id)]);
      setData({ client, docs, gals, people });
    } catch (e) { setError(e.message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const changeStatus = async (d, status) => {
    try { await updateDocumentStatus(d.id, status); setData((x) => ({ ...x, docs: x.docs.map((y) => (y.id === d.id ? { ...y, status } : y)) })); toast('Statut mis à jour.'); }
    catch (e) { toast(e.message); }
  };
  const removeDoc = async (d) => {
    if (!window.confirm(`Supprimer définitivement « ${d.title} » et les commentaires associés ?`)) return;
    try { await deleteDocument(d); toast('Document supprimé.'); load(); } catch (e) { toast(e.message); }
  };
  const removeGal = async (g) => {
    if (!window.confirm(`Supprimer définitivement la galerie « ${g.title} » et ses photos ?`)) return;
    try { await deleteGallery(g); toast('Galerie supprimée.'); load(); } catch (e) { toast(e.message); }
  };
  const dropUser = async (p) => {
    if (!window.confirm(`Retirer l’accès de ${p.full_name || p.email} ? Son compte et ses commentaires seront supprimés définitivement.`)) return;
    try { await removeUser(p.id); toast('Accès supprimé.'); load(); } catch (e) { toast(e.message); }
  };
  const exportData = async () => {
    try {
      const payload = await exportClientData(id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `donnees-${(data.client.company || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Export téléchargé.');
    } catch (e) { toast(e.message); }
  };
  const eraseClient = async (e) => {
    e.preventDefault(); setDeleteError(''); setDeleting(true);
    try { await deleteClient(id, confirmName); toast('Client supprimé définitivement.'); navigate('/admin', { replace: true }); }
    catch (err) { setDeleteError(err.message); setDeleting(false); }
  };
  const resend = async (p) => { await sendReset(p.email); toast(`Un lien a été envoyé à ${p.email}.`); };
  const addContact = async (e) => {
    e.preventDefault(); setContactError('');
    if (!contact.email.trim()) return setContactError('Indiquez une adresse email.');
    try { await inviteClient({ client_id: id, ...contact }); toast('Invitation envoyée par email.'); setContact({ full_name: '', email: '' }); load(); }
    catch (err) { setContactError(err.message); }
  };

  if (error) return <Shell><div className="container"><ErrorBox>{error}</ErrorBox></div></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const { client, docs, gals, people } = data;
  if (!client) return <Shell><div className="container"><ErrorBox>Client introuvable.</ErrorBox></div></Shell>;

  return (
    <Shell>
      <div className="container">
        <div className="page-head">
          <Link className="btn btn-ghost btn-sm" to="/admin">{ARROW_BACK}Retour au back-office</Link>
          <p className="eyebrow" style={{ marginTop: 32 }}>Fiche client</p>
          <h1>{client.company}</h1>
          <p className="lede">{[client.contact_name, client.project_title].filter(Boolean).join('. ')}</p>
          <p style={{ marginTop: 20 }}><Link className="btn btn-ghost btn-sm" to={`/admin/clients/${id}/apercu`}>Voir l’espace comme le client</Link></p>
        </div>
        <div className="clarity-line drawn" />

        <section className="cat">
          <h2 className="cat-title">Accès</h2>
          <ul className="user-list">
            {people.map((p) => (
              <li className="user-row" key={p.id}>
                <div><strong style={{ fontWeight: 600 }}>{p.full_name || 'Sans nom'}</strong><p className="muted">{p.email}</p></div>
                <div className="doc-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => resend(p)}>Renvoyer un lien de connexion</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => dropUser(p)}>Retirer l’accès</button>
                </div>
              </li>
            ))}
          </ul>
          <form className="add-form" onSubmit={addContact} noValidate style={{ marginTop: 24 }}>
            <p className="muted" style={{ marginBottom: 12 }}>Donner accès à une autre personne de cette entreprise</p>
            <div className="two">
              <div className="field"><label htmlFor="c-name">Nom</label><input id="c-name" value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} autoComplete="off" /></div>
              <div className="field"><label htmlFor="c-email">Adresse email</label><input id="c-email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} autoComplete="off" /></div>
            </div>
            <ErrorBox>{contactError}</ErrorBox>
            <button className="btn btn-ghost btn-sm" type="submit">Envoyer l’invitation</button>
          </form>
        </section>

        <section className="cat" style={{ marginTop: 56 }}>
          <h2 className="cat-title">Documents</h2>
          {docs.length === 0 ? <p className="empty">Aucun document. Publiez le premier avec le formulaire ci-dessous.</p> : (
            <ul className="doc-list">
              {docs.map((d) => {
                const open = (d.annotations || []).filter((a) => a.kind !== 'highlight' && a.status === 'open').length;
                const statuses = Array.from(new Set([...(STATUS_PRESETS[d.category] || []), d.status]));
                return (
                  <li className="doc-row" key={d.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto auto' }}>
                    <div className="doc-main">
                      <Link className="doc-title" to={`/documents/${d.id}`}>{d.title}</Link>
                      <p className="doc-meta">{CATS.find((c) => c[0] === d.category)?.[1]}, {d.reference ? `réf. ${d.reference}, ` : ''}ajouté le {fmtDate(d.created_at)}{d.first_viewed_at ? `, vu le ${fmtDate(d.first_viewed_at)}` : ', pas encore vu'}</p>
                    </div>
                    <select className="select-sm" value={d.status} onChange={(e) => changeStatus(d, e.target.value)} aria-label={`Statut de ${d.title}`}>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
                    <span className="doc-cm">{open ? plural(open, 'échange ouvert', 'échanges ouverts') : ''}</span>
                    <div className="doc-actions"><button className="btn btn-ghost btn-sm" onClick={() => removeDoc(d)}>Supprimer</button></div>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 style={{ margin: '40px 0 16px' }}>Publier un document</h3>
          <DocumentForm clientId={id} onDone={load} />
        </section>

        <section className="cat section" style={{ marginTop: 56 }}>
          <h2 className="cat-title">Galeries photo</h2>
          {gals.length === 0 ? <p className="empty">Aucune galerie. Créez-en une avec le formulaire ci-dessous.</p> : (
            <ul className="doc-list">
              {gals.map((g) => {
                const c = (d) => g.photos.filter((p) => p.decision === d).length;
                return (
                  <li className="doc-row" key={g.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
                    <div className="doc-main">
                      <Link className="doc-title" to={`/galeries/${g.id}`}>{g.title}</Link>
                      <p className="doc-meta">{plural(g.photos.length, 'photo', 'photos')}, ajoutée le {fmtDate(g.created_at)}. {c('approved')} approuvées, {c('comment')} à discuter, {c('rejected')} refusées, {c('none')} à examiner.{g.sent_at ? ' Sélection envoyée.' : ''}</p>
                    </div>
                    <span className="chip">{g.sent_at ? 'Sélection reçue' : 'En cours'}</span>
                    <div className="doc-actions"><button className="btn btn-ghost btn-sm" onClick={() => removeGal(g)}>Supprimer</button></div>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 style={{ margin: '40px 0 16px' }}>Créer une galerie photo</h3>
          <GalleryForm clientId={id} onDone={load} />
        </section>

        <section className="cat section" style={{ marginTop: 24 }}>
          <h2 className="cat-title">Données et suppression</h2>
          <p style={{ maxWidth: '60ch', marginBottom: 16 }}>Pour répondre à une demande d’accès ou de portabilité, exportez toutes les données de ce client. Les fichiers (PDF, photos) ne sont pas inclus : ils se récupèrent depuis leur lien.</p>
          <p style={{ marginBottom: 40 }}><button className="btn btn-ghost" onClick={exportData}>Exporter les données (JSON)</button></p>
          <form className="danger-zone" onSubmit={eraseClient} noValidate>
            <h3>Supprimer ce client</h3>
            <p>Supprime définitivement l’entreprise, ses accès de connexion, tous ses documents, ses photos et tous les échanges. Cette action ne peut pas être annulée.</p>
            <div className="field">
              <label htmlFor="confirm-name">Pour confirmer, retapez le nom de l’entreprise : <strong>{client.company}</strong></label>
              <input id="confirm-name" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
            </div>
            <ErrorBox>{deleteError}</ErrorBox>
            <button className="btn btn-primary" type="submit" disabled={deleting || confirmName.trim().toLowerCase() !== client.company.trim().toLowerCase()}>{deleting ? 'Suppression…' : 'Supprimer définitivement'}</button>
          </form>
        </section>
      </div>
    </Shell>
  );
}
