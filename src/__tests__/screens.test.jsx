import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({ profile: null, anonymous: false, refresh: () => {} }));
vi.mock('../lib/auth', () => ({
  useAuth: () => (state.anonymous
    ? { loading: false, session: null, profile: null, profileError: null }
    : { loading: false, session: { user: { id: 'u1' } }, profile: state.profile, profileError: null, refresh: state.refresh }),
  AuthProvider: ({ children }) => children,
}));
vi.mock('../supabase', () => ({ supabase: {}, configured: true, initialUrlType: null, initialUrlError: null }));
vi.mock('../lib/api', () => ({
  signOut: vi.fn(), signIn: vi.fn(), sendReset: vi.fn(),
  getClient: vi.fn(), listDocuments: vi.fn(), listGalleries: vi.fn(), documentUrl: vi.fn(),
  getDocument: vi.fn(), listThreads: vi.fn(), markDocumentViewed: vi.fn(), createHighlight: vi.fn(), createThread: vi.fn(),
  addMessage: vi.fn(), setThreadStatus: vi.fn(), deleteAnnotation: vi.fn(), notify: vi.fn(),
  getGallery: vi.fn(), listPhotos: vi.fn(), signedUrls: vi.fn(), setDecision: vi.fn(), addPhotoMessage: vi.fn(),
  sendSelection: vi.fn(), markGalleryViewed: vi.fn(), markGallerySeen: vi.fn(),
  adminPending: vi.fn(), listClients: vi.fn(), inviteClient: vi.fn(),
  acceptPrivacy: vi.fn(), deleteClient: vi.fn(), removeUser: vi.fn(), exportClientData: vi.fn(), listProfiles: vi.fn(),
  createDocument: vi.fn(), updateDocumentStatus: vi.fn(), deleteDocument: vi.fn(), createGallery: vi.fn(), deleteGallery: vi.fn(),
}));
vi.mock('../components/PdfViewer', () => ({ default: ({ annotations }) => <div data-testid="pdf">{annotations.length} annotations</div> }));

import * as api from '../lib/api';
import { ToastProvider } from '../lib/toast';
import Login from '../pages/Login';
import ClientDashboard from '../pages/ClientDashboard';
import Gallery from '../pages/Gallery';
import DocumentViewer from '../pages/DocumentViewer';
import AdminHome from '../pages/admin/AdminHome';
import AdminClient from '../pages/admin/AdminClient';
import Privacy from '../pages/Privacy';
import PrivacyGate from '../pages/PrivacyGate';
import { PRIVACY_VERSION } from '../config';

const client = { id: 'c1', company: 'Maison Lambert', contact_name: 'Claire Dubois', project_title: 'Plan marketing 2027' };
const wrap = (ui, path, route) => render(
  <MemoryRouter initialEntries={[path]}><ToastProvider><Routes><Route path={route} element={ui} /></Routes></ToastProvider></MemoryRouter>,
);
beforeEach(() => { vi.clearAllMocks(); state.refresh = vi.fn(); state.anonymous = false; state.profile = { id: 'u1', role: 'client', client_id: 'c1', full_name: 'Claire Dubois' }; });

describe('Connexion', () => {
  it('affiche l’erreur renvoyée par le serveur', async () => {
    state.anonymous = true;
    api.signIn.mockRejectedValue(new Error('Adresse email ou mot de passe incorrect.'));
    wrap(<Login />, '/connexion', '/connexion');
    fireEvent.change(screen.getByLabelText('Adresse email'), { target: { value: 'a@b.be' } });
    fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');
  });
});

