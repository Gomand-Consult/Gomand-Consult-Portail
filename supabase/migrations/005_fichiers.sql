-- 005 — Espace « Fichiers » : l'administrateur dépose des fichiers (photos d'annonces, visuels, archives…)
-- que le client télécharge tels quels (aucune recompression, contrairement aux galeries).
-- Sans risque pour l'existant : nouvelle table + nouveau compartiment privé.

create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id) on delete cascade,
  lot          text check (char_length(lot) <= 200),      -- titre du dépôt (ex. « Photos annonce rue des Roses »)
  note         text check (char_length(note) <= 2000),
  name         text not null check (char_length(name) between 1 and 255),
  storage_path text not null,
  thumb_path   text,                                     -- miniature JPEG (images uniquement)
  mime         text,
  size_bytes   bigint not null default 0 check (size_bytes >= 0),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);
create index if not exists files_client_idx on public.files (client_id, created_at desc);

alter table public.files enable row level security;

create policy files_select       on public.files for select to authenticated using (public.can_access_client(client_id));
create policy files_admin_insert on public.files for insert to authenticated with check (public.is_admin());
create policy files_admin_update on public.files for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy files_admin_delete on public.files for delete to authenticated using (public.is_admin());

-- Droits explicites (obligatoires pour toute nouvelle table depuis le 30/10/2026)
revoke all on public.files from anon, authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.files to service_role;

-- Compartiment privé : 50 Mo par fichier (limite du plan gratuit), tous types acceptés (dépôt réservé à l'administrateur).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = null;

-- Mêmes règles que les autres compartiments : <client_id>/<fichier>.
drop policy if exists portail_lecture on storage.objects;
create policy portail_lecture on storage.objects for select to authenticated
  using (bucket_id in ('documents', 'photos', 'files')
         and (public.is_admin() or (storage.foldername(name))[1] = public.my_client_id()::text));
drop policy if exists portail_ecriture_admin on storage.objects;
create policy portail_ecriture_admin on storage.objects for insert to authenticated
  with check (bucket_id in ('documents', 'photos', 'files') and public.is_admin());
drop policy if exists portail_maj_admin on storage.objects;
create policy portail_maj_admin on storage.objects for update to authenticated
  using (bucket_id in ('documents', 'photos', 'files') and public.is_admin());
drop policy if exists portail_suppression_admin on storage.objects;
create policy portail_suppression_admin on storage.objects for delete to authenticated
  using (bucket_id in ('documents', 'photos', 'files') and public.is_admin());
