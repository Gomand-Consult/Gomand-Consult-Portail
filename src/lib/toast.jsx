import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef();
  const toast = useCallback((text) => {
    setMsg(text); setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 4000);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  );
}
