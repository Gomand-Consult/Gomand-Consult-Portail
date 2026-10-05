-- ============================================================================
-- Portail client Gomand Consult — schéma Supabase
-- À exécuter UNE FOIS dans Supabase > SQL Editor (projet créé en région UE).
-- Principe : tout est privé par défaut. Un client ne voit que les lignes et les
-- fichiers de SON entreprise. Anthony (rôle « admin ») voit tout.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- Tables ----

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  company       text not null check (char_length(company) between 1 and 200),
  contact_name  text check (char_length(contact_name) <= 200),
  project_title text check (char_length(project_title) <= 300),
  created_at    timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('admin', 'client')),
  client_id  uuid references public.clients (id) on delete cascade,
  full_name  text check (char_length(full_name) <= 200),
  email      text,
  created_at timestamptz not null default now(),
  constraint profiles_role_client check (
    (role = 'admin' and client_id is null) or (role = 'client' and client_id is not null)
  )
);
create index profiles_client_idx on public.profiles (client_id);

create table public.documents (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  category        text not null check (category in ('devis', 'factures', 'livrables', 'comptes-rendus')),
  title           text not null check (char_length(title) between 1 and 300),
  reference       text check (char_length(reference) <= 100),
  status          text not null default 'Envoyé' check (char_length(status) <= 60),
  storage_path    text not null,
  file_name       text,
  created_at      timestamptz not null default now(),
  first_viewed_at timestamptz,
  notified_at     timestamptz
);
create index documents_client_idx on public.documents (client_id, created_at desc);

create table public.annotations (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_role text not null default 'client',
  author_name text,
  kind        text not null check (kind in ('highlight', 'comment', 'question')),
  page        integer not null check (page >= 1),
  rects       jsonb not null check (jsonb_typeof(rects) = 'array' and jsonb_array_length(rects) between 1 and 200),
  quote       text check (char_length(quote) <= 500),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);
create index annotations_doc_idx on public.annotations (document_id, created_at);

create table public.annotation_messages (
  id            uuid primary key default gen_random_uuid(),
  annotation_id uuid not null references public.annotations (id) on delete cascade,
  author_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_role   text not null default 'client',
  author_name   text,
  body          text not null check (char_length(body) between 1 and 4000),
  created_at    timestamptz not null default now(),
  notified_at   timestamptz
);
create index annotation_messages_idx on public.annotation_messages (annotation_id, created_at);

create table public.galleries (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  title           text not null check (char_length(title) between 1 and 300),
  note            text check (char_length(note) <= 2000),
  created_at      timestamptz not null default now(),
  first_viewed_at timestamptz,
  sent_at         timestamptz,
  seen_at         timestamptz,
  notified_at     timestamptz
);
create index galleries_client_idx on public.galleries (client_id, created_at desc);

create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  gallery_id   uuid not null references public.galleries (id) on delete cascade,
  storage_path text not null,
  thumb_path   text not null,
  position     integer not null default 0,
  alt          text check (char_length(alt) <= 300),
  decision     text not null default 'none' check (decision in ('none', 'approved', 'rejected', 'comment')),
  created_at   timestamptz not null default now()
);
create index photos_gallery_idx on public.photos (gallery_id, position);

create table public.photo_messages (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references public.photos (id) on delete cascade,
  author_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_role text not null default 'client',
  author_name text,
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  notified_at timestamptz
);
create index photo_messages_idx on public.photo_messages (photo_id, created_at);

-- ------------------------------------------------- Fonctions d'appartenance ----

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from public.profiles where id = auth.uid();
$$;

create function public.can_access_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (p_client is not null and p_client = public.my_client_id());
$$;

create function public.can_access_document(p_doc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.documents d where d.id = p_doc and public.can_access_client(d.client_id));
$$;

create function public.can_access_annotation(p_ann uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.annotations a where a.id = p_ann and public.can_access_document(a.document_id));
$$;

create function public.can_access_gallery(p_gal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.galleries g where g.id = p_gal and public.can_access_client(g.client_id));
$$;

create function public.can_access_photo(p_photo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.photos p where p.id = p_photo and public.can_access_gallery(p.gallery_id));
$$;

-- --------------------------------------------------------- Auteur et logique ----

