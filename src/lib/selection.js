// Sélection de texte « au doigt » : on choisit des phrases entières au lieu de poignées minuscules.
// Les fonctions pures (découpage en phrases, détection d'un surlignage touché) sont testées sans navigateur ;
// celles qui lisent la page (pageModel, describe) ont besoin d'un vrai affichage.
import { normalizeRects } from './rects';

const MAX_QUOTE = 400;
const ABBREVIATIONS = new Set(['art', 'etc', 'ex', 'cf', 'env', 'tel', 'tél', 'p', 'pp', 'no', 'n', 'm', 'mme', 'mlle', 'dr', 'me', 'st', 'sa', 'srl', 'sprl', 'ca', 'vs', 'resp', 'max', 'min']);

/** Une ponctuation de fin de phrase suivie d'un espace, sauf abréviation courante ou initiale seule. */
function endsSentence(text, i) {
  const ch = text[i];
  if (!/[.!?…]/.test(ch)) return false;
  if (i + 1 < text.length && !/\s/.test(text[i + 1]) && !/["»”')\]]/.test(text[i + 1])) return false; // 3.5, www.exemple.be
  if (ch === '.') {
    const m = /([\p{L}]+)$/u.exec(text.slice(Math.max(0, i - 6), i));
    if (m && (m[1].length === 1 || ABBREVIATIONS.has(m[1].toLowerCase()))) return false;
  }
  return true;
}

/**
 * Découpe le texte d'une page en phrases : [début, fin[ (fin exclue), sans espaces de bord.
 * `breaks` liste les positions où commence un nouveau paragraphe (une phrase ne les franchit jamais).
 */
export function splitSentences(text, breaks = []) {
  const out = [];
  const stops = new Set(breaks);
  let start = 0;
  const push = (s, e) => {
    while (s < e && /\s/.test(text[s])) s += 1;
    while (e > s && /\s/.test(text[e - 1])) e -= 1;
    if (e > s) out.push([s, e]);
  };
  for (let i = 0; i < text.length; i += 1) {
    if (stops.has(i) && i > start) { push(start, i); start = i; }
    if (endsSentence(text, i)) {
      let e = i + 1;
      while (e < text.length && /["»”')\]]/.test(text[e])) e += 1;
      const closing = /^\s+[»”]/.exec(text.slice(e)); // typographie française : « oui. »
      if (closing) e += closing[0].length;
      push(start, e); start = e; i = e - 1;
    }
  }
  push(start, text.length);
  return out;
}

/** Indice de la phrase qui contient (ou précède de peu) la position donnée. */
export function sentenceIndexAt(sentences, pos) {
  let best = -1;
  for (let k = 0; k < sentences.length; k += 1) {
    const [s, e] = sentences[k];
    if (pos >= s && pos < e) return k;
    if (e <= pos) best = k;
  }
  return best < 0 ? (sentences.length ? 0 : -1) : best;
}

/** Surlignage le plus précis sous un point (fractions de la page), en préférant les échanges aux simples surlignages. */
export function hitAnnotation(notes, page, fx, fy) {
  let best = null; let bestArea = Infinity;
  for (const a of notes) {
    if (a.page !== page) continue;
    for (const r of a.rects || []) {
      if (fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h) {
        const area = r.w * r.h * (a.kind === 'highlight' ? 4 : 1);
        if (area < bestArea) { best = a; bestArea = area; }
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------ Lecture de la page (navigateur)

/** Texte de la page dans l'ordre de lecture, avec la position de chaque morceau dans le DOM. */
export function pageModel(pageEl) {
  const layer = pageEl.querySelector('.textLayer');
  if (!layer) return null;
  const nodes = Array.from(layer.querySelectorAll('span'))
    .map((el) => ({ el, node: Array.from(el.childNodes).find((n) => n.nodeType === 3) }))
    .filter((x) => x.node && x.node.data.trim());
  const entries = []; const breaks = []; let text = ''; let prev = null;
  for (const { el, node } of nodes) {
    const rect = el.getBoundingClientRect();
    if (prev) {
      const h = Math.max(prev.rect.height, rect.height) || 10;
      const sameLine = Math.abs((rect.top + rect.height / 2) - (prev.rect.top + prev.rect.height / 2)) < h * 0.5;
      const gap = rect.left - prev.rect.right;
      if (sameLine && gap < h * 0.12) { /* même mot coupé en deux morceaux : rien à insérer */ } else text += ' ';
      if (!sameLine && rect.top - prev.rect.top > h * 1.6) breaks.push(text.length);
    }
    const start = text.length; text += node.data;
    entries.push({ node, rect, start, end: text.length });
    prev = entries[entries.length - 1];
  }
  return { pageEl, page: Number(pageEl.dataset.page), text, entries, breaks, sentences: splitSentences(text, breaks) };
}

/** Position (dans le texte de la page) la plus proche d'un point de l'écran, à 32 px près. */
export function indexAtPoint(model, x, y) {
  let best = null; let bestD = 32;
  for (const e of model.entries) {
    const dx = Math.max(e.rect.left - x, 0, x - e.rect.right);
    const dy = Math.max(e.rect.top - y, 0, y - e.rect.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestD) { best = e; bestD = d; }
  }
  if (!best) return -1;
  const len = best.end - best.start;
  const cp = document.caretPositionFromPoint?.(x, y);
  if (cp && cp.offsetNode === best.node) return best.start + Math.min(cp.offset, len - 1);
  const cr = document.caretRangeFromPoint?.(x, y);
  if (cr && cr.startContainer === best.node) return best.start + Math.min(cr.startOffset, len - 1);
  const frac = Math.min(1, Math.max(0, (x - best.rect.left) / (best.rect.width || 1)));
  return best.start + Math.min(len - 1, Math.floor(frac * len));
}

/** Convertit une zone du texte de la page [a, b[ en description exploitable (rectangles, citation, ancre). */
export function describe(model, a, b) {
  const first = model.entries.find((e) => e.end > a);
  const last = [...model.entries].reverse().find((e) => e.start < b);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, Math.max(0, a - first.start));
  range.setEnd(last.node, Math.min(last.end - last.start, b - last.start));
  const pageRect = model.pageEl.getBoundingClientRect();
  const rects = normalizeRects(Array.from(range.getClientRects()), pageRect);
  if (!rects.length) return null;
  const box = range.getBoundingClientRect();
  const quote = model.text.slice(a, b).replace(/\s+/g, ' ').trim().slice(0, MAX_QUOTE);
  return { page: model.page, rects, quote, anchor: { top: box.top, bottom: box.bottom, left: box.left, width: box.width }, a, b };
}

/** Sélection d'une phrase à partir d'un toucher. `from` et `to` sont des indices de phrases (extension possible). */
export function sentenceSelection(model, from, to = from) {
  const s = model.sentences[from]; const e = model.sentences[to];
  if (!s || !e) return null;
  const d = describe(model, s[0], e[1]);
  return d ? { ...d, source: 'tap', from, to } : null;
}
