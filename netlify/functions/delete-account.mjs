// Suppression définitive d'un client (avec ses accès, documents, photos et échanges) ou d'un seul contact.
// Réservé à l'administrateur. Droit à l'effacement (RGPD, article 17).
import { json, serviceClient, authenticate } from '../lib/common.mjs';

const BUCKETS = ['documents', 'photos'];
const CHUNK = 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Liste tous les fichiers d'un dossier, sous-dossiers compris (les dossiers n'ont pas d'identifiant).
async function listAll(sb, bucket, prefix, depth = 0) {
  const out = [];
  if (depth > 4) return out;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error('Lecture du stockage impossible');
    if (!data?.length) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) out.push(...(await listAll(sb, bucket, path, depth + 1)));
      else out.push(path);
    }
    if (data.length < 1000) break;
  }
  return out;
}

async function removePaths(sb, bucket, paths) {
  for (let i = 0; i < paths.length; i += CHUNK) {
    const { error } = await sb.storage.from(bucket).remove(paths.slice(i, i + CHUNK));
    if (error) throw new Error('Suppression de fichiers impossible');
  }
}

export async function handle(req, sb) {
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });

  const me = await authenticate(req, sb);
  if (!me) return json(401, { error: 'Connexion requise.' });
  if (me.profile.role !== 'admin') return json(403, { error: 'Accès réservé à l’administrateur.' });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Requête illisible.' }); }
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!UUID_RE.test(id)) return json(400, { error: 'Identifiant invalide.' });

  if (body.action === 'client') {
    const { data: client } = await sb.from('clients').select('id, company').eq('id', id).maybeSingle();
    if (!client) return json(404, { error: 'Client introuvable.' });
    // Garde-fou : il faut retaper le nom exact de l'entreprise.
    if (norm(body.confirm) !== norm(client.company)) return json(400, { error: 'Le nom saisi ne correspond pas à celui de l’entreprise.' });
    try {
      // 1. Les fichiers d'abord : s'ils échouent, rien d'autre n'est encore supprimé.
      for (const bucket of BUCKETS) await removePaths(sb, bucket, await listAll(sb, bucket, client.id));
      // 2. Les comptes de connexion (le profil suit automatiquement).
      const { data: people } = await sb.from('profiles').select('id, role').eq('client_id', client.id);
      for (const p of people || []) {
        if (p.role !== 'client') continue;
        const { error } = await sb.auth.admin.deleteUser(p.id);
        if (error) throw new Error('Suppression d’un accès impossible');
      }
      // 3. Enfin le client : documents, galeries, photos et échanges partent en cascade.
      const { error } = await sb.from('clients').delete().eq('id', client.id);
      if (error) throw new Error('Suppression du client impossible');
    } catch (e) {
      console.error('delete-account client:', e.message);
      return json(500, { error: 'La suppression n’a pas pu aller jusqu’au bout. Vous pouvez la relancer sans risque : elle reprendra là où elle s’est arrêtée.' });
    }
    console.log('delete-account: client supprimé', client.id);
    return json(200, { ok: true });
  }

  if (body.action === 'user') {
    const { data: target } = await sb.from('profiles').select('id, role').eq('id', id).maybeSingle();
    if (!target) return json(404, { error: 'Accès introuvable.' });
    if (target.role !== 'client' || target.id === me.user.id) return json(403, { error: 'Ce compte ne peut pas être supprimé ici.' });
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) { console.error('delete-account user:', error.message); return json(500, { error: 'La suppression de l’accès a échoué.' }); }
    console.log('delete-account: accès supprimé', id);
    return json(200, { ok: true });
  }

  return json(400, { error: 'Action inconnue.' });
}

export const config = { path: '/api/delete-account' };

export default async (req) => {
  let sb;
  try { sb = serviceClient(); } catch (e) { console.error(e.message); return json(500, { error: `Le serveur n’est pas configuré. ${e.message}.` }); }
  return handle(req, sb);
};
