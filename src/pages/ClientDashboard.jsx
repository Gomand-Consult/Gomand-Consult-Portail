import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { getClient, listDocuments, listGalleries, documentUrl } from '../lib/api';
import { useToast } from '../lib/toast';
import { CATS } from '../config';
import { fmtDate, plural } from '../lib/format';
import { Shell, Loading, ErrorBox, ContactBand, ARROW } from '../components/Layout';

export async function triggerDownload(doc) {
  const url = await documentUrl(doc.storage_path, doc.file_name || `${doc.title}.pdf`);
  const a = document.createElement('a');
  a.href = url; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
}

const openThreads = (doc) => (doc.annotations || []).filter((a) => a.kind !== 'highlight' && a.status === 'open').length;

export default function ClientDashboard({ clientId, preview = false }) {
  const { profile } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setError('');
    Promise.all([getClient(clientId), listDocuments(clientId), listGalleries(clientId)])
      .then(([client, docs, gals]) => alive && setData({ client, docs, gals }))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [clientId]);

  const download = async (doc) => {
    try { await triggerDownload(doc); } catch (e) { toast(e.message); }
  };

  if (error) return <Shell><div className="container"><ErrorBox>{error}</ErrorBox></div></Shell>;
  if (!data) return <Shell><Loading /></Shell>;
  const { client, docs, gals } = data;
  if (!client) return <Shell><div className="container"><ErrorBox>Cet espace client est introuvable.</ErrorBox></div></Shell>;

  const firstName = (profile?.full_name || client.contact_name || '').split(' ')[0];
  const isNewDoc = (d) => !preview && !d.first_viewed_at;
  const isNewGal = (g) => !preview && !g.first_viewed_at;
  const fresh = docs.filter(isNewDoc);
  const freshGals = gals.filter(isNewGal);
  const open = docs.reduce((n, d) => n + openThreads(d), 0);
  const featured = fresh[0] ? { kind: 'doc', item: fresh[0] } : freshGals[0] ? { kind: 'gal', item: freshGals[0] } : null;

  return (
    <Shell navLabel={preview ? 'Aperçu client' : 'Documents'}>
      {preview && (
        <div className="preview-banner">
          <p>Vous consultez l’espace de {client.company} en tant qu’Anthony.</p>
          <Link className="btn btn-ghost btn-sm" to={`/admin/clients/${client.id}`}>Retour à la fiche client</Link>
        </div>
      )}
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Mission en cours</p>
          <h1>{client.project_title || client.company}</h1>
          <p className="lede">{preview ? `Espace de ${client.company}.` : `Bonjour${firstName ? ` ${firstName}` : ''}. Retrouvez ici les documents de votre mission et posez vos questions directement sur les pages.`}</p>
        </div>
        <div className="clarity-line drawn" />

        <div className="trust-strip" style={{ marginBottom: 56 }}>
          <div className="trust-item"><h3>{plural(docs.length, 'document', 'documents')}</h3><p>Devis, factures, livrables et comptes rendus de la mission.</p></div>
          <div className="trust-item"><h3>{plural(fresh.length + freshGals.length, 'nouveauté', 'nouveautés')}</h3><p>Documents ou galeries ajoutés et pas encore ouverts.</p></div>
          <div className="trust-item"><h3>{plural(open, 'échange ouvert', 'échanges ouverts')}</h3><p>Questions et commentaires en attente d’une réponse ou d’une résolution.</p></div>
        </div>

        <div className="section">
          {featured && (
            <article className="service-card featured" style={{ marginBottom: 48 }}>
              <span className="tag">À consulter</span>
              <h3>{featured.item.title}</h3>
              <p>Ajouté le {fmtDate(featured.item.created_at)}. {featured.kind === 'doc' ? 'Surlignez les passages importants et posez vos questions directement sur le document.' : 'Approuvez, refusez ou commentez chaque photo.'}</p>
              <Link className="btn btn-primary" to={featured.kind === 'doc' ? `/documents/${featured.item.id}` : `/galeries/${featured.item.id}`}>
                {featured.kind === 'doc' ? 'Consulter le document' : 'Examiner les photos'} {ARROW}
              </Link>
            </article>
          )}

          {gals.length > 0 && (
            <section className="cat">
              <h2 className="cat-title" style={{ marginBottom: 16 }}>Galeries photo</h2>
              <div className="card-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
                {gals.map((g) => {
                  const total = g.photos.length, left = g.photos.filter((p) => p.decision === 'none').length;
                  const tag = isNewGal(g) ? 'Nouvelle galerie' : left ? 'À examiner' : 'Examinée';
                  return (
                    <article key={g.id} className={`service-card${isNewGal(g) || left ? ' featured' : ''}`}>
                      <span className="tag">{tag}</span>
                      <h3>{g.title}</h3>
                      <p>{plural(total, 'photo', 'photos')}, ajoutée le {fmtDate(g.created_at)}. {left ? `${plural(left, 'photo reste', 'photos restent')} à examiner.` : 'Toutes les photos sont examinées.'}{g.sent_at ? ' Sélection envoyée.' : ''}</p>
                      <Link className="btn btn-primary btn-sm" to={`/galeries/${g.id}`}>{left ? 'Examiner les photos' : 'Revoir la galerie'} {ARROW}</Link>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {CATS.map(([key, label]) => {
            const list = docs.filter((d) => d.category === key);
            if (!list.length) return null;
            return (
              <section className="cat" key={key} style={{ marginTop: 40 }}>
                <h2 className="cat-title">{label}</h2>
                <ul className="doc-list">
                  {list.map((d) => {
                    const n = openThreads(d);
                    const chip = isNewDoc(d) ? 'chip new' : d.status === 'À payer' ? 'chip warn' : 'chip';
                    return (
                      <li className="doc-row" key={d.id}>
                        <div className="doc-main">
                          <Link className="doc-title" to={`/documents/${d.id}`}>{d.title}</Link>
                          <p className="doc-meta">{d.reference ? `Réf. Accountable ${d.reference}, ` : ''}ajouté le {fmtDate(d.created_at)}</p>
                        </div>
                        <span className={chip}>{isNewDoc(d) ? 'Nouveau' : d.status}</span>
                        <span className="doc-cm">{n ? plural(n, 'échange ouvert', 'échanges ouverts') : ''}</span>
                        <div className="doc-actions">
                          <Link className="btn btn-ghost btn-sm" to={`/documents/${d.id}`}>Consulter</Link>
                          <button className="btn btn-ghost btn-sm" onClick={() => download(d)}>Télécharger</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {!docs.length && !gals.length && <p className="empty">Aucun document pour l’instant. Vous serez prévenu par email dès qu’Anthony en ajoute un.</p>}
        </div>
      </div>
      {!preview && <ContactBand name={profile?.full_name} company={client.company} />}
    </Shell>
  );
}

export function ClientHome() {
  const { profile } = useAuth();
  return <ClientDashboard clientId={profile.client_id} />;
}
