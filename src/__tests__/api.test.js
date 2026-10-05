import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'jeton' } } }) } } }));
import { deleteClient, inviteClient } from '../lib/api';

const respond = (status, body, type = 'application/json; charset=utf-8') =>
  Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } }));

beforeEach(() => { vi.restoreAllMocks(); });

describe('appels aux fonctions serveur', () => {
  it('ne prend jamais une page HTML pour un succès (adresse non branchée sur la fonction)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, '<!doctype html><html></html>', 'text/html')));
    await expect(deleteClient('id', 'nom')).rejects.toThrow(/fonction n’est pas disponible/);
  });
  it('réussit quand le serveur confirme', async () => {
    const f = vi.fn(() => respond(200, { ok: true }));
    vi.stubGlobal('fetch', f);
    await expect(deleteClient('abc', 'Maison Lambert')).resolves.toBeDefined();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/delete-account');
    expect(init.headers.authorization).toBe('Bearer jeton');
    expect(JSON.parse(init.body)).toEqual({ action: 'client', id: 'abc', confirm: 'Maison Lambert' });
  });
  it('transmet le message d’erreur du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(400, { error: 'Le nom saisi ne correspond pas à celui de l’entreprise.' })));
    await expect(deleteClient('abc', 'x')).rejects.toThrow('Le nom saisi ne correspond pas');
  });
  it('refuse un succès sans confirmation explicite', async () => {
    vi.stubGlobal('fetch', vi.fn(() => respond(200, { sent: true })));
    await expect(inviteClient({ email: 'a@b.be' })).rejects.toThrow('L’invitation a échoué.');
  });
  it('explique une panne réseau', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('network'))));
    await expect(deleteClient('abc', 'x')).rejects.toThrow(/ne répond pas/);
  });
});
