-- Eingangsfach für das Teilen-Menü (Apple-Kurzbefehl "Zu Rezepten").
-- In Supabase: links "SQL Editor" -> "New query" -> alles hier einfügen -> "Run".
--
-- Ablauf: Der Kurzbefehl schickt den geteilten Link zusammen mit einem persönlichen
-- Teilen-Schlüssel an share_add(). Die App holt beim Öffnen alles aus dem Eingangsfach.
-- Gespeichert wird nur der Fingerabdruck (SHA-256) des Schlüssels, nicht der Schlüssel selbst.

create table if not exists public.share_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now()
);

create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  input text not null,
  created_at timestamptz not null default now()
);

grant usage on schema public to authenticated, anon;
grant select, insert, delete on public.share_keys to authenticated;
grant select, delete on public.inbox to authenticated;

alter table public.share_keys enable row level security;
alter table public.inbox enable row level security;

drop policy if exists "eigene Teilen-Schlüssel" on public.share_keys;
create policy "eigene Teilen-Schlüssel" on public.share_keys
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigenes Eingangsfach" on public.inbox;
create policy "eigenes Eingangsfach" on public.inbox
  for all to authenticated using (auth.uid() = user_id);

-- Wird vom Kurzbefehl aufgerufen (ohne Anmeldung, nur mit dem Teilen-Schlüssel).
create or replace function public.share_add(p_key text, p_input text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  n int;
begin
  if p_key is null or length(p_key) < 20 or length(p_key) > 200 then
    return 'Teilen-Schlüssel fehlt. Bitte im Kurzbefehl prüfen.';
  end if;
  if p_input is null or length(trim(p_input)) = 0 then
    return 'Es wurde nichts geteilt.';
  end if;
  select k.user_id into uid from public.share_keys k
    where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if uid is null then
    return 'Teilen-Schlüssel ungültig. Bitte in der App unter Einstellungen einen neuen erstellen.';
  end if;
  select count(*) into n from public.inbox i where i.user_id = uid;
  if n >= 50 then
    return 'Eingangsfach voll. Bitte zuerst die App öffnen.';
  end if;
  insert into public.inbox (user_id, input) values (uid, left(p_input, 4000));
  return 'Gespeichert ✓ Öffne die Rezepte-App zum Ansehen.';
end;
$$;

revoke all on function public.share_add(text, text) from public;
grant execute on function public.share_add(text, text) to anon, authenticated;
