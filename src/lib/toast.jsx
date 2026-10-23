import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

/** toast('Texte') ou toast('Texte', { label: 'Annuler', onClick }) : l'action reste proposée 7 secondes. */
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [action, setAction] = useState(null);
  const [show, setShow] = useState(false);
  const timer = useRef();
  const toast = useCallback((text, act) => {
    setMsg(text); setAction(act || null); setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), act ? 7000 : 4000);
  }, []);
  const runAction = () => { const a = action; setShow(false); a?.onClick(); };
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast" className={`${show ? 'show' : ''}${action && show ? ' has-action' : ''}`} role="status" aria-live="polite">
        <span>{msg}</span>
        {action && show && <button type="button" onClick={runAction}>{action.label}</button>}
      </div>
    </Ctx.Provider>
  );
}
