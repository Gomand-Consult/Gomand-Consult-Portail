// Géométrie des surlignages. Toutes les valeurs sont des fractions de la page (0 à 1) :
// elles restent exactes quel que soit le zoom ou la largeur de l'écran.

const GAP = 0.012;       // écart horizontal toléré entre deux morceaux d'une même ligne
const MAX_RECTS = 200;   // limite imposée aussi par la base de données
const MAX_HEIGHT = 0.12; // un rectangle plus haut n'est pas une ligne de texte

const round = (n) => Math.round(n * 10000) / 10000;
const centerY = (r) => r.y + r.h / 2;

/** Regroupe les rectangles d'une même ligne et fusionne ceux qui se touchent. */
export function mergeRects(rects) {
  const valid = rects.filter((r) => r.w > 0 && r.h > 0 && r.h <= MAX_HEIGHT).sort((a, b) => a.y - b.y || a.x - b.x);
  const groups = [];
  for (const r of valid) {
    const g = groups.find((x) => Math.abs(centerY(x.ref) - centerY(r)) < Math.min(x.ref.h, r.h) * 0.5);
    if (g) g.items.push(r); else groups.push({ ref: r, items: [r] });
  }
  const out = [];
  for (const g of groups) {
    const items = g.items.slice().sort((a, b) => a.x - b.x);
    const merged = [];
    for (const it of items) {
      const last = merged[merged.length - 1];
      if (last && it.x <= last.x + last.w + GAP) {
        const right = Math.max(last.x + last.w, it.x + it.w);
        const top = Math.min(last.y, it.y);
        const bottom = Math.max(last.y + last.h, it.y + it.h);
        last.x = Math.min(last.x, it.x); last.w = right - last.x; last.y = top; last.h = bottom - top;
      } else merged.push({ ...it });
    }
    out.push(...merged);
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out.slice(0, MAX_RECTS).map((r) => ({ x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h) }));
}

/** Convertit des rectangles écran (getClientRects) en fractions de la page. */
export function normalizeRects(clientRects, pageRect) {
  const inside = clientRects.filter(
    (r) => r.width > 1 && r.height > 1 && r.right > pageRect.left && r.left < pageRect.right && r.bottom > pageRect.top && r.top < pageRect.bottom,
  );
  return mergeRects(
    inside.map((r) => {
      const x = Math.max(r.left, pageRect.left), y = Math.max(r.top, pageRect.top);
      const right = Math.min(r.right, pageRect.right), bottom = Math.min(r.bottom, pageRect.bottom);
      return { x: (x - pageRect.left) / pageRect.width, y: (y - pageRect.top) / pageRect.height, w: (right - x) / pageRect.width, h: (bottom - y) / pageRect.height };
    }),
  );
}

/** Lit la sélection de texte courante, si elle se trouve dans une page du PDF. */
export function captureSelection(root) {
  const sel = window.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !root) return null;
  const range = sel.getRangeAt(0);
  const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const pageEl = start?.closest?.('[data-page]');
  if (!pageEl || !root.contains(pageEl)) return null;
  const rects = normalizeRects(Array.from(range.getClientRects()), pageEl.getBoundingClientRect());
  if (!rects.length) return null;
  const quote = sel.toString().replace(/\s+/g, ' ').trim().slice(0, 400);
  const box = range.getBoundingClientRect();
  return { page: Number(pageEl.dataset.page), rects, quote, anchor: { top: box.top, bottom: box.bottom, left: box.left, width: box.width } };
}
