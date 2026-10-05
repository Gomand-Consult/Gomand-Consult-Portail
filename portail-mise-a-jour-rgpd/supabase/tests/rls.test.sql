-- Tests de sécurité : à exécuter sur une base de test qui contient stub_supabase.sql puis schema.sql.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

drop schema if exists t cascade;
create schema t;
grant usage on schema t to authenticated, anon;
create function t.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function t.as_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); execute 'set local role anon'; end $$;
create function t.as_super() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
create function t.eq(label text, actual bigint, expected bigint) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'ECHEC % : obtenu %, attendu %', label, actual, expected; end if;
  raise notice 'OK    %', label;
end $$;
create function t.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute stmt; get diagnostics n = row_count; return n; end $$;
create function t.fails(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then raise notice 'OK    % (refusé : %)', label, left(sqlerrm, 70); return;
  end;
  raise exception 'ECHEC % : aurait dû être refusé', label;
end $$;
grant execute on all functions in schema t to authenticated, anon;

begin;
-- Données de départ (superutilisateur)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'anthony@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'claire@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'julien@example.test');
insert into public.clients (id, company) values
  ('00000000-0000-0000-0000-0000000000c1', 'Maison Lambert'),
  ('00000000-0000-0000-0000-0000000000c2', 'Atelier Verhaegen');
insert into public.profiles (id, role, client_id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin',  null, 'Anthony Gomand', 'anthony@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'client', '00000000-0000-0000-0000-0000000000c1', 'Claire Dubois', 'claire@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'client', '00000000-0000-0000-0000-0000000000c2', 'Julien Verhaegen', 'julien@example.test');
insert into public.documents (id, client_id, category, title, storage_path) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'devis', 'Devis Lambert', '00000000-0000-0000-0000-0000000000c1/a.pdf'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'devis', 'Devis Verhaegen', '00000000-0000-0000-0000-0000000000c2/b.pdf');
insert into public.galleries (id, client_id, title) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Galerie Lambert'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', 'Galerie Verhaegen');
insert into public.photos (id, gallery_id, storage_path, thumb_path) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'c1/p1.jpg', 'c1/p1_t.jpg'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2', 'c2/p2.jpg', 'c2/p2_t.jpg');
insert into storage.objects (bucket_id, name) values
  ('documents', '00000000-0000-0000-0000-0000000000c1/a.pdf'),
  ('documents', '00000000-0000-0000-0000-0000000000c2/b.pdf'),
  ('photos',    '00000000-0000-0000-0000-0000000000c1/g/x.jpg');

-- 1. Le client 1 ne voit que son entreprise
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.eq('client1 voit 1 entreprise',   (select count(*) from public.clients), 1);
select t.eq('client1 voit 1 document',     (select count(*) from public.documents), 1);
select t.eq('client1 voit 1 galerie',      (select count(*) from public.galleries), 1);
select t.eq('client1 voit 1 photo',        (select count(*) from public.photos), 1);
select t.eq('client1 ne voit que son profil', (select count(*) from public.profiles), 1);
select t.eq('client1 voit 2 objets de stockage (documents + photos de son dossier)', (select count(*) from storage.objects), 2);
select t.eq('client1 ne voit pas le document de l''autre', (select count(*) from public.documents where id = '00000000-0000-0000-0000-0000000000d2'), 0);