-- L'auteur d'un message est TOUJOURS déduit de la session, jamais du navigateur.
create function public.fill_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_role text; v_name text;
begin
  select role, full_name into v_role, v_name from public.profiles where id = auth.uid();
  if v_role is null then raise exception 'Profil introuvable'; end if;
  new.author_id   := auth.uid();
  new.author_role := v_role;
  new.author_name := coalesce(nullif(v_name, ''), case when v_role = 'admin' then 'Anthony Gomand' else 'Client' end);
  return new;
end $$;

create trigger annotations_author        before insert on public.annotations         for each row execute function public.fill_author();
create trigger annotation_messages_author before insert on public.annotation_messages for each row execute function public.fill_author();
create trigger photo_messages_author      before insert on public.photo_messages      for each row execute function public.fill_author();

-- Un nouveau message rouvre un échange résolu.
create function public.reopen_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.annotations set status = 'open' where id = new.annotation_id and status = 'resolved';
  return new;
end $$;
create trigger annotation_messages_reopen after insert on public.annotation_messages for each row execute function public.reopen_thread();

-- Un commentaire du client sur une photo non encore traitée la passe « à discuter ».
create function public.photo_commented() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.author_role = 'client' then
    update public.photos set decision = 'comment' where id = new.photo_id and decision = 'none';
  end if;
  return new;
end $$;
create trigger photo_messages_comment after insert on public.photo_messages for each row execute function public.photo_commented();

-- --------------------------------------------------------------------- RLS ----

alter table public.clients             enable row level security;
alter table public.profiles            enable row level security;
alter table public.documents           enable row level security;
alter table public.annotations         enable row level security;
alter table public.annotation_messages enable row level security;
alter table public.galleries           enable row level security;
alter table public.photos              enable row level security;
alter table public.photo_messages      enable row level security;

-- clients
create policy clients_select on public.clients for select to authenticated using (public.can_access_client(id));
create policy clients_admin_write on public.clients for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles (lecture seule depuis le navigateur ; l'écriture passe par la fonction Netlify)
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());

-- documents
create policy documents_select on public.documents for select to authenticated using (public.can_access_client(client_id));
create policy documents_admin_write on public.documents for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- annotations
create policy annotations_select on public.annotations for select to authenticated using (public.can_access_document(document_id));
create policy annotations_insert on public.annotations for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_document(document_id));
create policy annotations_update on public.annotations for update to authenticated
  using (public.can_access_document(document_id)) with check (public.can_access_document(document_id));
create policy annotations_delete on public.annotations for delete to authenticated
  using (public.is_admin() or (author_id = auth.uid() and public.can_access_document(document_id)));

-- messages d'annotation
create policy annotation_messages_select on public.annotation_messages for select to authenticated using (public.can_access_annotation(annotation_id));
create policy annotation_messages_insert on public.annotation_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_annotation(annotation_id));
create policy annotation_messages_delete on public.annotation_messages for delete to authenticated using (public.is_admin());

-- galeries
create policy galleries_select on public.galleries for select to authenticated using (public.can_access_client(client_id));
create policy galleries_admin_write on public.galleries for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- photos
create policy photos_select on public.photos for select to authenticated using (public.can_access_gallery(gallery_id));
create policy photos_admin_write on public.photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- messages de photo
create policy photo_messages_select on public.photo_messages for select to authenticated using (public.can_access_photo(photo_id));
create policy photo_messages_insert on public.photo_messages for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_photo(photo_id));
create policy photo_messages_delete on public.photo_messages for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------- Droits ----
-- On retire tout, puis on rend uniquement ce qui est nécessaire. Les droits par
-- colonne empêchent un client de modifier autre chose que ce qui est prévu.

revoke all on public.clients, public.profiles, public.documents, public.annotations,
              public.annotation_messages, public.galleries, public.photos, public.photo_messages
  from anon, authenticated;

grant select, insert, update, delete on public.clients   to authenticated;
grant select                         on public.profiles  to authenticated;
grant select, insert, update, delete on public.documents to authenticated;

grant select                                                 on public.annotations to authenticated;
grant insert (document_id, kind, page, rects, quote)          on public.annotations to authenticated;
grant update (status)                                        on public.annotations to authenticated;
grant delete                                                 on public.annotations to authenticated;

grant select                         on public.annotation_messages to authenticated;
grant insert (annotation_id, body)   on public.annotation_messages to authenticated;
grant delete                         on public.annotation_messages to authenticated;

