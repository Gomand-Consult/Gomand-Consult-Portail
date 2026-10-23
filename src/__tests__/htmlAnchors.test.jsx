import { describe, it, expect } from 'vitest';
import { applyMarks, buildIndex, locate, offsetOf, rangeOffsets, unwrapMarks } from '../lib/htmlAnchors';

const make = (body) => { const d = document.implementation.createHTMLDocument('t'); d.body.innerHTML = body; return d; };

describe('ancrage dans une page HTML', () => {
  const html = '<h1>Titre</h1><p>La mission débute <b>en novembre</b>. Fin de phrase.</p><p>Second paragraphe.</p><script>var x = 1;</script>';

  it('construit le texte brut sans les scripts et repère les changements de paragraphe', () => {
    const idx = buildIndex(make(html));
    expect(idx.text).toBe('TitreLa mission débute en novembre. Fin de phrase.Second paragraphe.');
    expect(idx.breaks).toEqual([5, 'TitreLa mission débute en novembre. Fin de phrase.'.length]);
  });

  it('retrouve le morceau de texte et la position pour un décalage donné', () => {
    const idx = buildIndex(make(html));
    const at = idx.text.indexOf('novembre');
    const loc = locate(idx, at);
    expect(loc.node.data).toBe('en novembre');
    expect(offsetOf(idx, loc.node, loc.offset)).toBe(at);
  });

  it('aligne une sélection sur des mots entiers', () => {
    const d = make(html); const idx = buildIndex(d);
    const t = idx.nodes.find((n) => n.node.data.startsWith('La mission')).node;
    const r = d.createRange(); r.setStart(t, 5); r.setEnd(t, 12); // « ssion d »
    const [s, e] = rangeOffsets(idx, r);
    expect(idx.text.slice(s, e)).toBe('mission débute');
  });

  it('pose des marquages à cheval sur plusieurs balises, puis les retire sans rien changer', () => {
    const d = make(html); const before = d.body.innerHTML; const text = buildIndex(d).text;
    const s = text.indexOf('mission'); const e = text.indexOf('novembre') + 'novembre'.length;
    applyMarks(d, [{ id: 'a1', s, e, cls: 'gc-cm', n: 1 }]);
    const marks = d.querySelectorAll('mark[data-gc]');
    expect(marks.length).toBeGreaterThan(1);
    expect(Array.from(marks).map((m) => m.textContent).join('')).toBe(text.slice(s, e));
    expect(marks[0].getAttribute('data-n')).toBe('1');
    expect(marks[1].hasAttribute('data-n')).toBe(false);
    expect(buildIndex(d).text).toBe(text); // les positions ne bougent jamais
    unwrapMarks(d);
    expect(d.querySelectorAll('mark').length).toBe(0);
    expect(d.body.textContent).toBe(d.body.textContent); // texte intact
    expect(buildIndex(d).text).toBe(text);
    expect(d.body.innerHTML.replace(/<script>.*<\/script>/, '')).toBe(before.replace(/<script>.*<\/script>/, ''));
  });

  it('gère deux marquages qui se chevauchent', () => {
    const d = make('<p>Un deux trois quatre cinq</p>'); const text = buildIndex(d).text;
    applyMarks(d, [{ id: 'a', s: 0, e: 12, cls: '' }, { id: 'b', s: 3, e: 20, cls: 'gc-cm', n: 2 }]);
    expect(buildIndex(d).text).toBe(text);
    expect(d.querySelectorAll('mark[data-id="b"]').length).toBeGreaterThan(0);
  });
});
