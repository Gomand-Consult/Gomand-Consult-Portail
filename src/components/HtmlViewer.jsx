import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { applyMarks, buildIndex, markTop, offsetOf, rangeOffsets, unwrapMarks } from '../lib/htmlAnchors';
import { sentenceIndexAt, splitSentences } from '../lib/selection';

// Une page HTML autonome s'affiche dans un cadre isolé.
// - Aucun script ne peut s'y exécuter (pas d'« allow-scripts »), ni formulaire, ni navigation du portail.
// - « allow-same-origin » est sans danger SANS « allow-scripts » : le portail peut lire la sélection
//   et poser les surlignages, mais le contenu de la page ne peut rien faire.
// Le cadre prend la hauteur de la page : on fait défiler le portail, pas un cadre dans le cadre.
const STYLE = `
mark[data-gc]{background:rgba(232,106,74,.30);color:inherit;border-radius:2px;padding:0}
mark.gc-cm{background:rgba(104,126,140,.30);border-bottom:2px solid #687E8C;cursor:pointer}
mark.gc-resolved{background:rgba(104,126,140,.14);border-bottom-color:rgba(104,126,140,.4)}
mark.gc-active{background:rgba(232,106,74,.5);border-bottom-color:#E86A4A}
mark.gc-preview{background:rgba(50,74,89,.22);outline:1.5px solid #324A59}
mark[data-n]::before{content:attr(data-n);display:inline-block;min-width:18px;margin-right:4px;padding:0 4px;border-radius:3px;background:#E86A4A;color:#252A2B;font:700 11px/17px system-ui,sans-serif;text-align:center;-webkit-user-select:none;user-select:none}
html{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}
`;
const MIN_FRAME = 420;

