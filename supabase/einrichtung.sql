-- Einrichtung des Online-Speichers für die Rezepte-App.
-- In Supabase: links "SQL Editor" -> "New query" -> alles hier einfügen -> "Run".

-- Tabellen: je Zeile ein Rezept bzw. eine Sammlung (als JSON), getrennt nach Benutzer.
create table if not exists public.recipes (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb,
  deleted boolean not null default false,
  updated_at text not null,
  primary key (user_id, id)
);

create table if not exists public.collections (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb,
  deleted boolean not null default false,
  updated_at text not null,
  primary key (user_id, id)
);

-- Zugriffsschutz: Jeder angemeldete Benutzer sieht und ändert nur seine eigenen Einträge.
alter table public.recipes enable row level security;
alter table public.collections enable row level security;

drop policy if exists "eigene Rezepte" on public.recipes;
create policy "eigene Rezepte" on public.recipes
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "eigene Sammlungen" on public.collections;
create policy "eigene Sammlungen" on public.collections
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fotos: privater Speicherbereich, je Benutzer ein eigener Ordner.
insert into storage.buckets (id, name, public) values ('bilder', 'bilder', false)
  on conflict (id) do nothing;

drop policy if exists "eigene Bilder lesen" on storage.objects;
create policy "eigene Bilder lesen" on storage.objects for select to authenticated
  using (bucket_id = 'bilder' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Bilder hochladen" on storage.objects;
create policy "eigene Bilder hochladen" on storage.objects for insert to authenticated
  with check (bucket_id = 'bilder' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Bilder ändern" on storage.objects;
create policy "eigene Bilder ändern" on storage.objects for update to authenticated
  using (bucket_id = 'bilder' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "eigene Bilder löschen" on storage.objects;
create policy "eigene Bilder löschen" on storage.objects for delete to authenticated
  using (bucket_id = 'bilder' and (storage.foldername(name))[1] = auth.uid()::text);
