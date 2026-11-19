import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ uploads: [], removed: [], inserted: null, insertError: null, uploadFail: null }));
vi.mock('../lib/images', () => ({ resizeToJpeg: vi.fn(async () => new Blob(['t'], { type: 'image/jpeg' })) }));
vi.mock('../supabase', () => ({
  supabase: {
    storage: { from: () => ({
      upload: async (path, _f, opts) => (h.uploadFail && path.includes(h.uploadFail) ? { error: { message: 'x' } } : (h.uploads.push({ path, opts }), { error: null })),
      remove: async (p) => { h.removed.push(...p); return { error: null }; },
    }) },
    from: () => ({ insert: (rows) => { h.inserted = rows; return { select: async () => (h.insertError ? { data: null, error: { message: 'refusé' } } : { data: rows.map((r, i) => ({ ...r, id: `id${i}` })), error: null }) }; } }),
  },
}));
import { createFiles } from '../lib/api';

const file = (name, type, size = 10) => { const f = new File(['x'], name, { type }); Object.defineProperty(f, 'size', { value: size }); return f; };
beforeEach(() => { h.uploads = []; h.removed = []; h.inserted = null; h.insertError = null; h.uploadFail = null; });

describe('dépôt de fichiers', () => {
  it('range les originaux sous <client>/<dépôt>/ et crée une miniature pour les images', async () => {
    const rows = await createFiles({ clientId: 'c1', lot: 'Annonce', files: [file('Salon été.JPG', 'image/jpeg'), file('plan.pdf', 'application/pdf')] });
    expect(rows).toHaveLength(2);
    expect(h.uploads.map((u) => u.path).filter((p) => /^c1\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|pdf)$/.test(p))).toHaveLength(2);
    expect(h.uploads.some((u) => u.path.endsWith('_t.jpg'))).toBe(true);
    expect(h.inserted[0]).toMatchObject({ client_id: 'c1', lot: 'Annonce', name: 'Salon été.JPG', mime: 'image/jpeg' });
    expect(h.inserted[0].thumb_path).toMatch(/_t\.jpg$/);
    expect(h.inserted[1].thumb_path).toBeNull();
    const batches = new Set(h.inserted.map((r) => r.storage_path.split('/')[1]));
    expect(batches.size).toBe(1); // un seul dépôt
  });
  it('refuse un fichier trop lourd avant tout envoi', async () => {
    await expect(createFiles({ clientId: 'c1', files: [file('gros.zip', 'application/zip', 51 * 1024 * 1024)] })).rejects.toThrow(/dépasse 50 Mo/);
    expect(h.uploads).toHaveLength(0);
  });
  it('nettoie le stockage si l’enregistrement échoue', async () => {
    h.insertError = true;
    await expect(createFiles({ clientId: 'c1', files: [file('a.pdf', 'application/pdf')] })).rejects.toThrow();
    expect(h.removed).toEqual(h.uploads.map((u) => u.path));
  });
  it('nettoie ce qui a déjà été envoyé si un fichier échoue', async () => {
    h.uploadFail = 'zzz';
    const bad = file('b.pdf', 'application/pdf');
    // 1er fichier ok ; le 2e échoue car son chemin contient « .zzz »
    await expect(createFiles({ clientId: 'c1', files: [file('a.pdf', 'application/pdf'), file('b.zzz', 'application/octet-stream')] })).rejects.toThrow(/b\.zzz/);
    expect(h.removed).toHaveLength(1);
    void bad;
  });
});
