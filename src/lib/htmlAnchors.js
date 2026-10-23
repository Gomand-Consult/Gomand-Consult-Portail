// Ancrage des surlignages et commentaires dans une page HTML.
// Un passage est repéré par sa position dans le texte brut de la page (début, fin), pas par des coordonnées :
// il reste exact quelle que soit la largeur de l'écran, le zoom ou le retour à la ligne.
// Une page HTML publiée ne change jamais (une nouvelle version = un nouveau document), donc ces positions restent valables.
import { snapOffsets } from './rects';

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE']);
const BLOCKS = 'p,div,li,h1,h2,h3,h4,h5,h6,td,th,tr,section,article,header,footer,blockquote,pre,ul,ol,table,figure,figcaption,dd,dt,main,aside,nav';

/** Liste les morceaux de texte de la page, dans l'ordre, avec leur position dans le texte brut. */
export function buildIndex(doc) {
  const nodes = []; const breaks = []; const map = new Map();
  let text = ''; let lastBlock = null;
  const walker = doc.createTreeWalker(doc.body || doc.documentElement, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode: (n) => { for (let p = n.parentElement; p; p = p.parentElement) if (SKIP.has(p.tagName)) return 2; return 1; },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const start = text.length;
    if (n.data.trim()) {
      const block = n.parentElement?.closest(BLOCKS) || null;
      if (lastBlock !== null && block !== lastBlock && start > 0) breaks.push(start);
      lastBlock = block;
    }
    text += n.data;
    map.set(n, nodes.length);
    nodes.push({ node: n, start, end: text.length });
  }
  return { nodes, text, breaks, map };
}

/** Morceau de texte et position à l'intérieur de celui-ci pour une position dans le texte brut. */
export function locate(index, offset, atEnd = false) {
  const { nodes } = index; if (!nodes.length) return null;
  let lo = 0; let hi = nodes.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (nodes[mid].end < offset || (!atEnd && nodes[mid].end === offset)) lo = mid + 1; else hi = mid; }
  const n = nodes[lo];
  return { node: n.node, offset: Math.max(0, Math.min(n.end - n.start, offset - n.start)) };
}

/** Position dans le texte brut d'un point du DOM (morceau de texte + décalage), ou -1. */
export function offsetOf(index, node, off) {
  if (node.nodeType !== 3) {
    // Point placé entre deux éléments : on se rabat sur le premier texte qui suit.
    const child = node.childNodes[off] || node.childNodes[off - 1];
    const walker = child && node.ownerDocument.createTreeWalker(child, 4);
    const first = walker?.nextNode() || (child?.nodeType === 3 ? child : null);
    const i = first ? index.map.get(first) : undefined;
    return i === undefined ? -1 : index.nodes[i].start + (child === node.childNodes[off] ? 0 : first.data.length);
  }
  const i = index.map.get(node);
  return i === undefined ? -1 : index.nodes[i].start + off;
}

/** Début et fin (alignés sur des mots entiers) d'une sélection native. */
export function rangeOffsets(index, range) {
  const a = offsetOf(index, range.startContainer, range.startOffset);
  const b = offsetOf(index, range.endContainer, range.endOffset);
  if (a < 0 || b < 0 || a === b) return null;
  const [s, e] = snapOffsets(index.text, Math.min(a, b), Math.max(a, b));
  return e > s ? [s, e] : null;
}

/** Retire tous les marquages posés par le portail et recolle les morceaux de texte. */
export function unwrapMarks(doc) {
  const marks = doc.querySelectorAll('mark[data-gc]');
  if (!marks.length) return;
  marks.forEach((m) => {
    const p = m.parentNode; if (!p) return;
    while (m.firstChild) p.insertBefore(m.firstChild, m);
    p.removeChild(m);
  });
  (doc.body || doc.documentElement).normalize();
}

/**
 * Pose les marquages. `items` : [{ id, s, e, cls, n }]. Un surlignage qui traverse plusieurs paragraphes
 * est découpé en autant de morceaux que de blocs de texte ; le premier porte le numéro de l'échange.
 */
export function applyMarks(doc, items) {
  unwrapMarks(doc);
  for (const it of items) {
    const index = buildIndex(doc);
    const pieces = index.nodes.filter((x) => x.end > it.s && x.start < it.e && x.node.data.trim());
    pieces.forEach((x, k) => {
      const r = doc.createRange();
      r.setStart(x.node, Math.max(it.s, x.start) - x.start);
      r.setEnd(x.node, Math.min(it.e, x.end) - x.start);
      const m = doc.createElement('mark');
      m.setAttribute('data-gc', ''); m.setAttribute('data-id', it.id || ''); m.className = it.cls || '';
      if (k === 0 && it.n) m.setAttribute('data-n', String(it.n));
      r.surroundContents(m);
    });
  }
}

/** Position verticale (dans la page HTML) du premier marquage d'un échange. */
export function markTop(doc, id) {
  const m = Array.from(doc.querySelectorAll('mark[data-gc]')).find((x) => x.getAttribute('data-id') === id);
  return m ? m.getBoundingClientRect().top : null;
}
