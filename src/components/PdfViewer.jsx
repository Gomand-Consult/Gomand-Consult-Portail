import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
const RESOURCES = {
  cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/',
  isEvalSupported: false, // la politique de sécurité du site interdit eval
};

function Page({ pdf, n, width, ratio, notes, activeId, onPin }) {
  const wrap = useRef(null), canvas = useRef(null), text = useRef(null), lastTask = useRef(null);
  const [visible, setVisible] = useState(n <= 2);
  const [height, setHeight] = useState(Math.round(width * ratio));

  useEffect(() => {
    if (visible || !wrap.current) return undefined;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '800px 0px' });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    let renderTask, layer, cancelled = false;
    (async () => {
      // Un même canvas ne peut pas servir à deux rendus à la fois : on attend la fin de l'annulation précédente.
      if (lastTask.current) { try { lastTask.current.cancel(); await lastTask.current.promise; } catch { /* annulé */ } }
      if (cancelled) return;
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const viewport = page.getViewport({ scale });
      if (cancelled) return;
      setHeight(Math.round(viewport.height));
      const dpr = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * dpr); c.height = Math.floor(viewport.height * dpr);
      c.style.width = `${Math.floor(viewport.width)}px`; c.style.height = `${Math.floor(viewport.height)}px`;
      renderTask = page.render({ canvas: c, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      lastTask.current = renderTask;
      await renderTask.promise;
      if (cancelled) return;
      const box = text.current;
      box.replaceChildren();
      box.style.setProperty('--total-scale-factor', String(scale));
      box.style.setProperty('--scale-factor', String(scale));
      layer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: box, viewport });
      await layer.render();
    })().catch((e) => { if (e?.name !== 'RenderingCancelledException' && !cancelled) console.error(e); });
    return () => { cancelled = true; try { renderTask?.cancel(); } catch { /* déjà terminé */ } try { layer?.cancel(); } catch { /* idem */ } };
  }, [pdf, n, width, visible]);

  return (
    <div ref={wrap} className="pdf-page" data-page={n} style={{ width, height }} aria-label={`Page ${n}`}>
      <canvas ref={canvas} />
      <div className="pdf-overlay" aria-hidden="true">
        {notes.map((a) => a.rects.map((r, i) => (
          <div key={`${a.id}-${i}`} className={`ann-rect ${a.kind === 'highlight' ? 'highlight' : 'comment'}${a.status === 'resolved' ? ' resolved' : ''}${a.id === activeId ? ' active' : ''}`}
            style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
        )))}
      </div>
      <div ref={text} className="textLayer" />
      <div className="pin-layer">
        {notes.filter((a) => a.kind !== 'highlight' && a.rects[0]).map((a) => (
          <button key={a.id} className={`pin ${a.status}${a.id === activeId ? ' active' : ''}`} style={{ left: `${a.rects[0].x * 100}%`, top: `${a.rects[0].y * 100}%` }}
            onClick={() => onPin(a.id)} aria-label={`Voir l’échange ${a.n}`}>{a.n}</button>
        ))}
      </div>
    </div>
  );
}

export default function PdfViewer({ url, annotations, activeId, onPin, containerRef }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(1.414);
  const holder = useRef(null);

  useEffect(() => {
    let task; let alive = true;
    setPdf(null); setError('');
    task = pdfjs.getDocument({ url, ...RESOURCES });
    task.promise.then(async (doc) => {
      if (!alive) return;
      const first = await doc.getPage(1); const v = first.getViewport({ scale: 1 });
      setRatio(v.height / v.width); setPdf(doc);
    }).catch(() => alive && setError('Ce PDF ne peut pas être affiché. Utilisez « Télécharger le PDF ».'));
    return () => { alive = false; task?.destroy(); };
  }, [url]);

  useEffect(() => {
    const el = holder.current; if (!el) return undefined;
    const measure = () => setWidth(Math.max(280, Math.min(Math.floor(el.clientWidth), 900)));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byPage = useMemo(() => {
    const m = new Map();
    (annotations || []).forEach((a) => { if (!m.has(a.page)) m.set(a.page, []); m.get(a.page).push(a); });
    return m;
  }, [annotations]);

  return (
    <div ref={(el) => { holder.current = el; if (containerRef) containerRef.current = el; }} className="pdf-pages">
      {error && <p className="error-box" role="alert">{error}</p>}
      {!pdf && !error && <p className="loading" role="status">Chargement du document…</p>}
      {pdf && width > 0 && Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((n) => (
        <Page key={n} pdf={pdf} n={n} width={width} ratio={ratio} notes={byPage.get(n) || []} activeId={activeId} onPin={onPin} />
      ))}
    </div>
  );
}