describe('Espace client', () => {
  it('range les documents par catégorie et signale les nouveautés', async () => {
    api.getClient.mockResolvedValue(client);
    api.listDocuments.mockResolvedValue([
      { id: 'd1', category: 'devis', title: 'Devis Lambert', status: 'Accepté', reference: 'D-1', created_at: '2026-09-15T10:00:00Z', first_viewed_at: '2026-09-16T10:00:00Z', annotations: [] },
      { id: 'd2', category: 'factures', title: 'Facture solde', status: 'À payer', created_at: '2026-10-02T10:00:00Z', first_viewed_at: null, annotations: [{ id: 'a', kind: 'question', status: 'open' }, { id: 'b', kind: 'highlight', status: 'open' }] },
    ]);
    api.listGalleries.mockResolvedValue([{ id: 'g1', title: 'Séance', created_at: '2026-10-03T10:00:00Z', first_viewed_at: null, sent_at: null, photos: [{ id: 'p1', decision: 'none' }, { id: 'p2', decision: 'approved' }] }]);
    wrap(<ClientDashboard clientId="c1" />, '/', '/');
    expect(await screen.findByRole('heading', { name: 'Plan marketing 2027' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Devis' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Factures' })).toBeInTheDocument();
    expect(screen.getAllByText('Nouveau').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 échange ouvert')).toHaveLength(2); // bandeau + ligne de la facture ; le surlignage ne compte pas
    expect(screen.getByRole('link', { name: 'Écrire sur WhatsApp' }).href).toContain('https://wa.me/32496903051');
    expect(screen.getByRole('link', { name: 'Écrire par email' }).href).toContain('mailto:anthony@gomandconsult.com');
  });
  it('n’affiche pas le bandeau de contact dans l’aperçu d’Anthony', async () => {
    state.profile = { id: 'a', role: 'admin', full_name: 'Anthony' };
    api.getClient.mockResolvedValue(client); api.listDocuments.mockResolvedValue([]); api.listGalleries.mockResolvedValue([]);
    wrap(<ClientDashboard clientId="c1" preview />, '/x', '/x');
    expect(await screen.findByText(/en tant qu’Anthony/)).toBeInTheDocument();
    expect(screen.queryByText('Écrire sur WhatsApp')).toBeNull();
  });
});

describe('Galerie photo', () => {
  const photos = ['p1', 'p2', 'p3'].map((id, i) => ({ id, gallery_id: 'g1', storage_path: `c1/g1/${id}.jpg`, thumb_path: `c1/g1/${id}_t.jpg`, alt: `Photo ${i + 1}`, decision: 'none', photo_messages: [] }));
  const setup = () => {
    api.getGallery.mockResolvedValue({ id: 'g1', client_id: 'c1', title: 'Séance du 30 septembre', note: 'Choisissez.', sent_at: null });
    api.listPhotos.mockResolvedValue(photos.map((p) => ({ ...p })));
    api.signedUrls.mockImplementation(async (_b, paths) => Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])));
    api.setDecision.mockResolvedValue(null);
    wrap(<Gallery />, '/galeries/g1', '/galeries/:id');
  };
  it('approuve, filtre et envoie la sélection', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Séance du 30 septembre' });
    const group = screen.getByRole('group', { name: 'Décision pour la photo 1' });
    fireEvent.click(within(group).getByRole('button', { name: 'Approuver' }));
    await waitFor(() => expect(api.setDecision).toHaveBeenCalledWith('p1', 'approved'));
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Approuvées/ }));
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('tile'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma sélection à Anthony' }));
    await waitFor(() => expect(api.sendSelection).toHaveBeenCalledWith('g1'));
    expect(api.notify).toHaveBeenCalledWith('selection_sent', 'g1');
  });
  it('annule la décision si le serveur la refuse', async () => {
    setup(); api.setDecision.mockRejectedValue(new Error('Refusé'));
    await screen.findByRole('heading', { name: 'Séance du 30 septembre' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Décision pour la photo 2' })).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(screen.getByText('0 sur 3')).toBeInTheDocument());
  });
  it('ouvre la visionneuse, envoie un commentaire et ferme avec Échap', async () => {
    setup(); api.addPhotoMessage.mockResolvedValue({ id: 'm1', body: 'Plus clair ?', author_name: 'Claire Dubois', author_role: 'client', created_at: new Date().toISOString() });
    await screen.findByRole('heading', { name: 'Séance du 30 septembre' });
    fireEvent.click(screen.getByRole('button', { name: 'Agrandir la photo 3' }));
    const dialog = await screen.findByRole('dialog', { name: 'Photo 3 sur 3' });
    fireEvent.change(within(dialog).getByLabelText('Commentaire sur cette photo'), { target: { value: 'Plus clair ?' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Envoyer le commentaire' }));
    await waitFor(() => expect(api.addPhotoMessage).toHaveBeenCalledWith('p3', 'Plus clair ?'));
    expect(api.notify).toHaveBeenCalledWith('photo_message', 'm1');
    expect(await within(dialog).findByText('À discuter')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByRole('dialog', { name: 'Photo 1 sur 3' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('cache les boutons de décision à Anthony', async () => {
    state.profile = { id: 'a', role: 'admin', full_name: 'Anthony' };
    setup();
    await screen.findByRole('heading', { name: 'Séance du 30 septembre' });
    expect(screen.queryByRole('button', { name: 'Approuver' })).toBeNull();
    expect(screen.getByText('Approuvées', { selector: 'dt' })).toBeInTheDocument();
    expect(api.markGallerySeen).toHaveBeenCalledWith('g1');
  });
});

describe('Lecture d’un document', () => {
  it('répond à un échange et le résout', async () => {
    api.getDocument.mockResolvedValue({ id: 'd1', client_id: 'c1', title: 'Audit', storage_path: 'c1/a.pdf', created_at: '2026-10-03T10:00:00Z', reference: null });
    api.documentUrl.mockResolvedValue('https://x/a.pdf');
    api.listThreads.mockResolvedValue([
      { id: 't1', kind: 'question', page: 2, status: 'open', quote: 'Un passage', rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }], created_at: '2026-10-03T10:00:00Z', author_id: 'u1',
        annotation_messages: [{ id: 'm1', body: 'Une question ?', author_name: 'Claire Dubois', author_role: 'client', created_at: '2026-10-03T10:00:00Z' }] },
      { id: 'h1', kind: 'highlight', page: 1, status: 'open', quote: 'Surligné', rects: [{ x: 0.1, y: 0.3, w: 0.2, h: 0.02 }], created_at: '2026-10-03T09:00:00Z', author_id: 'u1', author_name: 'Claire Dubois', annotation_messages: [] },
    ]);
    api.addMessage.mockResolvedValue({ id: 'm2', body: 'Merci', author_name: 'Claire Dubois', author_role: 'client', created_at: new Date().toISOString() });
    wrap(<DocumentViewer />, '/documents/d1', '/documents/:id');
    expect(await screen.findByText('Un passage')).toBeInTheDocument();
    expect(await screen.findByTestId('pdf')).toHaveTextContent('2 annotations');
    expect(api.markDocumentViewed).toHaveBeenCalledWith('d1');
    fireEvent.change(screen.getByLabelText('Répondre à l’échange 1'), { target: { value: 'Merci' } });
    fireEvent.click(screen.getByRole('button', { name: 'Répondre' }));
    await waitFor(() => expect(api.addMessage).toHaveBeenCalledWith('t1', 'Merci'));
    expect(api.notify).toHaveBeenCalledWith('annotation_message', 'm2');
    fireEvent.click(screen.getByRole('button', { name: 'Marquer comme résolu' }));
    await waitFor(() => expect(api.setThreadStatus).toHaveBeenCalledWith('t1', 'resolved'));
    fireEvent.click(screen.getByRole('tab', { name: /Surlignages/ }));
    expect(screen.getByText('Surligné')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument();
  });
});

describe('Back-office', () => {
  it('liste ce qui attend une réponse avec le bon lien', async () => {
    state.profile = { id: 'a', role: 'admin', full_name: 'Anthony' };
    api.adminPending.mockResolvedValue([
      { kind: 'doc_thread', ref_id: 't1', parent_id: 'd1', client_id: 'c1', title: 'Audit', happened_at: '2026-10-04T10:00:00Z', excerpt: 'Une question ?' },
      { kind: 'selection', ref_id: 'g1', parent_id: 'g1', client_id: 'c1', title: 'Séance', happened_at: '2026-10-04T11:00:00Z', excerpt: null },
    ]);
    api.listClients.mockResolvedValue([{ ...client, documents: [{ count: 3 }], galleries: [{ count: 1 }] }]);
    wrap(<AdminHome />, '/admin', '/admin');
    expect(await screen.findByText('Une question ?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Répondre' }).getAttribute('href')).toBe('/documents/d1?thread=t1');
    expect(screen.getByRole('link', { name: 'Voir la sélection' }).getAttribute('href')).toBe('/galeries/g1');
    expect(screen.getByText('3 documents, 1 galerie')).toBeInTheDocument();
  });
});

describe('Politique de confidentialité', () => {
  it('est lisible sans connexion et annonce l’absence de cookies publicitaires', () => {
    state.anonymous = true;
    wrap(<Privacy />, '/confidentialite', '/confidentialite');
    expect(screen.getByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    for (const h of ['Qui est responsable de vos données', 'Quelles données', 'Pourquoi', 'Qui reçoit', 'Combien de temps', 'Cookies', 'Vos droits', 'Sécurité']) {
      expect(screen.getByRole('heading', { level: 2, name: new RegExp(h) })).toBeInTheDocument();
    }
    expect(screen.getByText(/aucun cookie publicitaire/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'hello@gomandconsult.com' })[0].getAttribute('href')).toBe('mailto:hello@gomandconsult.com');
    expect(screen.getByText(/Irlande/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Retour à la connexion' }).length).toBeGreaterThan(0);
  });
});

describe('Accusé de réception de la politique', () => {
  it('bloque le bouton tant que la case n’est pas cochée, puis enregistre la version', async () => {
    api.acceptPrivacy.mockResolvedValue(null);
    wrap(<PrivacyGate />, '/', '/');
    const go = screen.getByRole('button', { name: 'Continuer' });
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/J’ai pris connaissance/));
    expect(go).toBeEnabled();
    fireEvent.click(go);
    await waitFor(() => expect(api.acceptPrivacy).toHaveBeenCalledWith(PRIVACY_VERSION));
    await waitFor(() => expect(state.refresh).toHaveBeenCalled());
  });
  it('affiche une erreur claire si l’enregistrement échoue', async () => {
    api.acceptPrivacy.mockRejectedValue(new Error('x'));
    wrap(<PrivacyGate />, '/', '/');
    fireEvent.click(screen.getByLabelText(/J’ai pris connaissance/));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('n’a pas pu être enregistré');
  });
});

describe('Suppression d’un client (back-office)', () => {
  const setupAdmin = () => {
    state.profile = { id: 'a', role: 'admin', full_name: 'Anthony' };
    api.getClient.mockResolvedValue(client);
    api.listDocuments.mockResolvedValue([]); api.listGalleries.mockResolvedValue([]);
    api.listProfiles.mockResolvedValue([{ id: 'p1', full_name: 'Claire Dubois', email: 'claire@lambert.be' }]);
    wrap(<AdminClient />, '/admin/clients/c1', '/admin/clients/:id');
  };
  it('exige le nom exact de l’entreprise avant d’activer la suppression', async () => {
    setupAdmin(); api.deleteClient.mockResolvedValue(null);
    await screen.findByRole('heading', { name: 'Maison Lambert' });
    const button = screen.getByRole('button', { name: 'Supprimer définitivement' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/retapez le nom/), { target: { value: 'maison' } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/retapez le nom/), { target: { value: 'maison lambert' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    await waitFor(() => expect(api.deleteClient).toHaveBeenCalledWith('c1', 'maison lambert'));
  });
  it('affiche l’erreur du serveur si la suppression échoue', async () => {
    setupAdmin(); api.deleteClient.mockRejectedValue(new Error('La suppression n’a pas pu aller jusqu’au bout.'));
    await screen.findByRole('heading', { name: 'Maison Lambert' });
    fireEvent.change(screen.getByLabelText(/retapez le nom/), { target: { value: 'Maison Lambert' } });
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('pas pu aller jusqu’au bout');
  });
  it('retire l’accès d’un contact après confirmation', async () => {
    setupAdmin(); api.removeUser.mockResolvedValue(null);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await screen.findByText('claire@lambert.be');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’accès' }));
    await waitFor(() => expect(api.removeUser).toHaveBeenCalledWith('p1'));
  });
  it('ne supprime rien si la confirmation est refusée', async () => {
    setupAdmin(); vi.spyOn(window, 'confirm').mockReturnValue(false);
    await screen.findByText('claire@lambert.be');
    fireEvent.click(screen.getByRole('button', { name: 'Retirer l’accès' }));
    expect(api.removeUser).not.toHaveBeenCalled();
  });
  it('propose l’export des données', async () => {
    setupAdmin(); api.exportClientData.mockResolvedValue({ client });
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    await screen.findByRole('heading', { name: 'Maison Lambert' });
    fireEvent.click(screen.getByRole('button', { name: 'Exporter les données (JSON)' }));
    await waitFor(() => expect(api.exportClientData).toHaveBeenCalledWith('c1'));
  });
});
