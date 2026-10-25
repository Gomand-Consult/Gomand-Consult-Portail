-- 004 — Performance et durcissement signalés par les conseillers Supabase (octobre 2026).
-- Aucun changement de comportement : mêmes droits d'accès, écrits de façon plus efficace.

-- 1) ping : chemin de recherche figé (le workflow GitHub « Garder Supabase actif » l'appelle).
create or replace function public.ping() returns integer
language sql stable set search_path = ''
as $$ select 1 $$;

-- 2) Règles de sécurité par ligne : auth.uid() évalué une seule fois par requête, pas par ligne.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

drop policy if exists annotations_insert on public.annotations;
create policy annotations_insert on public.annotations for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_access_document(document_id));

drop policy if exists annotations_delete on public.annotations;
create policy annotations_delete on public.annotations for delete to authenticated
  using (public.is_admin() or (author_id = (select auth.uid()) and public.can_access_document(document_id)));

drop policy if exists annotation_messages_insert on public.annotation_messages;
create policy annotation_messages_insert on public.annotation_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_access_annotation(annotation_id));

drop policy if exists photo_messages_insert on public.photo_messages;
create policy photo_messages_insert on public.photo_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_access_photo(photo_id));

-- 3) Droits d'écriture de l'administrateur : une règle par action au lieu d'une règle « ALL »,
--    pour ne plus doubler la règle de lecture (même effet, moins de travail par requête).
do $$
declare t text;
begin
  foreach t in array array['clients', 'documents', 'galleries', 'photos'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
  end loop;
end $$;

-- 4) Index sur les clés étrangères « auteur ».
create index if not exists annotation_messages_author_idx on public.annotation_messages (author_id);
create index if not exists annotations_author_idx on public.annotations (author_id);
create index if not exists photo_messages_author_idx on public.photo_messages (author_id);
