import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { getDocument, documentUrl, documentHtml, isHtmlDoc, listThreads, createHighlight, createThread, addMessage, setThreadStatus, deleteAnnotation, markDocumentViewed, notify } from '../lib/api';
import { captureSelection } from '../lib/rects';
import { hitAnnotation, indexAtPoint, pageModel, sentenceIndexAt, sentenceSelection } from '../lib/selection';
import { useMedia } from '../lib/useMedia';
import SelectionBar from '../components/SelectionBar';
import { fmtDate, fmtDateTime } from '../lib/format';
import { Header, Loading, ErrorBox, ARROW_BACK } from '../components/Layout';
import { triggerDownload } from './ClientDashboard';
// Chargé à la demande : pdf.js est volumineux et inutile sur les autres écrans.
const PdfViewer = lazy(() => import('../components/PdfViewer'));
const HtmlViewer = lazy(() => import('../components/HtmlViewer'));

const ZOOMS = [0.8, 1, 1.25, 1.5, 2, 2.5, 3];
const pct = (z) => `${Math.round(z * 100)}\u00A0%`;
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
  const [html, setHtml] = useState('');
  const [threads, setThreads] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [active, setActive] = useState(params.get('thread'));
  const [composer, setComposer] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pagesRef = useRef(null);
  const selRef = useRef(null);
  const notesRef = useRef([]);
  const lastPointer = useRef('mouse');
  const downAt = useRef(0);
  const barHeld = useRef(false);
  const areaRef = useRef(null);
  const htmlRef = useRef(null);
  const keyRef = useRef(() => {});
  const highlightRef = useRef(() => {});
  const commentRef = useRef(() => {});
  const coarse = useMedia('(pointer: coarse)');
  const narrow = useMedia('(max-width: 1000px)');
  selRef.current = sel;
  const isHtml = isHtmlDoc(doc);
  const isHtmlRef = useRef(false);
  isHtmlRef.current = isHtml;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getDocument(id);
        if (!d) throw new Error('Ce document est introuvable.');
        const asHtml = isHtmlDoc(d);
        const [content, t] = await Promise.all([asHtml ? documentHtml(d.storage_path) : documentUrl(d.storage_path), listThreads(id)]);
        if (!alive) return;
        setDoc(d); setThreads(t);
        if (asHtml) setHtml(content); else setUrl(content);
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

  notesRef.current = notes;
  // Passage mis en évidence : la sélection au toucher, ou le passage que l'on est en train de commenter.
  const preview = sel?.source === 'tap' ? sel : (composer && !composer.pageLevel ? { page: composer.page, rects: composer.rects, tone: 'comment' } : null);

  const clearSelection = useCallback(() => { window.getSelection()?.removeAllRanges(); htmlRef.current?.clear(); setSel(null); }, []);

  // Sélection native (souris, ou appui long au doigt) → barre d'actions.
  // On attend que le doigt ou la souris soit relevé : la barre ne saute plus pendant le glissement.
  useEffect(() => {
    let timer; let down = false;
    const read = () => {
      if (down || barHeld.current || isHtmlRef.current) return; // pour une page HTML, c'est le cadre qui signale la sélection
      const native = captureSelection(pagesRef.current);
      setSel((prev) => (native ? { ...native, source: 'native' } : prev?.source === 'tap' ? prev : null));
    };
    const later = (ms) => { clearTimeout(timer); timer = setTimeout(read, ms); };
    const onDown = (e) => { lastPointer.current = e.pointerType || 'mouse'; downAt.current = performance.now(); if (!e.target.closest?.('#seltool')) down = true; };
    const onUp = () => { down = false; later(30); };
    const onSel = () => later(150);
    document.addEventListener('selectionchange', onSel);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', onSel); document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointerup', onUp, true); document.removeEventListener('pointercancel', onUp, true); };
  }, []);

  const scrollToPin = useCallback((tid) => {
    if (isHtmlRef.current) {
      const top = htmlRef.current?.topOf(tid);
      if (top != null) window.scrollBy({ top: top - (window.matchMedia('(max-width: 1000px)').matches ? 110 : window.innerHeight / 2), behavior: 'smooth' });
      return;
    }
    const el = pagesRef.current?.querySelector('.pin.active') || pagesRef.current?.querySelector('.ann-rect.active');
    if (!el) return;
    if (window.matchMedia('(max-width: 1000px)').matches) {
      // La feuille de commentaires occupe le bas de l'écran : on remonte le passage dans le tiers supérieur.
      window.scrollBy({ top: el.getBoundingClientRect().top - 110, behavior: 'smooth' });
    } else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const focusThread = useCallback((tid) => {
    setActive(tid);
    const t = threads.find((x) => x.id === tid);
    if (t) setTab(t.status === 'resolved' ? 'resolved' : 'open');
    setSheetOpen(true);
    setTimeout(() => {
      document.getElementById(`th-${tid}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      scrollToPin(tid);
    }, 80);
  }, [threads, scrollToPin]);

  // Toucher une phrase la sélectionne ; toucher un passage déjà commenté ouvre l'échange.
  useEffect(() => {
    const root = areaRef.current; if (!root) return undefined;
    const onClick = (e) => {
      const pageEl = e.target.closest?.('.pdf-page');
      if (!pageEl || e.target.closest('.pin')) return;
      if (performance.now() - downAt.current > 450) return; // appui long : c'est la sélection native qui prend le relais
      if (window.getSelection()?.toString()) return; // fin d'une sélection à la souris
      if (selRef.current) { clearSelection(); return; } // un toucher ailleurs ferme la sélection en cours
      const r = pageEl.getBoundingClientRect();
      const page = Number(pageEl.dataset.page);
      const hit = hitAnnotation(notesRef.current, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (hit && hit.kind !== 'highlight') { focusThread(hit.id); return; }
      if (lastPointer.current !== 'touch' && lastPointer.current !== 'pen') return;
      const model = pageModel(pageEl); if (!model) return;
      const idx = indexAtPoint(model, e.clientX, e.clientY); if (idx < 0) return;
      const k = sentenceIndexAt(model.sentences, idx); if (k < 0) return;
      setSel(sentenceSelection(model, k));
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [clearSelection, focusThread, doc]);

  const resize = (delta) => {
    if (isHtmlRef.current) { htmlRef.current?.resize(delta, selRef.current); return; }
    resizePdf(delta);
  };
  const resizePdf = (delta) => setSel((cur) => {
    if (!cur || cur.source !== 'tap') return cur;
    const pageEl = pagesRef.current?.querySelector(`[data-page="${cur.page}"]`); const model = pageEl && pageModel(pageEl);
    if (!model) return cur;
    const to = Math.min(model.sentences.length - 1, Math.max(cur.from, cur.to + delta));
    if (to === cur.to) return cur;
    return sentenceSelection(model, cur.from, to) || cur;
  });

  // Clavier (ordinateur) : H surligne, C commente, Échap annule.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !selRef.current) return;
      if (e.key === 'Escape') clearSelection();
      else if (e.key === 'h' || e.key === 'H') { e.preventDefault(); highlightRef.current(); }
      else if (e.key === 'c' || e.key === 'C') { e.preventDefault(); commentRef.current(); }
    };
    keyRef.current = onKey; // le cadre d'une page HTML y transmet aussi ses touches
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [clearSelection]);

  // Indique à la page quels éléments occupent le bas de l'écran, pour placer les messages au bon endroit.
  useEffect(() => {
    document.body.classList.toggle('has-dock', Boolean(sel) && coarse);
    document.body.classList.toggle('sheet-open', narrow && sheetOpen);
    return () => document.body.classList.remove('has-dock', 'sheet-open');
  }, [sel, coarse, narrow, sheetOpen]);

  // Clavier virtuel : la feuille de commentaires remonte au-dessus du clavier.
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return undefined;
    const set = () => {
      document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
      document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
    };
    set(); vv.addEventListener('resize', set); vv.addEventListener('scroll', set);
    return () => { vv.removeEventListener('resize', set); vv.removeEventListener('scroll', set); document.documentElement.style.removeProperty('--kb'); document.documentElement.style.removeProperty('--vvh'); };
  }, []);

  // Zoom : on garde au même endroit le point du document qui se trouve au centre de l'écran.
  const zoomRef = useRef({ prev: 1, top: 0 });
  const changeZoom = (dir) => {
    const i = ZOOMS.indexOf(zoom); const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))];
    if (next === zoom) return;
    zoomRef.current = { prev: zoom, mid: window.scrollY + window.innerHeight / 2, holderTop: (pagesRef.current?.getBoundingClientRect().top || 0) + window.scrollY };
    setZoom(next);
  };
  useEffect(() => {
    const z = zoomRef.current; if (!z.mid || isHtmlRef.current) { zoomRef.current = { prev: zoom, mid: 0, holderTop: 0 }; return; }
    const ratio = zoom / z.prev;
    window.scrollTo({ top: z.holderTop + (z.mid - z.holderTop) * ratio - window.innerHeight / 2 });
    zoomRef.current = { prev: zoom, mid: 0, holderTop: 0 };
  }, [zoom]);

  // Ouverture directe d'un échange depuis le back-office (?thread=…)
  useEffect(() => {
    if (active && threads.length && params.get('thread') === active) focusThread(active);
  }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeHighlight = async (h, silent) => {
    try { await deleteAnnotation(h.id); setThreads((all) => all.filter((x) => x.id !== h.id)); if (!silent) toast('Surlignage retiré.'); }
    catch (e) { toast(e.message); }
  };
  const highlight = async () => {
    const s = selRef.current; if (!s) return;
    clearSelection();
    try {
      const row = await createHighlight({ documentId: id, page: s.page, rects: s.rects, quote: s.quote });
      setThreads((t) => [...t, { ...row, annotation_messages: [] }]);
      toast('Passage surligné.', { label: 'Annuler', onClick: () => removeHighlight(row, false) });
    } catch (e) { toast(e.message); }
  };
  const startComment = () => {
    const s = selRef.current; if (!s) return;
    setComposer({ page: s.page, rects: s.rects, quote: s.quote, type: 'comment', text: '', error: '' });
    setTab('open');
    if (narrow) { setSheetOpen(true); window.scrollBy({ top: s.anchor.top - 110, behavior: 'smooth' }); }
    clearSelection();
  };
  highlightRef.current = highlight; commentRef.current = startComment;
  // Commentaire sur une page entière : on propose la page actuellement visible.
  const startPageComment = () => {
    let page = 1; let best = Infinity; const mid = window.innerHeight / 2;
    pagesRef.current?.querySelectorAll('.pdf-page').forEach((el) => {
      const r = el.getBoundingClientRect(); const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < best) { best = d; page = Number(el.dataset.page); }
    });
    setComposer({ page, rects: [{ x: 0.06, y: 0.03, w: 0.5, h: 0.02 }], quote: isHtml ? 'Document entier' : 'Page entière', type: 'comment', text: '', error: '', pageLevel: true });
    setSheetOpen(true);
  };

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
          <button className="btn btn-ghost btn-sm" onClick={() => triggerDownload(doc).catch((e) => toast(e.message))}>{isHtml ? 'Télécharger le fichier' : 'Télécharger le PDF'}</button>
        </div>
      </div>

      <div className={`viewer${narrow && sheetOpen ? ' sheet-open' : ''}`}>
        <div className="doc-area" ref={areaRef}>
          <p className="hint">
            {coarse
              ? 'Touchez une phrase pour la sélectionner. Pour un passage précis, maintenez le doigt sur le texte.'
              : 'Sélectionnez un passage pour le surligner ou y ajouter un commentaire. Raccourcis : H pour surligner, C pour commenter.'}
          </p>
          <Suspense fallback={<Loading label="Chargement du lecteur…" />}>
            {isHtml
              ? <HtmlViewer ref={htmlRef} html={html} title={doc.title} annotations={notes} activeId={active} zoom={zoom} preview={preview}
                  onPin={focusThread} onSelect={setSel} getSelection={() => selRef.current} onKey={(e) => keyRef.current(e)} />
              : <PdfViewer url={url} annotations={notes} activeId={active} onPin={focusThread} containerRef={pagesRef} zoom={zoom} preview={preview} />}
          </Suspense>
        </div>

        <aside className={`panel${narrow ? ' sheet' : ''}${sheetOpen ? ' open' : ''}`} aria-label="Commentaires">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Commentaires</h2>
              {narrow && <button type="button" className="sheet-close" onClick={() => setSheetOpen(false)} aria-label="Fermer les commentaires">Fermer</button>}
            </div>
            <div className="tabs" role="tablist">
              {tabBtn('open', 'Ouverts', open.length)}
              {tabBtn('resolved', 'Résolus', resolved.length)}
              {tabBtn('marks', 'Surlignages', highlights.length)}
            </div>
          </div>

          {composer && (
            <section className="composer" aria-label="Nouveau message">
              <p className="composer-label">{composer.pageLevel ? (isHtml ? 'Commentaire sur le document' : 'Commentaire sur une page') : 'Passage commenté'}</p>
              {composer.pageLevel
                ? (isHtml ? <blockquote>Document entier</blockquote> : <div className="field"><label htmlFor="cpage">Numéro de page</label>
                    <input id="cpage" type="number" min="1" value={composer.page} onChange={(e) => setComposer({ ...composer, page: Math.max(1, Number(e.target.value) || 1) })} /></div>)
                : <blockquote>{composer.quote}</blockquote>}
              <fieldset className="type"><legend className="sr">Type de message</legend>
                {[['comment', 'Commentaire'], ['question', 'Question']].map(([v, l]) => (
                  <label key={v}><input type="radio" name="ctype" checked={composer.type === v} onChange={() => setComposer({ ...composer, type: v })} /> {l}</label>
                ))}
              </fieldset>
              <textarea rows="3" aria-label="Votre message" placeholder={composer.type === 'question' ? 'Votre question' : 'Votre commentaire'}
                value={composer.text} onChange={(e) => setComposer({ ...composer, text: e.target.value, error: '' })}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); publish(); } }} autoFocus />
              {composer.error && <p className="field-error" role="alert">{composer.error}</p>}
              <div className="row">
                <button className="btn btn-primary btn-sm" onClick={publish}>Publier{!coarse && <span className="kbd-hint" aria-hidden="true"> Ctrl + Entrée</span>}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setComposer(null)}>Annuler</button>
              </div>
            </section>
          )}

          <div className="threads">
            {!composer && <p style={{ margin: '14px 0 0' }}><button className="link-btn" onClick={startPageComment}>{isHtml ? 'Commenter le document' : 'Commenter une page entière'}</button></p>}

            {tab !== 'marks' && list.length === 0 && (
              <p className="empty">{tab === 'resolved' ? 'Aucun échange résolu pour l’instant.' : 'Aucun échange ouvert. Sélectionnez un passage du document pour en démarrer un.'}</p>
            )}
            {tab !== 'marks' && list.map((t) => (
              <section key={t.id} id={`th-${t.id}`} className={`thread${t.id === active ? ' active' : ''}`} onClick={() => t.id !== active && focusThread(t.id)}>
                <div className="thread-head">
                  <span className={`pin ${t.status}`}>{t.n}</span>
                  <strong>{t.kind === 'question' ? 'Question' : 'Commentaire'}</strong>
                  <span className="meta">{isHtml ? (typeof t.rects?.[0]?.s === 'number' ? 'Passage' : 'Document') : `Page ${t.page}`}</span>
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
                <p className="muted">{isHtml ? 'Surligné' : `Page ${h.page}, surligné`} par {h.author_name}, {fmtDateTime(h.created_at)}</p>
                {(h.author_id === myId || isAdmin) && <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => removeHighlight(h, false)}>Retirer</button></div>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {sel && (
        <SelectionBar sel={sel} coarse={coarse} onHighlight={highlight} onComment={startComment}
          onExtend={() => resize(1)} onReduce={() => resize(-1)} onClose={clearSelection} onHold={(v) => { barHeld.current = v; }} />
      )}

      {!sel && (
        <div className="zoom" role="group" aria-label="Taille du document">
          <button type="button" onClick={() => changeZoom(-1)} disabled={zoom <= ZOOMS[0]} aria-label="Réduire le document">−</button>
          <button type="button" className="zoom-val" onClick={() => { if (zoom !== 1) { zoomRef.current = { prev: zoom, mid: window.scrollY + window.innerHeight / 2, holderTop: (pagesRef.current?.getBoundingClientRect().top || 0) + window.scrollY }; setZoom(1); } }} aria-label="Taille normale">{pct(zoom)}</button>
          <button type="button" onClick={() => changeZoom(1)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} aria-label="Agrandir le document">+</button>
        </div>
      )}
      {narrow && !sel && !sheetOpen && (
        <button type="button" className="fab" onClick={() => setSheetOpen(true)}>Commentaires <span>{open.length}</span></button>
      )}
    </>
  );
}
