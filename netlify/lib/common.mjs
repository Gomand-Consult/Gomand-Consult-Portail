// Utilitaires partagés par les fonctions Netlify (exécutées côté serveur uniquement).
import { createClient } from '@supabase/supabase-js';

export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

// Client « service » : contourne la sécurité par ligne. Ne jamais l'exposer au navigateur.
export function serviceClient() {
  return createClient(env('SUPABASE_URL', process.env.VITE_SUPABASE_URL), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Sous Node 20 (pas de WebSocket natif), supabase-js refuse de démarrer, même si la fonction n'utilise pas le temps réel.
    // On fournit donc un transport vide : il n'est jamais appelé ici.
    realtime: { transport: class NoRealtime {} },
  });
}

export const siteUrl = () => (process.env.SITE_URL || process.env.URL || '').replace(/\/$/, '');

// Identifie l'appelant à partir de son jeton de session Supabase et charge son profil.
export async function authenticate(req, sb) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await sb.from('profiles').select('id, role, client_id, full_name, email').eq('id', data.user.id).maybeSingle();
  return profile ? { user: data.user, profile } : null;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function emailHtml({ title, intro, cta, url }) {
  const privacyUrl = `${siteUrl()}/confidentialite`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F1F3F5;font-family:Montserrat,Arial,sans-serif;color:#252A2B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #D6DCDF;border-radius:10px">
<tr><td style="padding:32px 32px 8px"><p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#324A59">Gomand Consult</p></td></tr>
<tr><td style="padding:0 32px"><h1 style="margin:12px 0 16px;font-size:22px;line-height:1.25;font-weight:600">${esc(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4E6469">${esc(intro)}</p>
<p style="margin:0 0 32px"><a href="${esc(url)}" style="display:inline-block;background:#324A59;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px">${esc(cta)}</a></p></td></tr>
<tr><td style="padding:0 32px 28px"><p style="margin:0;font-size:12px;line-height:1.5;color:#536770;border-top:1px solid #D6DCDF;padding-top:16px">Vous recevez ce message car vous avez un espace client chez Gomand Consult. Pour votre sécurité, le contenu de vos échanges n'est jamais envoyé par email : connectez-vous pour le consulter. <a href="${esc(privacyUrl)}" style="color:#324A59">Politique de confidentialité</a></p></td></tr>
</table></td></tr></table></body></html>`;
}

// Envoi via Resend. Ne fait jamais échouer l'action de l'utilisateur : renvoie un état.
export async function sendEmail({ to, subject, title, intro, cta, url }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'RESEND_API_KEY non configurée' };
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!recipients.length) return { sent: false, reason: 'aucun destinataire' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('MAIL_FROM'),
      to: recipients,
      subject,
      html: emailHtml({ title, intro, cta, url }),
      text: `${title}\n\n${intro}\n\n${cta} : ${url}\n\nPolitique de confidentialité : ${siteUrl()}/confidentialite`,
    }),
  });
  if (!res.ok) return { sent: false, reason: `Resend a répondu ${res.status}` };
  return { sent: true };
}
