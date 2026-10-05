// Envoie les emails de prévenance. Le navigateur n'indique QUE le type d'événement et un identifiant :
// destinataires, objet et lien sont déterminés ici, d'après la base. Chaque événement ne notifie qu'une fois
// (colonne notified_at) et uniquement s'il est récent, donc impossible de s'en servir pour spammer.
import { json, serviceClient, authenticate, siteUrl, sendEmail } from '../lib/common.mjs';

const FRESH_MS = 30 * 60 * 1000;
const fresh = (iso) => iso && Date.now() - new Date(iso).getTime() < FRESH_MS;

async function clientUsers(sb, clientId) {
  const { data } = await sb.from('profiles').select('email').eq('client_id', clientId).eq('role', 'client');
  return (data || []).map((p) => p.email).filter(Boolean);
}
const adminEmail = () => process.env.ADMIN_EMAIL;

// Chaque gestionnaire renvoie { markTable, markId, mail } ou null s'il n'y a rien à envoyer.
const handlers = {
  async annotation_message(sb, me, id) {
    const { data: m } = await sb.from('annotation_messages').select('id, author_id, created_at, notified_at, annotations(document_id, documents(id, title, client_id, clients(company)))').eq('id', id).maybeSingle();
    if (!m || m.author_id !== me.user.id || m.notified_at || !fresh(m.created_at)) return null;
    const doc = m.annotations.documents; const url = `${siteUrl()}/documents/${doc.id}`;
    return { table: 'annotation_messages', id, mail: me.profile.role === 'admin'
      ? { to: await clientUsers(sb, doc.client_id), subject: `Anthony a répondu sur « ${doc.title} »`, title: 'Vous avez une réponse', intro: `Anthony a répondu à votre message sur le document « ${doc.title} ».`, cta: 'Lire la réponse', url }
      : { to: adminEmail(), subject: `${doc.clients.company} a écrit sur « ${doc.title} »`, title: 'Nouveau message d’un client', intro: `${doc.clients.company} a laissé un message sur le document « ${doc.title} ».`, cta: 'Ouvrir le document', url } };
  },
  async photo_message(sb, me, id) {
    const { data: m } = await sb.from('photo_messages').select('id, author_id, created_at, notified_at, photos(gallery_id, galleries(id, title, client_id, clients(company)))').eq('id', id).maybeSingle();
    if (!m || m.author_id !== me.user.id || m.notified_at || !fresh(m.created_at)) return null;
    const g = m.photos.galleries; const url = `${siteUrl()}/galeries/${g.id}`;
    return { table: 'photo_messages', id, mail: me.profile.role === 'admin'
      ? { to: await clientUsers(sb, g.client_id), subject: `Anthony a répondu sur « ${g.title} »`, title: 'Vous avez une réponse', intro: `Anthony a répondu à votre message sur une photo de « ${g.title} ».`, cta: 'Voir la galerie', url }
      : { to: adminEmail(), subject: `${g.clients.company} a commenté une photo`, title: 'Nouveau commentaire sur une photo', intro: `${g.clients.company} a commenté une photo de la galerie « ${g.title} ».`, cta: 'Ouvrir la galerie', url } };
  },
  async selection_sent(sb, me, id) {
    const { data: g } = await sb.from('galleries').select('id, title, client_id, sent_at, notified_at, clients(company)').eq('id', id).maybeSingle();
    if (!g || me.profile.client_id !== g.client_id || g.notified_at || !fresh(g.sent_at)) return null;
    return { table: 'galleries', id, mail: { to: adminEmail(), subject: `${g.clients.company} a envoyé sa sélection de photos`, title: 'Sélection de photos reçue', intro: `${g.clients.company} a envoyé sa sélection pour la galerie « ${g.title} ».`, cta: 'Voir la sélection', url: `${siteUrl()}/galeries/${g.id}` } };
  },
  async document_published(sb, me, id) {
    if (me.profile.role !== 'admin') return null;
    const { data: d } = await sb.from('documents').select('id, title, client_id, created_at, notified_at').eq('id', id).maybeSingle();
    if (!d || d.notified_at || !fresh(d.created_at)) return null;
    return { table: 'documents', id, mail: { to: await clientUsers(sb, d.client_id), subject: 'Un nouveau document est disponible', title: 'Nouveau document', intro: `Le document « ${d.title} » vient d’être ajouté à votre espace client.`, cta: 'Consulter le document', url: `${siteUrl()}/documents/${d.id}` } };
  },
  async gallery_published(sb, me, id) {
    if (me.profile.role !== 'admin') return null;
    const { data: g } = await sb.from('galleries').select('id, title, client_id, created_at, notified_at').eq('id', id).maybeSingle();
    if (!g || g.notified_at || !fresh(g.created_at)) return null;
    return { table: 'galleries', id, mail: { to: await clientUsers(sb, g.client_id), subject: 'Une nouvelle galerie photo vous attend', title: 'Nouvelle galerie photo', intro: `La galerie « ${g.title} » est prête : approuvez, refusez ou commentez chaque photo.`, cta: 'Voir la galerie', url: `${siteUrl()}/galeries/${g.id}` } };
  },
};

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  let sb;
  try { sb = serviceClient(); } catch { return json(500, { error: 'Le serveur n’est pas configuré.' }); }
  const me = await authenticate(req, sb);
  if (!me) return json(401, { error: 'Connexion requise.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Requête illisible.' }); }
  const handler = handlers[body?.event];
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!handler || !/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Événement inconnu.' });

  try {
    const job = await handler(sb, me, id);
    if (!job) return json(200, { sent: false, reason: 'rien à envoyer' });
    // On « réserve » l'envoi avant d'écrire à Resend : un second appel concurrent ne peut pas doubler l'email.
    const { data: claimed } = await sb.from(job.table).update({ notified_at: new Date().toISOString() }).eq('id', job.id).is('notified_at', null).select('id');
    if (!claimed?.length) return json(200, { sent: false, reason: 'déjà envoyé' });
    const result = await sendEmail(job.mail);
    if (!result.sent) await sb.from(job.table).update({ notified_at: null }).eq('id', job.id);
    return json(200, result);
  } catch (e) {
    console.error('notify:', e?.message);
    return json(200, { sent: false, reason: 'erreur serveur' });
  }
};

