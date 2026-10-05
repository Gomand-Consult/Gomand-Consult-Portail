import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { getGallery, listPhotos, signedUrls, setDecision, addPhotoMessage, sendSelection, markGalleryViewed, markGallerySeen, notify } from '../lib/api';
import { DEC_LABEL } from '../config';
import { fmtDateTime, plural } from '../lib/format';
import { Header, Footer, Loading, ErrorBox, ARROW, ARROW_BACK } from '../components/Layout';

const sortMsgs = (p) => (p.photo_messages || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
const FILTERS = [['all', 'Toutes'], ['none', 'À examiner'], ['approved', 'Approuvées'], ['comment', 'À discuter'], ['rejected', 'Refusées']];

function DecisionButtons({ photo, index, onDecide, onComment, label }) {
  return (
    <div className={label ? 'lb-decide' : 'tile-actions'} role="group" aria-label={`Décision pour la photo ${index + 1}`}>
      <button className="btn btn-ghost btn-sm dec dec-approved" aria-pressed={photo.decision === 'approved'} onClick={() => onDecide(photo, 'approved')}>Approuver</button>
      <button className="btn btn-ghost btn-sm dec dec-comment" aria-pressed={photo.decision === 'comment'} onClick={() => onComment(photo)}>Commenter</button>
      <button className="btn btn-ghost btn-sm dec dec-rejected" aria-pressed={photo.decision === 'rejected'} onClick={() => onDecide(photo, 'rejected')}>Refuser</button>
    </div>
  );
}

function Lightbox({ photos, index, setIndex, thumbs, isAdmin, onClose, onDecide, onSend, focusText }) {
  const photo = photos[index];
  const [full, setFull] = useState('');
  const [text, setText] = useState('');
  const cache = useRef(new Map());
  const root = useRef(null);
  const taRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true; setFull('');
    const path = photo.storage_path;
    if (cache.current.has(path)) { setFull(cache.current.get(path)); return undefined; }
    signedUrls('photos', [path]).then((m) => { if (alive && m[path]) { cache.current.set(path, m[path]); setFull(m[path]); } }).catch(() => {});
    return () => { alive = false; };
  }, [photo.storage_path]);

  useEffect(() => { setText(''); }, [photo.id]);
  useEffect(() => { (focusText ? taRef : closeRef).current?.focus(); }, [focusText]);
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const step = (d) => setIndex((index + d + photos.length) % photos.length);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    const typing = /^(TEXTAREA|INPUT)$/.test(e.target.tagName);
    if (!typing && e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (!typing && e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'Tab') {
      const f = Array.from(root.current.querySelectorAll('button, textarea')).filter((x) => !x.disabled);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const send = async () => {
    const body = text.trim(); if (!body) { taRef.current?.focus(); return; }
    const ok = await onSend(photo, body); if (ok) setText('');
  };
  const msgs = sortMsgs(photo);

  return (
    <div className="lb" ref={root} role="dialog" aria-modal="true" aria-label={`Photo ${index + 1} sur ${photos.length}`} onKeyDown={onKey}>
      <div className="lb-stage">
        <button className="lb-nav lb-prev" onClick={() => step(-1)} aria-label="Photo précédente">{ARROW_BACK}</button>
        <img src={full || thumbs[photo.thumb_path] || ''} alt={photo.alt || `Photo ${index + 1}`} />
        <button className="lb-nav lb-next" onClick={() => step(1)} aria-label="Photo suivante">{ARROW}</button>
      </div>
      <aside className="lb-side">
        <div className="lb-top">
          <p className="eyebrow">Photo {index + 1} sur {photos.length}</p>
          <button ref={closeRef} className="btn btn-ghost btn-sm" onClick={onClose}>Fermer</button>
        </div>
        <h2>{DEC_LABEL[photo.decision]}</h2>
        {!isAdmin && <DecisionButtons photo={photo} index={index} label onDecide={onDecide} onComment={() => taRef.current?.focus()} />}
        {msgs.length ? (
          <ol className="msgs">
            {msgs.map((m) => (
              <li key={m.id} className={`msg ${m.author_role === 'admin' ? 'bo' : 'client'}`}>
                <div className="msg-h"><strong>{m.author_name}</strong><time dateTime={m.created_at}>{fmtDateTime(m.created_at)}</time></div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
              </li>
            ))}
          </ol>
        ) : <p className="hint">Aucun message pour cette photo.</p>}
        <div>
          <p className="composer-label">{isAdmin ? 'Votre réponse' : 'Votre commentaire'}</p>
          <textarea ref={taRef} rows="3" value={text} onChange={(e) => setText(e.target.value)}
            aria-label={isAdmin ? 'Votre réponse' : 'Commentaire sur cette photo'} placeholder={isAdmin ? 'Répondre au client' : 'Une remarque, une retouche, une question'} />
          <div className="row"><button className="btn btn-primary btn-sm" onClick={send}>{isAdmin ? 'Envoyer la réponse' : 'Envoyer le commentaire'}</button></div>
        </div>
      </aside>
    </div>
  );
}

export default function Gallery() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { profile } = useAuth();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';

  const [gallery, setGallery] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [lb, setLb] = useState(null); // { index, focusText }
  const lastTile = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const g = await getGallery(id);
        if (!g) throw new Error('Cette galerie est introuvable.');
        const p = await listPhotos(id);
        const t = await signedUrls('photos', p.map((x) => x.thumb_path));
        if (!alive) return;
        setGallery(g); setPhotos(p); setThumbs(t);
        if (isAdmin) markGallerySeen(id); else markGalleryViewed(id);
        const want = params.get('photo'); const i = p.findIndex((x) => x.id === want);
        if (i >= 0) setLb({ index: i, focusText: true });
      } catch (e) { if (alive) setError(e.message); }
    })();
    return () => { alive = false; };
  }, [id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((pid, fn) => setPhotos((all) => all.map((p) => (p.id === pid ? fn(p) : p))), []);

  const decide = async (photo, dec) => {
    const before = photo.decision;
    const next = before === dec ? ((photo.photo_messages || []).length ? 'comment' : 'none') : dec;
    update(photo.id, (p) => ({ ...p, decision: next }));
    try {
      await setDecision(photo.id, next);
      toast(next === dec ? `Photo ${dec === 'approved' ? 'approuvée' : 'refusée'}.` : 'Choix retiré.');
    } catch (e) { update(photo.id, (p) => ({ ...p, decision: before })); toast(e.message); }
  };
  const sendMessage = async (photo, body) => {
    try {
      const msg = await addPhotoMessage(photo.id, body);
      update(photo.id, (p) => ({ ...p, decision: !isAdmin && p.decision === 'none' ? 'comment' : p.decision, photo_messages: [...(p.photo_messages || []), msg] }));
      notify('photo_message', msg.id);
      toast(isAdmin ? 'Réponse envoyée. Le client est prévenu par email.' : 'Commentaire envoyé. Anthony est prévenu par email.');
      return true;
    } catch (e) { toast(e.message); return false; }
  };
  const send = async () => {
    try {
      await sendSelection(id);
      setGallery((g) => ({ ...g, sent_at: new Date().toISOString() }));
      notify('selection_sent', id);
      const left = photos.filter((p) => p.decision === 'none').length;
      toast(`Sélection envoyée à Anthony.${left ? ` ${plural(left, 'photo reste', 'photos restent')} à examiner.` : ''}`);
    } catch (e) { toast(e.message); }
  };
  const closeLb = () => { setLb(null); setTimeout(() => lastTile.current?.focus(), 0); };

  if (error) return <><Header /><div className="container"><ErrorBox>{error}</ErrorBox></div></>;
  if (!gallery) return <><Header /><Loading /></>;

  const count = (d) => photos.filter((p) => p.decision === d).length;
  const done = photos.length - count('none');
  const pct = photos.length ? Math.round((done / photos.length) * 100) : 0;
  const shown = photos.map((p, i) => ({ p, i })).filter(({ p }) => filter === 'all' || p.decision === filter);
  const nums = (d) => { const a = photos.map((p, i) => (p.decision === d ? i + 1 : 0)).filter(Boolean); return a.length ? a.join(', ') : 'aucune'; };
  const backTo = isAdmin ? `/admin/clients/${gallery.client_id}` : '/';

  return (
    <>
      <Header />
      <main>
        <div className="container">
          <div className="page-head">
            <Link className="btn btn-ghost btn-sm" to={backTo}>{ARROW_BACK}{isAdmin ? 'Retour à la fiche client' : 'Retour aux documents'}</Link>
            <p className="eyebrow" style={{ marginTop: 32 }}>Galerie photo</p>
            <h1>{gallery.title}</h1>
            {gallery.note && <p className="lede">{gallery.note}</p>}
          </div>
          <div className="clarity-line drawn" />

          <div className="section">
            <div className="gal-head">
              <div className="progress">
                <p><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{done} sur {photos.length}</strong> {isAdmin ? 'photos examinées par le client' : 'photos examinées'}</p>
                <div className="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax={photos.length} aria-valuenow={done} aria-label="Photos examinées"><span style={{ width: `${pct}%` }} /></div>
              </div>
              {!isAdmin && <button className="btn btn-primary" onClick={send}>{gallery.sent_at ? 'Renvoyer ma sélection' : 'Envoyer ma sélection à Anthony'}</button>}
            </div>
            {gallery.sent_at && <p className="gal-sent" role="status">Sélection {isAdmin ? 'envoyée par le client' : 'envoyée'} le {fmtDateTime(gallery.sent_at)}.{isAdmin ? '' : ' Vous pouvez encore la modifier et la renvoyer.'}</p>}

            {isAdmin && (
              <dl className="summary">
                <div><dt>Approuvées</dt><dd>{nums('approved')}</dd></div>
                <div><dt>À discuter</dt><dd>{nums('comment')}</dd></div>
                <div><dt>Refusées</dt><dd>{nums('rejected')}</dd></div>
                <div><dt>À examiner</dt><dd>{nums('none')}</dd></div>
              </dl>
            )}

            <div className="filters" role="group" aria-label="Filtrer les photos">
              {FILTERS.map(([k, label]) => (
                <button key={k} className="filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {label} <span className="count">{k === 'all' ? photos.length : count(k)}</span>
                </button>
              ))}
            </div>

            {shown.length === 0 ? <p className="empty">Aucune photo dans cette catégorie.</p> : (
              <ul className="photo-grid">
                {shown.map(({ p, i }) => {
                  const n = (p.photo_messages || []).length;
                  return (
                    <li key={p.id} className={`tile ${p.decision}`}>
                      <button className="tile-img" aria-label={`Agrandir la photo ${i + 1}`} onClick={(e) => { lastTile.current = e.currentTarget; setLb({ index: i, focusText: false }); }}>
                        <img src={thumbs[p.thumb_path] || ''} alt={p.alt || `Photo ${i + 1}`} loading="lazy" />
                        {p.decision !== 'none' && <span className="badge">{DEC_LABEL[p.decision]}</span>}
                      </button>
                      <div className="tile-cap"><span>Photo {i + 1}</span><span className="tile-meta">{n ? plural(n, 'message', 'messages') : ''}</span></div>
                      {!isAdmin && <DecisionButtons photo={p} index={i} onDecide={decide} onComment={() => setLb({ index: i, focusText: true })} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </main>
      <Footer />
      {lb && (
        <Lightbox photos={photos} index={lb.index} focusText={lb.focusText} thumbs={thumbs} isAdmin={isAdmin}
          setIndex={(i) => setLb({ index: i, focusText: false })} onClose={closeLb} onDecide={decide} onSend={sendMessage} />
      )}
    </>
  );
}