grant select, insert, update, delete on public.galleries to authenticated;
grant select, insert, update, delete on public.photos    to authenticated;

grant select                         on public.photo_messages to authenticated;
grant insert (photo_id, body)        on public.photo_messages to authenticated;
grant delete                         on public.photo_messages to authenticated;

-- -------------------------------------------------------------------- RPC ----

create function public.mark_document_viewed(p_doc uuid) returns void
language sql security definer set search_path = public as $$
  update public.documents set first_viewed_at = now()
   where id = p_doc and first_viewed_at is null and client_id = public.my_client_id();
$$;

create function public.mark_gallery_viewed(p_gallery uuid) returns void
language sql security definer set search_path = public as $$
  update public.galleries set first_viewed_at = now()
   where id = p_gallery and first_viewed_at is null and client_id = public.my_client_id();
$$;

create function public.set_photo_decision(p_photo uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_decision not in ('none', 'approved', 'rejected', 'comment') then
    raise exception 'Décision invalide';
  end if;
  update public.photos p set decision = p_decision
   where p.id = p_photo
     and exists (select 1 from public.galleries g where g.id = p.gallery_id and g.client_id = public.my_client_id());
  if not found then raise exception 'Photo introuvable'; end if;
end $$;

create function public.send_gallery_selection(p_gallery uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.galleries set sent_at = now(), notified_at = null
   where id = p_gallery and client_id = public.my_client_id();
  if not found then raise exception 'Galerie introuvable'; end if;
end $$;

-- Liste « À traiter » du back-office (vide pour toute personne qui n'est pas admin).
create function public.admin_pending()
returns table (kind text, ref_id uuid, parent_id uuid, client_id uuid, title text, happened_at timestamptz, excerpt text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'doc_thread'::text as kind, a.id as ref_id, d.id as parent_id, d.client_id, d.title,
           m.created_at as happened_at, left(m.body, 160) as excerpt
      from public.annotations a
      join public.documents d on d.id = a.document_id
      join lateral (select x.* from public.annotation_messages x where x.annotation_id = a.id order by x.created_at desc limit 1) m on true
     where public.is_admin() and a.status = 'open' and a.kind <> 'highlight' and m.author_role = 'client'
    union all
    select 'photo_thread'::text, p.id, g.id, g.client_id, g.title, m.created_at, left(m.body, 160)
      from public.photos p
      join public.galleries g on g.id = p.gallery_id
      join lateral (select x.* from public.photo_messages x where x.photo_id = p.id order by x.created_at desc limit 1) m on true
     where public.is_admin() and m.author_role = 'client'
    union all
    select 'selection'::text, g.id, g.id, g.client_id, g.title, g.sent_at, null::text
      from public.galleries g
     where public.is_admin() and g.sent_at is not null and (g.seen_at is null or g.sent_at > g.seen_at)
  ) t order by happened_at desc;
$$;

-- Appelée par le workflow GitHub « keep-alive » pour éviter la mise en pause du plan gratuit.
create function public.ping() returns integer language sql stable as $$ select 1 $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_admin(), public.my_client_id(), public.can_access_client(uuid),
  public.can_access_document(uuid), public.can_access_annotation(uuid), public.can_access_gallery(uuid),
  public.can_access_photo(uuid),
  public.mark_document_viewed(uuid), public.mark_gallery_viewed(uuid), public.set_photo_decision(uuid, text),
  public.send_gallery_selection(uuid), public.admin_pending() to authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ---------------------------------------------------------------- Stockage ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 52428800, array['application/pdf']),
  ('photos',    'photos',    false, 15728640, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Chemin attendu : <client_id>/<fichier>. Le premier dossier désigne l'entreprise.
create policy portail_lecture on storage.objects for select to authenticated
  using (bucket_id in ('documents', 'photos')
         and (public.is_admin() or (storage.foldername(name))[1] = public.my_client_id()::text));
create policy portail_ecriture_admin on storage.objects for insert to authenticated
  with check (bucket_id in ('documents', 'photos') and public.is_admin());
create policy portail_maj_admin on storage.objects for update to authenticated
  using (bucket_id in ('documents', 'photos') and public.is_admin());
create policy portail_suppression_admin on storage.objects for delete to authenticated
  using (bucket_id in ('documents', 'photos') and public.is_admin());

commit;
