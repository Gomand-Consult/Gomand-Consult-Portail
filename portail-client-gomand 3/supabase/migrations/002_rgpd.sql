-- Mise à jour RGPD : accusé de réception de la politique de confidentialité.
-- À exécuter UNE FOIS dans Supabase > SQL Editor si vous avez déjà installé la première version (schema.sql).
-- Sans risque pour les données existantes : elle ajoute seulement deux colonnes et une fonction.

begin;

alter table public.profiles add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles add column if not exists privacy_version text;

create or replace function public.accept_privacy(p_version text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_version is null or char_length(p_version) not between 1 and 40 then raise exception 'Version invalide'; end if;
  update public.profiles set privacy_accepted_at = now(), privacy_version = p_version where id = auth.uid();
  if not found then raise exception 'Profil introuvable'; end if;
end $$;

revoke execute on function public.accept_privacy(text) from public, anon;
grant execute on function public.accept_privacy(text) to authenticated;

commit;
