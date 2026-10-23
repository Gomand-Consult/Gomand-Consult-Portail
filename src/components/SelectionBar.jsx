import { useRef } from 'react';

/**
 * Actions sur le passage choisi.
 * - Écran tactile : barre ancrée en bas de l'écran. Elle ne masque pas le texte et ne se heurte
 *   jamais au menu natif du téléphone (Copier, Partager…) qui s'affiche au-dessus de la sélection.
 * - Souris : petite barre flottante au-dessus du passage (ou en dessous s'il est trop près du haut).
 */
export default function SelectionBar({ sel, coarse, onHighlight, onComment, onExtend, onReduce, onClose, onHold }) {
  const ref = useRef(null);
  // Un appui sur la barre ne doit pas faire perdre la sélection ni faire disparaître la barre.
  const keep = { onMouseDown: (e) => e.preventDefault(), onPointerDown: (e) => { e.preventDefault(); onHold(true); }, onPointerUp: () => onHold(false), onPointerCancel: () => onHold(false) };
  const canReduce = sel.source === 'tap' && sel.to > sel.from;

  if (coarse) {
    return (
      <div id="seltool" className="dock" role="toolbar" aria-label="Actions sur le passage sélectionné" ref={ref} {...keep}>
        <p className="dock-quote" aria-live="polite"><span>{typeof sel.rects?.[0]?.s === 'number' ? 'Document' : `Page ${sel.page}`}</span> {sel.quote}</p>
        <div className="dock-row">
          <button type="button" className="primary" onClick={onHighlight}>Surligner</button>
          <button type="button" className="primary" onClick={onComment}>Commenter</button>
        </div>
        <div className="dock-row sub">
          {sel.source === 'tap' && <button type="button" onClick={onExtend} aria-label="Ajouter la phrase suivante">+ Phrase</button>}
          {canReduce && <button type="button" onClick={onReduce} aria-label="Retirer la dernière phrase">− Phrase</button>}
          <button type="button" className="close" onClick={onClose} aria-label="Annuler la sélection">Annuler</button>
        </div>
      </div>
    );
  }

  const headerH = document.querySelector('.site-header')?.offsetHeight || 88;
  const below = sel.anchor.top - 52 < headerH + 8; // l'en-tête fixe masquerait la barre : on l'affiche sous le passage
  const top = below ? sel.anchor.bottom + 10 : sel.anchor.top - 52;
  const left = Math.max(8, Math.min(sel.anchor.left + sel.anchor.width / 2 - 110, window.innerWidth - 232));
  return (
    <div id="seltool" role="toolbar" aria-label="Actions sur le passage sélectionné" ref={ref} style={{ top, left }} {...keep}>
      <button type="button" onClick={onHighlight}>Surligner <kbd>H</kbd></button>
      <button type="button" onClick={onComment}>Commenter <kbd>C</kbd></button>
    </div>
  );
}
