// Crée l'accès d'un client (ou d'un contact supplémentaire) et lui envoie l'invitation.
// Réservé à l'administrateur : la clé « service » ne quitte jamais ce fichier.
import { json, serviceClient, authenticate, siteUrl } from '../lib/common.mjs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });
  let sb;
  try { sb = serviceClient(); } catch (e) { console.error(e.message); return json(500, { error: `Le serveur n’est pas configuré. ${e.message}.` }); }

  const me = await authenticate(req, sb);
  if (!me) return json(401, { error: 'Connexion requise.' });
  if (me.profile.role !== 'admin') return json(403, { error: 'Accès réservé à l’administrateur.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Requête illisible.' }); }

  const email = clean(body.email, 254).toLowerCase();
  const fullName = clean(body.full_name, 200);
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Adresse email invalide.' });

  let clientId = clean(body.client_id, 64);
  let createdClient = false;

  if (clientId) {
    const { data: existing } = await sb.from('clients').select('id').eq('id', clientId).maybeSingle();
    if (!existing) return json(404, { error: 'Client introuvable.' });
  } else {
    const company = clean(body.company, 200);
    if (!company) return json(400, { error: 'Indiquez le nom de l’entreprise.' });
    const { data: created, error } = await sb.from('clients')
      .insert({ company, contact_name: fullName || null, project_title: clean(body.project_title, 300) || null })
      .select('id').single();
    if (error) return json(500, { error: 'Impossible de créer le client.' });
    clientId = created.id; createdClient = true;
  }

  const rollback = async (userId) => {
    if (userId) await sb.auth.admin.deleteUser(userId);
    if (createdClient) await sb.from('clients').delete().eq('id', clientId);
  };

  const { data: invited, error: inviteError } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl()}/definir-mot-de-passe`,
    data: { full_name: fullName },
  });
  if (inviteError || !invited?.user) {
    await rollback(null);
    const exists = /already|registered|exists/i.test(inviteError?.message || '');
    return json(exists ? 409 : 500, { error: exists ? 'Cette adresse email a déjà un accès.' : 'L’invitation n’a pas pu être envoyée. Vérifiez la configuration email de Supabase.' });
  }

  const { error: profileError } = await sb.from('profiles').insert({
    id: invited.user.id, role: 'client', client_id: clientId, full_name: fullName || null, email,
  });
  if (profileError) {
    await rollback(invited.user.id);
    return json(500, { error: 'Le profil n’a pas pu être créé.' });
  }

  return json(200, { ok: true, client_id: clientId });
};

