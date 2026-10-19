// Affiche une page HTML autonome dans un cadre isolé (sandbox) : pas de script, pas d'accès à la session du portail.
// Le sandbox sans « allow-same-origin » interdit toute lecture du stockage ou des cookies du portail.
export default function HtmlViewer({ html, title }) {
  return (
    <iframe
      className="html-frame"
      title={title || 'Document'}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  );
}
