// Toutes les communications avec Supabase passent par ce fichier.
import { supabase } from '../supabase';
import { resizeToJpeg } from './images';
import { MAX_PDF_MB } from '../config';

const ok = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Une erreur est survenue.');
  return data;
};
const uuid = () => crypto.randomUUID();

// ------------------------------------------------------------ Connexion ----
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    if (/invalid login/i.test(error.message)) throw new Error('Adresse email ou mot de passe incorrect.');
    if (/rate|too many/i.test(error.message)) throw new Error('Trop de tentatives. Patientez quelques minutes avant de réessayer.');
    throw new Error('La connexion a échoué. Réessayez dans un instant.');
  }
}
export const signOut = () => supabase.auth.signOut();
export async function sendReset(email) {
  // Réponse volontairement neutre : on ne révèle jamais si une adresse existe.
  await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/definir-mot-de-passe` });
}
export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (/same/i.test(error.message)) throw new Error('Choisissez un mot de passe différent de l’ancien.');
    if (/weak|pwned|compromised|easy to guess/i.test(error.message)) throw new Error('Ce mot de passe est trop courant. Choisissez-en un plus original.');
    throw new Error('Le mot de passe n’a pas pu être enregistré.');
  }
}
export const acceptPrivacy = async (version) => ok(await supabase.rpc('accept_privacy', { p_version: version }));
export const fetchProfile = async (uid) => ok(await supabase.from('profiles').select('*').eq('id', uid).maybeSingle());

// -------------------------------------------------------------- Clients ----
export const getClient = async (id) => ok(await supabase.from('clients').select('*').eq('id', id).maybeSingle());
export const listClients = async () =>
  ok(await supabase.from('clients').select('*, documents(count), galleries(count)').order('created_at', { ascending: false }));
export const listProfiles = async (clientId) =>
  ok(await supabase.from('profiles').select('id, full_name, email, created_at').eq('client_id', clientId).order('created_at'));

export async function inviteClient(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/invite-client', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'L’invitation a échoué.');
  return body;
}

export async function deleteAccount(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/delete-account', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'La suppression a échoué.');
}
export const deleteClient = (clientId, confirm) => deleteAccount({ action: 'client', id: clientId, confirm });
export const removeUser = (userId) => deleteAccount({ action: 'user', id: userId });

// Copie complète des données d'un client (droit d'accès et de portabilité). Les fichiers eux-mêmes ne sont pas inclus.
export async function exportClientData(clientId) {
  const [client, people, documents, galleries] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle().then(ok),
    supabase.from('profiles').select('full_name, email, created_at, privacy_accepted_at, privacy_version').eq('client_id', clientId).then(ok),
    supabase.from('documents').select('*, annotations(*, annotation_messages(*))').eq('client_id', clientId).then(ok),
    supabase.from('galleries').select('*, photos(*, photo_messages(*))').eq('client_id', clientId).then(ok),
  ]);
  return { exported_at: new Date().toISOString(), client, people, documents, galleries };
}

// ------------------------------------------------------------ Documents ----
export const listDocuments = async (clientId) =>
  ok(await supabase.from('documents').select('*, annotations(id, status, kind)').eq('client_id', clientId).order('created_at', { ascending: false }));
export const getDocument = async (id) =>
  ok(await supabase.from('documents').select('*, clients(company)').eq('id', id).maybeSingle());
export async function documentUrl(path, downloadAs) {
  const opts = downloadAs ? { download: downloadAs } : undefined;
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 3600, opts);
  if (error) throw new Error('Le document est momentanément inaccessible.');
  return data.signedUrl;
}
export const markDocumentViewed = (id) => supabase.rpc('mark_document_viewed', { p_doc: id });

export async function createDocument({ clientId, category, title, reference, status, file }) {
  if (file.type !== 'application/pdf') throw new Error('Le fichier doit être un PDF.');
  if (file.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`Le PDF dépasse ${MAX_PDF_MB} Mo.`);
  const head = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (!head.startsWith('%PDF')) throw new Error('Ce fichier n’est pas un PDF valide.');
  const path = `${clientId}/${uuid()}.pdf`;
  const up = await supabase.storage.from('documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error('L’envoi du fichier a échoué.');
  const res = await supabase.from('documents').insert({
    client_id: clientId, category, title, reference: reference || null, status, storage_path: path, file_name: file.name,
  }).select().single();
  if (res.error) { await supabase.storage.from('documents').remove([path]); throw new Error('Le document n’a pas pu être enregistré.'); }
  return res.data;
}
export const updateDocumentStatus = async (id, status) => ok(await supabase.from('documents').update({ status }).eq('id', id));
export async function deleteDocument(doc) {
  await supabase.storage.from('documents').remove([doc.storage_path]);
  ok(await supabase.from('documents').delete().eq('id', doc.id));
}

// ---------------------------------------------------------- Annotations ----
export const listThreads = async (documentId) =>
  ok(await supabase.from('annotations').select('*, annotation_messages(*)').eq('document_id', documentId).order('created_at'));
export const createHighlight = async ({ documentId, page, rects, quote }) =>
  ok(await supabase.from('annotations').insert({ document_id: documentId, kind: 'highlight', page, rects, quote }).select().single());
export async function createThread({ documentId, kind, page, rects, quote, body }) {
  const ann = ok(await supabase.from('annotations').insert({ document_id: documentId, kind, page, rects, quote }).select().single());
  const msg = await supabase.from('annotation_messages').insert({ annotation_id: ann.id, body }).select().single();
  if (msg.error) { await supabase.from('annotations').delete().eq('id', ann.id); throw new Error('Le message n’a pas pu être envoyé.'); }
  return { annotation: ann, message: msg.data };
}
export const addMessage = async (annotationId, body) =>
  ok(await supabase.from('annotation_messages').insert({ annotation_id: annotationId, body }).select().single());
export const setThreadStatus = async (id, status) => ok(await supabase.from('annotations').update({ status }).eq('id', id));
export const deleteAnnotation = async (id) => ok(await supabase.from('annotations').delete().eq('id', id));

// ------------------------------------------------------------- Galeries ----
export const listGalleries = async (clientId) =>
  ok(await supabase.from('galleries').select('*, photos(id, decision)').eq('client_id', clientId).order('created_at', { ascending: false }));
export const getGallery = async (id) =>
  ok(await supabase.from('galleries').select('*, clients(company)').eq('id', id).maybeSingle());
export const listPhotos = async (galleryId) =>
  ok(await supabase.from('photos').select('*, photo_messages(*)').eq('gallery_id', galleryId).order('position').order('created_at'));
export async function signedUrls(bucket, paths) {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw new Error('Les photos sont momentanément inaccessibles.');
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
export const setDecision = async (photoId, decision) => ok(await supabase.rpc('set_photo_decision', { p_photo: photoId, p_decision: decision }));
export const addPhotoMessage = async (photoId, body) =>
  ok(await supabase.from('photo_messages').insert({ photo_id: photoId, body }).select().single());
export const sendSelection = async (galleryId) => ok(await supabase.rpc('send_gallery_selection', { p_gallery: galleryId }));
export const markGalleryViewed = (id) => supabase.rpc('mark_gallery_viewed', { p_gallery: id });
export const markGallerySeen = (id) => supabase.from('galleries').update({ seen_at: new Date().toISOString() }).eq('id', id);

export async function createGallery({ clientId, title, note, files, onProgress }) {
  const gallery = ok(await supabase.from('galleries').insert({ client_id: clientId, title, note: note || null }).select().single());
  const uploaded = [];
  try {
    const rows = [];
    for (let i = 0; i < files.length; i++) {
      const base = `${clientId}/${gallery.id}/${uuid()}`;
      const [full, thumb] = await Promise.all([resizeToJpeg(files[i], 2400, 0.85), resizeToJpeg(files[i], 800, 0.8)]);
      const a = await supabase.storage.from('photos').upload(`${base}.jpg`, full, { contentType: 'image/jpeg' });
      if (a.error) throw new Error('L’envoi d’une photo a échoué.');
      uploaded.push(`${base}.jpg`);
      const b = await supabase.storage.from('photos').upload(`${base}_t.jpg`, thumb, { contentType: 'image/jpeg' });
      if (b.error) throw new Error('L’envoi d’une photo a échoué.');
      uploaded.push(`${base}_t.jpg`);
      rows.push({ gallery_id: gallery.id, storage_path: `${base}.jpg`, thumb_path: `${base}_t.jpg`, position: i, alt: `Photo ${i + 1}` });
      onProgress?.(i + 1, files.length);
    }
    ok(await supabase.from('photos').insert(rows));
    return gallery;
  } catch (e) {
    if (uploaded.length) await supabase.storage.from('photos').remove(uploaded);
    await supabase.from('galleries').delete().eq('id', gallery.id);
    throw e;
  }
}
export async function deleteGallery(gallery) {
  const photos = ok(await supabase.from('photos').select('storage_path, thumb_path').eq('gallery_id', gallery.id));
  const paths = photos.flatMap((p) => [p.storage_path, p.thumb_path]);
  if (paths.length) await supabase.storage.from('photos').remove(paths);
  ok(await supabase.from('galleries').delete().eq('id', gallery.id));
}

// ------------------------------------------------------------ Back-office ----
export const adminPending = async () => ok(await supabase.rpc('admin_pending'));

// ---------------------------------------------------------- Notifications ----
// Silencieux : une notification qui échoue ne doit jamais bloquer l'action de la personne.
export async function notify(event, id) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ event, id }),
    });
  } catch { /* ignoré */ }
}
