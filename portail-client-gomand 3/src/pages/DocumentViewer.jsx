import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { getDocument, documentUrl, listThreads, createHighlight, createThread, addMessage, setThreadStatus, deleteAnnotation, markDocumentViewed, notify } from '../lib/api';
import { captureSelection } from '../lib/rects';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Header, Loading, ErrorBox, ARROW_BACK } from '../components/Layout';
import { triggerDownload } from './ClientDashboard';
// Chargé à la demande : pdf.js est volumineux et inutile sur les autres écrans.
const PdfViewer = lazy(() => import('../components/PdfViewer'));

const sortMsgs = (t) => (t.annotation_messages || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));

export default function DocumentViewer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { session, profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';
  const myId = session?.user?.id;

  const [doc, setDoc] = useState(null);
  const [url, setUrl] = useState('');
  const [threads, setThreads] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [active, setActive] = useState(params.get('thread'));
  const [composer, setComposer] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sel, setSel] = useState(null);
  const pagesRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getDocument(id);
        if (!d) throw new Error('Ce document est introuvable.');
        const [u, t] = await Promise.all([documentUrl(d.storage_path), listThreads(id)]);
        if (!alive) return;
        setDoc(d); setUrl(u); setThreads(t);
        if (!isAdmin) markDocumentViewed(id);
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [id, isAdmin]);

  // Numérotation stable des échanges (hors surlignages)
  const notes = useMemo(() => {
    const talk = threads.filter((t) => t.kind !== 'highlight').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const num = new Map(talk.map((t, i) => [t.id, i + 1]));
    return threads.map((t) => ({ ...t, n: num.get(t.id) }));
  }, [threads]);
  const talks = notes.filter((t) => t.kind !== 'highlight');
  const highlights = notes.filter((t) => t.kind === 'highlight');
  const open = talks.filter((t) => t.status === 'open');
  const resolved = talks.filter((t) => t.status === 'resolved');

  // Sélection de texte → barre flottante
  useEffect(() => {
    let timer;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSel(captureSelection(pagesRef.current)), 150);
    };
    document.addEventListener('selectionchange', update);
    return () => { document.removeEventListener('selectionchange', update); clearTimeout(timer); };
  }, []);
  const clearSelection = () => { window.getSelection()?.removeAllRanges(); setSel(null); };

  const focusThread = useCallback((tid) => {
    setActive(tid);
    const t = threads.find((x) => x.id === tid);
    if (t) setTab(t.status === 'resolved' ? 'resolved' : 'open');
    setTimeout(() => {
      document.getElementById(`th-${tid}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      pagesRef.current?.querySelector('.pin.active')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
  }, [threads]);

  // Ouverture directe d'un échange depuis le back-office (?thread=…)
  useEffect(() => {
    if (active && threads.length && params.get('thread') === active) focusThread(active);
  }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const highlight = async () => {
    if (!sel) return;
    const s = sel; clearSelection();
    try {
      const row = await createHighlight({ documentId: id, page: s.page, rects: s.rects, quote: s.quote });
      setThreads((t) => [...t, { ...row, annotation_messages: [] }]);
      toast('Passage surligné.');
    } catch (e) { toast(e.message); }
  };
  const startComment = () => {
    if (!sel) return;
    setComposer({ page: sel.page, rects: sel.rects, quote: sel.quote, type: 'comment', text: '', error: '' });
    clearSelection();
  };
  const startPageComment = () => setComposer({ page: 1, rects: [{ x: 0.06, y: 0.03, w: 0.5, h: 0.02 }], quote: 'Page entière', type: 'comment', text: '', error: '', pageLevel: true });

  const publish = async () => {
    const c = composer; const body = c.text.trim();
    if (!body) return setComposer({ ...c, error: 'Écrivez votre message avant de publier.' });
    try {
      const { annotation, message } = await createThread({ documentId: id, kind: c.type, page: c.page, rects: c.rects, quote: c.quote, body });
      setThreads((t) => [...t, { ...annotation, annotation_messages: [message] }]);
      setComposer(null); setTab('open'); setActive(annotation.id);
      notify('annotation_message', message.id);
      toast(isAdmin ? 'Message publié. Le client est prévenu par email.' : 'Message publié. Anthony est prévenu par email.');
    } catch (e) { setComposer({ ...c, error: e.message }); }
  };
  const reply = async (t) => {
    const body = (drafts[t.id] || '').trim();
    if (!body) return toast('Écrivez votre réponse avant de l’envoyer.');
    try {
      const msg = await addMessage(t.id, body);
      setThreads((all) => all.map((x) => (x.id === t.id ? { ...x, status: 'open', annotation_messages: [...(x.annotation_messages || []), msg] } : x)));
      setDrafts((d) => ({ ...d, [t.id]: '' })); setActive(t.id);
      notify('annotation_message', msg.id);
      toast(isAdmin ? 'Réponse envoyée. Le client est prévenu par email.' : 'Réponse envoyée. Anthony est prévenu par email.');
    } catch (e) { toast(e.message); }
  };
  const toggle = async (t) => {
    const status = t.status === 'open' ? 'resolved' : 'open';
    try {
      await setThreadStatus(t.id, status);
      setThreads((all) => all.map((x) => (x.id === t.id ? { ...x, status } : x)));
      toast(status === 'resolved' ? 'Échange marqué comme résolu.' : 'Échange rouvert.');
    } catch (e) { toast(e.message); }
  };
  const removeHighlight = async (h) => {
    try { await deleteAnnotation(h.id); setThreads((all) => all.filter((x) => x.id !== h.id)); toast('Surlignage retiré.'); }
    catch (e) { toast(e.message); }
  };

  if (error) return <><Header /><div className="container"><ErrorBox>{error}</ErrorBox><p><Link to={isAdmin ? '/admin' : '/'}>Retour</Link></p></div></>;
  if (!doc) return <><Header /><Loading /></>;

  const backTo = isAdmin ? `/admin/clients/${doc.client_id}` : '/';
  const list = tab === 'open' ? open : resolved;
  const tabBtn = (key, label, count) => (
    <button key={key} role="tab" className="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label} <span className="count">{count}</span></button>
  );

  return (
    <>
      <Header />
      <div className="doc-bar">
        <div className="container">
          <Link className="btn btn-ghost btn-sm" to={backTo}>{ARROW_BACK}{isAdmin ? 'Retour à la fiche client' : 'Retour aux documents'}</Link>
          <div className="doc-bar-title">
            <h1>{doc.title}</h1>
            <p className="doc-meta">{doc.reference ? `Réf. Accountable ${doc.reference}, ` : ''}ajouté le {fmtDate(doc.created_at)}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => triggerDownload(doc).catch((e) => toast(e.message))}>Télécharger le PDF</button>
        </div>
      </div>

      <div className="viewer">
        <div className="doc-area">
          <p className="hint">Sélectionnez un passage pour le surligner ou y ajouter un commentaire.</p>
          <Suspense fallback={<Loading label="Chargement du lecteur…" />}>
            <PdfViewer url={url} annotations={notes} activeId={active} onPin={focusThread} containerRef={pagesRef} />
          </Suspense>
        </div>

        <aside className="panel" aria-label="Commentaires">
          <div className="panel-head">
            <h2>Commentaires</h2>
            <div className="tabs" role="tablist">
              {tabBtn('open', 'Ouverts', open.length)}
              {tabBtn('resolved', 'Résolus', resolved.length)}
              {tabBtn('marks', 'Surlignages', highlights.length)}
            </div>
          </div>

          {composer && (
            <section className="composer" aria-label="Nouveau message">
              <p className="composer-label">{composer.pageLevel ? 'Commentaire sur une page' : 'Passage commenté'}</p>
              {composer.pageLevel
                ? (<div className="field"><label htmlFor="cpage">Numéro de page</label>
                    <input id="cpage" type="number" min="1" value={composer.page} onChange={(e) => setComposer({ ...composer, page: Math.max(1, Number(e.target.value) || 1) })} /></div>)
                : <blockquote>{composer.quote}</blockquote>}
              <fieldset className="type"><legend className="sr">Type de message</legend>
                {[['comment', 'Commentaire'], ['question', 'Question']].map(([v, l]) => (
                  <label key={v}><input type="radio" name="ctype" checked={composer.type === v} onChange={() => setComposer({ ...composer, type: v })} /> {l}</label>
                ))}
              </fieldset>
              <textarea rows="3" aria-label="Votre message" placeholder={composer.type === 'question' ? 'Votre question' : 'Votre commentaire'}
                value={composer.text} onChange={(e) => setComposer({ ...composer, text: e.target.value, error: '' })} autoFocus />
              {composer.error && <p className="field-error" role="alert">{composer.error}</p>}
              <div className="row">
                <button className="btn btn-primary btn-sm" onClick={publish}>Publier</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setComposer(null)}>Annuler</button>
              </div>
            </section>
          )}

          <div className="threads">
            {!composer && <p style={{ margin: '14px 0 0' }}><button className="link-btn" onClick={startPageComment}>Commenter une page entière</button></p>}

            {tab !== 'marks' && list.length === 0 && (
              <p className="empty">{tab === 'resolved' ? 'Aucun échange résolu pour l’instant.' : 'Aucun échange ouvert. Sélectionnez un passage du document pour en démarrer un.'}</p>
            )}
            {tab !== 'marks' && list.map((t) => (
              <section key={t.id} id={`th-${t.id}`} className={`thread${t.id === active ? ' active' : ''}`} onClick={() => t.id !== active && focusThread(t.id)}>
                <div className="thread-head">
                  <span className={`pin ${t.status}`}>{t.n}</span>
                  <strong>{t.kind === 'question' ? 'Question' : 'Commentaire'}</strong>
                  <span className="meta">Page {t.page}</span>
                  <span className={`status ${t.status}`}>{t.status === 'open' ? 'Ouvert' : 'Résolu'}</span>
                </div>
                <blockquote>{t.quote}</blockquote>
                <ol className="msgs">
                  {sortMsgs(t).map((m) => (
                    <li key={m.id} className={`msg ${m.author_role === 'admin' ? 'bo' : 'client'}`}>
                      <div className="msg-h"><strong>{m.author_name}</strong><time dateTime={m.created_at}>{fmtDateTime(m.created_at)}</time></div>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
                    </li>
                  ))}
                </ol>
                <textarea rows="2" placeholder="Votre réponse" aria-label={`Répondre à l’échange ${t.n}`}
                  value={drafts[t.id] || ''} onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })} />
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={() => reply(t)}>Répondre</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggle(t)}>{t.status === 'open' ? 'Marquer comme résolu' : 'Rouvrir'}</button>
                </div>
              </section>
            ))}

            {tab === 'marks' && highlights.length === 0 && <p className="empty">Aucun surlignage. Sélectionnez un passage et choisissez « Surligner ».</p>}
            {tab === 'marks' && highlights.map((h) => (
              <div key={h.id} className="hl-item">
                <blockquote>{h.quote}</blockquote>
                <p className="muted">Page {h.page}, par {h.author_name}, {fmtDateTime(h.created_at)}</p>
                {(h.author_id === myId || isAdmin) && <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => removeHighlight(h)}>Retirer</button></div>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {sel && (
        <div id="seltool" role="toolbar" aria-label="Actions sur le passage sélectionné"
          style={{ top: Math.max(8, sel.anchor.top - 52), left: Math.max(8, Math.min(sel.anchor.left + sel.anchor.width / 2 - 100, window.innerWidth - 216)) }}
          onMouseDown={(e) => e.preventDefault()}>
          <button onClick={highlight}>Surligner</button>
          <button onClick={startComment}>Commenter</button>
        </div>
      )}
    </>
  );
}
