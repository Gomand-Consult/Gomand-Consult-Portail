import { describe, it, expect } from 'vitest';
import { mergeRects, normalizeRects } from '../lib/rects';

describe('mergeRects', () => {
  it('fusionne les morceaux voisins d’une même ligne', () => {
    const out = mergeRects([
      { x: 0.10, y: 0.20, w: 0.10, h: 0.02 },
      { x: 0.205, y: 0.201, w: 0.15, h: 0.02 },
      { x: 0.36, y: 0.2, w: 0.1, h: 0.02 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBeCloseTo(0.10, 3);
    expect(out[0].w).toBeCloseTo(0.36, 3);
  });
  it('garde séparées deux lignes différentes', () => {
    const out = mergeRects([{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }, { x: 0.1, y: 0.25, w: 0.3, h: 0.02 }]);
    expect(out).toHaveLength(2);
    expect(out[0].y).toBeLessThan(out[1].y);
  });
  it('ne fusionne pas deux morceaux très éloignés sur la même ligne', () => {
    expect(mergeRects([{ x: 0.1, y: 0.2, w: 0.1, h: 0.02 }, { x: 0.6, y: 0.2, w: 0.1, h: 0.02 }])).toHaveLength(2);
  });
  it('écarte les rectangles vides ou trop hauts pour être du texte', () => {
    expect(mergeRects([{ x: 0, y: 0, w: 0, h: 0.02 }, { x: 0, y: 0, w: 1, h: 0.9 }])).toHaveLength(0);
  });
  it('plafonne à 200 rectangles (limite de la base)', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ x: 0.1, y: i * 0.002, w: 0.3, h: 0.0015 }));
    expect(mergeRects(many).length).toBeLessThanOrEqual(200);
  });
});

describe('normalizeRects', () => {
  const page = { left: 100, top: 50, right: 700, bottom: 850, width: 600, height: 800 };
  const r = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  it('convertit en fractions de la page', () => {
    const [a] = normalizeRects([r(160, 130, 300, 16)], page);
    expect(a.x).toBeCloseTo(0.1, 3); expect(a.y).toBeCloseTo(0.1, 3);
    expect(a.w).toBeCloseTo(0.5, 3); expect(a.h).toBeCloseTo(0.02, 3);
  });
  it('ignore ce qui est hors de la page et rogne ce qui dépasse', () => {
    const out = normalizeRects([r(900, 130, 100, 16), r(650, 130, 200, 16)], page);
    expect(out).toHaveLength(1);
    expect(out[0].x + out[0].w).toBeLessThanOrEqual(1.0001);
  });
});
