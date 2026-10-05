// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handle } from '../functions/delete-account.mjs';

const ADMIN = '11111111-1111-1111-1111-111111111111';
const CLIENT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

// Faux Supabase : enregistre l'ordre des opérations pour vérifier la séquence de suppression.
function fakeSb({ role = 'admin', failStorage = false, failUser = false } = {}) {
  const log = [];
  const files = {
    documents: { [CLIENT_ID]: [{ name: 'a.pdf', id: 'x' }] },
    photos: { [CLIENT_ID]: [{ name: 'g1', id: null }], [`${CLIENT_ID}/g1`]: [{ name: 'p.jpg', id: 'y' }, { name: 'p_t.jpg', id: 'z' }] },
  };
  const table = (name) => ({
    select: () => ({
      eq: (col, val) => {
        const rows = name === 'profiles' && col === 'client_id' ? [{ id: USER_ID, role: 'client' }] : [];
        const one = name === 'clients' ? (val === CLIENT_ID ? { id: CLIENT_ID, company: 'Maison Lambert' } : null)
          : name === 'profiles' && col === 'id' ? (val === ADMIN ? { id: ADMIN, role } : val === USER_ID ? { id: USER_ID, role: 'client' } : null) : null;
        return Object.assign(Promise.resolve({ data: rows }), { maybeSingle: async () => ({ data: one }) });
      },
    }),
    delete: () => ({ eq: async () => { log.push(`db:delete:${name}`); return { error: null }; } }),
  });
  return {
    log,
    auth: {
      getUser: async (t) => (t === 'tok' ? { data: { user: { id: ADMIN } }, error: null } : { data: null, error: { message: 'bad' } }),
      admin: { deleteUser: async (id) => { log.push(`auth:delete:${id}`); return { error: failUser ? { message: 'x' } : null }; } },
    },
    from: (n) => table(n),
    storage: {
      from: (bucket) => ({
        list: async (prefix) => ({ data: files[bucket][prefix] || [], error: null }),
        remove: async (paths) => { log.push(`storage:${bucket}:${paths.length}`); return { error: failStorage ? { message: 'x' } : null }; },
      }),
    },
  };
}
const req = (body, token = 'tok') => new Request('https://x/api/delete-account', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

describe('delete-account', () => {
  it('refuse sans connexion et pour un non-administrateur', async () => {
    expect((await handle(req({}, 'mauvais'), fakeSb())).status).toBe(401);
    expect((await handle(req({ action: 'client', id: CLIENT_ID }), fakeSb({ role: 'client' }))).status).toBe(403);
  });
  it('exige de retaper le nom exact de l’entreprise', async () => {
    const sb = fakeSb();
    const res = await handle(req({ action: 'client', id: CLIENT_ID, confirm: 'autre nom' }), sb);
    expect(res.status).toBe(400);
    expect(sb.log).toEqual([]); // rien n'a été supprimé
  });
  it('supprime fichiers, puis accès, puis client, dans cet ordre', async () => {
    const sb = fakeSb();
    const res = await handle(req({ action: 'client', id: CLIENT_ID, confirm: '  maison   LAMBERT ' }), sb);
    expect(res.status).toBe(200);
    expect(sb.log).toEqual(['storage:documents:1', 'storage:photos:2', `auth:delete:${USER_ID}`, 'db:delete:clients']);
  });
  it('s’arrête avant de toucher aux comptes si les fichiers ne peuvent pas être supprimés', async () => {
    const sb = fakeSb({ failStorage: true });
    const res = await handle(req({ action: 'client', id: CLIENT_ID, confirm: 'Maison Lambert' }), sb);
    expect(res.status).toBe(500);
    expect(sb.log.some((l) => l.startsWith('auth:') || l.startsWith('db:'))).toBe(false);
  });
  it('ne supprime pas le client si un accès résiste', async () => {
    const sb = fakeSb({ failUser: true });
    expect((await handle(req({ action: 'client', id: CLIENT_ID, confirm: 'Maison Lambert' }), sb)).status).toBe(500);
    expect(sb.log).not.toContain('db:delete:clients');
  });
  it('supprime un seul contact, jamais un administrateur ni soi-même', async () => {
    const sb = fakeSb();
    expect((await handle(req({ action: 'user', id: USER_ID }), sb)).status).toBe(200);
    expect(sb.log).toEqual([`auth:delete:${USER_ID}`]);
    expect((await handle(req({ action: 'user', id: ADMIN }), fakeSb())).status).toBe(403);
  });
  it('rejette un identifiant invalide ou une action inconnue', async () => {
    expect((await handle(req({ action: 'client', id: 'pas-un-uuid' }), fakeSb())).status).toBe(400);
    expect((await handle(req({ action: 'autre', id: CLIENT_ID }), fakeSb())).status).toBe(400);
  });
});