-- 2. Le client ne peut rien créer ni modifier de ce qui appartient à Anthony
select t.fails('client1 ne peut pas ajouter de document', $$insert into public.documents (client_id, category, title, storage_path) values ('00000000-0000-0000-0000-0000000000c1','devis','x','x')$$);
select t.fails('client1 ne peut pas créer de profil admin', $$insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')$$);
select t.fails('client1 ne peut pas se promouvoir admin', $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000b1'$$);
select t.fails('client1 ne peut pas déposer dans le stockage', $$insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-0000000000c1/hack.pdf')$$);
select t.fails('client1 ne peut pas créer de galerie', $$insert into public.galleries (client_id, title) values ('00000000-0000-0000-0000-0000000000c1','x')$$);
select t.eq('client1 ne modifie pas le statut d''un document (0 ligne)', t.affected($$update public.documents set status = 'Payée'$$), 0);
select t.eq('client1 ne modifie pas une galerie directement (0 ligne)', t.affected($$update public.galleries set sent_at = now()$$), 0);
select t.eq('client1 ne modifie pas une photo directement (0 ligne)', t.affected($$update public.photos set decision = 'approved'$$), 0);

-- 3. Annotations : seulement sur ses documents, auteur imposé par le serveur
select t.fails('client1 ne peut pas annoter le document de l''autre', $$insert into public.annotations (document_id, kind, page, rects) values ('00000000-0000-0000-0000-0000000000d2','comment',1,'[{"x":0.1,"y":0.1,"w":0.2,"h":0.02}]')$$);
select t.fails('client1 ne peut pas imposer author_role', $$insert into public.annotations (document_id, kind, page, rects, author_role) values ('00000000-0000-0000-0000-0000000000d1','comment',1,'[{"x":0.1,"y":0.1,"w":0.2,"h":0.02}]','admin')$$);
select t.fails('client1 ne peut pas imposer created_at', $$insert into public.annotations (document_id, kind, page, rects, created_at) values ('00000000-0000-0000-0000-0000000000d1','comment',1,'[{"x":0.1,"y":0.1,"w":0.2,"h":0.02}]','2020-01-01')$$);
insert into public.annotations (document_id, kind, page, rects, quote) values
  ('00000000-0000-0000-0000-0000000000d1', 'question', 1, '[{"x":0.1,"y":0.1,"w":0.2,"h":0.02}]', 'passage') returning id as ann1 \gset
insert into public.annotation_messages (annotation_id, body) values (:'ann1', 'Une question ?');
select t.eq('annotation : rôle imposé = client', (select count(*) from public.annotations where author_role = 'client' and author_name = 'Claire Dubois'), 1);
select t.eq('message : rôle imposé = client',   (select count(*) from public.annotation_messages where author_role = 'client'), 1);
select t.fails('client1 ne peut pas changer le texte cité', $$update public.annotations set quote = 'falsifié'$$);
select t.eq('client1 peut résoudre un échange', t.affected($$update public.annotations set status = 'resolved'$$), 1);
insert into public.annotation_messages (annotation_id, body) values (:'ann1', 'Finalement une précision');
select t.eq('un nouveau message rouvre l''échange', (select count(*) from public.annotations where status = 'open'), 1);
select t.eq('client1 ne peut pas supprimer un message (0 ligne)', t.affected($$delete from public.annotation_messages$$), 0);
select t.fails('client1 ne peut pas écrire à la place d''un autre auteur', $$insert into public.annotation_messages (annotation_id, body, author_id) values ((select id from public.annotations limit 1),'x','00000000-0000-0000-0000-0000000000a1')$$);

-- 4. Photos : décision par fonction contrôlée
select t.fails('décision invalide refusée', $$select public.set_photo_decision('00000000-0000-0000-0000-0000000000f1', 'bizarre')$$);
select t.fails('client1 ne peut pas décider sur la photo de l''autre', $$select public.set_photo_decision('00000000-0000-0000-0000-0000000000f2', 'approved')$$);
select public.set_photo_decision('00000000-0000-0000-0000-0000000000f1', 'approved');
select t.eq('client1 approuve sa photo', (select count(*) from public.photos where decision = 'approved'), 1);
select public.set_photo_decision('00000000-0000-0000-0000-0000000000f1', 'none');
insert into public.photo_messages (photo_id, body) values ('00000000-0000-0000-0000-0000000000f1', 'Plus lumineuse ?');
select t.eq('un commentaire client passe la photo à « à discuter »', (select count(*) from public.photos where decision = 'comment'), 1);
select t.fails('client1 ne peut pas commenter la photo de l''autre', $$insert into public.photo_messages (photo_id, body) values ('00000000-0000-0000-0000-0000000000f2','x')$$);
select t.fails('client1 ne peut pas envoyer la sélection de l''autre', $$select public.send_gallery_selection('00000000-0000-0000-0000-0000000000e2')$$);
select public.send_gallery_selection('00000000-0000-0000-0000-0000000000e1');
select t.eq('sélection envoyée', (select count(*) from public.galleries where sent_at is not null), 1);
select public.mark_document_viewed('00000000-0000-0000-0000-0000000000d1');
select t.eq('document marqué vu', (select count(*) from public.documents where first_viewed_at is not null), 1);
select t.eq('client1 n''a rien à traiter côté admin', (select count(*) from public.admin_pending()), 0);

-- 4b. Accusé de réception de la politique de confidentialité
select t.fails('version vide refusée', $$select public.accept_privacy('')$$);
select public.accept_privacy('2026-10-05');
select t.eq('client1 accuse réception (sa ligne uniquement)', (select count(*) from public.profiles where privacy_version = '2026-10-05'), 1);
select t.fails('client1 ne peut pas écrire la date lui-même', $$update public.profiles set privacy_accepted_at = now()$$);

-- 5. Le client 2 ne voit rien du client 1
select t.as_super();
select t.as_user('00000000-0000-0000-0000-0000000000b2');
select t.eq('client2 ne voit pas les annotations du client 1', (select count(*) from public.annotations), 0);
select t.eq('client2 ne voit pas les messages du client 1', (select count(*) from public.annotation_messages), 0);
select t.eq('client2 ne voit pas les messages de photo du client 1', (select count(*) from public.photo_messages), 0);
select t.eq('client2 ne voit pas les objets du client 1', (select count(*) from storage.objects where name like '%c1%'), 0);
select t.eq('client2 ne résout pas l''échange du client 1 (0 ligne)', t.affected($$update public.annotations set status = 'resolved'$$), 0);
select t.eq('client2 ne supprime pas les annotations du client 1 (0 ligne)', t.affected($$delete from public.annotations$$), 0);

-- 6. Anthony voit tout et peut tout gérer
select t.as_super();
select t.as_user('00000000-0000-0000-0000-0000000000a1');
select t.eq('admin voit 2 entreprises', (select count(*) from public.clients), 2);
select t.eq('admin voit 2 documents',   (select count(*) from public.documents), 2);
select t.eq('admin voit 3 profils',     (select count(*) from public.profiles), 3);
select t.eq('admin voit tout le stockage', (select count(*) from storage.objects), 3);
select t.eq('admin : à traiter = 1 échange doc + 1 échange photo + 1 sélection', (select count(*) from public.admin_pending()), 3);
insert into public.annotation_messages (annotation_id, body) values (:'ann1', 'Voici la réponse.');
insert into public.photo_messages (photo_id, body) values ('00000000-0000-0000-0000-0000000000f1', 'Je retouche.');
select t.eq('message admin : rôle imposé = admin', (select count(*) from public.annotation_messages where author_role = 'admin' and author_name = 'Anthony Gomand'), 1);
select t.eq('admin : après réponses, il ne reste que la sélection à traiter', (select count(*) from public.admin_pending()), 1);
update public.galleries set seen_at = now() where id = '00000000-0000-0000-0000-0000000000e1';
select t.eq('admin : sélection vue, plus rien à traiter', (select count(*) from public.admin_pending()), 0);
insert into public.documents (client_id, category, title, storage_path) values ('00000000-0000-0000-0000-0000000000c2','factures','Facture','c2/f.pdf');
select t.eq('admin peut ajouter un document', (select count(*) from public.documents), 3);
select t.eq('admin supprime une annotation d''un client', t.affected($$delete from public.annotations$$), 1);

-- 6b. Suppressions en cascade (effacement d'un contact, puis d'un client entier)
select t.as_super();
select t.eq('avant : 2 messages de photo existent', (select count(*) from public.photo_messages), 2);
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1';
select t.eq('effacer un contact supprime son profil', (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000b1'), 0);
select t.eq('effacer un contact supprime ses commentaires de photo', (select count(*) from public.photo_messages where author_role = 'client'), 0);
select t.eq('effacer un contact supprime aussi ses messages sur les documents', (select count(*) from public.annotation_messages where author_role = 'client'), 0);
delete from public.clients where id = '00000000-0000-0000-0000-0000000000c2';
select t.eq('effacer un client supprime ses documents', (select count(*) from public.documents where client_id = '00000000-0000-0000-0000-0000000000c2'), 0);
select t.eq('effacer un client supprime ses galeries et photos', (select count(*) from public.galleries where client_id = '00000000-0000-0000-0000-0000000000c2') + (select count(*) from public.photos where id = '00000000-0000-0000-0000-0000000000f2'), 0);
select t.eq('effacer un client supprime ses profils', (select count(*) from public.profiles where client_id = '00000000-0000-0000-0000-0000000000c2'), 0);

-- 7. Anonyme : rien
select t.as_super();
select t.as_anon();
select t.fails('anonyme ne lit pas les documents', $$select count(*) from public.documents$$);
select t.fails('anonyme ne lit pas les profils',  $$select count(*) from public.profiles$$);
select t.fails('anonyme ne peut pas appeler admin_pending', $$select * from public.admin_pending()$$);
select t.eq('anonyme peut appeler ping', (select public.ping()), 1);

rollback;
\echo === TOUS LES TESTS DE SÉCURITÉ PASSENT ===
