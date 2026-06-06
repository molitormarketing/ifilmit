-- Run this in Supabase SQL Editor

-- Drop existing user_profiles if it exists and recreate
drop table if exists user_profiles cascade;

create table user_profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  role text not null default 'creator',
  display_name text,
  agency_name text,
  agency_code text unique,
  agency_id uuid references user_profiles(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  created_at timestamp default now()
);

-- Allow users to read/write their own profile
alter table user_profiles enable row level security;

create policy "Users manage own profile"
  on user_profiles for all
  using (auth.uid() = id);

create policy "Agency can view all profiles in their agency"
  on user_profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'agency'
    )
  );

create policy "Agency can update creator profiles"
  on user_profiles for update
  using (
    exists (select 1 from user_profiles where id = auth.uid() and role = 'agency')
  );
