export const NBSP = '\u00a0';
// Typographie française : espace insécable avant : ; ! ? » et après «
export function fr(s) {
  return String(s ?? '').replace(/ ([:;!?»€%])/g, NBSP + '$1').replace(/«\s/g, '«' + NBSP);
}
const day = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
const dayShort = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short' });
const time = new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' });
export const fmtDate = (iso) => (iso ? day.format(new Date(iso)) : '');
export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayShort.format(d)} à ${time.format(d)}`;
};
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