const HtmlViewer = forwardRef(function HtmlViewer({ html, title, annotations = [], activeId, zoom = 1, preview = null, onPin, onSelect, getSelection, onKey }, ref) {
  const frame = useRef(null);
  const state = useRef({ doc: null, index: null, sentences: [], tapSel: null, down: false, downAt: 0, pointer: 'mouse', timer: 0 });
  const props = useRef({});
  props.current = { onKey, onPin, onSelect, getSelection, annotations, activeId, preview };
  const [ready, setReady] = useState(false);
  const [fixed, setFixed] = useState(false);

  const refreshIndex = useCallback(() => {
    const s = state.current; if (!s.doc) return;
    s.index = buildIndex(s.doc);
    s.sentences = splitSentences(s.index.text, s.index.breaks);
  }, []);

  const fit = useCallback(() => {
    const s = state.current; const f = frame.current; if (!s.doc || !f) return;
    f.style.height = '0px';
    const h = Math.ceil(Math.max(s.doc.documentElement.scrollHeight, s.doc.body?.scrollHeight || 0));
    if (h < MIN_FRAME) { setFixed(true); f.style.height = ''; return; } // page conçue pour remplir l'écran : on garde un cadre défilant
    setFixed(false); f.style.height = `${h + 2}px`;
  }, []);

  const paint = useCallback(() => {
    const s = state.current; if (!s.doc) return;
    const { annotations: notes, activeId: act, preview: pv } = props.current;
    const items = [];
    for (const a of notes) {
      const r = a.rects?.[0]; if (!r || typeof r.s !== 'number') continue;
      const cls = `${a.kind === 'highlight' ? '' : 'gc-cm'}${a.status === 'resolved' ? ' gc-resolved' : ''}${a.id === act ? ' gc-active' : ''}`.trim();
      items.push({ id: a.id, s: r.s, e: r.e, cls, n: a.kind === 'highlight' ? 0 : a.n });
    }
    if (pv?.rects?.[0] && typeof pv.rects[0].s === 'number') items.push({ id: 'preview', s: pv.rects[0].s, e: pv.rects[0].e, cls: 'gc-preview' });
    try { applyMarks(s.doc, items); } catch (e) { console.error(e); }
    refreshIndex(); fit();
  }, [fit, refreshIndex]);

  // Description d'une zone du texte (positions dans le texte brut) pour la barre d'actions.
  const describe = useCallback((a, b, extra) => {
    const s = state.current; const { doc, index } = s;
    const startNode = index.nodes.find((x) => x.end > a); const endNode = [...index.nodes].reverse().find((x) => x.start < b);
    if (!startNode || !endNode) return null;
    const r = doc.createRange();
    r.setStart(startNode.node, Math.max(0, a - startNode.start)); r.setEnd(endNode.node, Math.min(endNode.end - endNode.start, b - endNode.start));
    const box = r.getBoundingClientRect(); const off = frame.current.getBoundingClientRect();
    return {
      page: 1, rects: [{ s: a, e: b }], quote: index.text.slice(a, b).replace(/\s+/g, ' ').trim().slice(0, 400),
      anchor: { top: off.top + box.top, bottom: off.top + box.bottom, left: off.left + box.left, width: box.width }, ...extra,
    };
  }, []);

  const selectSentences = useCallback((from, to) => {
    const s = state.current; const sa = s.sentences[from]; const sb = s.sentences[to];
    if (!sa || !sb) return null;
    const d = describe(sa[0], sb[1], { source: 'tap', from, to });
    if (d) props.current.onSelect?.(d);
    return d;
  }, [describe]);

  const readNative = useCallback(() => {
    const s = state.current; if (!s.doc || s.down) return;
    const sel = s.doc.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { if (props.current.getSelection?.()?.source === 'native') props.current.onSelect?.(null); return; }
    const offs = rangeOffsets(s.index, sel.getRangeAt(0)); if (!offs) return;
    const d = describe(offs[0], offs[1], { source: 'native' });
    if (d) props.current.onSelect?.(d);
  }, [describe]);

  const onLoad = useCallback(() => {
    const f = frame.current; const doc = f?.contentDocument; if (!doc || !doc.body) return;
    const s = state.current; s.doc = doc;
    const st = doc.createElement('style'); st.setAttribute('data-gc-style', ''); st.textContent = STYLE; (doc.head || doc.documentElement).appendChild(st);
    refreshIndex();

    const later = (ms) => { clearTimeout(s.timer); s.timer = setTimeout(readNative, ms); };
    doc.addEventListener('selectionchange', () => later(150));
    doc.addEventListener('keydown', (e) => props.current.onKey?.(e));
    doc.addEventListener('pointerdown', (e) => { s.down = true; s.downAt = performance.now(); s.pointer = e.pointerType || 'mouse'; });
    const up = () => { s.down = false; later(30); };
    doc.addEventListener('pointerup', up); doc.addEventListener('pointercancel', up);
    doc.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (a) { // les liens s'ouvrent dans un nouvel onglet ; les ancres restent dans la page
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) return;
        e.preventDefault(); if (/^(https?:|mailto:|tel:)/i.test(a.href)) window.open(a.href, '_blank', 'noopener,noreferrer');
        return;
      }
      if (performance.now() - s.downAt > 450) return; // appui long : la sélection native prend le relais
      if (!doc.getSelection()?.isCollapsed) return;
      if (props.current.getSelection?.()) { props.current.onSelect?.(null); return; } // un toucher ailleurs ferme la sélection en cours
      const mk = e.target.closest?.('mark[data-id]');
      if (mk && mk.classList.contains('gc-cm')) { props.current.onPin?.(mk.getAttribute('data-id')); return; }
      if (s.pointer !== 'touch' && s.pointer !== 'pen') return;
      const cp = doc.caretPositionFromPoint?.(e.clientX, e.clientY); const cr = !cp && doc.caretRangeFromPoint?.(e.clientX, e.clientY);
      const node = cp ? cp.offsetNode : cr?.startContainer; const off = cp ? cp.offset : cr?.startOffset;
      if (!node) return;
      const pos = offsetOf(s.index, node, off); if (pos < 0) return;
      const k = sentenceIndexAt(s.sentences, pos); if (k < 0) return;
      selectSentences(k, k);
    });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fit()).observe(doc.documentElement);
    doc.documentElement.style.zoom = String(zoom);
    setReady(true);
  }, [fit, readNative, refreshIndex, selectSentences, zoom]);

  useEffect(() => { if (ready) paint(); }, [ready, annotations, activeId, preview, paint]);
  useEffect(() => { const d = state.current.doc; if (!d) return; d.documentElement.style.zoom = String(zoom); fit(); }, [zoom, fit]);
  useEffect(() => () => { clearTimeout(state.current.timer); }, []);

  useImperativeHandle(ref, () => ({
    clear() { const s = state.current; s.doc?.getSelection()?.removeAllRanges(); },
    // Ajoute (ou retire) une phrase à la sélection faite d'un toucher.
    resize(delta, cur) {
      const s = state.current; if (!cur || cur.source !== 'tap') return;
      const to = Math.min(s.sentences.length - 1, Math.max(cur.from, cur.to + delta)); if (to === cur.to) return;
      selectSentences(cur.from, to);
    },
    topOf(id) { const s = state.current; if (!s.doc) return null; const t = markTop(s.doc, id); return t == null ? null : t + frame.current.getBoundingClientRect().top; },
    unwrap() { if (state.current.doc) unwrapMarks(state.current.doc); },
  }), [selectSentences]);

  return (
    <iframe
      ref={frame}
      className={`html-frame${fixed ? ' fixed' : ''}`}
      title={title || 'Document'}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      scrolling={fixed ? 'yes' : 'no'}
      referrerPolicy="no-referrer"
      srcDoc={html}
      onLoad={onLoad}
    />
  );
});

export default HtmlViewer;
