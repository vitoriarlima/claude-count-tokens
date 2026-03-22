-- claude-count-tokens: Supabase migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Profiles table — stores GitHub username for each authenticated user
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Users can read any profile (needed for username lookups)
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- Users can only update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 2. Auto-create profile on signup (pulls GitHub username from metadata)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',     -- GitHub username
      new.raw_user_meta_data ->> 'preferred_username',
      split_part(new.email, '@', 1)                -- fallback
    )
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Storage bucket for token data
insert into storage.buckets (id, name, public)
values ('token-data', 'token-data', true)
on conflict (id) do nothing;

-- 4. Storage policies

-- Anyone can read token data (the widget needs this)
create policy "Public read access to token data"
  on storage.objects for select
  using (bucket_id = 'token-data');

-- Authenticated users can upload their own file only (filename must be {username}.json)
create policy "Users can upload own token data"
  on storage.objects for insert
  with check (
    bucket_id = 'token-data'
    and auth.role() = 'authenticated'
    and name = (select username from public.profiles where id = auth.uid()) || '.json'
  );

-- Authenticated users can update their own file
create policy "Users can update own token data"
  on storage.objects for update
  using (
    bucket_id = 'token-data'
    and auth.role() = 'authenticated'
    and name = (select username from public.profiles where id = auth.uid()) || '.json'
  );
