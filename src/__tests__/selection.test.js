import { describe, it, expect } from 'vitest';
import { splitSentences, sentenceIndexAt, hitAnnotation } from '../lib/selection';

const slice = (t, [s, e]) => t.slice(s, e);

describe('splitSentences', () => {
  it('découpe sur le point, le point d’interrogation et le point d’exclamation', () => {
    const t = 'Première phrase. Deuxième phrase ? Troisième !';
    expect(splitSentences(t).map((x) => slice(t, x))).toEqual(['Première phrase.', 'Deuxième phrase ?', 'Troisième !']);
  });
  it('ne coupe pas sur les abréviations, les initiales ni les nombres', () => {
    const t = 'Voir l’art. 12 du contrat, soit 3.5 mois env. selon M. Dupont. Fin.';
    expect(splitSentences(t).map((x) => slice(t, x))).toEqual(['Voir l’art. 12 du contrat, soit 3.5 mois env. selon M. Dupont.', 'Fin.']);
  });
  it('ne franchit jamais un changement de paragraphe', () => {
    const t = 'Titre sans point Le texte commence ici. Suite.';
    const breaks = [t.indexOf('Le texte')];
    expect(splitSentences(t, breaks).map((x) => slice(t, x))).toEqual(['Titre sans point', 'Le texte commence ici.', 'Suite.']);
  });
  it('garde un guillemet fermant avec sa phrase', () => {
    const t = 'Il a dit « oui. » Puis il est parti.';
    expect(splitSentences(t).map((x) => slice(t, x))).toEqual(['Il a dit « oui. »', 'Puis il est parti.']);
  });
  it('gère un texte vide ou sans ponctuation', () => {
    expect(splitSentences('')).toEqual([]);
    const t = 'Un simple titre';
    expect(splitSentences(t).map((x) => slice(t, x))).toEqual(['Un simple titre']);
  });
});

describe('sentenceIndexAt', () => {
  const t = 'Un. Deux. Trois.';
  const s = splitSentences(t);
  it('trouve la phrase qui contient la position', () => {
    expect(sentenceIndexAt(s, t.indexOf('Deux'))).toBe(1);
  });
  it('retombe sur la phrase précédente quand on touche l’espace entre deux phrases', () => {
    expect(sentenceIndexAt(s, t.indexOf('. D') + 1)).toBeLessThanOrEqual(1);
  });
  it('renvoie -1 s’il n’y a aucune phrase', () => { expect(sentenceIndexAt([], 3)).toBe(-1); });
});

describe('hitAnnotation', () => {
  const notes = [
    { id: 'h', kind: 'highlight', page: 1, rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }] },
    { id: 'c', kind: 'comment', page: 1, rects: [{ x: 0.2, y: 0.1, w: 0.2, h: 0.05 }] },
    { id: 'o', kind: 'comment', page: 2, rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.05 }] },
  ];
  it('préfère l’échange au simple surlignage quand ils se superposent', () => {
    expect(hitAnnotation(notes, 1, 0.3, 0.12).id).toBe('c');
  });
  it('trouve le surlignage seul ailleurs sur la ligne', () => {
    expect(hitAnnotation(notes, 1, 0.5, 0.12).id).toBe('h');
  });
  it('ignore les autres pages et les points hors zone', () => {
    expect(hitAnnotation(notes, 3, 0.3, 0.12)).toBeNull();
    expect(hitAnnotation(notes, 1, 0.9, 0.9)).toBeNull();
  });
});
